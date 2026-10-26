const express = require('express');
const rateLimit = require('express-rate-limit');
const { consultar } = require('../db');
const { ErrorApp } = require('../errores');
const {
  hashContrasena, compararContrasena, firmarToken, generarCodigo, hashCodigo, iguales,
} = require('../seguridad');
const {
  validarCorreo, validarNombre, validarContrasena, validarCodigo, hoyMexico,
} = require('../validacion');
const { enviarCodigo } = require('../mailer');
const { verificarCaptcha } = require('../captcha');
const { requiereSesion } = require('../middleware/auth');

const router = express.Router();

const limitar = (max, mensaje) =>
  rateLimit({
    windowMs: 15 * 60 * 1000,
    max,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: mensaje },
  });
const limiteAuth = limitar(40, 'Demasiados intentos. Espera unos minutos e inténtalo de nuevo.');
const limiteConsulta = limitar(120, 'Demasiadas consultas. Espera unos minutos.');

const MAX_INTENTOS = 3; // el código se bloquea tras 3 intentos fallidos
const ESPERA_REENVIO_SEG = 60;

const datosUsuario = (u) => ({ id: u.id, nombre: u.nombre, correo: u.correo });

/** Crea y envía un código nuevo (tipo 'verificar' o 'recuperar'). */
async function emitirCodigo(usuario, { respetarEspera, tipo = 'verificar' }) {
  const [ultimo] = await consultar(
    'SELECT TIMESTAMPDIFF(SECOND, creado_en, NOW()) AS hace FROM codigos_verificacion WHERE usuario_id = ? AND tipo = ? ORDER BY id DESC LIMIT 1',
    [usuario.id, tipo],
  );
  if (respetarEspera && ultimo && ultimo.hace < ESPERA_REENVIO_SEG) {
    return { enviado: false, esperar: ESPERA_REENVIO_SEG - ultimo.hace };
  }

  const codigo = generarCodigo();
  await consultar('UPDATE codigos_verificacion SET usado = 1 WHERE usuario_id = ? AND tipo = ? AND usado = 0', [usuario.id, tipo]);
  await consultar(
    'INSERT INTO codigos_verificacion (usuario_id, tipo, codigo_hash, expira_en) VALUES (?, ?, ?, DATE_ADD(NOW(), INTERVAL 10 MINUTE))',
    [usuario.id, tipo, hashCodigo(codigo)],
  );
  try {
    await enviarCodigo(usuario.correo, usuario.nombre, codigo, tipo);
  } catch (e) {
    console.error('No se pudo enviar el correo:', e.message);
    throw new ErrorApp(502, 'No pudimos enviar el correo. Inténtalo de nuevo en un momento.');
  }
  return { enviado: true, esperar: 0 };
}

/** Revisa un código (vigente, con intentos y correcto). Si todo está bien lo marca como usado. */
async function comprobarCodigo(usuario, codigo, tipo) {
  const [fila] = await consultar(
    'SELECT id, codigo_hash, intentos, (expira_en > NOW()) AS vigente FROM codigos_verificacion WHERE usuario_id = ? AND tipo = ? AND usado = 0 ORDER BY id DESC LIMIT 1',
    [usuario.id, tipo],
  );
  if (!fila) throw new ErrorApp(400, 'No hay un código activo. Solicita uno nuevo.', { campo: 'codigo', codigo: 'SIN_CODIGO' });
  if (!fila.vigente) throw new ErrorApp(400, 'El código venció. Solicita uno nuevo.', { campo: 'codigo', codigo: 'VENCIDO' });
  if (fila.intentos >= MAX_INTENTOS) {
    throw new ErrorApp(429, 'Demasiados intentos con este código. Solicita uno nuevo.', { campo: 'codigo', codigo: 'BLOQUEADO' });
  }
  if (!iguales(hashCodigo(codigo), fila.codigo_hash)) {
    await consultar('UPDATE codigos_verificacion SET intentos = intentos + 1 WHERE id = ?', [fila.id]);
    const restantes = MAX_INTENTOS - (fila.intentos + 1);
    throw new ErrorApp(
      400,
      restantes > 0 ? `Código incorrecto. Te quedan ${restantes} intentos.` : 'Código incorrecto. Solicita uno nuevo.',
      { campo: 'codigo', codigo: 'INCORRECTO' },
    );
  }
  await consultar('UPDATE codigos_verificacion SET usado = 1 WHERE id = ?', [fila.id]);
}

