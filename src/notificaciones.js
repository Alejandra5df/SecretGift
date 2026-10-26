const config = require('./config');
const { consultar } = require('./db');

let mensajeria = null;
let intentado = false;

/** Inicializa Firebase Admin una sola vez. Devuelve null si FCM no está configurado. */
function obtenerMensajeria() {
  if (intentado) return mensajeria;
  intentado = true;
  if (!config.fcm.json) return null;
  try {
    const { initializeApp, cert } = require('firebase-admin/app');
    const { getMessaging } = require('firebase-admin/messaging');
    // FIREBASE_SERVICE_ACCOUNT puede ser el JSON completo o ese JSON en base64.
    const crudo = config.fcm.json.trim().startsWith('{')
      ? config.fcm.json
      : Buffer.from(config.fcm.json, 'base64').toString('utf8');
    const app = initializeApp({ credential: cert(JSON.parse(crudo)) });
    mensajeria = getMessaging(app);
  } catch (e) {
    console.error('FCM: no se pudo iniciar Firebase Admin:', e.message);
  }
  return mensajeria;
}

const fcmConfigurado = () => Boolean(obtenerMensajeria());

/** Envía una notificación push a todos los dispositivos de los usuarios indicados. Nunca lanza errores. */
async function notificarUsuarios(usuarioIds, titulo, cuerpo, datos = {}) {
  try {
    const m = obtenerMensajeria();
    const ids = [...new Set(usuarioIds)].filter(Boolean);
    if (!m || ids.length === 0) return;

    const filas = await consultar(
      `SELECT token FROM dispositivos_fcm WHERE usuario_id IN (${ids.map(() => '?').join(',')})`,
      ids,
    );
    const tokens = filas.map((f) => f.token);
    if (tokens.length === 0) return;

    const respuesta = await m.sendEachForMulticast({
      tokens,
      notification: { title: titulo, body: cuerpo },
      data: Object.fromEntries(Object.entries(datos).map(([k, v]) => [k, String(v)])),
      android: { priority: 'high', notification: { channelId: 'secretgift', sound: 'default' } },
    });

    // Limpia los tokens que ya no sirven (app desinstalada, token vencido)
    const invalidos = [];
    respuesta.responses.forEach((r, i) => {
      const c = r.error && r.error.code;
      if (c === 'messaging/registration-token-not-registered' || c === 'messaging/invalid-registration-token') {
        invalidos.push(tokens[i]);
      }
    });
    if (invalidos.length) {
      await consultar(`DELETE FROM dispositivos_fcm WHERE token IN (${invalidos.map(() => '?').join(',')})`, invalidos);
    }
  } catch (e) {
    console.error('FCM: error al enviar notificación:', e.message);
  }
}

/** Notifica a los usuarios (por correo) que participan en un intercambio. */
async function notificarCorreos(correos, titulo, cuerpo, datos) {
  if (!correos.length) return;
  const usuarios = await consultar(
    `SELECT id FROM usuarios WHERE estado = 'activo' AND correo IN (${correos.map(() => '?').join(',')})`,
    correos,
  );
  await notificarUsuarios(usuarios.map((u) => u.id), titulo, cuerpo, datos);
}

module.exports = { notificarUsuarios, notificarCorreos, fcmConfigurado };
