const express = require('express');
const fs = require('fs');
const path = require('path');
const helmet = require('helmet');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const config = require('./config');
const { ErrorApp } = require('./errores');

const app = express();
app.disable('x-powered-by');
// El túnel (Tailscale Funnel, Render, etc.) entrega la IP real del visitante en X-Forwarded-For.
// Solo se confía en proxies que estén en esta misma computadora (en Render, en su único proxy).
app.set('trust proxy', process.env.TRUST_PROXY || (process.env.RENDER ? 1 : 'loopback'));
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", 'https://www.google.com/recaptcha/', 'https://www.gstatic.com/recaptcha/'],
        frameSrc: ['https://www.google.com/recaptcha/', 'https://recaptcha.google.com/recaptcha/'],
        scriptSrcAttr: ["'unsafe-inline'"],
        styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
        fontSrc: ["'self'", 'https://fonts.gstatic.com', 'data:'],
        imgSrc: ["'self'", 'data:', 'https://www.gstatic.com/recaptcha/'],
        connectSrc: ["'self'", 'data:', 'https://www.google.com/recaptcha/'],
        objectSrc: ["'none'"],
        baseUri: ["'self'"],
        frameAncestors: ["'none'"],
        formAction: ["'self'"],
        upgradeInsecureRequests: config.produccion ? [] : null, // en producción (Render) todo va por HTTPS
      },
    },
    hsts: config.produccion,
  }),
);

// En desarrollo se permiten localhost y tu red local; en producción solo CORS_ORIGINS.
// Orígenes de la app instalada en el celular (Capacitor)
const ORIGENES_APP = ['https://localhost', 'http://localhost', 'capacitor://localhost'];
const RE_LOCAL = /^https?:\/\/(localhost|127\.0\.0\.1|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+)(:\d+)?$/;
app.use(
  cors({
    origin(origen, cb) {
      if (!origen) return cb(null, true); // apps nativas, curl, etc.
      if (ORIGENES_APP.includes(origen) || config.corsOrigenes.includes(origen)) return cb(null, true);
      if (!config.produccion && RE_LOCAL.test(origen)) return cb(null, true);
      return cb(null, false);
    },
    methods: ['GET', 'POST', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  }),
);

app.use(express.json({ limit: '10kb' }));
app.use(
  rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 600,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Demasiadas solicitudes. Espera unos minutos.' },
  }),
);

app.get('/api/salud', (_req, res) => res.json({ ok: true }));

// Android verifica con este archivo que el link pertenece a tu app (para abrirla directo)
app.get('/.well-known/assetlinks.json', (_req, res) => {
  if (!config.androidAppId || config.androidSha256.length === 0) {
    return res.status(404).json({ error: 'No configurado.' });
  }
  return res.json([
    {
      relation: ['delegate_permission/common.handle_all_urls'],
      target: {
        namespace: 'android_app',
        package_name: config.androidAppId,
        sha256_cert_fingerprints: config.androidSha256,
      },
    },
  ]);
});
app.use('/api/auth', require('./routes/auth.routes'));
app.use('/api/intercambios', require('./routes/intercambios.routes'));
app.use('/api/invitaciones', require('./routes/invitaciones.routes'));
app.use('/api/notificaciones', require('./routes/notificaciones.routes'));

// Si existe la carpeta "public" (la app web compilada), el mismo servidor la sirve.
// Así los links de invitación abren la app en cualquier navegador.
const carpetaWeb = path.join(__dirname, '..', 'public');
if (fs.existsSync(path.join(carpetaWeb, 'index.html'))) {
  app.use(express.static(carpetaWeb, { index: false }));
  app.get(/^\/(?!api\/).*/, (_req, res) => res.sendFile(path.join(carpetaWeb, 'index.html')));
}

app.use((_req, _res, next) => next(new ErrorApp(404, 'Ruta no encontrada.')));

// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => {
  if (err instanceof ErrorApp) {
    return res.status(err.estado).json({ error: err.message, ...err.extra });
  }
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'El cuerpo de la solicitud no es válido.' });
  }
  if (err.type === 'entity.too.large') {
    return res.status(413).json({ error: 'La solicitud es demasiado grande.' });
  }
  console.error(err);
  return res.status(500).json({ error: 'Ocurrió un error en el servidor.' });
});

module.exports = app;
