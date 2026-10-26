class ErrorApp extends Error {
  constructor(estado, mensaje, extra = {}) {
    super(mensaje);
    this.estado = estado;
    this.extra = extra; // { campo, codigo, ... }
  }
}
module.exports = { ErrorApp };
