const test = require('node:test');
const assert = require('node:assert/strict');
const bcrypt = require('bcryptjs');
const helmet = require('helmet');
const Anthropic = require('@anthropic-ai/sdk');

test('bcrypt 3 verifica hashes heredados y genera hashes compatibles', async () => {
  const currentHash = await bcrypt.hash('Clave-de-prueba-2026', 4);
  assert.match(currentHash, /^\$2b\$/);
  assert.equal(await bcrypt.compare('Clave-de-prueba-2026', currentHash), true);

  const legacyHash = currentHash.replace(/^\$2b\$/, '$2a$');
  assert.equal(await bcrypt.compare('Clave-de-prueba-2026', legacyHash), true);
});

test('helmet 8 acepta la configuración de seguridad de la aplicación', () => {
  const middleware = helmet({
    contentSecurityPolicy: false,
    crossOriginResourcePolicy: { policy: 'same-origin' },
    referrerPolicy: { policy: 'no-referrer' },
    hsts: { maxAge: 31536000, includeSubDomains: true, preload: true },
  });

  assert.equal(typeof middleware, 'function');
});

test('Anthropic SDK conserva el cliente Messages utilizado por la aplicación', () => {
  const client = new Anthropic({ apiKey: 'test-key' });
  assert.equal(typeof client.messages.create, 'function');
});
