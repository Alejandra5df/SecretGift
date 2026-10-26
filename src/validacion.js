const { ErrorApp } = require('./errores');

const RE_CORREO = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const RE_NOMBRE = /^[\p{L}][\p{L}\p{M}' .-]*$/u;

function texto(valor) {
  return typeof valor === 'string' ? valor.trim() : '';
}

function validarCorreo(valor) {
  const correo = texto(valor).toLowerCase();
  if (!correo || correo.length > 254 || !RE_CORREO.test(correo)) {
    throw new ErrorApp(400, 'Escribe un correo válido.', { campo: 'correo' });
  }
  return correo;
}

function validarNombre(valor, campo = 'nombre', minimo = 2) {
  const nombre = texto(valor).replace(/\s+/g, ' ');
  if (nombre.length < minimo || nombre.length > 80 || !RE_NOMBRE.test(nombre)) {
    throw new ErrorApp(400, `Escribe un nombre válido (mínimo ${minimo} letras).`, { campo });
  }
  return nombre;
}

function validarContrasena(valor) {
  const c = typeof valor === 'string' ? valor : '';
  if (c.length < 8 || c.length > 64 || !/[A-Za-z]/.test(c) || !/\d/.test(c)) {
    throw new ErrorApp(400, 'La contraseña debe tener de 8 a 64 caracteres, con letras y números.', { campo: 'contrasena' });
  }
  return c;
}

function hoyMexico() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Mexico_City' });
}

function validarFecha(valor) {
  const f = texto(valor);
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(f);
  if (!m) throw new ErrorApp(400, 'La fecha no es válida.', { campo: 'fecha' });
  const [, a, mes, d] = m.map(Number);
  const fecha = new Date(Date.UTC(a, mes - 1, d));
  const real = fecha.getUTCFullYear() === a && fecha.getUTCMonth() === mes - 1 && fecha.getUTCDate() === d;
  if (!real || a > 2100) throw new ErrorApp(400, 'La fecha no es válida.', { campo: 'fecha' });
  if (f < hoyMexico()) throw new ErrorApp(400, 'La fecha ya pasó. Elige hoy o una fecha posterior.', { campo: 'fecha' });
  return f;
}

function validarPresupuesto(valor) {
  const n = Number(valor);
  if (!Number.isFinite(n) || n <= 0 || n > 100000) {
    throw new ErrorApp(400, 'El presupuesto debe ser mayor a 0 y menor a $100,000.', { campo: 'presupuesto' });
  }
  return Math.round(n * 100) / 100;
}

function validarDeseo(valor) {
  const t = texto(valor).replace(/\s+/g, ' ');
  if (t.length < 2 || t.length > 60) {
    throw new ErrorApp(400, 'La preferencia debe tener de 2 a 60 caracteres.', { campo: 'texto' });
  }
  return t;
}

function validarCodigo(valor) {
  const c = texto(valor);
  if (!/^\d{6}$/.test(c)) throw new ErrorApp(400, 'El código tiene 6 dígitos.', { campo: 'codigo' });
  return c;
}

function validarCodigoInvitacion(valor) {
  const c = texto(valor);
  if (!/^[A-Za-z0-9_-]{16,32}$/.test(c)) throw new ErrorApp(404, 'Esta invitación no existe o ya no está disponible.');
  return c;
}

function validarId(valor) {
  const n = Number(valor);
  if (!Number.isInteger(n) || n <= 0) throw new ErrorApp(404, 'No se encontró lo que buscas.');
  return n;
}

module.exports = {
  validarCorreo, validarNombre, validarContrasena, validarFecha, validarPresupuesto,
  validarDeseo, validarCodigo, validarId, validarCodigoInvitacion, hoyMexico,
};
