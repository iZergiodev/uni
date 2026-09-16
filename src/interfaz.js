import { pintarEmblema } from './logos.js';

/**
 * Capa HTML sobre la escena: dock de productos, ficha del producto enfocado,
 * etiquetas bajo cada astro y botón de pausa.
 */
export function montarInterfaz({ elementos, alElegir, alVolver, alPausar }) {
  const $ = (id) => document.getElementById(id);
  const raiz = $('interfaz');
  const dock = $('dock');
  const ficha = $('ficha');
  const pista = $('pista');
  const anuncio = $('anuncio');
  const capaEtiquetas = $('etiquetas');
  const enlace = $('ficha-enlace');
  const botonAnterior = $('ficha-anterior');
  const botonSiguiente = $('ficha-siguiente');
  const botonPausa = $('pausa');

  const botonesDock = new Map();
  for (const elemento of elementos) {
    if (elemento.tipo !== 'planeta') continue;
    const boton = document.createElement('button');
    boton.type = 'button';
    boton.style.setProperty('--color', elemento.hex);
    const nombre = document.createElement('span');
    nombre.textContent = elemento.nombre;
    boton.append(pintarEmblema(elemento.logo, 40), nombre);
    boton.addEventListener('click', () => alElegir(elemento.id));
    dock.append(boton);
    botonesDock.set(elemento.id, boton);
  }

  const etiquetas = new Map();
  for (const elemento of elementos) {
    const etiqueta = document.createElement('div');
    etiqueta.className = 'etiqueta';
    etiqueta.textContent = elemento.nombre;
    etiqueta.style.opacity = '0';
    capaEtiquetas.append(etiqueta);
    etiquetas.set(elemento.id, etiqueta);
  }

  let pasoAnterior = null;
  let pasoSiguiente = null;
  botonAnterior.addEventListener('click', () => pasoAnterior && alElegir(pasoAnterior.id));
  botonSiguiente.addEventListener('click', () => pasoSiguiente && alElegir(pasoSiguiente.id));
  $('ficha-volver').addEventListener('click', alVolver);
  $('marca').addEventListener('click', alVolver);

  botonPausa.addEventListener('click', () => {
    const pausado = alPausar();
    botonPausa.setAttribute('aria-pressed', String(pausado));
    botonPausa.querySelector('span').textContent = pausado ? 'Reanudar órbitas' : 'Pausar órbitas';
  });

  function marcarActivo(id) {
    for (const [clave, boton] of botonesDock) {
      if (clave === id) boton.setAttribute('aria-current', 'true');
      else boton.removeAttribute('aria-current');
    }
  }

  return {
    etiquetas,

    revelar() {
      raiz.classList.add('visible');
      capaEtiquetas.classList.add('visible');
    },

    ocultarPista() {
      pista.classList.add('oculta');
    },

    sinProductos() {
      pista.textContent = 'Copia los logos de tus productos en la carpeta productos para crear planetas.';
    },

    mostrarFicha(elemento, anterior, siguiente) {
      const yaAbierta = !ficha.hidden;
      $('ficha-emblema').replaceChildren(...(elemento.logo ? [pintarEmblema(elemento.logo, 72)] : []));
      $('ficha-nombre').textContent = elemento.nombre;
      $('ficha-lema').textContent = elemento.lema;
      enlace.hidden = !elemento.url;
      if (elemento.url) enlace.href = elemento.url;

      pasoAnterior = anterior;
      pasoSiguiente = siguiente;
      botonAnterior.querySelector('span').textContent = anterior.nombre;
      botonSiguiente.querySelector('span').textContent = siguiente.nombre;
      botonAnterior.setAttribute('aria-label', `Ver ${anterior.nombre}`);
      botonSiguiente.setAttribute('aria-label', `Ver ${siguiente.nombre}`);

      ficha.style.setProperty('--color', elemento.hex);
      ficha.hidden = false;
      raiz.dataset.ficha = '';
      if (!yaAbierta) {
        ficha.classList.remove('entrando');
        void ficha.offsetWidth;
        ficha.classList.add('entrando');
      }
      marcarActivo(elemento.id);
      pista.classList.add('oculta');
      anuncio.textContent = elemento.lema ? `${elemento.nombre}: ${elemento.lema}` : elemento.nombre;
    },

    ocultarFicha() {
      const teniaFoco = ficha.contains(document.activeElement);
      ficha.hidden = true;
      delete raiz.dataset.ficha;
      marcarActivo(null);
      anuncio.textContent = 'Vista general del universo';
      if (teniaFoco) $('marca').focus();
    },

    /** Altura a la que empieza el dock; por debajo, las etiquetas quedarían tapadas. */
    bordeDock() {
      const caja = dock.getBoundingClientRect();
      return caja.height > 0 ? caja.top : window.innerHeight;
    },

    /** Zona de pantalla que tapa la ficha, para desplazar el encuadre de la cámara. */
    zonaFicha() {
      if (ficha.hidden) return null;
      const lateral = window.matchMedia('(min-width: 820px)').matches;
      if (lateral) {
        const derecha = parseFloat(getComputedStyle(ficha).right) || 0;
        return { lateral, borde: window.innerWidth - ficha.offsetWidth - derecha };
      }
      return { lateral, borde: window.innerHeight - ficha.offsetHeight };
    },
  };
}
