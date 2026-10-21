import test from 'node:test';
import assert from 'node:assert/strict';
import {stockImageKey,stockImageFor,stockImageMime} from './stock-images.ts';
test('fotos ficam vinculadas ao produto e rejeitam caminhos externos',()=>{const key='stock-images/stock-12/12345678-1234-1234-1234-123456789abc.png';assert.ok(stockImageKey(key));assert.ok(stockImageFor(key,'stock-12'));assert.equal(stockImageFor(key,'stock-13'),false);for(const value of ['https://example.com/image.jpg','stock-images/../private.jpg',key.replace('.png','.svg')])assert.equal(stockImageKey(value),false)});
test('aceita PNG, JPEG e WebP e rejeita SVG ou texto',()=>{assert.equal(stockImageMime(new Uint8Array([137,80,78,71,13,10,26,10])),'image/png');assert.equal(stockImageMime(new Uint8Array([255,216,255,224])),'image/jpeg');assert.equal(stockImageMime(new TextEncoder().encode('RIFF0000WEBP')),'image/webp');assert.equal(stockImageMime(new TextEncoder().encode('<svg></svg>')),null)});