// ¿Ya existe una cuenta verificada con este correo? (para avisar mientras escribe)
router.get('/correo-disponible', limiteConsulta, async (req, res, next) => {
  try {
    const correo = validarCorreo(req.query.correo);
    const [u] = await consultar('SELECT verificado FROM usuarios WHERE correo = ?', [correo]);
    res.json({ disponible: !(u && u.verificado) });
  } catch (e) {
    next(e);
  }
});

router.post('/registro', limiteAuth, async (req, res, next) => {
  try {
    const nombre = validarNombre(req.body.nombre, 'nombre', 3);
    const correo = validarCorreo(req.body.correo);
    const contrasena = validarContrasena(req.body.contrasena);

    const [existente] = await consultar('SELECT id, verificado, estado FROM usuarios WHERE correo = ?', [correo]);
    if (existente && existente.estado === 'inactivo') {
      throw new ErrorApp(409, 'Ese correo pertenece a una cuenta eliminada. Podrás volver a usarlo cuando pasen 30 días.', { campo: 'correo', codigo: 'CUENTA_ELIMINADA' });
    }
    if (existente && existente.verificado) {
      throw new ErrorApp(409, 'Ya existe una cuenta con ese correo. Inicia sesión.', { campo: 'correo' });
    }

    const hash = await hashContrasena(contrasena);
    let id;
    if (existente) {
      // Registro anterior sin verificar: se actualizan los datos y se reenvía el código.
      await consultar('UPDATE usuarios SET nombre = ?, password_hash = ? WHERE id = ?', [nombre, hash, existente.id]);
      id = existente.id;
    } else {
      try {
        const r = await consultar('INSERT INTO usuarios (nombre, correo, password_hash) VALUES (?, ?, ?)', [nombre, correo, hash]);
        id = r.insertId;
      } catch (e) {
        if (e.code === 'ER_DUP_ENTRY') {
          throw new ErrorApp(409, 'Ya existe una cuenta con ese correo. Inicia sesión.', { campo: 'correo' });
        }
        throw e;
      }
    }

    await emitirCodigo({ id, nombre, correo }, { respetarEspera: true });
    res.status(201).json({ mensaje: 'Te enviamos un código de verificación a tu correo.', correo });
  } catch (e) {
    next(e);
  }
});

router.post('/verificar', limiteAuth, async (req, res, next) => {
  try {
    const correo = validarCorreo(req.body.correo);
    const codigo = validarCodigo(req.body.codigo);

    const [usuario] = await consultar('SELECT id, nombre, correo FROM usuarios WHERE correo = ?', [correo]);
    if (!usuario) throw new ErrorApp(400, 'Código incorrecto o vencido.', { campo: 'codigo' });

    await comprobarCodigo(usuario, codigo, 'verificar');
    await consultar('UPDATE usuarios SET verificado = 1 WHERE id = ?', [usuario.id]);
    res.json({ token: firmarToken(usuario), usuario: datosUsuario(usuario) });
  } catch (e) {
    next(e);
  }
});

router.post('/reenviar', limiteAuth, async (req, res, next) => {
  try {
    const correo = validarCorreo(req.body.correo);
    const [usuario] = await consultar('SELECT id, nombre, correo, verificado FROM usuarios WHERE correo = ?', [correo]);
    // Respuesta idéntica exista o no la cuenta, para no revelar correos registrados.
    if (usuario && !usuario.verificado) {
      const r = await emitirCodigo(usuario, { respetarEspera: true });
      if (!r.enviado) {
        throw new ErrorApp(429, `Espera ${r.esperar} segundos para pedir otro código.`, { codigo: 'ESPERA', esperar: r.esperar });
      }
    }
    res.json({ mensaje: 'Si el correo está pendiente de verificar, te enviamos un código nuevo.' });
  } catch (e) {
    next(e);
  }
});

