const db = require('../config/database');
const auditClinical = (resource, patientParam = 'pacienteId') => async (req, _res, next) => {
  const patientId = req.params[patientParam] || req.body.paciente_id || null;
  await db.query(`INSERT INTO audit.accesos_clinicos(usuario_id,paciente_id,recurso,accion,ip)
    VALUES($1,$2,$3,$4,$5)`, [req.user.id, patientId, resource, req.method, req.ip || null]);
  next();
};
module.exports = auditClinical;
