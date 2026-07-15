const router=require('express').Router();
const db=require('../config/database');
const {auth,rol}=require('../middleware/auth');
const AppError=require('../utils/AppError');
router.use(auth,rol('admin','psicologa'));
router.get('/:citaId',async(req,res)=>{const {rows}=await db.query('SELECT * FROM app.notas_sesion WHERE cita_id=$1 ORDER BY created_at DESC',[req.params.citaId]);res.json({ok:true,data:rows})});
router.post('/:citaId',async(req,res)=>{const {contenido,etiquetas,estado_animo,progreso,tareas_asignadas,next_steps,es_privada}=req.body;
  if(!contenido?.trim()) throw new AppError('Contenido requerido',400);
  const {rows:c}=await db.query('SELECT paciente_id FROM app.citas WHERE id=$1',[req.params.citaId]);if(!c.length)throw new AppError('Cita no encontrada',404);
  const {rows}=await db.query(`INSERT INTO app.notas_sesion(cita_id,paciente_id,contenido,etiquetas,estado_animo,progreso,tareas_asignadas,next_steps,es_privada)
  VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,[req.params.citaId,c[0].paciente_id,contenido,etiquetas,estado_animo,progreso,tareas_asignadas,next_steps,es_privada!==false]);res.status(201).json({ok:true,data:rows[0]})});
module.exports=router;
