/** Generador pseudoaleatorio con semilla (mulberry32): el universo sale igual en cada visita. */
export function azarConSemilla(semilla) {
  let estado = semilla >>> 0;
  return () => {
    estado = (estado + 0x6d2b79f5) >>> 0;
    let t = estado;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Número con distribución normal (media 0, desviación 1). */
export function normal(azar) {
  const u = Math.max(azar(), 1e-9);
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * azar());
}
