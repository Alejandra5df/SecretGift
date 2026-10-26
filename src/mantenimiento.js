const { consultar, transaccion } = require('./db');

const DIAS_DE_RETENCION = 30;

/**
 * Las cuentas eliminadas quedan "inactivas" y se conservan 30 días.
 * Pasado ese tiempo se borran definitivamente. Sus participaciones en intercambios
 * de otras personas se anonimizan para no romper el sorteo de los demás.
 */
async function purgarCuentasInactivas() {
  const vencidas = await consultar(
    "SELECT id, correo FROM usuarios WHERE estado = 'inactivo' AND desactivado_en < DATE_SUB(NOW(), INTERVAL ? DAY)",
    [DIAS_DE_RETENCION],
  );
  for (const u of vencidas) {
    await transaccion(async (cx) => {
      await cx.execute(
        "UPDATE participantes SET nombre = 'Cuenta eliminada', correo = CONCAT('eliminado-', id, '@eliminado.invalid') WHERE correo = ?",
        [u.correo],
      );
      await cx.execute('DELETE FROM usuarios WHERE id = ?', [u.id]);
    });
  }
  return vencidas.length;
}

function programarMantenimiento() {
  const ejecutar = () =>
    purgarCuentasInactivas()
      .then((n) => n && console.log(`Mantenimiento: ${n} cuenta(s) eliminada(s) definitivamente.`))
      .catch((e) => console.error('Error en el mantenimiento:', e.message));
  ejecutar();
  setInterval(ejecutar, 6 * 60 * 60 * 1000).unref();
}

module.exports = { purgarCuentasInactivas, programarMantenimiento, DIAS_DE_RETENCION };
