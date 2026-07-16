const db = require('../config/database');
const logger = require('../config/logger');

async function runMigrations() {
  await db.query(`CREATE TABLE IF NOT EXISTS app.schema_migrations(
    version INTEGER PRIMARY KEY, nombre TEXT NOT NULL, applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`);
  const migrations = [{
    version: 2, name: 'operacion_clinica',
    sql: `
      CREATE TABLE IF NOT EXISTS app.lista_espera(
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        paciente_id UUID NOT NULL REFERENCES app.usuarios(id) ON DELETE CASCADE,
        modalidad app.modalidad_cita NOT NULL,
        fecha_desde DATE NOT NULL, fecha_hasta DATE,
        preferencias TEXT, estado VARCHAR(20) NOT NULL DEFAULT 'activa',
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_espera_activa ON app.lista_espera(estado,fecha_desde);
      ALTER TABLE app.citas ADD COLUMN IF NOT EXISTS sala_virtual_token UUID;
      ALTER TABLE app.citas ADD COLUMN IF NOT EXISTS consentimiento_aceptado_at TIMESTAMPTZ;
      CREATE TABLE IF NOT EXISTS audit.accesos_clinicos(
        id BIGSERIAL PRIMARY KEY, usuario_id UUID REFERENCES app.usuarios(id),
        paciente_id UUID REFERENCES app.usuarios(id), recurso VARCHAR(80) NOT NULL,
        accion VARCHAR(30) NOT NULL, ip INET, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `
  },{
    version: 3, name: 'videoconsulta_y_consentimiento',
    sql: `ALTER TABLE app.citas ALTER COLUMN sala_virtual_token SET DEFAULT uuid_generate_v4();
          UPDATE app.citas SET sala_virtual_token=uuid_generate_v4() WHERE sala_virtual_token IS NULL;`
  },{
    version: 4, name: 'superadmin_y_firma_clinica',
    sql: `
      ALTER TYPE app.rol_usuario ADD VALUE IF NOT EXISTS 'superadmin';
      ALTER TABLE app.notas_sesion ADD COLUMN IF NOT EXISTS profesional_id UUID REFERENCES app.usuarios(id);
      ALTER TABLE app.notas_sesion ADD COLUMN IF NOT EXISTS contenido_hash VARCHAR(64);
      ALTER TABLE app.notas_sesion ADD COLUMN IF NOT EXISTS firma_hmac VARCHAR(64);
      ALTER TABLE app.notas_sesion ADD COLUMN IF NOT EXISTS firmado_at TIMESTAMPTZ;
      ALTER TABLE app.notas_sesion ADD COLUMN IF NOT EXISTS version INTEGER NOT NULL DEFAULT 1;
      ALTER TABLE app.notas_sesion ADD COLUMN IF NOT EXISTS clasificacion VARCHAR(30) NOT NULL DEFAULT 'CONFIDENCIAL';
    `
  },{
    version: 5, name: 'proteccion_documento_clinico',
    sql: `
      ALTER TABLE app.notas_sesion ADD COLUMN IF NOT EXISTS protegido_at TIMESTAMPTZ;
      ALTER TABLE app.notas_sesion ADD COLUMN IF NOT EXISTS protegido_por UUID REFERENCES app.usuarios(id);
      ALTER TABLE app.notas_sesion ADD COLUMN IF NOT EXISTS enviado_at TIMESTAMPTZ;
      ALTER TABLE app.notas_sesion ADD COLUMN IF NOT EXISTS enviado_a VARCHAR(320);
    `
  }];
  for (const migration of migrations) {
    const exists = await db.query('SELECT 1 FROM app.schema_migrations WHERE version=$1', [migration.version]);
    if (exists.rowCount) continue;
    const client = await db.connect();
    try {
      await client.query('BEGIN');
      await client.query(migration.sql);
      await client.query('INSERT INTO app.schema_migrations(version,nombre) VALUES($1,$2)', [migration.version,migration.name]);
      await client.query('COMMIT');
      logger.info(`Migración aplicada: ${migration.version} ${migration.name}`);
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally { client.release(); }
  }
}
module.exports = { runMigrations };
