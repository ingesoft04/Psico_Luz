// ════════════════════════════════════════════════════════════
//  routes/auth.js
// ════════════════════════════════════════════════════════════
const router     = require('express').Router();
const { body }   = require('express-validator');
const ctrl       = require('../controllers/authController');
const { auth }   = require('../middleware/auth');
const { authLimiter } = require('../middleware/rateLimiter');

const passRules = body('password')
  .isLength({ min: 6 }).withMessage('Mínimo 6 caracteres');

router.post('/register',
  authLimiter,
  [
    body('nombre').trim().notEmpty().withMessage('Nombre requerido'),
    body('apellido').trim().notEmpty().withMessage('Apellido requerido'),
    body('email').isEmail().normalizeEmail().withMessage('Email inválido'),
    passRules,
    body('telefono').optional().isMobilePhone('es-CO'),
    body('tipo_documento').optional({ nullable:true }).isIn(['CC','CE','TI','PA']),
    body('numero_documento').optional({ nullable:true }).trim().isLength({ min:4,max:40 }),
    body('fecha_nacimiento').optional({ nullable:true }).isDate(),
  ],
  ctrl.register
);

router.post('/login',
  authLimiter,
  [
    body('email').isEmail().normalizeEmail(),
    body('password').notEmpty(),
  ],
  ctrl.login
);

router.post('/refresh',  ctrl.refreshToken);
router.post('/logout',   auth, ctrl.logout);
router.post('/forgot-password', authLimiter, [body('email').isEmail()], ctrl.forgotPassword);
router.post('/reset-password',  authLimiter, ctrl.resetPassword);
router.get('/verify-email/:token', ctrl.verifyEmail);
router.get('/me', auth, ctrl.me);

module.exports = router;


// ════════════════════════════════════════════════════════════
//  controllers/authController.js
// ════════════════════════════════════════════════════════════
