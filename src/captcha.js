const config = require('./config');
const { ErrorApp } = require('./errores');

/**
 * Verifica el token de reCAPTCHA v2 con Google.
 * Si RECAPTCHA_SECRET está vacío (desarrollo local) se omite la validación.
 * En producción es obligatorio configurarlo.
 */
async function verificarCaptcha(token, ip) {
  if (!config.recaptcha.secret) {
    if (config.produccion) throw new ErrorApp(500, 'reCAPTCHA no está configurado en el servidor.');
    return;
  }
  if (typeof token !== 'string' || token.length < 20 || token.length > 4096) {
    throw new ErrorApp(400, 'Confirma que no eres un robot.', { codigo: 'CAPTCHA_REQUERIDO' });
  }
  let datos;
  try {
    const cuerpo = new URLSearchParams({ secret: config.recaptcha.secret, response: token });
    if (ip) cuerpo.set('remoteip', ip);
    const r = await fetch('https://www.google.com/recaptcha/api/siteverify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: cuerpo,
      signal: AbortSignal.timeout(8000),
    });
    datos = await r.json();
  } catch (e) {
    console.error('No se pudo verificar reCAPTCHA:', e.message);
    throw new ErrorApp(502, 'No pudimos validar el reCAPTCHA. Inténtalo de nuevo.');
  }
  if (!datos.success) {
    throw new ErrorApp(400, 'La verificación reCAPTCHA falló. Inténtalo de nuevo.', { codigo: 'CAPTCHA_INVALIDO' });
  }
}

module.exports = { verificarCaptcha };
