import test from 'node:test';
import assert from 'node:assert/strict';
import {oilChangeLocation} from './oil-change-location.ts';
const monitor={plate:'FCC7G74',oilDate:'2026-10-19',oilKm:58912};
const entry={plate:'FCC 7G74',lastChange:'2026-10-19',odometer:58912,notes:'Trocado no Wellington · Pedi para ele trocar'};
test('última troca mostra o local confirmado mesmo quando a despesa tem data de leitura anterior',()=>{assert.equal(oilChangeLocation(monitor,[entry]),'Trocado no Wellington')});
test('nova troca, outro KM ou outra moto não herdam local de troca antiga',()=>{for(const update of [{oilDate:'2026-10-29'},{oilKm:60000},{plate:'FUA2E40'}])assert.equal(oilChangeLocation({...monitor,...update},[entry]),'')});
test('moto na oficina sem confirmação de troca não recebe o rótulo',()=>{assert.equal(oilChangeLocation(monitor,[{...entry,notes:'Moto estava no Wellington'}]),'');assert.equal(oilChangeLocation(monitor,[]),'')});
