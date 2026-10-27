"""Prepare historical Vita prices from the original workbook; never edit XLSX."""
import argparse
import hashlib
import json
import re
import unicodedata
from decimal import Decimal
from pathlib import Path
from openpyxl import load_workbook

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('workbook', type=Path)
parser.add_argument('output', type=Path)
args = parser.parse_args()
root = Path(__file__).resolve().parent.parent
history = json.loads((root/'migration/vita-history-2026-04-08.json').read_text(encoding='utf-8'))
book_hash = hashlib.sha256(args.workbook.read_bytes()).hexdigest()
if book_hash != history['source']['sha256']:
    raise ValueError('Use a planilha original conferida na recuperação Vita.')
w = load_workbook(args.workbook, read_only=True, data_only=True)

def rate(product, sheet, cells, divisor=1):
    value = Decimal(str(w[sheet][cells.split(':')[-1]].value)) / Decimal(divisor)
    cents = value*100
    if cents != int(cents) or cents <= 0:
        raise ValueError(f'Preço inválido em {sheet}!{cells}')
    return dict(product=product, unitPrice=int(cents), sheet=sheet, range=cells, divisor=divisor)

prices = {
 'cloro': rate('Cloro líquido 5 L','V. Jan Vita','F13:G13',4),
 'redutor': rate('Redutor de pH 5 L','V. Fev Vita ','F27:G27',4),
 'elevador': rate('Elevador de Alcalinidade','V. Jan Vita','F15:G15',2),
 'algicida': rate('Algicida Manutenção HTH','V. Fev Vita ','F13:G13',2),
 'choque': rate('Algicida Choque HTH','V. Mar Vita ','F22:G22',2),
 'clarificante': rate('Clarificante','Valores Produtos','I17:J17'),
 'oleosidade': rate('Removedor de Oleosidade','Valores Produtos','I22:J22'),
 'pastilha': rate('Kit de Pastilha em Gel','Valores Produtos','I24:J24'),
 'hth': rate('Cloro Granulado HTH','V. Mar Vita ','F21:G21'),
 'mangueira': rate('Mangueira (metro)','Valores Produtos','I32:J32'),
 'ponteira': rate('Ponteira de mangueira','Valores Produtos','I43:J43'),
 'semanal': dict(product='Tratamento Semanal',unitPrice=None,source='Manter sem valor, conforme solicitação de 27/10/2026'),
}
w.close()

def normalize(value):
    value = ''.join(c for c in unicodedata.normalize('NFKD',value) if not unicodedata.combining(c)).lower()
    return re.sub(r'[^a-z0-9]+',' ',value).strip()

def parse_product(part):
    original = part.strip()
    text = normalize(original)
    match = re.match(r'^(\d+(?:[.,]\d+)?)\s+(.+)$', original)
    quantity = Decimal(match[1].replace(',','.')) if match else Decimal(1)
    name = normalize(match[2]) if match else text
    if name.startswith('mangueira'):
        length = re.search(r'(\d+)\s*(?:mts?|metros?)',text)
        if not length:
            raise ValueError(f'Comprimento da mangueira ausente: {original}')
        quantity, key = Decimal(length[1]), 'mangueira'
    elif name.startswith('ponteira'): key = 'ponteira'
    elif name.startswith('trat'): key = 'semanal'
    elif name.startswith('elevad') and 'alc' in name: key = 'elevador'
    elif ('removed' in name or 'redutor' in name) and 'oleosidade' in name: key = 'oleosidade'
    elif name.startswith('redutor'): key = 'redutor'
    elif 'pastilha' in name and 'gel' in name: key = 'pastilha'
    elif name.startswith('algicida'): key = 'choque' if 'choque' in name else 'algicida'
    elif name.startswith('clarificante'): key = 'clarificante'
    elif name.startswith('cloro'): key = 'hth' if 'hth' in name else 'cloro'
    else: raise ValueError(f'Produto não reconhecido: {original}')
    return dict(product=prices[key]['product'],quantity=float(quantity) if quantity%1 else int(quantity),unitPrice=prices[key]['unitPrice'])

rows=[]
for sale in history['sales']:
    if sale['total'] is not None: continue
    parts=re.split(r'\s+e\s+(?=\d)|,\s*(?=\d)',sale['product'],flags=re.I)
    lines=[parse_product(part) for part in parts]
    total=sum(int(Decimal(str(line['quantity']))*line['unitPrice']) for line in lines if line['unitPrice'] is not None)
    rows.append(dict(id=sale['id'],lineItems=lines,total=total))
if len(rows)!=49: raise ValueError('O pacote deve conter 49 valores antes ausentes.')
payload=dict(format='artbec-vita-history-prices-v1',source=history['source'],prices=prices,rows=rows)
args.output.parent.mkdir(parents=True,exist_ok=True)
args.output.write_text(json.dumps(payload,ensure_ascii=False,indent=2)+'\n',encoding='utf-8',newline='\n')
summary={}
for row in rows:
    sale=next(s for s in history['sales'] if s['id']==row['id'])
    key=sale['period']+' '+sale['client']
    summary[key]=summary.get(key,0)+row['total']
print(json.dumps(dict(records=len(rows),unpricedTreatmentRows=sum(any(line['unitPrice'] is None for line in row['lineItems']) for row in rows),totalsCents=summary),ensure_ascii=False))
