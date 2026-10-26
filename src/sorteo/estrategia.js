const crypto = require('crypto');

/**
 * Patrón Strategy: cada estrategia define cómo se reparten las asignaciones.
 * asignar(ids) debe devolver un arreglo de pares [idQuienRegala, idQuienRecibe].
 */
class CicloAleatorioStrategy {
  asignar(ids) {
    const mezcla = [...ids];
    for (let i = mezcla.length - 1; i > 0; i--) {
      const j = crypto.randomInt(0, i + 1);
      [mezcla[i], mezcla[j]] = [mezcla[j], mezcla[i]];
    }
    // Cada persona le regala a la siguiente de la lista; la última, a la primera.
    return mezcla.map((id, i) => [id, mezcla[(i + 1) % mezcla.length]]);
  }
}

module.exports = { CicloAleatorioStrategy };
