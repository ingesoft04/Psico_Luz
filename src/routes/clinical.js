const router=require('express').Router();
const db=require('../config/database');
const {auth,rol}=require('../middleware/auth');
const audit=require('../middleware/auditClinical');
router.use(auth,rol('psicologa'));
router.get('/resumen',async(_req,res)=>{const {rows}=await db.query(`SELECT
  (SELECT COUNT(*) FROM app.citas WHERE fecha=CURRENT_DATE) citas_hoy,
  (SELECT COUNT(*) FROM app.citas WHERE fecha>CURRENT_DATE AND estado IN('pendiente','confirmada')) proximas,
  (SELECT COUNT(*) FROM app.usuarios WHERE rol='paciente' AND activo) pacientes,
  (SELECT COUNT(*) FROM app.lista_espera WHERE estado='activa') espera`);res.json({ok:true,data:rows[0]})});
router.get('/agenda',async(req,res)=>{const desde=req.query.desde||new Date().toISOString().slice(0,10),hasta=req.query.hasta||desde;const {rows}=await db.query(`SELECT c.*,u.nombre,u.apellido,u.telefono,u.email,
  EXISTS(SELECT 1 FROM app.notas_sesion n WHERE n.cita_id=c.id) AS registro_diligenciado
  FROM app.citas c JOIN app.usuarios u ON u.id=c.paciente_id
  WHERE c.fecha BETWEEN $1 AND $2 ORDER BY c.fecha,c.hora_inicio`,[desde,hasta]);res.json({ok:true,data:rows})});
router.get('/pacientes',async(req,res)=>{const q=`%${req.query.q||''}%`;const {rows}=await db.query(`SELECT id,nombre,apellido,email,telefono,ciudad,created_at FROM app.usuarios WHERE rol='paciente' AND (nombre ILIKE $1 OR apellido ILIKE $1 OR email ILIKE $1) ORDER BY nombre LIMIT 100`,[q]);res.json({ok:true,data:rows})});
router.get('/pacientes/:pacienteId/ficha',audit('ficha'),async(req,res)=>{const {rows}=await db.query('SELECT * FROM app.fichas_clinicas WHERE paciente_id=$1',[req.params.pacienteId]);res.json({ok:true,data:rows[0]||null})});
router.get('/auditoria-accesos',async(_req,res)=>{const {rows}=await db.query(`SELECT a.*,u.email AS profesional,p.email AS paciente FROM audit.accesos_clinicos a LEFT JOIN app.usuarios u ON u.id=a.usuario_id LEFT JOIN app.usuarios p ON p.id=a.paciente_id ORDER BY a.created_at DESC LIMIT 100`);res.json({ok:true,data:rows})});
module.exports=router;
