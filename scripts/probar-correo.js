// Envía un correo de prueba para comprobar la configuración SMTP del archivo .env
//   npm run probar-correo -- destino@correo.com
const nodemailer = require('nodemailer');
const config = require('../src/config');

const destino = process.argv[2];
if (!destino) {
  console.error('Uso: npm run probar-correo -- tucorreo@ejemplo.com');
  process.exit(1);
}
const { usaGmailApi, enviarCodigo } = require('../src/mailer');
if (usaGmailApi()) {
  enviarCodigo(destino, 'Prueba', '123456', 'verificar')
    .then(() => console.log(`Correo de prueba enviado a ${destino} por la Gmail API. Revisa tu bandeja (y spam).`))
    .catch((e) => { console.error('No se pudo enviar el correo:', e.message); process.exit(1); });
  return;
}
if (!config.smtp.host || !config.smtp.user || !config.smtp.pass) {
  console.error('Faltan SMTP_HOST, SMTP_USER o SMTP_PASS en tu archivo .env');
  process.exit(1);
}

(async () => {
  const transporte = nodemailer.createTransport({
    host: config.smtp.host,
    port: config.smtp.port,
    secure: config.smtp.secure,
    auth: { user: config.smtp.user, pass: config.smtp.pass },
  });
  try {
    await transporte.verify();
    console.log('Conexión con el servidor de correo: OK');
    await transporte.sendMail({
      from: config.smtp.from,
      to: destino,
      subject: 'Prueba de correo de SecretGift',
      text: 'Si lees esto, el envío de correos de SecretGift funciona.',
    });
    console.log(`Correo de prueba enviado a ${destino}. Revisa tu bandeja (y la carpeta de spam).`);
  } catch (e) {
    console.error('\nNo se pudo enviar el correo:', e.message);
    if (e.code === 'EAUTH') {
      console.error('-> El servidor rechazó el usuario o la contraseña. En Gmail debes usar una "contraseña de aplicación"');
      console.error('   de 16 letras (requiere verificación en 2 pasos), no tu contraseña normal.');
    } else if (['ECONNECTION', 'ETIMEDOUT', 'ESOCKET', 'ENOTFOUND'].includes(e.code)) {
      console.error('-> No hay conexión con el servidor de correo. Revisa tu internet y SMTP_HOST / SMTP_PORT / SMTP_SECURE.');
    }
    process.exit(1);
  }
})();
