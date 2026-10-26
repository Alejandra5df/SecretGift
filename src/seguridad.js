const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const config = require('./config');

const RONDAS = 12;
// Hash de relleno para que el login tarde lo mismo exista o no el correo.
const HASH_FALSO = bcrypt.hashSync('relleno-no-valido', RONDAS);

const hashContrasena = (contrasena) => bcrypt.hash(contrasena, RONDAS);
const compararContrasena = (contrasena, hash) => bcrypt.compare(contrasena, hash || HASH_FALSO);

const firmarToken = (usuario) =>
  jwt.sign({ sub: usuario.id }, config.jwtSecret, { algorithm: 'HS256', expiresIn: config.jwtExpira });
const verificarToken = (token) => jwt.verify(token, config.jwtSecret, { algorithms: ['HS256'] });

/** Código de 6 dígitos generado con aleatoriedad criptográfica. */
const generarCodigo = () => String(crypto.randomInt(0, 1000000)).padStart(6, '0');
const hashCodigo = (codigo) => crypto.createHmac('sha256', config.jwtSecret).update(codigo).digest('hex');
const iguales = (a, b) => {
  const A = Buffer.from(a);
  const B = Buffer.from(b);
  return A.length === B.length && crypto.timingSafeEqual(A, B);
};

module.exports = {
  hashContrasena, compararContrasena, firmarToken, verificarToken,
  generarCodigo, hashCodigo, iguales,
};