router.post('/login', limiteAuth, async (req, res, next) => {
  try {
    // reCAPTCHA v2: solo en el inicio de sesión
    await verificarCaptcha(req.body.captcha, req.ip);
    const correo = validarCorreo(req.body.correo);
    const contrasena = typeof req.body.contrasena === 'string' ? req.body.contrasena : '';
    const [usuario] = await consultar(
      'SELECT id, nombre, correo, password_hash, verificado, estado FROM usuarios WHERE correo = ?',
      [correo],
    );
    const correcta = await compararContrasena(contrasena, usuario && usuario.password_hash);
    if (!usuario || !correcta) throw new ErrorApp(401, 'Correo o contraseña incorrectos.');
    if (usuario.estado === 'inactivo') {
      throw new ErrorApp(403, 'Esta cuenta fue eliminada. Sus datos se borran definitivamente a los 30 días.', { codigo: 'CUENTA_ELIMINADA' });
    }

    if (!usuario.verificado) {
      await emitirCodigo(usuario, { respetarEspera: true });
      throw new ErrorApp(403, 'Debes verificar tu correo. Te enviamos un código.', { codigo: 'NO_VERIFICADO', correo });
    }
    res.json({ token: firmarToken(usuario), usuario: datosUsuario(usuario) });
  } catch (e) {
    next(e);
  }
});

// ---------- Recuperar contraseña ----------
router.post('/olvide', limiteAuth, async (req, res, next) => {
  try {
    const correo = validarCorreo(req.body.correo);
    const [usuario] = await consultar('SELECT id, nombre, correo, verificado, estado FROM usuarios WHERE correo = ?', [correo]);
    if (usuario && usuario.verificado && usuario.estado === 'activo') {
      await emitirCodigo(usuario, { respetarEspera: true, tipo: 'recuperar' });
    }
    // Siempre la misma respuesta: no revela si el correo existe.
    res.json({ mensaje: 'Si el correo está registrado, te enviamos un código para restablecer tu contraseña.' });
  } catch (e) {
    next(e);
  }
});

router.post('/restablecer', limiteAuth, async (req, res, next) => {
  try {
    const correo = validarCorreo(req.body.correo);
    const codigo = validarCodigo(req.body.codigo);
    const contrasena = validarContrasena(req.body.contrasena);

    const [usuario] = await consultar('SELECT id, nombre, correo, verificado, estado FROM usuarios WHERE correo = ?', [correo]);
    if (!usuario || !usuario.verificado || usuario.estado !== 'activo') throw new ErrorApp(400, 'Código incorrecto o vencido.', { campo: 'codigo' });

    await comprobarCodigo(usuario, codigo, 'recuperar');
    await consultar('UPDATE usuarios SET password_hash = ? WHERE id = ?', [await hashContrasena(contrasena), usuario.id]);
    res.json({ mensaje: 'Tu contraseña se actualizó. Ya puedes iniciar sesión.' });
  } catch (e) {
    next(e);
  }
});

// ---------- Eliminar cuenta (borrado lógico: pasa a "inactivo" y se borra a los 30 días) ----------
router.post('/cuenta/eliminar', limiteAuth, requiereSesion, async (req, res, next) => {
  try {
    const contrasena = typeof req.body.contrasena === 'string' ? req.body.contrasena : '';
    const [u] = await consultar('SELECT password_hash FROM usuarios WHERE id = ?', [req.usuario.id]);
    const correcta = await compararContrasena(contrasena, u && u.password_hash);
    if (!correcta) throw new ErrorApp(401, 'La contraseña es incorrecta.', { campo: 'contrasena', codigo: 'CONTRASENA_INCORRECTA' });

    const [{ total }] = await consultar(
      'SELECT COUNT(*) AS total FROM intercambios WHERE creador_id = ? AND fecha >= ?',
      [req.usuario.id, hoyMexico()],
    );
    if (total > 0) {
      throw new ErrorApp(
        409,
        'Organizas intercambios que aún no pasan. Podrás eliminar tu cuenta cuando termine su fecha.',
        { codigo: 'ORGANIZA_ACTIVOS' },
      );
    }

    await consultar("UPDATE usuarios SET estado = 'inactivo', desactivado_en = NOW() WHERE id = ?", [req.usuario.id]);
    res.json({ mensaje: 'Tu cuenta se desactivó. Tus datos se conservan 30 días y después se eliminan definitivamente.' });
  } catch (e) {
    next(e);
  }
});

router.get('/yo', requiereSesion, (req, res) => {
  res.json({ usuario: req.usuario });
});

module.exports = router;
