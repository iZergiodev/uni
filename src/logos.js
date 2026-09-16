import * as THREE from 'three';
import { ESTRELLA, PRODUCTOS } from './config.js';
import { vectorizar } from './vectorizar.js';

// Resolución de la textura del logo blanco que se pinta sobre los astros.
const RESOLUCION_GLIFO = 1024;

// Todos los PNG de /productos. Añadir un archivo ahí añade un planeta.
const URLS = import.meta.glob('../productos/*.png', { eager: true, query: '?url', import: 'default' });

/**
 * Carga los logos y extrae de cada uno su color de relleno y su logo blanco (la T y el
 * pictograma), que la escena dibuja nítidos a cualquier tamaño. Devuelve la estrella
 * (el logo de Tandem) y los productos en orden de órbita.
 */
export async function cargarLogos(renderer) {
  const logos = await Promise.all(
    Object.entries(URLS).map(async ([ruta, url]) => {
      const imagen = new Image();
      imagen.src = url;
      await imagen.decode();
      const id = ruta.split('/').pop().replace(/\.png$/i, '');
      return { id, url, ...analizar(imagen) };
    }),
  );

  const anisotropia = renderer.capabilities.getMaxAnisotropy();
  for (const logo of logos) logo.textura = crearTextura(logo.mascaraGlifo, anisotropia);

  const estrella = logos.find((logo) => logo.id === ESTRELLA) ?? null;
  const productos = logos
    .filter((logo) => logo !== estrella)
    .map((logo) => {
      const datos = PRODUCTOS[logo.id] ?? {};
      const color = datos.color ? new THREE.Color(datos.color) : logo.color;
      return {
        ...logo,
        nombre: logo.id,
        lema: datos.lema ?? '',
        url: datos.url ?? '',
        orden: datos.orden ?? Infinity,
        mordisco: datos.mordisco ?? false,
        color,
        hex: `#${color.getHexString()}`,
      };
    })
    .sort((a, b) => a.orden - b.orden || a.id.localeCompare(b.id));

  return { estrella, productos };
}

/**
 * Dibuja el logo completo (relleno de color y logo blanco) en un <canvas> para la
 * interfaz HTML, con bordes limpios aunque el PNG sea pequeño.
 */
export function pintarEmblema(logo, tamCss) {
  const dpr = Math.min(window.devicePixelRatio || 1, 3);
  const lado = Math.max(1, Math.round(tamCss * dpr));
  const grande = crearLienzo(lado * 4, lado * 4);
  const ctxGrande = grande.getContext('2d', { willReadFrequently: true });
  ctxGrande.imageSmoothingEnabled = true;
  ctxGrande.imageSmoothingQuality = 'low';
  ctxGrande.drawImage(logo.mascara, 0, 0, grande.width, grande.height);

  const imagen = ctxGrande.getImageData(0, 0, grande.width, grande.height);
  const d = imagen.data;
  const [r, g, b] = aRgb255(logo.color);
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 1] >= 128) {
      d[i] = 255;
      d[i + 1] = 255;
      d[i + 2] = 255;
      d[i + 3] = 255;
    } else if (d[i] >= 128) {
      d[i] = r;
      d[i + 1] = g;
      d[i + 2] = b;
      d[i + 3] = 255;
    } else {
      d[i + 3] = 0;
    }
  }
  ctxGrande.putImageData(imagen, 0, 0);

  const lienzo = crearLienzo(lado, lado);
  const ctx = lienzo.getContext('2d');
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(grande, 0, 0, lado, lado);
  lienzo.style.width = `${tamCss}px`;
  lienzo.style.height = `${tamCss}px`;
  return lienzo;
}

/** Tipos de píxel vacío dentro del recuadro del logo. */
const HUECO = 1; // forma parte del logo blanco (la T recortada, el engranaje...)
const FONDO = 2; // queda fuera del logo (muescas abiertas hacia fuera)

