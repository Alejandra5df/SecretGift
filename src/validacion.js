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

/**
 * Contraseña del REGISTRO. Reglas:
 *  - mínimo 8 caracteres (máximo 64)
 *  - al menos una mayúscula, una minúscula y un carácter especial
 *  - sin números consecutivos (123, 987) ni letras consecutivas (abc, cba)
 * LARGO_SECUENCIA = cuántos seguidos cuentan como "consecutivos" (3 -> 123 sí, 12 no).
 */
const LARGO_SECUENCIA = 3;

function haySecuencia(texto, esDelTipo) {
  let sube = 1;
  let baja = 1;
  for (let i = 1; i < texto.length; i++) {
    const a = texto[i - 1];
    const b = texto[i];
    const validos = esDelTipo.test(a) && esDelTipo.test(b);
    sube = validos && b.charCodeAt(0) === a.charCodeAt(0) + 1 ? sube + 1 : 1;
    baja = validos && b.charCodeAt(0) === a.charCodeAt(0) - 1 ? baja + 1 : 1;
    if (sube >= LARGO_SECUENCIA || baja >= LARGO_SECUENCIA) return true;
  }
  return false;
}

function validarContrasenaRegistro(valor) {
  const c = typeof valor === 'string' ? valor : '';
  const sinAcentos = c.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const falla =
    c.length < 8 || c.length > 64 ||
    !/\p{Lu}/u.test(c) ||
    !/\p{Ll}/u.test(c) ||
    !/[^\p{L}\p{N}\s]/u.test(c) ||
    haySecuencia(c, /[0-9]/) ||
    haySecuencia(sinAcentos, /[a-z]/);
  if (falla) {
    throw new ErrorApp(
      400,
      'La contraseña debe tener mínimo 8 caracteres, una mayúscula, una minúscula, un carácter especial, y no llevar números ni letras consecutivos (como 123 o abc).',
      { campo: 'contrasena' },
    );
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
  validarCorreo, validarNombre, validarContrasena, validarContrasenaRegistro, validarFecha, validarPresupuesto,
  validarDeseo, validarCodigo, validarId, validarCodigoInvitacion, hoyMexico,
};
