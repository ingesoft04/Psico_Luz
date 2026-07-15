const router=require('express').Router();const db=require('../config/database');const {auth}=require('../middleware/auth');router.use(auth);
router.get('/',async(req,res)=>{const {rows}=await db.query('SELECT * FROM app.notificaciones WHERE usuario_id=$1 ORDER BY created_at DESC LIMIT 30',[req.user.id]);res.json({ok:true,data:rows,noLeidas:rows.filter(x=>!x.leida).length})});
router.put('/leer-todas',async(req,res)=>{await db.query('UPDATE app.notificaciones SET leida=true WHERE usuario_id=$1',[req.user.id]);res.json({ok:true})});
router.put('/:id/leer',async(req,res)=>{await db.query('UPDATE app.notificaciones SET leida=true WHERE id=$1 AND usuario_id=$2',[req.params.id,req.user.id]);res.json({ok:true})});
module.exports=router;