function analizar(imagen) {
  const ancho = imagen.naturalWidth;
  const alto = imagen.naturalHeight;
  const lienzo = crearLienzo(ancho, alto);
  const ctx = lienzo.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(imagen, 0, 0);
  const px = ctx.getImageData(0, 0, ancho, alto).data;

  const [cr, cg, cb] = colorDominante(px);
  const [fila0, fila1] = filasDelEmblema(px, ancho, alto);
  const vacio = mapaVacio(px, ancho, alto);
  const caja = cajaPrincipal(vacio, ancho, fila0, fila1);
  const tipo = clasificarVacios(vacio, ancho, caja);
  const vecino = (x, y, valor) =>
    (x > caja.x0 && tipo[y * ancho + x - 1] === valor) ||
    (x < caja.x1 && tipo[y * ancho + x + 1] === valor) ||
    (y > caja.y0 && tipo[(y - 1) * ancho + x] === valor) ||
    (y < caja.y1 && tipo[(y + 1) * ancho + x] === valor);

  // Cobertura de la silueta (relleno + logo blanco) y del logo blanco en cada píxel.
  const silueta = new Float32Array(ancho * alto);
  const glifo = new Float32Array(ancho * alto);
  const dr = 255 - cr;
  const dg = 255 - cg;
  const db = 255 - cb;
  const dd = Math.max(dr * dr + dg * dg + db * db, 1);

  for (let y = fila0; y <= fila1; y++) {
    for (let x = 0; x < ancho; x++) {
      const j = y * ancho + x;
      const i = j * 4;
      const a = px[i + 3] / 255;
      // Posición del píxel entre el color de relleno (0) y el blanco (1).
      const t = ((px[i] - cr) * dr + (px[i + 1] - cg) * dg + (px[i + 2] - cb) * db) / dd;
      const blanco = a > 0 ? Math.min(1, Math.max(0, t)) : 0;
      const dentro = x >= caja.x0 && x <= caja.x1 && y >= caja.y0 && y <= caja.y1;
      let g = 0;
      if (dentro && tipo[j] !== FONDO) {
        g = a * blanco;
        const bordeDeHueco = !vacio[j] && vecino(x, y, HUECO) && !vecino(x, y, FONDO);
        if (tipo[j] === HUECO || bordeDeHueco) g += 1 - a;
      }
      glifo[j] = Math.min(1, g);
      silueta[j] = Math.min(1, a * (1 - blanco) + g);
    }
  }

  const color = new THREE.Color().setRGB(cr / 255, cg / 255, cb / 255, THREE.SRGBColorSpace);
  const cajaSilueta = cajaDeCobertura(silueta, ancho, fila0, fila1, 0.04) ?? { x0: 0, x1: ancho - 1, y0: fila0, y1: fila1 };
  const cajaGlifo = cajaDeCobertura(glifo, ancho, fila0, fila1, 0.5) ?? cajaSilueta;
  const ladoCuadrado = Math.max(caja.x1 - caja.x0, caja.y1 - caja.y0) + 1;
  const completa = volcarMascara(silueta, glifo, ancho, fila0, fila1, cajaSilueta);
  // El logo blanco se centra por sí mismo pero conserva su proporción respecto al cuadrado,
  // así la T mide lo mismo en todos los planetas.
  const soloGlifo = mascaraVectorial(glifo, ancho, alto, cajaGlifo, ladoCuadrado);

  return {
    color,
    hex: `#${color.getHexString()}`,
    // Logo completo, para la interfaz.
    mascara: completa.lienzo,
    // Logo blanco centrado, para los astros. escalaGlifo: fracción de la máscara que ocupa
    // el cuadrado original del logo.
    mascaraGlifo: soloGlifo.lienzo,
    escalaGlifo: soloGlifo.escala,
  };
}

