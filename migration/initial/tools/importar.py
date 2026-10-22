# Artbec portable archive importer. Python 3 standard library only.
# Usage: python tools/importar.py backup.zip --dest NEW_FOLDER
# Creates a separate copy; never connects to production or overwrites an existing folder.
import argparse,hashlib,json,pathlib,sqlite3,zipfile

def main():
    parser=argparse.ArgumentParser(description='Verifica e importa o ZIP Artbec para uma pasta nova.')
    parser.add_argument('archive');parser.add_argument('--dest',required=True);args=parser.parse_args()
    dest=pathlib.Path(args.dest)
    if dest.exists():raise ValueError('O destino já existe. Escolha uma pasta nova.')
    with zipfile.ZipFile(args.archive) as archive:
        infos=archive.infolist();names=[info.filename for info in infos]
        if len(names)!=len(set(names)):raise ValueError('Arquivo com caminhos duplicados.')
        for info in infos:
            name=info.filename
            if name.startswith('/') or '\\' in name or ':' in name or '\x00' in name or any(p in ('','.','..') for p in name.split('/')):raise ValueError('Caminho inválido no ZIP.')
        manifest=json.loads(archive.read('manifest.json'))
        if manifest.get('format')!='artbec-portable-v1' or not manifest.get('complete'):raise ValueError('Exportação incompleta ou não reconhecida.')
        expected={item['path']:item for item in manifest['files']}
        if set(names)!=set(expected)|{'manifest.json'}:raise ValueError('O conteúdo do ZIP difere do manifesto.')
        # Verify everything, including the original binary files, before creating the destination.
        for name,item in expected.items():
            h=hashlib.sha256();size=0
            with archive.open(name) as stream:
                for chunk in iter(lambda:stream.read(1024*1024),b''):h.update(chunk);size+=len(chunk)
            if size!=item['size'] or h.hexdigest()!=item['sha256']:raise ValueError('Falha de integridade: '+name)
        dump=json.loads(archive.read('database/database.json'))
        if len(dump['tables'])!=dump['tableCount']:raise ValueError('Contagem de tabelas inválida.')
        for table in dump['tables'].values():
            if len(table['rows'])!=table['rowCount']:raise ValueError('Contagem de linhas inválida.')
        dest.mkdir(parents=True)
        for name in names:
            output=dest.joinpath(*name.split('/'));output.parent.mkdir(parents=True,exist_ok=True)
            with archive.open(name) as src,output.open('xb') as dst:
                for chunk in iter(lambda:src.read(1024*1024),b''):dst.write(chunk)
        db=sqlite3.connect(dest/'artbec.sqlite')
        db.set_authorizer(lambda action,*_: sqlite3.SQLITE_DENY if action in (sqlite3.SQLITE_ATTACH,sqlite3.SQLITE_DETACH) else sqlite3.SQLITE_OK)
        try:
            db.executescript((dest/'database/database.sql').read_text(encoding='utf-8'))
            for name,table in dump['tables'].items():
                actual=db.execute('SELECT COUNT(*) FROM "'+name.replace('"','""')+'"').fetchone()[0]
                if actual!=table['rowCount']:raise ValueError('Contagem restaurada divergente: '+name)
                cur=db.execute('SELECT * FROM "'+name.replace('"','""')+'"');columns=[col[0] for col in cur.description]
                restored=[dict(zip(columns,[list(v) if isinstance(v,bytes) else v for v in row])) for row in cur.fetchall()]
                canonical=lambda rows:sorted(json.dumps(row,sort_keys=True,ensure_ascii=False,separators=(',',':')) for row in rows)
                if canonical(restored)!=canonical(table['rows']):raise ValueError('Conteúdo restaurado divergente: '+name)
            if db.execute('PRAGMA foreign_key_check').fetchall():raise ValueError('Vínculos inválidos.')
            if db.execute('PRAGMA integrity_check').fetchone()[0]!='ok':raise ValueError('Integridade SQLite inválida.')
        finally:db.close()
        print(json.dumps({'verified':True,'tables':dump['tableCount'],'rows':sum(t['rowCount'] for t in dump['tables'].values()),'files':len(manifest['files']),'destination':str(dest)},ensure_ascii=False))
if __name__=='__main__':
    try:main()
    except Exception as error:raise SystemExit('Importação interrompida: '+str(error))
