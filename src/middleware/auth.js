const { consultar } = require('../db');
const { verificarToken } = require('../seguridad');
const { ErrorApp } = require('../errores');

/** Exige un token válido y carga al usuario (debe seguir existiendo y estar verificado). */
async function requiereSesion(req, _res, next) {
  try {
    const cabecera = req.headers.authorization || '';
    const [tipo, token] = cabecera.split(' ');
    if (tipo !== 'Bearer' || !token) throw new ErrorApp(401, 'Inicia sesión para continuar.');

    let datos;
    try {
      datos = verificarToken(token);
    } catch {
      throw new ErrorApp(401, 'Tu sesión venció. Inicia sesión de nuevo.');
    }
    const [usuario] = await consultar(
      'SELECT id, nombre, correo, verificado, estado FROM usuarios WHERE id = ?',
      [datos.sub],
    );
    if (!usuario || !usuario.verificado || usuario.estado !== 'activo') throw new ErrorApp(401, 'Inicia sesión para continuar.');
    req.usuario = { id: usuario.id, nombre: usuario.nombre, correo: usuario.correo };
    next();
  } catch (e) {
    next(e);
  }
}

module.exports = { requiereSesion };