/** Color de relleno: el tono saturado más frecuente entre los píxeles opacos. */
function colorDominante(px) {
  const cubetas = new Map();
  for (let i = 0; i < px.length; i += 4) {
    if (px[i + 3] < 250) continue;
    const r = px[i];
    const g = px[i + 1];
    const b = px[i + 2];
    if (Math.max(r, g, b) - Math.min(r, g, b) < 40) continue; // blancos, grises y el texto
    const clave = ((r >> 3) << 10) | ((g >> 3) << 5) | (b >> 3);
    const cubeta = cubetas.get(clave) ?? { n: 0, r: 0, g: 0, b: 0 };
    cubeta.n++;
    cubeta.r += r;
    cubeta.g += g;
    cubeta.b += b;
    cubetas.set(clave, cubeta);
  }
  let mejor = null;
  for (const cubeta of cubetas.values()) if (!mejor || cubeta.n > mejor.n) mejor = cubeta;
  return mejor ? [mejor.r / mejor.n, mejor.g / mejor.n, mejor.b / mejor.n] : [22, 151, 213];
}

/**
 * Filas que ocupa el emblema. Los logos de producto llevan el nombre escrito debajo en gris
 * oscuro; ese bloque se descarta porque la escena escribe el nombre aparte.
 */
function filasDelEmblema(px, ancho, alto) {
  const tramos = [];
  let inicio = -1;
  for (let y = 0; y <= alto; y++) {
    let ocupada = false;
    if (y < alto) {
      for (let x = 0; x < ancho; x++) {
        if (px[(y * ancho + x) * 4 + 3] > 24) {
          ocupada = true;
          break;
        }
      }
    }
    if (ocupada && inicio < 0) inicio = y;
    if (!ocupada && inicio >= 0) {
      tramos.push([inicio, y - 1]);
      inicio = -1;
    }
  }
  if (tramos.length === 0) return [0, alto - 1];
  if (tramos.length === 1) return tramos[0];

  const [a, b] = tramos.at(-1);
  const hueco = a - tramos.at(-2)[1] - 1;
  let luminancia = 0;
  let n = 0;
  for (let y = a; y <= b; y++) {
    for (let x = 0; x < ancho; x++) {
      const i = (y * ancho + x) * 4;
      if (px[i + 3] < 128) continue;
      luminancia += (0.2126 * px[i] + 0.7152 * px[i + 1] + 0.0722 * px[i + 2]) / 255;
      n++;
    }
  }
  const esTexto = b - a + 1 <= alto * 0.3 && hueco >= 2 && n > 0 && luminancia / n < 0.3;
  return [tramos[0][0], esTexto ? tramos.at(-2)[1] : b];
}

/** Píxeles vacíos: transparentes o, si el PNG no tiene transparencia, el blanco del fondo. */
function mapaVacio(px, ancho, alto) {
  let bordeTransparente = false;
  for (let x = 0; x < ancho && !bordeTransparente; x++) {
    bordeTransparente = px[x * 4 + 3] < 128 || px[((alto - 1) * ancho + x) * 4 + 3] < 128;
  }
  for (let y = 0; y < alto && !bordeTransparente; y++) {
    bordeTransparente = px[y * ancho * 4 + 3] < 128 || px[(y * ancho + ancho - 1) * 4 + 3] < 128;
  }
  const vacio = new Uint8Array(ancho * alto);
  for (let j = 0; j < vacio.length; j++) {
    const i = j * 4;
    const transparente = px[i + 3] < 128;
    const blancoDeFondo = !bordeTransparente && Math.min(px[i], px[i + 1], px[i + 2]) > 235;
    vacio[j] = transparente || blancoDeFondo ? 1 : 0;
  }
  return vacio;
}

