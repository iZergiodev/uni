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
  const contenido = $('ficha-contenido');
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
    const nombre = document.createElement('span');
    nombre.className = 'etiqueta-nombre';
    nombre.textContent = elemento.nombre;
    etiqueta.append(nombre);
    // El lema aparece bajo el nombre al pasar el ratón por el astro.
    if (elemento.lema) {
      const lema = document.createElement('span');
      lema.className = 'etiqueta-lema';
      lema.textContent = elemento.lema;
      etiqueta.append(lema);
    }
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

  function rellenarPaso(boton, elemento) {
    const emblema = boton.querySelector('.ficha-paso-emblema');
    emblema.replaceChildren(...(elemento.logo ? [pintarEmblema(elemento.logo, 22)] : []));
    boton.querySelector('.ficha-paso-nombre').textContent = elemento.nombre;
    boton.setAttribute('aria-label', `Ver ${elemento.nombre}`);
  }

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
      $('ficha-emblema').replaceChildren(...(elemento.logo ? [pintarEmblema(elemento.logo, 64)] : []));
      $('ficha-nombre').textContent = elemento.nombre;
      $('ficha-lema').textContent = elemento.lema;
      enlace.hidden = !elemento.url;
      if (elemento.url) enlace.href = elemento.url;

      pasoAnterior = anterior;
      pasoSiguiente = siguiente;
      rellenarPaso(botonAnterior, anterior);
      rellenarPaso(botonSiguiente, siguiente);

      ficha.style.setProperty('--color', elemento.hex);
      ficha.style.setProperty('--brillo', elemento.brillo);
      ficha.style.setProperty('--tinta-color', tintaLegible(elemento.hex));
      ficha.hidden = false;
      raiz.dataset.ficha = '';
      // Al abrirse entra la ficha entera; al pasar de un producto a otro solo cambia su contenido.
      const animado = yaAbierta ? contenido : ficha;
      ficha.classList.remove('entrando');
      contenido.classList.remove('entrando');
      void animado.offsetWidth;
      animado.classList.add('entrando');
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

/** Blanco o tinta oscura, lo que mejor contraste sobre el color dado (#rrggbb). */
function tintaLegible(hex) {
  const canal = (i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  };
  const luminancia = 0.2126 * canal(1) + 0.7152 * canal(3) + 0.0722 * canal(5);
  const contraBlanco = 1.05 / (luminancia + 0.05);
  const contraOscuro = (luminancia + 0.05) / 0.052;
  return contraBlanco >= contraOscuro ? '#ffffff' : '#02060f';
}
