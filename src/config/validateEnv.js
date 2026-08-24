const REQUIRED_PRODUCTION_SECRETS = [
  'POSTGRES_PASSWORD',
  'REDIS_PASSWORD',
  'JWT_SECRET',
  'JWT_REFRESH_SECRET',
  'PSYCHOLOGIST_PASSWORD',
  'MAINTENANCE_PASSWORD',
  'CLINICAL_SIGNING_SECRET',
];

const PUBLIC_DEFAULTS = new Set([
  'changeme_secure_2025',
  'redis_secret_2025',
  'dev_access_secret_change_in_production',
  'dev_refresh_secret_change_in_production',
  'PsicologaLocal2026!',
  'MantenimientoLocal2026!',
  'clinical_dev_signing_secret_change_me',
  'pgadmin_2025',
  'n8n_2025',
  'n8n_2025_seguro',
]);

function validateEnvironment(env = process.env) {
  if (env.NODE_ENV !== 'production') return true;

  const errors = [];
  const values = new Map();
  for (const name of REQUIRED_PRODUCTION_SECRETS) {
    const value = String(env[name] || '').trim();
    if (!value) errors.push(`${name} es obligatorio`);
    else if (value.length < 16) errors.push(`${name} debe tener al menos 16 caracteres`);
    else if (PUBLIC_DEFAULTS.has(value) || /^(cambia|change|example|ejemplo|tu_|your_)/i.test(value)) {
      errors.push(`${name} conserva un valor público o de ejemplo`);
    }
    if (value) {
      if (values.has(value)) errors.push(`${name} no puede reutilizar el mismo secreto que ${values.get(value)}`);
      else values.set(value, name);
    }
  }

  for (const name of ['JWT_SECRET', 'JWT_REFRESH_SECRET', 'CLINICAL_SIGNING_SECRET']) {
    const value = String(env[name] || '');
    if (value && value.length < 32) errors.push(`${name} debe tener al menos 32 caracteres`);
  }

  if (env.PSYCHOLOGIST_EMAIL === env.MAINTENANCE_EMAIL) {
    errors.push('PSYCHOLOGIST_EMAIL y MAINTENANCE_EMAIL deben ser diferentes');
  }

  if (errors.length) {
    throw new Error(`Configuración insegura de producción:\n- ${[...new Set(errors)].join('\n- ')}`);
  }
  return true;
}

module.exports = { REQUIRED_PRODUCTION_SECRETS, validateEnvironment };
