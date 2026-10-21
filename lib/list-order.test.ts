import test from 'node:test';
import assert from 'node:assert/strict';
import {replaceKeepingPosition} from './list-order.ts';

test('editar um registro mantém sua posição na lista',()=>{
 const rows=[{id:'a',name:'Ana'},{id:'b',name:'Bia'},{id:'c',name:'Caio'}];
 assert.deepEqual(replaceKeepingPosition(rows,{id:'b',name:'Beatriz'}).map(row=>row.id),['a','b','c']);
 assert.equal(rows[1].name,'Bia');
});

test('um cadastro novo é acrescentado uma única vez',()=>{
 const rows=[{id:'a',name:'Ana'}];
 assert.deepEqual(replaceKeepingPosition(rows,{id:'b',name:'Bia'}).map(row=>row.id),['a','b']);
});
