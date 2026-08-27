const test = require('node:test');
const assert = require('node:assert/strict');
const { validateEnvironment } = require('../../src/config/validateEnv');

const secureEnv = () => ({
  NODE_ENV: 'production',
  POSTGRES_PASSWORD: 'postgres-A-unique-secret',
  REDIS_PASSWORD: 'redis-B-unique-secret',
  JWT_SECRET: 'jwt-access-C-unique-secret-000000',
  JWT_REFRESH_SECRET: 'jwt-refresh-D-unique-secret-00000',
  PSYCHOLOGIST_PASSWORD: 'Psychologist-E-2026!',
  MAINTENANCE_PASSWORD: 'Maintenance-F-2026!',
  CLINICAL_SIGNING_SECRET: 'clinical-signing-G-unique-000000',
  APP_URL: 'https://dev-fmv.duckdns.org/psicologia',
  FRONTEND_URL: 'https://dev-fmv.duckdns.org/psicologia',
  PUBLIC_BASE_PATH: '/psicologia',
  PSYCHOLOGIST_EMAIL: 'psychologist@example.test',
  MAINTENANCE_EMAIL: 'maintenance@example.test',
});

test('acepta secretos de producción únicos y suficientemente largos', () => {
  assert.equal(validateEnvironment(secureEnv()), true);
});

test('rechaza secretos faltantes y valores públicos conocidos', () => {
  const env = secureEnv();
  env.JWT_SECRET = 'dev_access_secret_change_in_production';
  env.REDIS_PASSWORD = '';
  assert.throws(() => validateEnvironment(env), /Configuración insegura de producción/);
});

test('rechaza la reutilización de secretos', () => {
  const env = secureEnv();
  env.REDIS_PASSWORD = env.POSTGRES_PASSWORD;
  assert.throws(() => validateEnvironment(env), /no puede reutilizar/);
});

test('no bloquea el entorno de desarrollo', () => {
  assert.equal(validateEnvironment({ NODE_ENV: 'development' }), true);
});

test('rechaza URLs sin HTTPS y subrutas ambiguas en producción', () => {
  const env = secureEnv();
  env.APP_URL = 'http://dev-fmv.duckdns.org/psicologia';
  env.PUBLIC_BASE_PATH = 'psicologia/';
  assert.throws(() => validateEnvironment(env), /HTTPS|PUBLIC_BASE_PATH/);
});
