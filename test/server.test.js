const test = require('node:test');
const assert = require('node:assert');
const http = require('node:http');
const { app, decodeProjectPath, SAFE_SEGMENT } = require('../server');

function request(port, path, host) {
  return new Promise((resolve, reject) => {
    const req = http.get({ port, host: '127.0.0.1', path, headers: { Host: host } }, (res) => {
      let body = '';
      res.on('data', (chunk) => (body += chunk));
      res.on('end', () => resolve({ status: res.statusCode, body }));
    });
    req.on('error', reject);
  });
}

test('decodeProjectPath turns a project directory name into a path', () => {
  assert.strictEqual(decodeProjectPath('-Users-alice'), '/Users/alice');
});

test('SAFE_SEGMENT accepts project and session ids and rejects traversal', () => {
  assert.ok(SAFE_SEGMENT.test('-Users-alice-Work'));
  assert.ok(SAFE_SEGMENT.test('3f2a9c1e-1111-2222-3333-444455556666'));
  assert.ok(!SAFE_SEGMENT.test('../secret'));
  assert.ok(!SAFE_SEGMENT.test('a/b'));
  assert.ok(!SAFE_SEGMENT.test(''));
});

test('API rejects foreign Host headers and invalid session ids', async (context) => {
  const server = app.listen(0, '127.0.0.1');
  context.after(() => server.close());
  await new Promise((resolve) => server.once('listening', resolve));
  const { port } = server.address();
  const local = 'localhost:3737';

  assert.strictEqual((await request(port, '/api/projects', 'evil.example.com')).status, 403);
  assert.strictEqual((await request(port, '/api/session/-Users-alice/no-such-session', local)).status, 200);
  assert.strictEqual((await request(port, '/api/session/%2e%2e/abc', local)).status, 400);
});
