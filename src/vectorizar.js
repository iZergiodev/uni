/**
 * Convierte una máscara de cobertura (valores 0..1, un PNG pequeño y suavizado) en contornos
 * vectoriales: marching squares para trazar el borde y un enderezado que devuelve las aristas
 * horizontales y verticales a su sitio y recupera las esquinas rectas que el suavizado redondeó.
 * Las coordenadas resultantes están en píxeles de la imagen original.
 */
export function vectorizar(cobertura, ancho, alto, umbral = 0.5) {
  return trazarContornos(cobertura, ancho, alto, umbral).map(enderezar);
}

function trazarContornos(cobertura, ancho, alto, umbral) {
  const valor = (x, y) => (x < 0 || y < 0 || x >= ancho || y >= alto ? 0 : cobertura[y * ancho + x]);
  // Punto de corte en la arista entre los centros de dos píxeles vecinos.
  const enHorizontal = (x, y) => {
    const a = valor(x, y);
    const t = (umbral - a) / (valor(x + 1, y) - a);
    return { clave: `h${x},${y}`, x: x + 0.5 + t, y: y + 0.5 };
  };
  const enVertical = (x, y) => {
    const a = valor(x, y);
    const t = (umbral - a) / (valor(x, y + 1) - a);
    return { clave: `v${x},${y}`, x: x + 0.5, y: y + 0.5 + t };
  };

  const segmentos = [];
  for (let y = -1; y < alto; y++) {
    for (let x = -1; x < ancho; x++) {
      const caso =
        (valor(x, y) >= umbral ? 8 : 0) |
        (valor(x + 1, y) >= umbral ? 4 : 0) |
        (valor(x + 1, y + 1) >= umbral ? 2 : 0) |
        (valor(x, y + 1) >= umbral ? 1 : 0);
      if (caso === 0 || caso === 15) continue;
      const arriba = () => enHorizontal(x, y);
      const abajo = () => enHorizontal(x, y + 1);
      const izquierda = () => enVertical(x, y);
      const derecha = () => enVertical(x + 1, y);
      switch (caso) {
        case 1:
        case 14:
          segmentos.push([izquierda(), abajo()]);
          break;
        case 2:
        case 13:
          segmentos.push([abajo(), derecha()]);
          break;
        case 3:
        case 12:
          segmentos.push([izquierda(), derecha()]);
          break;
        case 4:
        case 11:
          segmentos.push([arriba(), derecha()]);
          break;
        case 6:
        case 9:
          segmentos.push([arriba(), abajo()]);
          break;
        case 7:
        case 8:
          segmentos.push([izquierda(), arriba()]);
          break;
        default: {
          // Casos ambiguos (esquinas opuestas): decide el valor medio de la celda.
          const centroDentro = (valor(x, y) + valor(x + 1, y) + valor(x + 1, y + 1) + valor(x, y + 1)) / 4 >= umbral;
          if ((caso === 5) === centroDentro) segmentos.push([izquierda(), arriba()], [abajo(), derecha()]);
          else segmentos.push([izquierda(), abajo()], [arriba(), derecha()]);
        }
      }
    }
  }

  // Enlaza los segmentos que comparten punto en contornos cerrados.
  const porClave = new Map();
  segmentos.forEach((segmento, i) => {
    for (const punto of segmento) {
      const lista = porClave.get(punto.clave);
      if (lista) lista.push(i);
      else porClave.set(punto.clave, [i]);
    }
  });
  const usado = new Uint8Array(segmentos.length);
  const contornos = [];
  for (let i = 0; i < segmentos.length; i++) {
    if (usado[i]) continue;
    usado[i] = 1;
    const [inicio, segundo] = segmentos[i];
    const contorno = [inicio, segundo];
    let actual = segundo;
    while (actual.clave !== inicio.clave) {
      const siguiente = porClave.get(actual.clave).find((k) => !usado[k]);
      if (siguiente === undefined) break;
      usado[siguiente] = 1;
      const [a, b] = segmentos[siguiente];
      actual = a.clave === actual.clave ? b : a;
      if (actual.clave !== inicio.clave) contorno.push(actual);
    }
    if (contorno.length >= 3) contornos.push(contorno);
  }
  return contornos;
}

const HORIZONTAL = 1;
const VERTICAL = 2;