/** Recuadro de la mancha de color más grande: el cuadrado del logo. */
function cajaPrincipal(vacio, ancho, fila0, fila1) {
  const visto = new Uint8Array(vacio.length);
  const pila = [];
  let mejor = null;
  for (let y = fila0; y <= fila1; y++) {
    for (let x = 0; x < ancho; x++) {
      const inicio = y * ancho + x;
      if (vacio[inicio] || visto[inicio]) continue;
      const caja = { x0: x, x1: x, y0: y, y1: y, n: 0 };
      visto[inicio] = 1;
      pila.push(inicio);
      while (pila.length) {
        const j = pila.pop();
        const cx = j % ancho;
        const cy = (j - cx) / ancho;
        caja.n++;
        caja.x0 = Math.min(caja.x0, cx);
        caja.x1 = Math.max(caja.x1, cx);
        caja.y0 = Math.min(caja.y0, cy);
        caja.y1 = Math.max(caja.y1, cy);
        for (const [nx, ny] of [[cx - 1, cy], [cx + 1, cy], [cx, cy - 1], [cx, cy + 1]]) {
          if (nx < 0 || nx >= ancho || ny < fila0 || ny > fila1) continue;
          const k = ny * ancho + nx;
          if (!vacio[k] && !visto[k]) {
            visto[k] = 1;
            pila.push(k);
          }
        }
      }
      if (!mejor || caja.n > mejor.n) mejor = caja;
    }
  }
  return mejor ?? { x0: 0, x1: ancho - 1, y0: fila0, y1: fila1, n: 0 };
}

/**
 * Clasifica las zonas vacías dentro del cuadrado del logo. Una zona encerrada o que solo
 * toca un lado del cuadrado (como el engranaje de T-Config) es un hueco del logo blanco;
 * si toca dos o más lados es una muesca hacia fuera (como la esquina de T-Stock). Las
 * zonas diminutas o las franjas de un par de píxeles pegadas a un lado son restos del
 * suavizado de los bordes, no parte del logo.
 */
function clasificarVacios(vacio, ancho, caja) {
  const tipo = new Uint8Array(vacio.length);
  const region = [];
  const pila = [];
  for (let y = caja.y0; y <= caja.y1; y++) {
    for (let x = caja.x0; x <= caja.x1; x++) {
      const inicio = y * ancho + x;
      if (!vacio[inicio] || tipo[inicio]) continue;
      region.length = 0;
      let lados = 0;
      const extension = { x0: x, x1: x, y0: y, y1: y };
      tipo[inicio] = FONDO;
      pila.push(inicio);
      while (pila.length) {
        const j = pila.pop();
        region.push(j);
        const cx = j % ancho;
        const cy = (j - cx) / ancho;
        extension.x0 = Math.min(extension.x0, cx);
        extension.x1 = Math.max(extension.x1, cx);
        extension.y0 = Math.min(extension.y0, cy);
        extension.y1 = Math.max(extension.y1, cy);
        if (cx === caja.x0) lados |= 1;
        if (cx === caja.x1) lados |= 2;
        if (cy === caja.y0) lados |= 4;
        if (cy === caja.y1) lados |= 8;
        for (const [nx, ny] of [[cx - 1, cy], [cx + 1, cy], [cx, cy - 1], [cx, cy + 1]]) {
          if (nx < caja.x0 || nx > caja.x1 || ny < caja.y0 || ny > caja.y1) continue;
          const k = ny * ancho + nx;
          if (vacio[k] && !tipo[k]) {
            tipo[k] = FONDO;
            pila.push(k);
          }
        }
      }
      const ladosTocados = (lados & 1) + ((lados >> 1) & 1) + ((lados >> 2) & 1) + ((lados >> 3) & 1);
      const hondoHorizontal = extension.x1 - extension.x0 + 1;
      const hondoVertical = extension.y1 - extension.y0 + 1;
      const hondo = lados & 3 ? hondoHorizontal : lados & 12 ? hondoVertical : Infinity;
      if (ladosTocados <= 1 && hondo >= 3 && region.length >= 4) for (const j of region) tipo[j] = HUECO;
    }
  }
  return tipo;
}

function cajaDeCobertura(cobertura, ancho, fila0, fila1, umbral) {
  let caja = null;
  for (let y = fila0; y <= fila1; y++) {
    for (let x = 0; x < ancho; x++) {
      if (cobertura[y * ancho + x] <= umbral) continue;
      if (!caja) caja = { x0: x, x1: x, y0: y, y1: y };
      caja.x0 = Math.min(caja.x0, x);
      caja.x1 = Math.max(caja.x1, x);
      caja.y0 = Math.min(caja.y0, y);
      caja.y1 = Math.max(caja.y1, y);
    }
  }
  return caja;
}

