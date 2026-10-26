const config = require('./config');
const app = require('./app');
const { pool } = require('./db');
const { configurado, usaGmailApi } = require('./mailer');
const { fcmConfigurado } = require('./notificaciones');
const { programarMantenimiento } = require('./mantenimiento');

(async () => {
  try {
    await pool.query('SELECT 1');
  } catch (e) {
    console.error(`\n[ERROR] No se pudo conectar a MySQL (${config.db.host}:${config.db.port}): ${e.message}`);
    console.error('Revisa que MySQL esté encendido y que DB_USER / DB_PASSWORD de tu .env sean correctos.\n');
    process.exit(1);
  }

  programarMantenimiento();

  app.listen(config.puerto, '0.0.0.0', () => {
    console.log(`SecretGift API escuchando en http://localhost:${config.puerto}/api`);
    console.log(`Links de invitación con base: ${config.appUrl}`);
    console.log(
      configurado()
        ? (usaGmailApi() ? 'Correo: Gmail API (HTTPS) configurada.' : 'Correo: SMTP configurado (los códigos se envían por correo).')
        : 'Correo: SMTP SIN configurar -> los códigos se imprimen aquí en la terminal (solo desarrollo).',
    );
    console.log(fcmConfigurado() ? 'FCM: notificaciones push activas.' : 'FCM: sin configurar (no se enviarán notificaciones push).');
    console.log(config.recaptcha.secret ? 'reCAPTCHA: activo en el inicio de sesión.' : 'reCAPTCHA: SIN configurar (se omite en desarrollo).');
  });
})();
