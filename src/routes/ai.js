// routes/ai.js
const router = require('express').Router();
const { body } = require('express-validator');
const ctrl   = require('../controllers/aiController');
const { auth, rol } = require('../middleware/auth');

router.use(auth);

// Asistente chat 24/7 (todos los usuarios autenticados)
router.post('/chat',
  [body('mensaje').trim().notEmpty().isLength({ max: 1000 })],
  ctrl.chat
);

// Solo psicóloga y admin
router.post('/recordatorio/:citaId',  rol('admin','psicologa','recepcionista'), ctrl.recordatorio);
router.post('/resumen/:citaId',        rol('admin','psicologa'), ctrl.resumenSesion);
router.post('/bienestar/:pacienteId',  rol('admin','psicologa'), ctrl.bienestar);

// Clasificación disponible para todos (al crear cita)
router.post('/clasificar',
  [body('motivo').trim().notEmpty().isLength({ max: 500 })],
  ctrl.clasificar
);

// Historial de uso IA (admin)
router.get('/log',        rol('admin'), ctrl.log);
router.get('/log/costos', rol('admin'), ctrl.costos);

// CRUD de plantillas de prompts
router.get('/plantillas',          rol('admin','psicologa'), ctrl.listarPlantillas);
router.post('/plantillas',         rol('admin'), ctrl.crearPlantilla);
router.put('/plantillas/:id',      rol('admin'), ctrl.actualizarPlantilla);

module.exports = router;


// ════════════════════════════════════════════════════════════
//  controllers/aiController.js
// ════════════════════════════════════════════════════════════
