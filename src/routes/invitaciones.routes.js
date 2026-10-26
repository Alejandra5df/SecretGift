const express = require('express');
const rateLimit = require('express-rate-limit');
const { consultar, transaccion } = require('../db');
const { ErrorApp } = require('../errores');
const { requiereSesion } = require('../middleware/auth');
const { validarCodigoInvitacion, hoyMexico } = require('../validacion');

const router = express.Router();
const MAX_PARTICIPANTES = 30;

const limite = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Demasiadas consultas. Espera unos minutos.' },
});

// Vista previa pública de la invitación (solo datos básicos, sin correos ni participantes)
router.get('/:codigo', limite, async (req, res, next) => {
  try {
    const codigo = validarCodigoInvitacion(req.params.codigo);
    const [i] = await consultar(
      `SELECT i.nombre, i.fecha, i.presupuesto, i.sorteado, u.nombre AS organizador,
              (SELECT COUNT(*) FROM participantes p WHERE p.intercambio_id = i.id) AS participantes
         FROM intercambios i JOIN usuarios u ON u.id = i.creador_id
        WHERE i.codigo_invitacion = ?`,
      [codigo],
    );
    if (!i) throw new ErrorApp(404, 'Esta invitación no existe o ya no está disponible.');

    const vencido = i.fecha < hoyMexico();
    res.json({
      nombre: i.nombre,
      fecha: i.fecha,
      presupuesto: Number(i.presupuesto),
      organizador: String(i.organizador).split(' ')[0],
      participantes: Number(i.participantes),
      sorteado: Boolean(i.sorteado),
      vencido,
      abierta: !i.sorteado && !vencido,
    });
  } catch (e) {
    next(e);
  }
});

// Unirse al intercambio con la cuenta que tiene la sesión iniciada
router.post('/:codigo/aceptar', limite, requiereSesion, async (req, res, next) => {
  try {
    const codigo = validarCodigoInvitacion(req.params.codigo);

    const resultado = await transaccion(async (cx) => {
      const [[i]] = await cx.execute(
        'SELECT id, fecha, sorteado FROM intercambios WHERE codigo_invitacion = ? FOR UPDATE',
        [codigo],
      );
      if (!i) throw new ErrorApp(404, 'Esta invitación no existe o ya no está disponible.');

      const [[yo]] = await cx.execute(
        'SELECT id FROM participantes WHERE intercambio_id = ? AND correo = ?',
        [i.id, req.usuario.correo],
      );
      if (yo) return { id: i.id, yaParticipaba: true };

      if (i.sorteado) throw new ErrorApp(409, 'El sorteo de este intercambio ya se realizó, así que ya no se puede entrar.', { codigo: 'SORTEADO' });
      if (i.fecha < hoyMexico()) throw new ErrorApp(409, 'La fecha de este intercambio ya pasó.', { codigo: 'VENCIDO' });

      const [[{ total }]] = await cx.execute('SELECT COUNT(*) AS total FROM participantes WHERE intercambio_id = ?', [i.id]);
      if (total >= MAX_PARTICIPANTES) throw new ErrorApp(400, `Este intercambio ya tiene el máximo de ${MAX_PARTICIPANTES} participantes.`);

      await cx.execute(
        'INSERT INTO participantes (intercambio_id, nombre, correo) VALUES (?, ?, ?)',
        [i.id, req.usuario.nombre, req.usuario.correo],
      );
      return { id: i.id, yaParticipaba: false };
    });
    res.status(resultado.yaParticipaba ? 200 : 201).json(resultado);
  } catch (e) {
    next(e);
  }
});

module.exports = router;
