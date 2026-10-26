const mysql = require('mysql2/promise');
const config = require('./config');

const pool = mysql.createPool({
  ...config.db,
  waitForConnections: true,
  connectionLimit: 10,
  charset: 'utf8mb4',
  dateStrings: true, // las fechas llegan como texto AAAA-MM-DD (sin problemas de zona horaria)
});

/** Consulta con parámetros (siempre parametrizada: evita inyección SQL). */
async function consultar(sql, params = []) {
  const [filas] = await pool.execute(sql, params);
  return filas;
}

/** Ejecuta varias operaciones en una transacción. */
async function transaccion(trabajo) {
  const conexion = await pool.getConnection();
  try {
    await conexion.beginTransaction();
    const resultado = await trabajo(conexion);
    await conexion.commit();
    return resultado;
  } catch (e) {
    await conexion.rollback();
    throw e;
  } finally {
    conexion.release();
  }
}

module.exports = { pool, consultar, transaccion };
