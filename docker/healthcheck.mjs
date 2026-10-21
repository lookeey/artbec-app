import https from 'node:https';

// The local Wrangler endpoint uses a self-signed certificate.
const request = https.get('https://127.0.0.1:3000/api/auth/session', {
  rejectUnauthorized: false,
  timeout: 8000,
}, response => {
  response.resume();
  process.exitCode = response.statusCode === 200 || response.statusCode === 401 ? 0 : 1;
});
request.on('timeout', () => request.destroy(new Error('Healthcheck timeout')));
request.on('error', () => { process.exitCode = 1; });
