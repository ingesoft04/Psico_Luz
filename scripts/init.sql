-- ═══════════════════════════════════════════════════════════════
--  PSICÓLOGA LUZ ADRIANA — Schema de Base de Datos PostgreSQL
--  Diseñado para escalar con Claude AI · Gemini · N8N
-- ═══════════════════════════════════════════════════════════════

-- Extensiones útiles
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";       -- búsqueda de texto difusa
CREATE EXTENSION IF NOT EXISTS "btree_gin";      -- índices compuestos

-- Schemas separados
CREATE SCHEMA IF NOT EXISTS app;
CREATE SCHEMA IF NOT EXISTS ai;
CREATE SCHEMA IF NOT EXISTS audit;
CREATE SCHEMA IF NOT EXISTS n8n;

SET search_path TO app, public;

-- ─── ENUM TYPES ───────────────────────────────────────────────

CREATE TYPE app.rol_usuario     AS ENUM ('paciente', 'admin', 'psicologa', 'recepcionista');
CREATE TYPE app.estado_cita     AS ENUM ('pendiente', 'confirmada', 'en_curso', 'completada', 'cancelada', 'no_asistio');
CREATE TYPE app.modalidad_cita  AS ENUM ('presencial', 'virtual');
CREATE TYPE app.estado_pago     AS ENUM ('pendiente', 'pagado', 'reembolsado', 'fallido');
CREATE TYPE app.metodo_pago     AS ENUM ('efectivo', 'transferencia', 'tarjeta', 'nequi', 'daviplata');
CREATE TYPE app.genero          AS ENUM ('masculino', 'femenino', 'no_binario', 'prefiero_no_decir');
CREATE TYPE app.tipo_sesion     AS ENUM ('evaluacion', 'individual', 'familiar', 'grupal', 'seguimiento');
CREATE TYPE ai.proveedor_ia     AS ENUM ('claude', 'gemini', 'openai');
CREATE TYPE ai.tipo_accion      AS ENUM ('recordatorio', 'resumen', 'analisis', 'respuesta_auto', 'clasificacion');

-- ─── USUARIOS ─────────────────────────────────────────────────

