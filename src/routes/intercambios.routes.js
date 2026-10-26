const express = require('express');
const crypto = require('crypto');
const config = require('../config');
const { consultar, transaccion } = require('../db');
const { ErrorApp } = require('../errores');
const { requiereSesion } = require('../middleware/auth');
const {
  validarNombre, validarFecha, validarPresupuesto, validarDeseo, validarId,
} = require('../validacion');
const { SorteoServicio, MIN_PARTICIPANTES } = require('../sorteo/servicio');
const { notificarCorreos, notificarUsuarios } = require('../notificaciones');

const router = express.Router();
const sorteo = new SorteoServicio();

const MAX_INTERCAMBIOS_POR_USUARIO = 30;
const MAX_DESEOS = 10;

router.use(requiereSesion);

/** Carga el intercambio solo si el usuario es organizador o participante (si no, "no existe"). */
async function cargar(idCrudo, usuario) {
  const id = validarId(idCrudo);
  const [inter] = await consultar(
    `SELECT i.id, i.nombre, i.fecha, i.presupuesto, i.sorteado, i.creador_id, i.codigo_invitacion, u.correo AS correo_creador
       FROM intercambios i JOIN usuarios u ON u.id = i.creador_id WHERE i.id = ?`,
    [id],
  );
  if (!inter) throw new ErrorApp(404, 'No se encontró el intercambio.');
  const [yo] = await consultar(
    'SELECT id, nombre, correo FROM participantes WHERE intercambio_id = ? AND correo = ?',
    [id, usuario.correo],
  );
  const esCreador = inter.creador_id === usuario.id;
  if (!esCreador && !yo) throw new ErrorApp(404, 'No se encontró el intercambio.');
  return { inter: { ...inter, presupuesto: Number(inter.presupuesto), sorteado: Boolean(inter.sorteado) }, yo: yo || null, esCreador };
}

const exigirCreador = (ctx) => {
  if (!ctx.esCreador) throw new ErrorApp(403, 'Solo el organizador puede hacer esto.');
};

// ---------------- Lista ----------------
router.get('/', async (req, res, next) => {
  try {
    const filas = await consultar(
      `SELECT i.id, i.nombre, i.fecha, i.presupuesto, i.sorteado, i.creador_id,
              (SELECT COUNT(*) FROM participantes p WHERE p.intercambio_id = i.id) AS participantes
         FROM intercambios i
        WHERE i.creador_id = ?
           OR EXISTS (SELECT 1 FROM participantes p WHERE p.intercambio_id = i.id AND p.correo = ?)
        ORDER BY i.fecha ASC, i.id ASC`,
      [req.usuario.id, req.usuario.correo],
    );
    res.json(
      filas.map((f) => ({
        id: f.id,
        nombre: f.nombre,
        fecha: f.fecha,
        presupuesto: Number(f.presupuesto),
        participantes: Number(f.participantes),
        sorteado: Boolean(f.sorteado),
        esCreador: f.creador_id === req.usuario.id,
      })),
    );
  } catch (e) {
    next(e);
  }
});

// ---------------- Crear ----------------
router.post('/', async (req, res, next) => {
  try {
    const nombre = validarNombre(req.body.nombre, 'nombre', 3).slice(0, 80);
    const fecha = validarFecha(req.body.fecha);
    const presupuesto = validarPresupuesto(req.body.presupuesto);

    const [{ total }] = await consultar('SELECT COUNT(*) AS total FROM intercambios WHERE creador_id = ?', [req.usuario.id]);
    if (total >= MAX_INTERCAMBIOS_POR_USUARIO) {
      throw new ErrorApp(400, `Llegaste al máximo de ${MAX_INTERCAMBIOS_POR_USUARIO} intercambios.`);
    }

    const id = await transaccion(async (cx) => {
      const [r] = await cx.execute(
        'INSERT INTO intercambios (nombre, fecha, presupuesto, creador_id, codigo_invitacion) VALUES (?, ?, ?, ?, ?)',
        [nombre, fecha, presupuesto, req.usuario.id, crypto.randomBytes(16).toString('base64url')],
      );
      await cx.execute(
        'INSERT INTO participantes (intercambio_id, nombre, correo) VALUES (?, ?, ?)',
        [r.insertId, req.usuario.nombre, req.usuario.correo],
      );
      return r.insertId;
    });
    res.status(201).json({ id });
  } catch (e) {
    next(e);
  }
});

