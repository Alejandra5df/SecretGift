const { CicloAleatorioStrategy } = require('./estrategia');

const MIN_PARTICIPANTES = 3;

class SorteoServicio {
  constructor(estrategia = new CicloAleatorioStrategy()) {
    this.estrategia = estrategia;
  }

  establecerEstrategia(estrategia) {
    this.estrategia = estrategia;
  }

  realizar(ids) {
    if (ids.length < MIN_PARTICIPANTES) {
      throw new Error(`Se necesitan al menos ${MIN_PARTICIPANTES} participantes.`);
    }
    const pares = this.estrategia.asignar(ids);
    if (!this.esValido(ids, pares)) {
      throw new Error('El sorteo generó una asignación inválida.');
    }
    return pares;
  }

  /** Nadie se regala a sí mismo y todos dan y reciben exactamente una vez. */
  esValido(ids, pares) {
    if (pares.length !== ids.length) return false;
    const dan = new Set();
    const reciben = new Set();
    for (const [da, recibe] of pares) {
      if (da === recibe || !ids.includes(da) || !ids.includes(recibe)) return false;
      if (dan.has(da) || reciben.has(recibe)) return false;
      dan.add(da);
      reciben.add(recibe);
    }
    return true;
  }
}

module.exports = { SorteoServicio, MIN_PARTICIPANTES };