CREATE TABLE app.usuarios (
  id                UUID          PRIMARY KEY DEFAULT uuid_generate_v4(),
  nombre            VARCHAR(120)  NOT NULL,
  apellido          VARCHAR(120)  NOT NULL,
  email             VARCHAR(255)  UNIQUE NOT NULL,
  telefono          VARCHAR(20),
  whatsapp          VARCHAR(20),
  password_hash     TEXT          NOT NULL,
  rol               app.rol_usuario NOT NULL DEFAULT 'paciente',
  activo            BOOLEAN       NOT NULL DEFAULT true,
  email_verificado  BOOLEAN       NOT NULL DEFAULT false,
  token_verificacion TEXT,
  token_reset       TEXT,
  token_reset_exp   TIMESTAMPTZ,
  ultimo_login      TIMESTAMPTZ,
  foto_url          TEXT,
  ciudad            VARCHAR(100),
  departamento      VARCHAR(100),
  pais              VARCHAR(80)   DEFAULT 'Colombia',
  fecha_nacimiento  DATE,
  genero            app.genero,
  como_nos_conocio  VARCHAR(200),
  notas_internas    TEXT,                     -- solo visible para admin/psicóloga
  metadata          JSONB         DEFAULT '{}',  -- extensible para IA
  created_at        TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_usuarios_email   ON app.usuarios(email);
CREATE INDEX idx_usuarios_rol     ON app.usuarios(rol);
CREATE INDEX idx_usuarios_activo  ON app.usuarios(activo) WHERE activo = true;
CREATE INDEX idx_usuarios_nombre  ON app.usuarios USING gin(nombre gin_trgm_ops);

-- ─── FICHAS CLÍNICAS (Historial por paciente) ─────────────────

CREATE TABLE app.fichas_clinicas (
  id               UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  paciente_id      UUID        NOT NULL REFERENCES app.usuarios(id) ON DELETE RESTRICT,
  motivo_consulta  TEXT,
  antecedentes     TEXT,
  diagnostico      TEXT,
  observaciones    TEXT,
  objetivos        TEXT,
  medicamentos     TEXT,
  alergias         TEXT,
  contacto_emergencia_nombre  VARCHAR(120),
  contacto_emergencia_tel     VARCHAR(20),
  datos_extra      JSONB       DEFAULT '{}',   -- campo libre extensible
  creado_por       UUID        REFERENCES app.usuarios(id),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_fichas_paciente ON app.fichas_clinicas(paciente_id);
CREATE UNIQUE INDEX uq_fichas_paciente ON app.fichas_clinicas(paciente_id);

-- ─── DISPONIBILIDAD DE LA PSICÓLOGA ───────────────────────────

CREATE TABLE app.disponibilidad (
  id            UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  dia_semana    SMALLINT    NOT NULL CHECK (dia_semana BETWEEN 0 AND 6),  -- 0=Dom, 1=Lun
  hora_inicio   TIME        NOT NULL,
  hora_fin      TIME        NOT NULL,
  modalidad     app.modalidad_cita NOT NULL DEFAULT 'presencial',
  activo        BOOLEAN     NOT NULL DEFAULT true,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Seed inicial de disponibilidad
INSERT INTO app.disponibilidad (dia_semana, hora_inicio, hora_fin, modalidad) VALUES
  (1, '07:00', '20:00', 'presencial'),
  (2, '07:00', '20:00', 'presencial'),
  (3, '07:00', '20:00', 'presencial'),
  (4, '07:00', '20:00', 'presencial'),
  (5, '07:00', '20:00', 'presencial'),
  (6, '08:00', '14:00', 'presencial'),
  (1, '07:00', '20:00', 'virtual'),
  (2, '07:00', '20:00', 'virtual'),
  (3, '07:00', '20:00', 'virtual'),
  (4, '07:00', '20:00', 'virtual'),
  (5, '07:00', '20:00', 'virtual'),
  (6, '08:00', '14:00', 'virtual');

-- Días bloqueados (festivos, vacaciones)
CREATE TABLE app.dias_bloqueados (
  id        UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  fecha     DATE        NOT NULL UNIQUE,
  motivo    VARCHAR(200),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── CITAS ────────────────────────────────────────────────────

CREATE TABLE app.citas (
  id                 UUID              PRIMARY KEY DEFAULT uuid_generate_v4(),
  paciente_id        UUID              NOT NULL REFERENCES app.usuarios(id) ON DELETE RESTRICT,
  fecha              DATE              NOT NULL,
  hora_inicio        TIME              NOT NULL,
  hora_fin           TIME              NOT NULL,
  modalidad          app.modalidad_cita NOT NULL DEFAULT 'presencial',
  tipo_sesion        app.tipo_sesion   NOT NULL DEFAULT 'individual',
  estado             app.estado_cita   NOT NULL DEFAULT 'pendiente',
  motivo             TEXT,
  notas_previas      TEXT,
  notas_post_sesion  TEXT,             -- llenadas después de la sesión
  link_videollamada  TEXT,             -- Zoom / Meet / Teams
  duracion_min       SMALLINT          NOT NULL DEFAULT 60,
  recordatorio_enviado BOOLEAN         NOT NULL DEFAULT false,
  recordatorio_24h   BOOLEAN           NOT NULL DEFAULT false,
  cancelada_por      UUID              REFERENCES app.usuarios(id),
  motivo_cancelacion TEXT,
  created_by         UUID              REFERENCES app.usuarios(id),
  metadata           JSONB             DEFAULT '{}',
  created_at         TIMESTAMPTZ       NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ       NOT NULL DEFAULT NOW(),
  CHECK (hora_fin > hora_inicio)
);

CREATE INDEX idx_citas_paciente  ON app.citas(paciente_id);
CREATE INDEX idx_citas_fecha     ON app.citas(fecha);
CREATE INDEX idx_citas_estado    ON app.citas(estado);
CREATE INDEX idx_citas_fecha_estado ON app.citas(fecha, estado);
CREATE UNIQUE INDEX no_doble_cita_activa
  ON app.citas(fecha, hora_inicio, modalidad)
  WHERE estado NOT IN ('cancelada','no_asistio');

-- ─── PAGOS ────────────────────────────────────────────────────

CREATE TABLE app.pagos (
  id             UUID              PRIMARY KEY DEFAULT uuid_generate_v4(),
  cita_id        UUID              NOT NULL REFERENCES app.citas(id) ON DELETE RESTRICT,
  paciente_id    UUID              NOT NULL REFERENCES app.usuarios(id),
  monto          NUMERIC(10,2)     NOT NULL CHECK (monto > 0),
  moneda         CHAR(3)           NOT NULL DEFAULT 'COP',
  metodo         app.metodo_pago   NOT NULL DEFAULT 'efectivo',
  estado         app.estado_pago   NOT NULL DEFAULT 'pendiente',
  referencia_ext TEXT,             -- ID de Wompi, Stripe, etc.
  comprobante_url TEXT,
  notas          TEXT,
  created_at     TIMESTAMPTZ       NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ       NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_pagos_cita     ON app.pagos(cita_id);
CREATE INDEX idx_pagos_paciente ON app.pagos(paciente_id);
CREATE INDEX idx_pagos_estado   ON app.pagos(estado);

-- ─── NOTAS DE SESIÓN (separadas de citas para privacidad) ─────

CREATE TABLE app.notas_sesion (
  id              UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  cita_id         UUID        NOT NULL REFERENCES app.citas(id) ON DELETE RESTRICT,
  paciente_id     UUID        NOT NULL REFERENCES app.usuarios(id),
  contenido       TEXT        NOT NULL,
  es_privada      BOOLEAN     NOT NULL DEFAULT true,  -- solo psicóloga
  etiquetas       TEXT[],
  estado_animo    SMALLINT    CHECK (estado_animo BETWEEN 1 AND 10),
  progreso        SMALLINT    CHECK (progreso BETWEEN 1 AND 5),
  tareas_asignadas TEXT,
  next_steps      TEXT,
  resumen_ia      TEXT,        -- resumen generado por Claude/Gemini
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_notas_cita     ON app.notas_sesion(cita_id);
CREATE INDEX idx_notas_paciente ON app.notas_sesion(paciente_id);

-- ─── NOTIFICACIONES ───────────────────────────────────────────

CREATE TABLE app.notificaciones (
  id          UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  usuario_id  UUID        NOT NULL REFERENCES app.usuarios(id) ON DELETE CASCADE,
  tipo        VARCHAR(60) NOT NULL,   -- 'cita_confirmada', 'recordatorio_24h', etc.
  canal       VARCHAR(20) NOT NULL,   -- 'email', 'whatsapp', 'push'
  titulo      VARCHAR(200),
  cuerpo      TEXT,
  leida       BOOLEAN     NOT NULL DEFAULT false,
  enviada     BOOLEAN     NOT NULL DEFAULT false,
  error_msg   TEXT,
  ref_id      UUID,                   -- ID de la cita u objeto relacionado
  metadata    JSONB       DEFAULT '{}',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  enviada_at  TIMESTAMPTZ
);

CREATE INDEX idx_notif_usuario  ON app.notificaciones(usuario_id);
CREATE INDEX idx_notif_leida    ON app.notificaciones(leida) WHERE leida = false;
CREATE INDEX idx_notif_enviada  ON app.notificaciones(enviada, created_at);

-- ─── IA: LOG DE INTERACCIONES ─────────────────────────────────

CREATE TABLE ai.interacciones (
  id              UUID            PRIMARY KEY DEFAULT uuid_generate_v4(),
  usuario_id      UUID            REFERENCES app.usuarios(id),
  proveedor       ai.proveedor_ia NOT NULL,
  tipo_accion     ai.tipo_accion  NOT NULL,
  modelo          VARCHAR(80),
  prompt          TEXT,
  respuesta       TEXT,
  tokens_entrada  INTEGER,
  tokens_salida   INTEGER,
  costo_usd       NUMERIC(10,6),
  latencia_ms     INTEGER,
  exitoso         BOOLEAN         NOT NULL DEFAULT true,
  error_msg       TEXT,
  ref_tipo        VARCHAR(60),    -- 'cita', 'nota', 'paciente'
  ref_id          UUID,
  metadata        JSONB           DEFAULT '{}',
  created_at      TIMESTAMPTZ     NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_ia_usuario   ON ai.interacciones(usuario_id);
CREATE INDEX idx_ia_proveedor ON ai.interacciones(proveedor);
CREATE INDEX idx_ia_fecha     ON ai.interacciones(created_at);
CREATE INDEX idx_ia_costo     ON ai.interacciones(costo_usd) WHERE costo_usd IS NOT NULL;

-- ─── IA: PLANTILLAS DE PROMPTS ────────────────────────────────

CREATE TABLE ai.plantillas_prompt (
  id          UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  nombre      VARCHAR(100) NOT NULL UNIQUE,
  descripcion TEXT,
  proveedor   ai.proveedor_ia NOT NULL DEFAULT 'claude',
  modelo      VARCHAR(80),
  sistema     TEXT,        -- system prompt
  plantilla   TEXT NOT NULL, -- prompt con {{variables}}
  variables   TEXT[],      -- lista de variables esperadas
  activa      BOOLEAN      NOT NULL DEFAULT true,
  version     SMALLINT     NOT NULL DEFAULT 1,
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- Plantillas base
INSERT INTO ai.plantillas_prompt (nombre, descripcion, proveedor, sistema, plantilla, variables) VALUES
(
  'recordatorio_cita',
  'Mensaje de recordatorio personalizado para citas',
  'claude',
  'Eres el asistente virtual de la Psicóloga Luz Adriana. Tu tono es cálido, empático y profesional.',
  'Genera un mensaje de recordatorio de cita para {{nombre_paciente}} que tiene cita el {{fecha}} a las {{hora}} de forma {{modalidad}}. El mensaje debe ser amable, corto (máximo 3 oraciones) y mencionar que puede reagendar si necesita.',
  ARRAY['nombre_paciente','fecha','hora','modalidad']
),
(
  'resumen_sesion',
  'Genera un resumen estructurado de notas de sesión',
  'claude',
  'Eres asistente clínico de la Psicóloga Luz Adriana. Genera resúmenes claros, estructurados y confidenciales.',
  'Genera un resumen profesional y estructurado de la siguiente nota de sesión clínica: {{notas}}. Incluye: estado emocional observado, temas trabajados, avances notados y próximos pasos sugeridos.',
  ARRAY['notas']
),
(
  'clasificar_motivo',
  'Clasifica el motivo de consulta del paciente',
  'gemini',
  'Eres un asistente de triaje clínico. Clasifica motivos de consulta de forma objetiva.',
  'Clasifica el siguiente motivo de consulta en una de estas categorías: ansiedad, depresión, relaciones, duelo, infancia, familia, trabajo, otro. Motivo: {{motivo}}. Responde SOLO con la categoría.',
  ARRAY['motivo']
);

-- ─── AUDIT LOG ────────────────────────────────────────────────

CREATE TABLE audit.logs (
  id          BIGSERIAL   PRIMARY KEY,
  tabla       VARCHAR(80) NOT NULL,
  operacion   CHAR(6)     NOT NULL,  -- INSERT, UPDATE, DELETE
  usuario_id  UUID,
  registro_id TEXT,
  datos_ant   JSONB,
  datos_new   JSONB,
  ip          INET,
  user_agent  TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_audit_tabla  ON audit.logs(tabla, created_at);
CREATE INDEX idx_audit_uid    ON audit.logs(usuario_id);

-- ─── FUNCIÓN: updated_at automático ───────────────────────────

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Triggers updated_at
CREATE TRIGGER trg_usuarios_updated_at
  BEFORE UPDATE ON app.usuarios
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER trg_citas_updated_at
  BEFORE UPDATE ON app.citas
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER trg_pagos_updated_at
  BEFORE UPDATE ON app.pagos
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ─── FUNCIÓN: Audit trigger ───────────────────────────────────

CREATE OR REPLACE FUNCTION audit.registrar_cambio()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO audit.logs(tabla, operacion, registro_id, datos_ant, datos_new)
  VALUES (
    TG_TABLE_SCHEMA || '.' || TG_TABLE_NAME,
    TG_OP,
    COALESCE(NEW.id::TEXT, OLD.id::TEXT),
    CASE WHEN TG_OP != 'INSERT' THEN to_jsonb(OLD) ELSE NULL END,
    CASE WHEN TG_OP != 'DELETE' THEN to_jsonb(NEW) ELSE NULL END
  );
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_audit_citas
  AFTER INSERT OR UPDATE OR DELETE ON app.citas
  FOR EACH ROW EXECUTE FUNCTION audit.registrar_cambio();

CREATE TRIGGER trg_audit_usuarios
  AFTER INSERT OR UPDATE OR DELETE ON app.usuarios
  FOR EACH ROW EXECUTE FUNCTION audit.registrar_cambio();

-- Las cuentas operativas se crean en el arranque desde variables de entorno.

-- ─── VISTAS ÚTILES ────────────────────────────────────────────

CREATE OR REPLACE VIEW app.v_citas_hoy AS
SELECT
  c.id, c.fecha, c.hora_inicio, c.hora_fin,
  c.modalidad, c.tipo_sesion, c.estado,
  u.nombre || ' ' || u.apellido AS paciente,
  u.telefono, u.whatsapp,
  c.motivo, c.link_videollamada
FROM app.citas c
JOIN app.usuarios u ON u.id = c.paciente_id
WHERE c.fecha = CURRENT_DATE
ORDER BY c.hora_inicio;

CREATE OR REPLACE VIEW app.v_dashboard AS
SELECT
  (SELECT COUNT(*) FROM app.usuarios WHERE rol='paciente' AND activo=true)      AS pacientes_activos,
  (SELECT COUNT(*) FROM app.citas WHERE fecha=CURRENT_DATE)                      AS citas_hoy,
  (SELECT COUNT(*) FROM app.citas WHERE estado='pendiente')                      AS citas_pendientes,
  (SELECT COUNT(*) FROM app.citas WHERE fecha=CURRENT_DATE AND estado='confirmada') AS confirmadas_hoy,
  (SELECT COALESCE(SUM(monto),0) FROM app.pagos WHERE estado='pagado'
     AND DATE_TRUNC('month',created_at)=DATE_TRUNC('month',NOW()))               AS ingresos_mes,
  (SELECT COUNT(*) FROM app.notificaciones WHERE enviada=false)                  AS notif_pendientes;

COMMENT ON TABLE app.usuarios           IS 'Usuarios del sistema (pacientes, admin, psicóloga)';
COMMENT ON TABLE app.citas              IS 'Agendamiento de sesiones terapéuticas';
COMMENT ON TABLE app.fichas_clinicas    IS 'Historia clínica por paciente';
COMMENT ON TABLE app.notas_sesion       IS 'Notas privadas por sesión';
COMMENT ON TABLE ai.interacciones       IS 'Log de todas las llamadas a IAs (Claude, Gemini)';
COMMENT ON TABLE ai.plantillas_prompt   IS 'Prompts reutilizables para automatización con N8N';
