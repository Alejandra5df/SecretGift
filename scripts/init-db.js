// Crea la base de datos y las tablas (database/schema.sql) y actualiza bases antiguas.
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const mysql = require('mysql2/promise');

const BD = process.env.DB_NAME || 'secretgift';
const config = require('../src/config-bd');

async function existeColumna(cx, tabla, columna) {
  const [filas] = await cx.query(
    'SELECT COUNT(*) AS n FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND COLUMN_NAME = ?',
    [BD, tabla, columna],
  );
  return filas[0].n > 0;
}

(async () => {
  const cx = await mysql.createConnection({
    host: process.env.DB_HOST || '127.0.0.1',
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    multipleStatements: true,
    ssl: config.ssl,
  });
  let sql = fs.readFileSync(path.join(__dirname, '..', 'database', 'schema.sql'), 'utf8');
  // En Aiven la base ya existe (defaultdb): se usa DB_NAME en lugar de crear "secretgift".
  sql = sql.replace(/CREATE DATABASE IF NOT EXISTS secretgift[^;]*;/i, `CREATE DATABASE IF NOT EXISTS \`${BD}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;`)
           .replace(/USE secretgift;/i, `USE \`${BD}\`;`);
  try {
    await cx.query(sql);
  } catch (e) {
    if (e.code !== 'ER_DBACCESS_DENIED_ERROR' && e.code !== 'ER_SPECIFIC_ACCESS_DENIED_ERROR') throw e;
    // Sin permiso para crear la base: se crean solo las tablas dentro de la existente.
    await cx.query(`USE \`${BD}\``);
    await cx.query(sql.replace(/CREATE DATABASE[^;]*;/i, '').replace(/USE [^;]*;/i, ''));
  }
  await cx.query(`USE \`${BD}\``);

  // --- Migraciones para bases creadas con versiones anteriores ---
  if (!(await existeColumna(cx, 'usuarios', 'estado'))) {
    await cx.query("ALTER TABLE usuarios ADD COLUMN estado VARCHAR(10) NOT NULL DEFAULT 'activo' AFTER verificado, ADD COLUMN desactivado_en DATETIME NULL AFTER estado");
    console.log('  + usuarios: columnas estado y desactivado_en');
  }
  if (!(await existeColumna(cx, 'intercambios', 'codigo_invitacion'))) {
    await cx.query('ALTER TABLE intercambios ADD COLUMN codigo_invitacion VARCHAR(32) NULL');
    const [filas] = await cx.query('SELECT id FROM intercambios');
    for (const f of filas) {
      await cx.query('UPDATE intercambios SET codigo_invitacion = ? WHERE id = ?', [crypto.randomBytes(16).toString('base64url'), f.id]);
    }
    await cx.query('ALTER TABLE intercambios MODIFY codigo_invitacion VARCHAR(32) NOT NULL, ADD UNIQUE KEY uq_intercambios_invitacion (codigo_invitacion)');
    console.log('  + intercambios: columna codigo_invitacion');
  }

  await cx.end();
  console.log(`Base de datos "${BD}" lista (tablas creadas y actualizadas).`);
})().catch((e) => {
  console.error('No se pudo crear la base de datos:', e.message);
  process.exit(1);
});
