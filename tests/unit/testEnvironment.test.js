const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '../..');
const compose = fs.readFileSync(path.join(root, 'docker-compose.test.yml'), 'utf8');
const docs = fs.readFileSync(path.join(root, 'docs/FLUJO_TEST_PRODUCCION.md'), 'utf8');

test('el entorno test usa contenedores y red independientes', () => {
  for (const service of ['postgres', 'redis', 'api', 'nginx']) {
    assert.match(compose, new RegExp(`container_name: psicologa_test_${service}`));
  }
  assert.match(compose, /image: psico_luz_test-api:latest/);
  assert.match(compose, /image: postgres@sha256:[a-f0-9]{64}/);
  assert.match(compose, /name: psico_luz_test_net/);
  assert.match(compose, /subnet: 172\.29\.0\.0\/16/);
  assert.match(compose, /test_logs:\/app\/logs/);
  assert.match(compose, /test_uploads:\/app\/uploads/);
  assert.doesNotMatch(compose, /container_name: psicologa_(?:postgres|redis|api|nginx)\s*$/m);
});

test('test deshabilita integraciones con efectos externos', () => {
  for (const variable of [
    'SMTP_HOST',
    'SMTP_PASS',
    'TWILIO_ACCOUNT_SID',
    'TELEGRAM_BOT_TOKEN',
    'GOOGLE_CALENDAR_ID',
    'ANTHROPIC_API_KEY',
    'GEMINI_API_KEY',
  ]) {
    assert.match(compose, new RegExp(`${variable}: ""`));
  }
});

test('la promoción exige aprobación y respaldo antes de producción', () => {
  assert.match(docs, /https:\/\/test-psicologia\.dev-fmv\.duckdns\.org/);
  assert.match(docs, /autorización explícita/i);
  assert.match(docs, /respaldo/i);
  assert.match(docs, /reversión/i);
  assert.match(docs, /no reutiliza/i);
});