function enderezar(puntos) {
  const n = puntos.length;
  if (n < 6) return puntos;

  // Tipo de cada segmento i → i+1.
  const tipo = new Int8Array(n);
  for (let i = 0; i < n; i++) {
    const a = puntos[i];
    const b = puntos[(i + 1) % n];
    const dx = Math.abs(b.x - a.x);
    const dy = Math.abs(b.y - a.y);
    if (dy <= dx * 0.18) tipo[i] = HORIZONTAL;
    else if (dx <= dy * 0.18) tipo[i] = VERTICAL;
  }

  // Tramos de segmentos consecutivos del mismo tipo.
  const tramos = agruparTramos(tipo);
  for (const tramo of tramos) {
    if (!tramo.tipo) continue;
    const primero = puntos[tramo.desde];
    const ultimo = puntos[(tramo.desde + tramo.largo) % n];
    const extension = tramo.tipo === HORIZONTAL ? Math.abs(ultimo.x - primero.x) : Math.abs(ultimo.y - primero.y);
    if (extension < 1.5) {
      tramo.tipo = 0;
      continue;
    }
    // La coordenada fija de la arista es la mediana de sus puntos.
    const valores = [];
    for (let s = 0; s <= tramo.largo; s++) {
      const p = puntos[(tramo.desde + s) % n];
      valores.push(tramo.tipo === HORIZONTAL ? p.y : p.x);
    }
    valores.sort((a, b) => a - b);
    tramo.fijo = valores[valores.length >> 1];
  }

  const fijoX = new Float64Array(n).fill(NaN);
  const fijoY = new Float64Array(n).fill(NaN);
  for (const tramo of tramos) {
    if (!tramo.tipo) continue;
    for (let s = 0; s <= tramo.largo; s++) {
      const j = (tramo.desde + s) % n;
      if (tramo.tipo === HORIZONTAL) fijoY[j] = tramo.fijo;
      else fijoX[j] = tramo.fijo;
    }
  }

  // Un tramo corto entre una arista horizontal y otra vertical es el chaflán que dejó el
  // suavizado: se sustituye por la esquina donde se cortan ambas aristas.
  const eliminar = new Uint8Array(n);
  const esquinas = new Map();
  tramos.forEach((tramo, t) => {
    if (tramo.tipo || tramo.largo > 3) return;
    const antes = tramos[(t - 1 + tramos.length) % tramos.length];
    const despues = tramos[(t + 1) % tramos.length];
    if (!antes.tipo || !despues.tipo || antes.tipo === despues.tipo) return;
    let longitud = 0;
    for (let s = 0; s < tramo.largo; s++) {
      const a = puntos[(tramo.desde + s) % n];
      const b = puntos[(tramo.desde + s + 1) % n];
      longitud += Math.hypot(b.x - a.x, b.y - a.y);
    }
    if (longitud > 2.2) return;
    const vertical = antes.tipo === VERTICAL ? antes : despues;
    const horizontal = antes.tipo === HORIZONTAL ? antes : despues;
    esquinas.set(tramo.desde, { x: vertical.fijo, y: horizontal.fijo });
    for (let s = 1; s <= tramo.largo; s++) eliminar[(tramo.desde + s) % n] = 1;
  });

  const resultado = [];
  for (let j = 0; j < n; j++) {
    if (eliminar[j]) continue;
    const esquina = esquinas.get(j);
    if (esquina) {
      resultado.push(esquina);
      continue;
    }
    const p = puntos[j];
    resultado.push({ x: Number.isNaN(fijoX[j]) ? p.x : fijoX[j], y: Number.isNaN(fijoY[j]) ? p.y : fijoY[j] });
  }
  return resultado;
}

function agruparTramos(tipo) {
  const n = tipo.length;
  let inicio = 0;
  while (inicio < n && tipo[inicio] === tipo[(inicio + n - 1) % n]) inicio++;
  if (inicio === n) return [{ tipo: tipo[0], desde: 0, largo: n }];
  const tramos = [];
  for (let k = 0; k < n; ) {
    const desde = (inicio + k) % n;
    let largo = 1;
    while (k + largo < n && tipo[(desde + largo) % n] === tipo[desde]) largo++;
    tramos.push({ tipo: tipo[desde], desde, largo });
    k += largo;
  }
  return tramos;
}
