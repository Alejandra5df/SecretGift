const nodemailer = require('nodemailer');
const config = require('./config');

let transporte = null;
const usaGmailApi = () => Boolean(config.gmailApi.clientId && config.gmailApi.clientSecret && config.gmailApi.refreshToken);
const configurado = () => usaGmailApi() || Boolean(config.smtp.host && config.smtp.user && config.smtp.pass);

function obtenerTransporte() {
  if (!transporte) {
    transporte = nodemailer.createTransport({
      host: config.smtp.host,
      port: config.smtp.port,
      secure: config.smtp.secure,
      auth: { user: config.smtp.user, pass: config.smtp.pass },
    });
  }
  return transporte;
}

// ---------- Gmail API (HTTPS): funciona en Render gratis, donde el SMTP está bloqueado ----------
let tokenCache = { valor: '', vence: 0 };

async function tokenGmail() {
  if (tokenCache.valor && Date.now() < tokenCache.vence - 60000) return tokenCache.valor;
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: config.gmailApi.clientId,
      client_secret: config.gmailApi.clientSecret,
      refresh_token: config.gmailApi.refreshToken,
      grant_type: 'refresh_token',
    }),
    signal: AbortSignal.timeout(10000),
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok || !d.access_token) {
    throw new Error(`Gmail OAuth: ${d.error_description || d.error || r.status}`);
  }
  tokenCache = { valor: d.access_token, vence: Date.now() + (d.expires_in || 3600) * 1000 };
  return tokenCache.valor;
}

async function enviarPorGmailApi(opciones) {
  // nodemailer arma el mensaje completo y la API de Gmail lo envía
  const { message } = await nodemailer
    .createTransport({ streamTransport: true, buffer: true, newline: 'unix' })
    .sendMail(opciones);
  const token = await tokenGmail();
  const r = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ raw: message.toString('base64url') }),
    signal: AbortSignal.timeout(15000),
  });
  if (!r.ok) {
    const d = await r.json().catch(() => ({}));
    throw new Error(`Gmail API: ${(d.error && d.error.message) || r.status}`);
  }
}

// ---------- Plantilla del correo: sencilla, con una sola imagen (el logo) ----------
// Logo de SecretGift en blanco, incrustado en este archivo (se envía como adjunto CID).
const LOGO_PNG_BASE64 =
  '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';
const ADJUNTOS = [
  { filename: 'logo.png', content: Buffer.from(LOGO_PNG_BASE64, 'base64'), contentType: 'image/png', cid: 'logo@secretgift' },
];

const FUENTE = "'Segoe UI',Helvetica,Arial,sans-serif";
const AZUL = '#1f66d6';
const MARINO = '#14213d';
const GRIS = '#5f6f90';

function plantilla({ codigo, recuperar }) {
  const titulo = recuperar ? 'Restablece tu contraseña' : '¡Verifica tu correo!';
  const intro = recuperar
    ? 'Usa este código para restablecer tu contraseña de SecretGift:'
    : 'Usa este código para completar el registro de tu cuenta de SecretGift:';
  const aviso = recuperar
    ? 'Si no lo solicitaste, ignora este mensaje: tu contraseña no cambiará.'
    : 'Si no solicitaste este código, puedes ignorar este mensaje.';

  return `<!DOCTYPE html>
<html lang="es">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f1f6fd">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent">Tu código es ${codigo}. Vence en 10 minutos.</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f1f6fd">
    <tr><td align="center" style="padding:28px 12px">
      <table role="presentation" width="440" cellpadding="0" cellspacing="0" style="width:100%;max-width:440px;background:#ffffff;border:1px solid #e1eaf7;border-radius:18px;overflow:hidden;font-family:${FUENTE}">

        <tr><td align="center" bgcolor="${AZUL}" style="background:${AZUL};padding:18px 16px;font-size:0;line-height:0">
          <img src="cid:logo@secretgift" alt="SecretGift" width="190" style="display:block;margin:0 auto;width:190px;max-width:100%;height:auto;border:0;font-family:${FUENTE};font-size:22px;font-weight:700;color:#ffffff">
        </td></tr>

        <tr><td align="center" style="padding:30px 28px 0">
          <h1 style="margin:0;font-family:${FUENTE};font-size:24px;line-height:30px;font-weight:700;color:${MARINO}">${titulo}</h1>
          <p style="margin:12px 0 0;font-family:${FUENTE};font-size:15px;line-height:23px;color:${GRIS}">${intro}</p>
        </td></tr>

        <tr><td align="center" style="padding:22px 28px 0">
          <div style="background:#eef4ff;border:1px solid #d3e3fb;border-radius:14px;padding:18px 10px;font-family:;font-size:40px;line-height:46px;font-weight:800;letter-spacing:9px;color:${AZUL};text-align:center">${codigo}</div>
        </td></tr>

        <tr><td align="center" style="padding:16px 28px 0;font-family:${FUENTE};font-size:14px;color:${GRIS}">
          ⏱ Este código vence en <b style="color:${MARINO}">10 minutos</b>.
        </td></tr>

        <tr><td align="center" style="padding:20px 28px 28px;font-family:${FUENTE};font-size:13px;line-height:20px;color:#8a97b0">
          ${aviso}
        </td></tr>

        <tr><td align="center" bgcolor="#f6f9fe" style="background:#f6f9fe;border-top:1px solid #e8eff9;padding:14px 16px;font-family:${FUENTE};font-size:12px;color:#8a97b0">
          <b style="color:${AZUL}">SecretGift</b> · Regala momentos especiales
        </td></tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

async function enviarCodigo(correo, nombre, codigo, tipo = 'verificar') {
  if (!configurado()) {
    if (config.produccion) throw new Error('El correo no está configurado.');
    console.log(`\n[DESARROLLO] Código de verificación para ${correo}: ${codigo} (${tipo})\n`);
    return { simulado: true };
  }

  const recuperar = tipo === 'recuperar';
  const asunto = recuperar ? 'Restablece tu contraseña - SecretGift' : 'Verifica tu correo - SecretGift';
  const intro = recuperar ? 'usa este código para restablecer tu contraseña:' : 'usa este código para verificar tu correo:';
  const aviso = recuperar ? 'Si no lo solicitaste, ignora este mensaje: tu contraseña no cambiará.' : 'Si no creaste una cuenta, ignora este mensaje.';
  const texto = `Hola ${nombre},\n\n${intro} ${codigo}\n\nVence en 10 minutos. ${aviso}`;

  const mensaje = {
    from: config.smtp.from,
    to: correo,
    subject: asunto,
    text: texto,
    html: plantilla({ codigo, recuperar }),
    attachments: ADJUNTOS,
  };
  if (usaGmailApi()) await enviarPorGmailApi(mensaje);
  else await obtenerTransporte().sendMail(mensaje);
  return { simulado: false };
}

module.exports = { enviarCodigo, configurado, plantilla, usaGmailApi };
