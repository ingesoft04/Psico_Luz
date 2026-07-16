// routes/citas.js
const router   = require('express').Router();
const { body } = require('express-validator');
const ctrl     = require('../controllers/citasController');
const { auth, rol } = require('../middleware/auth');

router.use(auth);

router.get('/',           ctrl.listar);
router.get('/hoy',        rol('admin','psicologa','recepcionista'), ctrl.hoy);
router.get('/:id/calendario.ics', ctrl.exportarCalendario);
router.get('/:id/sala', ctrl.obtenerSalaVirtual);
router.get('/:id',        ctrl.obtener);
router.post('/',
  [
    body('fecha').isDate().withMessage('Fecha inválida'),
    body('hora_inicio').matches(/^\d{2}:\d{2}$/).withMessage('Hora inválida'),
    body('modalidad').isIn(['presencial','virtual']),
  ],
  ctrl.crear
);
router.put('/:id',        ctrl.actualizar);
router.patch('/:id/reprogramar',
  [body('fecha').isDate(), body('hora_inicio').matches(/^\d{2}:\d{2}$/), body('modalidad').isIn(['presencial','virtual'])],
  ctrl.reprogramar
);
router.patch('/:id/estado', rol('admin','psicologa','recepcionista'), ctrl.cambiarEstado);
router.delete('/:id',     ctrl.cancelar);

module.exports = router;


// ════════════════════════════════════════════════════════════
//  controllers/citasController.js
// ════════════════════════════════════════════════════════════