// ---------------- Detalle ----------------
router.get('/:id', async (req, res, next) => {
  try {
    const ctx = await cargar(req.params.id, req.usuario);
    const { inter, yo, esCreador } = ctx;
    const participantes = await consultar(
      'SELECT id, nombre, correo FROM participantes WHERE intercambio_id = ? ORDER BY id',
      [inter.id],
    );
    const misDeseos = yo
      ? await consultar('SELECT id, texto FROM deseos WHERE participante_id = ? ORDER BY id', [yo.id])
      : [];

    res.json({
      id: inter.id,
      nombre: inter.nombre,
      fecha: inter.fecha,
      presupuesto: inter.presupuesto,
      sorteado: inter.sorteado,
      esCreador,
      esParticipante: Boolean(yo),
      participantes: participantes.map((p) => ({
        id: p.id,
        nombre: p.nombre,
        esOrganizador: p.correo === inter.correo_creador,
        ...(esCreador ? { correo: p.correo } : {}), // solo el organizador ve los correos
      })),
      // El link de invitación solo lo ve el organizador y mientras no se haga el sorteo
      ...(esCreador && !inter.sorteado ? { urlInvitacion: `${config.appUrl}/invitacion/${inter.codigo_invitacion}` } : {}),
      misDeseos,
    });
  } catch (e) {
    next(e);
  }
});

