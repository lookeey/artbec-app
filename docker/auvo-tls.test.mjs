import test from 'node:test';
import assert from 'node:assert/strict';
import { Miniflare } from 'miniflare';

test('runtime Docker valida o TLS da API Auvo', { timeout: 30_000 }, async () => {
  const runtime = new Miniflare({
    modules: true,
    compatibilityDate: '2026-05-15',
    cf: false,
    script: `export default {
      async fetch() {
        try {
          const response = await fetch('https://api.auvo.com.br/v2/login', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ apiKey: 'diagnostic-invalid-key', apiToken: 'diagnostic-invalid-token' }),
            signal: AbortSignal.timeout(15_000),
          });
          return Response.json({ upstreamStatus: response.status });
        } catch (error) {
          return Response.json({ error: error.message }, { status: 502 });
        }
      },
    }`,
  });
  try {
    const response = await runtime.dispatchFetch('http://localhost');
    const result = await response.json();
    assert.equal(response.status, 200, JSON.stringify(result));
    assert.ok(result.upstreamStatus >= 200 && result.upstreamStatus < 500, JSON.stringify(result));
  } finally {
    await runtime.dispose();
  }
});
