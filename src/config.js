require('dotenv').config();

function requerida(nombre) {
  const valor = process.env[nombre];
  if (!valor) {
    console.error(`\n[ERROR] Falta la variable ${nombre} en el archivo .env\n`);
    process.exit(1);
  }
  return valor;
}

const jwtSecret = requerida('JWT_SECRET');
if (jwtSecret.length < 32) {
  console.error('\n[ERROR] JWT_SECRET debe tener al menos 32 caracteres.\n');
  process.exit(1);
}

function dbSsl() {
  if (String(process.env.DB_SSL || 'false') !== 'true') return undefined;
  // DB_SSL_CA: certificado CA de Aiven (contenido PEM, con \n literales si va en una sola línea)
  const ca = (process.env.DB_SSL_CA || '').replace(/\\n/g, '\n');
  return ca ? { ca, rejectUnauthorized: true } : { rejectUnauthorized: false };
}

module.exports = {
  puerto: Number(process.env.PORT || 3000),
  produccion: process.env.NODE_ENV === 'production',
  db: {
    host: process.env.DB_HOST || '127.0.0.1',
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'secretgift',
    // Aiven for MySQL exige conexión cifrada (SSL). DB_SSL=true la activa.
    ssl: dbSsl(),
  },
  recaptcha: {
    secret: process.env.RECAPTCHA_SECRET || '',
    siteKey: process.env.RECAPTCHA_SITE_KEY || '',
  },
  // Firebase Cloud Messaging (notificaciones push). Credenciales de la cuenta de servicio.
  fcm: {
    json: process.env.FIREBASE_SERVICE_ACCOUNT || '',
  },
  // Dirección pública de la app web (la que va en los links de invitación)
  appUrl: (process.env.APP_URL || `http://localhost:${Number(process.env.PORT || 3000)}`).replace(/\/+$/, ''),
  // Para que Android abra los links de invitación directo en la app (App Links)
  androidAppId: process.env.ANDROID_APP_ID || '',
  androidSha256: (process.env.ANDROID_SHA256 || '').split(',').map((s) => s.trim()).filter(Boolean),
  jwtSecret,
  jwtExpira: process.env.JWT_EXPIRA || '7d',
  corsOrigenes: (process.env.CORS_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean),
  smtp: {
    host: process.env.SMTP_HOST || '',
    port: Number(process.env.SMTP_PORT || 465),
    secure: String(process.env.SMTP_SECURE ?? 'true') === 'true',
    user: process.env.SMTP_USER || '',
    pass: process.env.SMTP_PASS || '',
    from: process.env.SMTP_FROM || process.env.SMTP_USER || 'SecretGift <no-reply@secretgift.app>',
  },
};