// ---------------- Participantes ----------------
router.delete('/:id/participantes/:pid', async (req, res, next) => {
  try {
    const ctx = await cargar(req.params.id, req.usuario);
    exigirCreador(ctx);
    if (ctx.inter.sorteado) throw new ErrorApp(409, 'El sorteo ya se realizó.');
    const pid = validarId(req.params.pid);

    const [p] = await consultar('SELECT id, correo FROM participantes WHERE id = ? AND intercambio_id = ?', [pid, ctx.inter.id]);
    if (!p) throw new ErrorApp(404, 'No se encontró al participante.');
    if (p.correo === ctx.inter.correo_creador) throw new ErrorApp(400, 'El organizador no se puede eliminar.');

    await consultar('DELETE FROM participantes WHERE id = ?', [pid]);
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

// ---------------- Sorteo ----------------
router.post('/:id/sorteo', async (req, res, next) => {
  try {
    const ctx = await cargar(req.params.id, req.usuario);
    exigirCreador(ctx);

    await transaccion(async (cx) => {
      const [[inter]] = await cx.execute('SELECT sorteado FROM intercambios WHERE id = ? FOR UPDATE', [ctx.inter.id]);
      if (inter.sorteado) throw new ErrorApp(409, 'El sorteo ya se realizó.');

      const [filas] = await cx.execute('SELECT id FROM participantes WHERE intercambio_id = ? ORDER BY id', [ctx.inter.id]);
      if (filas.length < MIN_PARTICIPANTES) {
        throw new ErrorApp(400, `Se necesitan al menos ${MIN_PARTICIPANTES} participantes.`);
      }

      const pares = sorteo.realizar(filas.map((f) => f.id));
      for (const [da, recibe] of pares) {
        await cx.execute(
          'INSERT INTO asignaciones (intercambio_id, participante_id, asignado_id) VALUES (?, ?, ?)',
          [ctx.inter.id, da, recibe],
        );
      }
      await cx.execute('UPDATE intercambios SET sorteado = 1 WHERE id = ?', [ctx.inter.id]);
    });
    res.json({ ok: true });

    // FCM: avisa a todos los participantes que ya pueden ver a quién le regalan (sin esperar la respuesta)
    consultar('SELECT correo FROM participantes WHERE intercambio_id = ?', [ctx.inter.id])
      .then((f) => notificarCorreos(
        f.map((x) => x.correo),
        '🎁 ¡Ya se realizó el sorteo!',
        `Descubre a quién le regalas en «${ctx.inter.nombre}».`,
        { tipo: 'sorteo', intercambioId: ctx.inter.id },
      ))
      .catch((e) => console.error('FCM sorteo:', e.message));
  } catch (e) {
    next(e);
  }
});

// ---------------- Mi asignación (privada) ----------------
router.get('/:id/mi-asignacion', async (req, res, next) => {
  try {
    const ctx = await cargar(req.params.id, req.usuario);
    if (!ctx.yo) throw new ErrorApp(404, 'No participas en este intercambio.');
    if (!ctx.inter.sorteado) throw new ErrorApp(409, 'El sorteo aún no se ha realizado.');

    const [fila] = await consultar(
      `SELECT r.id, r.nombre FROM asignaciones a
         JOIN participantes r ON r.id = a.asignado_id
        WHERE a.intercambio_id = ? AND a.participante_id = ?`,
      [ctx.inter.id, ctx.yo.id],
    );
    if (!fila) throw new ErrorApp(404, 'No se encontró tu asignación.');
    const deseos = await consultar('SELECT texto FROM deseos WHERE participante_id = ? ORDER BY id', [fila.id]);
    res.json({ asignado: { nombre: fila.nombre }, deseos: deseos.map((d) => d.texto) });
  } catch (e) {
    next(e);
  }
});

// ---------------- Mis preferencias ----------------
router.post('/:id/deseos', async (req, res, next) => {
  try {
    const ctx = await cargar(req.params.id, req.usuario);
    if (!ctx.yo) throw new ErrorApp(403, 'No participas en este intercambio.');
    const texto = validarDeseo(req.body.texto);

    const lista = await consultar('SELECT texto FROM deseos WHERE participante_id = ?', [ctx.yo.id]);
    if (lista.length >= MAX_DESEOS) throw new ErrorApp(400, `Máximo ${MAX_DESEOS} preferencias.`);
    if (lista.some((d) => d.texto.toLowerCase() === texto.toLowerCase())) {
      throw new ErrorApp(409, 'Esa preferencia ya está en tu lista.', { campo: 'texto' });
    }
    const r = await consultar('INSERT INTO deseos (participante_id, texto) VALUES (?, ?)', [ctx.yo.id, texto]);
    res.status(201).json({ id: r.insertId, texto });
    avisarCambioDeLista(ctx, 'agregó una preferencia nueva a su lista de deseos.');
  } catch (e) {
    next(e);
  }
});

router.delete('/:id/deseos/:did', async (req, res, next) => {
  try {
    const ctx = await cargar(req.params.id, req.usuario);
    if (!ctx.yo) throw new ErrorApp(403, 'No participas en este intercambio.');
    const did = validarId(req.params.did);
    const borrado = await consultar('DELETE FROM deseos WHERE id = ? AND participante_id = ?', [did, ctx.yo.id]);
    res.json({ ok: true });
    if (borrado.affectedRows > 0) avisarCambioDeLista(ctx, 'quitó una preferencia de su lista de deseos.');
  } catch (e) {
    next(e);
  }
});

/**
 * FCM: si ya hubo sorteo, avisa a quien le toca regalarle a este participante
 * que su lista de deseos cambió. No bloquea la respuesta ni expone quién es quién.
 */
function avisarCambioDeLista(ctx, accion) {
  if (!ctx.inter.sorteado || !ctx.yo) return;
  consultar(
    `SELECT u.id FROM asignaciones a
       JOIN participantes dador ON dador.id = a.participante_id
       JOIN usuarios u ON u.correo = dador.correo AND u.estado = 'activo'
      WHERE a.intercambio_id = ? AND a.asignado_id = ?`,
    [ctx.inter.id, ctx.yo.id],
  )
    .then((f) => notificarUsuarios(
      f.map((x) => x.id),
      '📝 Lista de deseos actualizada',
      `La persona a la que le regalas en «${ctx.inter.nombre}» ${accion}`,
      { tipo: 'lista-deseos', intercambioId: ctx.inter.id },
    ))
    .catch((e) => console.error('FCM lista de deseos:', e.message));
}

module.exports = router;