/**
 * Logo blanco vectorizado y dibujado a alta resolución, centrado en su caja.
 * escala: fracción del lado de la textura que ocupa `tamano` (el cuadrado del logo).
 */
function mascaraVectorial(glifo, ancho, alto, caja, tamano) {
  const ladoFuente = Math.max(caja.x1 - caja.x0 + 1, caja.y1 - caja.y0 + 1, tamano) * 1.2;
  const escala = RESOLUCION_GLIFO / ladoFuente;
  const centroX = (caja.x0 + caja.x1 + 1) / 2;
  const centroY = (caja.y0 + caja.y1 + 1) / 2;

  const trazo = new Path2D();
  for (const contorno of vectorizar(glifo, ancho, alto)) {
    contorno.forEach((p, i) => (i ? trazo.lineTo(p.x, p.y) : trazo.moveTo(p.x, p.y)));
    trazo.closePath();
  }

  const lienzo = crearLienzo(RESOLUCION_GLIFO, RESOLUCION_GLIFO);
  const ctx = lienzo.getContext('2d');
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, RESOLUCION_GLIFO, RESOLUCION_GLIFO);
  ctx.setTransform(escala, 0, 0, escala, RESOLUCION_GLIFO / 2 - centroX * escala, RESOLUCION_GLIFO / 2 - centroY * escala);
  ctx.fillStyle = '#fff';
  ctx.fill(trazo, 'evenodd');
  return { lienzo, escala: tamano / ladoFuente };
}

/**
 * Máscara cuadrada centrada en la caja indicada: R = silueta, G = logo blanco.
 * escala: fracción del lado que ocupa la caja.
 */
function volcarMascara(silueta, glifo, ancho, fila0, fila1, caja) {
  const bw = caja.x1 - caja.x0 + 1;
  const bh = caja.y1 - caja.y0 + 1;
  const tamano = Math.max(bw, bh);
  const lado = Math.ceil(tamano * 1.2);
  const dx = Math.round((lado - bw) / 2) - caja.x0;
  const dy = Math.round((lado - bh) / 2) - caja.y0;
  const lienzo = crearLienzo(lado, lado);
  const ctx = lienzo.getContext('2d');
  const datos = ctx.createImageData(lado, lado);
  for (let k = 3; k < datos.data.length; k += 4) datos.data[k] = 255;
  for (let y = fila0; y <= fila1; y++) {
    const ly = y + dy;
    if (ly < 0 || ly >= lado) continue;
    for (let x = 0; x < ancho; x++) {
      const lx = x + dx;
      if (lx < 0 || lx >= lado) continue;
      const j = y * ancho + x;
      const k = (ly * lado + lx) * 4;
      datos.data[k] = Math.round(silueta[j] * 255);
      datos.data[k + 1] = Math.round(glifo[j] * 255);
    }
  }
  ctx.putImageData(datos, 0, 0);
  return { lienzo, escala: tamano / lado };
}

function crearTextura(lienzo, anisotropia) {
  const textura = new THREE.CanvasTexture(lienzo);
  textura.minFilter = THREE.LinearMipmapLinearFilter;
  textura.magFilter = THREE.LinearFilter;
  textura.anisotropy = anisotropia;
  return textura;
}

function crearLienzo(ancho, alto) {
  const lienzo = document.createElement('canvas');
  lienzo.width = ancho;
  lienzo.height = alto;
  return lienzo;
}

function aRgb255(color) {
  const srgb = color.getRGB({ r: 0, g: 0, b: 0 }, THREE.SRGBColorSpace);
  return [Math.round(srgb.r * 255), Math.round(srgb.g * 255), Math.round(srgb.b * 255)];
}
