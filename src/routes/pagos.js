const router = require('express').Router();
const { body, validationResult } = require('express-validator');
const db = require('../config/database');
const { auth, rol } = require('../middleware/auth');
const AppError = require('../utils/AppError');
router.use(auth);

router.get('/', async (req, res) => {
  const staff = ['admin','psicologa','recepcionista'].includes(req.user.rol);
  const { rows } = await db.query(`SELECT p.*,c.fecha,c.hora_inicio,c.modalidad,
    u.nombre||' '||u.apellido AS paciente FROM app.pagos p
    JOIN app.citas c ON c.id=p.cita_id JOIN app.usuarios u ON u.id=p.paciente_id
    ${staff ? '' : 'WHERE p.paciente_id=$1'} ORDER BY p.created_at DESC LIMIT 50`, staff ? [] : [req.user.id]);
  res.json({ ok:true, data:rows });
});

router.post('/', [body('cita_id').isUUID(), body('monto').isFloat({gt:0}),
  body('metodo').optional().isIn(['efectivo','transferencia','tarjeta','nequi','daviplata'])], async (req,res) => {
  const errors=validationResult(req); if(!errors.isEmpty()) return res.status(422).json({ok:false,errors:errors.array()});
  const { rows:citas }=await db.query('SELECT paciente_id FROM app.citas WHERE id=$1',[req.body.cita_id]);
  if(!citas.length) throw new AppError('Cita no encontrada',404);
  if(req.user.rol==='paciente' && citas[0].paciente_id!==req.user.id) throw new AppError('Sin permiso',403);
  const { rows }=await db.query(`INSERT INTO app.pagos(cita_id,paciente_id,monto,metodo,notas)
    VALUES($1,$2,$3,$4,$5) RETURNING *`,[req.body.cita_id,citas[0].paciente_id,req.body.monto,req.body.metodo||'efectivo',req.body.notas]);
  res.status(201).json({ok:true,data:rows[0]});
});

router.patch('/:id/estado', rol('admin','recepcionista'), async(req,res)=>{
  if(!['pendiente','pagado','reembolsado','fallido'].includes(req.body.estado)) throw new AppError('Estado inválido',400);
  const {rows}=await db.query('UPDATE app.pagos SET estado=$1 WHERE id=$2 RETURNING *',[req.body.estado,req.params.id]);
  if(!rows.length) throw new AppError('Pago no encontrado',404); res.json({ok:true,data:rows[0]});
});
module.exports=router;
