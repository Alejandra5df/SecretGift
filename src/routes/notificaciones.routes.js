const express = require('express');
const { consultar } = require('../db');
const { ErrorApp } = require('../errores');
const { requiereSesion } = require('../middleware/auth');

const router = express.Router();
router.use(requiereSesion);

function validarToken(t) {
  const token = typeof t === 'string' ? t.trim() : '';
  if (token.length < 20 || token.length > 255 || /\s/.test(token)) {
    throw new ErrorApp(400, 'El token de notificaciones no es válido.');
  }
  return token;
}

// Registra (o reasigna al usuario actual) el token FCM de este dispositivo
router.post('/token', async (req, res, next) => {
  try {
    const token = validarToken(req.body.token);
    const plataforma = req.body.plataforma === 'ios' ? 'ios' : 'android';
    await consultar(
      `INSERT INTO dispositivos_fcm (usuario_id, token, plataforma) VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE usuario_id = VALUES(usuario_id), plataforma = VALUES(plataforma)`,
      [req.usuario.id, token, plataforma],
    );
    res.status(201).json({ ok: true });
  } catch (e) {
    next(e);
  }
});

// Quita el token (al cerrar sesión) para que este dispositivo deje de recibir avisos de esta cuenta
router.post('/token/eliminar', async (req, res, next) => {
  try {
    const token = validarToken(req.body.token);
    await consultar('DELETE FROM dispositivos_fcm WHERE token = ? AND usuario_id = ?', [token, req.usuario.id]);
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

module.exports = router;
