// Opciones de conexión SSL compartidas por la app y el script de inicialización (sin exigir JWT_SECRET).
require('dotenv').config();

function ssl() {
  if (String(process.env.DB_SSL || 'false') !== 'true') return undefined;
  const ca = (process.env.DB_SSL_CA || '').replace(/\\n/g, '\n');
  return ca ? { ca, rejectUnauthorized: true } : { rejectUnauthorized: false };
}

module.exports = { ssl: ssl() };
