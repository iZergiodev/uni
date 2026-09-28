import '@fontsource-variable/urbanist';
import './estilos.css';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { UNIVERSO } from './config.js';
import { cargarLogos } from './logos.js';
import { crearCielo } from './escena/cielo.js';
import { crearEstrella } from './escena/estrella.js';
import { calcularTonos, crearPlaneta } from './escena/planeta.js';
import { crearCinturon } from './escena/cinturon.js';
import { montarInterfaz } from './interfaz.js';

const TAU = Math.PI * 2;
const REDUCIR_MOVIMIENTO = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const { clamp, degToRad, smootherstep } = THREE.MathUtils;

const entradaSalida = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const salida = (t) => 1 - Math.pow(1 - t, 3);

iniciar().catch((error) => {
  console.error(error);
  mostrarAviso('No se ha podido crear el universo. Abre la consola del navegador para ver el motivo.');
});

async function iniciar() {
  const lienzo = document.getElementById('universo');
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas: lienzo, powerPreference: 'high-performance' });
  } catch (error) {
    console.error(error);
    mostrarAviso('Este navegador no puede mostrar gráficos 3D. Ábrelo con una versión reciente de Chrome, Edge o Firefox.');
    return;
  }
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  renderer.setPixelRatio(dpr);
  renderer.setSize(innerWidth, innerHeight);
  renderer.toneMapping = THREE.NeutralToneMapping;

  const { estrella: logoTandem, productos } = await cargarLogos(renderer);

  // Uniformes compartidos por todos los materiales.
  const globales = { uTiempo: { value: 0 }, uArribaCamara: { value: new THREE.Vector3(0, 1, 0) } };

  const escena = new THREE.Scene();
  const camara = new THREE.PerspectiveCamera(45, innerWidth / innerHeight, 0.1, 4000);

  const cielo = crearCielo(renderer, { titilar: !REDUCIR_MOVIMIENTO });
  cielo.uniformes.uPixel.value = dpr;
  escena.background = cielo.fondo;
  escena.add(cielo.estrellas);

  // La luz solo afecta al cinturón de cubos; estrella y planetas calculan su propia luz.
  const luz = new THREE.PointLight('#d8ecff', 0, 0, 0);
  escena.add(luz, new THREE.AmbientLight('#7a9cc6', 0.4));

  const estrella = crearEstrella(logoTandem, UNIVERSO.radioEstrella, globales);
  escena.add(estrella.grupo);

  const trasCinturon = UNIVERSO.cinturonTrasOrbita;
  const planetas = productos.map((producto, i) => {
    const hueco = trasCinturon > 0 && i >= trasCinturon ? UNIVERSO.separacionOrbitas : 0;
    const radioOrbita = UNIVERSO.primeraOrbita + i * UNIVERSO.separacionOrbitas + hueco;
    const planeta = crearPlaneta(
      producto,
      {
        radio: UNIVERSO.radioPlaneta,
        radioOrbita,
        velocidad: (TAU / UNIVERSO.periodoInterior) * Math.pow(UNIVERSO.primeraOrbita / radioOrbita, 1.5),
        fase: 0.6 + i * 2.39996,
        inclinacion: Math.sin(i * 1.9 + 0.5) * 0.06,
        nodo: i * 1.37,
        inclinacionEje: 0.3 * Math.sin(i * 2.3 + 1),
        giro: 0.1 + (i % 3) * 0.035,
        semilla: 3.1 + i * 13.7,
      },
      globales,
    );
    planeta.uniformesOrbita.uPixel.value = dpr;
    escena.add(planeta.orbita);
    return planeta;
  });

  let cinturon = null;
  let velocidadCinturon = 0;
  if (trasCinturon > 0) {
    const radio = UNIVERSO.primeraOrbita + trasCinturon * UNIVERSO.separacionOrbitas;
    cinturon = crearCinturon(radio, UNIVERSO.separacionOrbitas * 0.42);
    velocidadCinturon = (TAU / UNIVERSO.periodoInterior) * Math.pow(UNIVERSO.primeraOrbita / radio, 1.5) * 0.8;
    escena.add(cinturon.grupo);
  }

  // Elementos que muestra la interfaz y astros que les corresponden.
  const elementoTandem = {
    id: 'tandem',
    tipo: 'estrella',
    nombre: 'Tandem',
    lema: productos.length === 1 ? '1 producto gira a su alrededor.' : `${productos.length} productos giran a su alrededor.`,
    url: '',
    logo: logoTandem,
    hex: logoTandem?.hex ?? '#1697d5',
    brillo: `#${calcularTonos(estrella.uniformes.uAzul.value).brillo.getHexString()}`,
  };
  const cuerpos = [
    { elemento: elementoTandem, objeto: estrella.grupo, radio: UNIVERSO.radioEstrella, uniformes: estrella.uniformes },
    ...planetas.map((planeta) => ({
      elemento: {
        id: planeta.producto.id,
        tipo: 'planeta',
        nombre: planeta.producto.nombre,
        lema: planeta.producto.lema,
        url: planeta.producto.url,
        logo: planeta.producto,
        hex: planeta.producto.hex,
        brillo: `#${planeta.uniformes.uBrillo.value.getHexString()}`,
      },
      objeto: planeta.cuerpo,
      radio: planeta.radio,
      uniformes: planeta.uniformes,
      planeta,
    })),
  ];
  const cuerpoPorId = new Map(cuerpos.map((cuerpo) => [cuerpo.elemento.id, cuerpo]));
  const vecino = (cuerpo, paso) => cuerpos[(cuerpos.indexOf(cuerpo) + paso + cuerpos.length) % cuerpos.length];

  const estado = {
    modo: 'intro',
    foco: null,
    hover: null,
    puntero: null,
    pausado: false,
    escalaTiempo: 1,
    tiempoOrbital: 0,
    vuelo: null,
    ultimoCentro: new THREE.Vector3(),
    desfase: new THREE.Vector2(),
    desfaseObjetivo: new THREE.Vector2(),
  };

  const interfaz = montarInterfaz({
    elementos: cuerpos.map((cuerpo) => cuerpo.elemento),
    alElegir: (id) => enfocar(cuerpoPorId.get(id)),
    alVolver: () => volverAlUniverso(),
    alPausar: () => (estado.pausado = !estado.pausado),
  });
  if (productos.length === 0) interfaz.sinProductos();

  // Posprocesado: resplandor (bloom), mapeo de tonos y un tramado que evita bandas en el fondo.
  const muestras = dpr < 1.5 ? 4 : 0;
  const composer = new EffectComposer(
    renderer,
    new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: muestras }),
  );
  composer.setPixelRatio(dpr);
  composer.setSize(innerWidth, innerHeight);
  composer.addPass(new RenderPass(escena, camara));
  const resplandor = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.6, 0.1, 0.95);
  // Resplandor ceñido: los niveles más difusos apenas suman, para no velar la escena.
  [1, 1, 0.7, 0.35, 0.15].forEach((peso, i) => resplandor.bloomTintColors[i].setScalar(peso));
  composer.addPass(resplandor);
  const salidaFinal = new OutputPass();
  salidaFinal.material.fragmentShader = salidaFinal.material.fragmentShader.replace(
    /}\s*$/,
    `  gl_FragColor.rgb += (fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715)))) - 0.5) / 255.0;\n}`,
  );
  composer.addPass(salidaFinal);

  const controles = new OrbitControls(camara, lienzo);
  controles.enabled = false;
  controles.enableDamping = true;
  controles.dampingFactor = 0.07;
  controles.enablePan = false;
  controles.rotateSpeed = 0.55;
  controles.zoomSpeed = 0.7;
  aplicarLimites();

  const radioExterior = (planetas.at(-1)?.radioOrbita ?? UNIVERSO.radioEstrella * 4) + UNIVERSO.radioPlaneta * 2;
  const vistaGeneral = { aspecto: 0, suelo: 0, posicion: new THREE.Vector3() };

  // Altura de pantalla en la que empieza el dock: ni las etiquetas ni la vista general la cruzan.
  let bordeDock = innerHeight;
  const medirDock = () => {
    bordeDock = interfaz.bordeDock();
  };
  medirDock();

  // Vista general: la distancia más corta a la que caben todas las órbitas sin quedar bajo el dock.
  // En pantallas verticales no caben sin que los planetas se vuelvan diminutos, así que se
  // acepta recortar las órbitas exteriores por los lados.
  function poseGeneral() {
    const aspecto = innerWidth / innerHeight;
    const suelo = Math.max(-0.8, 1 - (2 * (bordeDock - 12)) / innerHeight);
    if (vistaGeneral.aspecto === aspecto && vistaGeneral.suelo === suelo) return vistaGeneral.posicion.clone();
    const elevacion = degToRad(20);
    const direccion = new THREE.Vector3(0, Math.sin(elevacion), Math.cos(elevacion));
    const prueba = new THREE.PerspectiveCamera(camara.fov, aspecto, 0.1, 4000);
    const punto = new THREE.Vector3();
    const distanciaMaxima = aspecto < 1 ? 78 : 120;
    let distancia = 24;
    for (; distancia < distanciaMaxima; distancia += 1.5) {
      prueba.position.copy(direccion).multiplyScalar(distancia);
      prueba.lookAt(0, 0, 0);
      prueba.updateMatrixWorld();
      let cabe = true;
      for (let i = 0; i < 48 && cabe; i++) {
        const angulo = (i / 48) * TAU;
        punto.set(Math.cos(angulo) * radioExterior, 0, Math.sin(angulo) * radioExterior).project(prueba);
        cabe = Math.abs(punto.x) < 0.94 && punto.y < 0.8 && punto.y > suelo;
      }
      if (cabe) break;
    }
    vistaGeneral.aspecto = aspecto;
    vistaGeneral.suelo = suelo;
    vistaGeneral.posicion.copy(direccion).multiplyScalar(distancia);
    return vistaGeneral.posicion.clone();
  }

  // Intro: la T se enciende de cerca y la cámara se aleja mientras aparecen los planetas.
  const intro = { t: 0, ritmo: 1, fin: 4.6 };
  const poseInicial = new THREE.Vector3(0, UNIVERSO.radioEstrella * 0.9, UNIVERSO.radioEstrella * 3.8);
  camara.position.copy(poseInicial);
  camara.lookAt(0, 0, 0);

  function actualizarIntro(dt) {
    intro.t += dt * intro.ritmo;
    const tramo = (desde, hasta) => clamp((intro.t - desde) / (hasta - desde), 0, 1);
    cielo.uniformes.uAparicion.value = smootherstep(tramo(0, 1.6), 0, 1);
    escena.backgroundIntensity = smootherstep(tramo(0, 2), 0, 1);
    estrella.uniformes.uGlifo.value = smootherstep(tramo(0.2, 1.1), 0, 1);
    estrella.uniformes.uEncendido.value = smootherstep(tramo(0.7, 2.1), 0, 1);
    luz.intensity = 3.8 * smootherstep(tramo(0.9, 2.5), 0, 1);
    planetas.forEach((planeta, i) => {
      const inicio = 1.5 + i * 0.2;
      planeta.aparecer(salida(tramo(inicio, inicio + 0.9)), tramo(inicio, inicio + 1.6));
    });

    if (estado.modo !== 'intro') return;
    camara.position.lerpVectors(poseInicial, poseGeneral(), entradaSalida(tramo(0.4, intro.fin)));
    controles.target.set(0, 0, 0);
    camara.lookAt(controles.target);
    if (intro.t >= intro.fin - 0.8) interfaz.revelar();
    if (intro.t >= intro.fin) {
      estado.modo = 'libre';
      controles.enabled = true;
    }
  }

  function terminarIntro() {
    intro.t = Math.max(intro.t, intro.fin);
    actualizarIntro(0);
  }

  if (REDUCIR_MOVIMIENTO) terminarIntro();

  function enfocar(cuerpo) {
    if (!cuerpo || cuerpo === estado.foco) return;
    if (estado.modo === 'intro') terminarIntro();
    estado.foco = cuerpo;
    interfaz.mostrarFicha(cuerpo.elemento, vecino(cuerpo, -1).elemento, vecino(cuerpo, 1).elemento);
    calcularDesfase();
    iniciarVuelo(cuerpo);
    history.replaceState(null, '', `#${cuerpo.elemento.id}`);
  }

  function volverAlUniverso() {
    if (!estado.foco) return;
    estado.foco = null;
    interfaz.ocultarFicha();
    medirDock();
    calcularDesfase();
    iniciarVuelo(null);
    history.replaceState(null, '', location.pathname + location.search);
  }

  // Enlaces directos a un astro: index.html#T-Stock abre ese planeta.
  const cuerpoDelEnlace = () => {
    const id = decodeURIComponent(location.hash.slice(1)).toLowerCase();
    return cuerpos.find((cuerpo) => cuerpo.elemento.id.toLowerCase() === id) ?? null;
  };
  window.addEventListener('hashchange', () => {
    const cuerpo = cuerpoDelEnlace();
    if (cuerpo) enfocar(cuerpo);
    else volverAlUniverso();
  });

  // Desplaza el encuadre para que el astro enfocado quede en el hueco que deja la ficha.
  function calcularDesfase() {
    const zona = estado.foco ? interfaz.zonaFicha() : null;
    if (!zona) estado.desfaseObjetivo.set(0, 0);
    else if (zona.lateral) estado.desfaseObjetivo.set((innerWidth - zona.borde) / 2, 0);
    else estado.desfaseObjetivo.set(0, (innerHeight - zona.borde) / 2);
  }

  function aplicarLimites() {
    const foco = estado.foco;
    controles.minDistance = foco ? foco.radio * (foco.planeta ? 2.2 : 1.7) : 8;
    controles.maxDistance = foco?.planeta ? foco.radio * 26 : 150;
  }

  function iniciarVuelo(cuerpo) {
    const desdePos = camara.position.clone();
    const desdeObjetivo = controles.target.clone();
    const lejos = innerWidth < innerHeight ? 1.35 : 1;
    let desplazamiento = null;
    let destino;

    if (!cuerpo) {
      destino = poseGeneral();
    } else {
      const centro = cuerpo.objeto.getWorldPosition(new THREE.Vector3());
      if (cuerpo.planeta) {
        // Entre la estrella y el planeta, algo adelantada y por encima: se ve iluminado de tres cuartos.
        const radial = centro.clone().setY(0).normalize();
        const tangente = new THREE.Vector3(radial.z, 0, -radial.x);
        desplazamiento = radial.multiplyScalar(-0.5).addScaledVector(tangente, 0.75);
        desplazamiento.y = 0.4;
        desplazamiento.setLength(cuerpo.radio * 4.6 * lejos);
      } else {
        desplazamiento = camara.position.clone().sub(centro).normalize();
        desplazamiento.y = clamp(desplazamiento.y, 0.15, 0.5);
        desplazamiento.setLength(cuerpo.radio * 5.2 * lejos);
      }
      destino = centro.add(desplazamiento);
    }

    // Si la línea recta pasa cerca de la estrella, el vuelo describe un arco por encima.
    const cercania = distanciaAlOrigen(desdePos, destino);
    const arco = Math.max(0, UNIVERSO.radioEstrella * 3 - cercania);
    const duracion = REDUCIR_MOVIMIENTO ? 0.5 : clamp(1 + desdePos.distanceTo(destino) * 0.012, 1.2, 2.2);

    estado.vuelo = { cuerpo, desdePos, desdeObjetivo, desplazamiento, destino, arco, duracion, t: 0 };
    controles.enabled = false;
  }

  const auxCentro = new THREE.Vector3();
  const auxDestino = new THREE.Vector3();
  const auxProyeccion = new THREE.Vector3();
  const auxRayo = new THREE.Vector3();

  function actualizarVuelo(dt) {
    const vuelo = estado.vuelo;
    vuelo.t = Math.min(1, vuelo.t + dt / vuelo.duracion);
    const k = entradaSalida(vuelo.t);
    if (vuelo.cuerpo) {
      vuelo.cuerpo.objeto.getWorldPosition(auxCentro);
      auxDestino.copy(auxCentro).add(vuelo.desplazamiento);
    } else {
      auxCentro.set(0, 0, 0);
      auxDestino.copy(vuelo.destino);
    }
    camara.position.lerpVectors(vuelo.desdePos, auxDestino, k);
    camara.position.y += Math.sin(Math.PI * k) * vuelo.arco;
    controles.target.lerpVectors(vuelo.desdeObjetivo, auxCentro, k);
    camara.lookAt(controles.target);

    if (vuelo.t >= 1) {
      estado.vuelo = null;
      estado.ultimoCentro.copy(auxCentro);
      aplicarLimites();
      controles.enabled = true;
    }
  }

  // Con un planeta enfocado, la cámara lo acompaña en su órbita.
  function seguirFoco() {
    if (!estado.foco?.planeta) return;
    estado.foco.objeto.getWorldPosition(auxCentro);
    auxDestino.subVectors(auxCentro, estado.ultimoCentro);
    camara.position.add(auxDestino);
    controles.target.add(auxDestino);
    estado.ultimoCentro.copy(auxCentro);
  }

  /** Proyecta un astro a la pantalla: posición en píxeles, radio aparente y si está delante. */
  function proyectar(cuerpo) {
    cuerpo.objeto.getWorldPosition(auxProyeccion);
    const distancia = auxProyeccion.distanceTo(camara.position);
    const radioPx = (cuerpo.radio / (distancia * Math.tan(degToRad(camara.fov / 2)))) * (innerHeight / 2);
    const tapado = tapadoPorEstrella(auxProyeccion, cuerpo);
    auxProyeccion.project(camara);
    return {
      x: ((auxProyeccion.x + 1) / 2) * innerWidth,
      y: ((1 - auxProyeccion.y) / 2) * innerHeight,
      radioPx,
      distancia,
      delante: auxProyeccion.z < 1,
      tapado,
    };
  }

  function tapadoPorEstrella(centro, cuerpo) {
    if (!cuerpo.planeta) return false;
    auxRayo.subVectors(centro, camara.position);
    const t = clamp(-camara.position.dot(auxRayo) / auxRayo.lengthSq(), 0, 1);
    const cercania = auxRayo.multiplyScalar(t).add(camara.position).length();
    return t < 1 && cercania < UNIVERSO.radioEstrella * 0.98;
  }

  function cuerpoEn(x, y) {
    let elegido = null;
    let distanciaElegido = Infinity;
    for (const cuerpo of cuerpos) {
      if (!cuerpo.objeto.visible) continue;
      const p = proyectar(cuerpo);
      if (!p.delante || p.tapado) continue;
      const alcance = Math.max(p.radioPx * 1.15, 22);
      if (Math.hypot(x - p.x, y - p.y) <= alcance && p.distancia < distanciaElegido) {
        elegido = cuerpo;
        distanciaElegido = p.distancia;
      }
    }
    return elegido;
  }

  // Las etiquetas van bajo cada astro, salvo que caigan sobre el dock: entonces van encima.
  const ALTO_ETIQUETA = 40; // nombre y lema
  function actualizarEtiquetas() {
    const mostrar = estado.modo === 'libre';
    for (const cuerpo of cuerpos) {
      const etiqueta = interfaz.etiquetas.get(cuerpo.elemento.id);
      const p = proyectar(cuerpo);
      let opacidad = estado.foco ? 0.45 : 0.85;
      if (cuerpo === estado.hover) opacidad = 1;
      if (!mostrar || !p.delante || p.tapado || cuerpo === estado.foco) opacidad = 0;
      const separacion = p.radioPx * 1.2 + 10;
      const arriba = p.y + separacion + ALTO_ETIQUETA > bordeDock - 8;
      const y = arriba ? p.y - separacion : p.y + separacion;
      etiqueta.style.transform = `translate(${p.x.toFixed(1)}px, ${y.toFixed(1)}px) translate(-50%, ${arriba ? -100 : 0}%)`;
      if (etiqueta.classList.contains('arriba') !== arriba) etiqueta.classList.toggle('arriba', arriba);
      if (etiqueta.dataset.opacidad !== String(opacidad)) {
        etiqueta.style.opacity = String(opacidad);
        etiqueta.dataset.opacidad = String(opacidad);
        etiqueta.classList.toggle('resaltada', opacidad === 1);
      }
    }
  }

  // Interacción
  let pulsacion = null;
  const acelerarIntro = () => {
    if (estado.modo === 'intro') intro.ritmo = 4;
  };

  lienzo.addEventListener('pointerdown', (evento) => {
    acelerarIntro();
    pulsacion = { x: evento.clientX, y: evento.clientY, t: performance.now() };
  });
  lienzo.addEventListener('pointerup', (evento) => {
    if (!pulsacion) return;
    const movimiento = Math.hypot(evento.clientX - pulsacion.x, evento.clientY - pulsacion.y);
    const duracion = performance.now() - pulsacion.t;
    pulsacion = null;
    if (movimiento > 6 || duracion > 500 || estado.modo !== 'libre') return;
    const cuerpo = cuerpoEn(evento.clientX, evento.clientY);
    if (cuerpo) enfocar(cuerpo);
  });
  lienzo.addEventListener('pointermove', (evento) => {
    estado.puntero = evento.pointerType === 'mouse' ? { x: evento.clientX, y: evento.clientY } : null;
  });
  lienzo.addEventListener('pointerleave', () => {
    estado.puntero = null;
  });
  lienzo.addEventListener('wheel', acelerarIntro, { passive: true });

  window.addEventListener('keydown', (evento) => {
    if (estado.modo === 'intro') {
      acelerarIntro();
      return;
    }
    if (evento.key === 'Escape') volverAlUniverso();
    if (!estado.foco || evento.altKey || evento.ctrlKey || evento.metaKey) return;
    if (evento.key === 'ArrowRight') enfocar(vecino(estado.foco, 1));
    if (evento.key === 'ArrowLeft') enfocar(vecino(estado.foco, -1));
  });

  window.addEventListener('resize', () => {
    camara.aspect = innerWidth / innerHeight;
    renderer.setSize(innerWidth, innerHeight);
    composer.setSize(innerWidth, innerHeight);
    medirDock();
    if (estado.vuelo && !estado.vuelo.cuerpo) estado.vuelo.destino = poseGeneral();
    calcularDesfase();
    estado.desfase.copy(estado.desfaseObjetivo);
  });

  enfocar(cuerpoDelEnlace());

  // Acceso desde la consola del navegador mientras se desarrolla (npm run dev).
  if (import.meta.env.DEV) window.tUniverse = { escena, camara, controles, composer, planetas, estrella, estado };

  // Bucle de animación
  let anterior = performance.now();
  let fotograma = 0;
  renderer.setAnimationLoop((ahora) => {
    try {
      dibujarFotograma(ahora);
    } catch (error) {
      // Un fallo al dibujar se repetiría en cada fotograma: se detiene el bucle y se avisa una vez.
      renderer.setAnimationLoop(null);
      console.error(error);
      mostrarAviso('Se ha producido un error al dibujar el universo. Recarga la página para volver a intentarlo.');
    }
  });

  function dibujarFotograma(ahora) {
    const dt = clamp((ahora - anterior) / 1000, 0, 0.05);
    anterior = ahora;

    if (intro.t < intro.fin + 3) actualizarIntro(dt);

    const escalaObjetivo = estado.pausado ? 0 : estado.foco ? 0.12 : 1;
    estado.escalaTiempo += (escalaObjetivo - estado.escalaTiempo) * (1 - Math.exp(-dt * 2.5));
    estado.tiempoOrbital += dt * estado.escalaTiempo * (REDUCIR_MOVIMIENTO ? 0.5 : 1);
    globales.uTiempo.value += dt * (REDUCIR_MOVIMIENTO ? 0.3 : 1);
    cielo.uniformes.uTiempo.value = globales.uTiempo.value;

    for (const planeta of planetas) planeta.actualizar(estado.tiempoOrbital);
    if (cinturon) cinturon.grupo.rotation.y = estado.tiempoOrbital * velocidadCinturon;

    if (estado.vuelo) actualizarVuelo(dt);
    else if (estado.modo === 'libre') {
      seguirFoco();
      controles.update(dt);
    }

    const suavizado = 1 - Math.exp(-dt * 5);
    estado.desfase.lerp(estado.desfaseObjetivo, suavizado);
    camara.setViewOffset(innerWidth, innerHeight, estado.desfase.x, estado.desfase.y, innerWidth, innerHeight);
    camara.updateMatrixWorld();
    globales.uArribaCamara.value.setFromMatrixColumn(camara.matrixWorld, 1);
    cielo.estrellas.position.copy(camara.position);

    const hover =
      estado.puntero && estado.modo === 'libre' && !estado.vuelo ? cuerpoEn(estado.puntero.x, estado.puntero.y) : null;
    if (hover !== estado.hover) {
      estado.hover = hover;
      lienzo.style.cursor = hover ? 'pointer' : '';
    }
    for (const cuerpo of cuerpos) {
      const objetivo = cuerpo === estado.hover || cuerpo === estado.foco ? 1 : 0;
      cuerpo.uniformes.uResalte.value += (objetivo - cuerpo.uniformes.uResalte.value) * (1 - Math.exp(-dt * 8));
    }

    if (fotograma++ % 30 === 0) medirDock();
    actualizarEtiquetas();
    composer.render(dt);
  }
}

/** Distancia mínima entre el origen (la estrella) y el segmento a-b. */
function distanciaAlOrigen(a, b) {
  const ab = new THREE.Vector3().subVectors(b, a);
  const t = clamp(-a.dot(ab) / Math.max(ab.lengthSq(), 1e-6), 0, 1);
  return ab.multiplyScalar(t).add(a).length();
}

function mostrarAviso(texto) {
  const aviso = document.getElementById('aviso');
  aviso.textContent = texto;
  aviso.hidden = false;
}
