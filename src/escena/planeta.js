import * as THREE from 'three';
import { RUIDO } from '../shaders/ruido.js';
import { EMBLEMA } from '../shaders/emblema.js';
import { MORDISCO_GLSL, crearFragmentos } from './mordisco.js';

const TAU = Math.PI * 2;
const geometriaEsfera = new THREE.SphereGeometry(1, 96, 64);
const geometriaCuadro = new THREE.PlaneGeometry(2, 2);

/**
 * Un producto convertido en planeta: esfera rellena con el color del logo y el logo blanco
 * centrado de cara a la cámara, halo atmosférico y una órbita de pequeños cuadrados.
 */
export function crearPlaneta(producto, parametros, globales) {
  const { radio, radioOrbita, velocidad, fase, inclinacion, nodo, inclinacionEje, giro, semilla } = parametros;
  const tonos = calcularTonos(producto.color);

  const orbita = new THREE.Group();
  orbita.rotation.set(inclinacion, nodo, 0, 'YXZ');

  const cuerpo = new THREE.Group();
  orbita.add(cuerpo);

  const uniformes = {
    uTiempo: globales.uTiempo,
    uArribaCamara: globales.uArribaCamara,
    uMascara: { value: producto.textura },
    // El cuadrado del logo original mediría de -0.5 a 0.5 del camino entre el centro y el borde
    // visible; el logo blanco se dibuja en su proporción dentro de ese cuadrado.
    uMitad: { value: 0.5 / producto.escalaGlifo },
    uColor: { value: tonos.base },
    uBrillo: { value: tonos.brillo },
    uSemilla: { value: semilla },
    uResalte: { value: 0 },
    uMordisco: { value: producto.mordisco ? 1 : 0 },
  };

  const esfera = new THREE.Mesh(
    geometriaEsfera,
    new THREE.ShaderMaterial({
      uniforms: uniformes,
      vertexShader: /* glsl */ `
        varying vec3 vPos;
        varying vec3 vCentro;
        varying vec3 vObjeto;
        varying float vRadio;
        void main() {
          vec4 mundo = modelMatrix * vec4(position, 1.0);
          vPos = mundo.xyz;
          vCentro = (modelMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
          vObjeto = position;
          vRadio = length(modelMatrix[0].xyz);
          gl_Position = projectionMatrix * viewMatrix * mundo;
        }
      `,
      fragmentShader: /* glsl */ `
        uniform vec3 uArribaCamara;
        uniform sampler2D uMascara;
        uniform float uMitad;
        uniform vec3 uColor;
        uniform vec3 uBrillo;
        uniform float uSemilla;
        uniform float uResalte;
        uniform float uMordisco;
        varying vec3 vPos;
        varying vec3 vCentro;
        varying vec3 vObjeto;
        varying float vRadio;
        ${RUIDO}
        ${EMBLEMA}
        ${MORDISCO_GLSL}

        void main() {
          vec3 N = normalize(vPos - vCentro);
          vec3 V = normalize(cameraPosition - vCentro);
          vec3 Vf = normalize(cameraPosition - vPos);
          float pared = 0.0;
          float hondura = 0.0;
          vec3 puntoRoca = vec3(0.0);

          if (uMordisco > 0.5) {
            // Si el fragmento cae dentro del hueco, se avanza por el rayo hasta dar con la roca
            // del interior; si el rayo sale del planeta sin tocarla, se ve el espacio.
            vec3 derecha = normalize(cross(uArribaCamara, V));
            mat3 marco = mat3(derecha, cross(V, derecha), V);
            vec3 p = (vPos - vCentro) * marco / vRadio;
            if (length(p - CRATER_CENTRO) < CRATER_RADIO + 0.2 && distanciaCrater(p) < 0.0) {
              vec3 direccion = normalize(p - (cameraPosition - vCentro) * marco / vRadio);
              float t = 0.0;
              bool toca = false;
              for (int i = 0; i < 64; i++) {
                vec3 q = p + direccion * t;
                float d = distanciaSolido(q);
                if (d < 0.002) {
                  toca = true;
                  p = q;
                  break;
                }
                if (length(q) > 1.0 && dot(q, direccion) > 0.0) break;
                t += max(d * 0.6, 0.003);
              }
              if (!toca) discard;
              vec2 e = vec2(0.004, 0.0);
              N = marco * normalize(vec3(
                distanciaSolido(p + e.xyy) - distanciaSolido(p - e.xyy),
                distanciaSolido(p + e.yxy) - distanciaSolido(p - e.yxy),
                distanciaSolido(p + e.yyx) - distanciaSolido(p - e.yyx)
              ));
              pared = 1.0;
              hondura = 1.0 - length(p);
              puntoRoca = p;
            }
          }

          vec3 L = normalize(-vPos);
          float dia = smoothstep(-0.25, 0.6, dot(N, L));

          // Relleno con el color del logo y un veteado muy suave para que se lea como esfera.
          vec3 p = normalize(vObjeto);
          float bandas = sin((p.y * 3.2 + fbm(p * 1.8 + uSemilla, 3) * 0.9) * 3.14159) * 0.5 + 0.5;
          float grano = fbm(p * 6.0 + uSemilla * 2.3, 3);
          vec3 relleno = uColor * (0.9 + 0.14 * bandas + 0.08 * grano);

          if (pared > 0.5) {
            // Roca del interior: más oscura y con vetas; junto a la superficie asoma la corteza rota.
            float vetas = fbm(puntoRoca * 9.0, 3) * 0.5 + 0.5;
            vec3 roca = mix(uColor * 0.5, uBrillo * 0.38, vetas);
            float corteza = 1.0 - smoothstep(0.03, 0.1, hondura);
            relleno = mix(roca, uColor, corteza);
          }

          // Logo blanco centrado en la cara que mira a la cámara.
          vec2 uv = uvEmblema(N, V, uArribaCamara, uMitad);
          float glifo = umbralSuave(0.5, texture2D(uMascara, uv).g) * dentroDeMascara(uv) * (1.0 - pared);

          // Luz de la estrella; el logo blanco conserva brillo en la cara nocturna para leerse.
          // El fondo del hueco queda en penumbra para que se note la profundidad.
          float luz = mix(0.3, 1.0, dia) * mix(1.0, 0.5, pared * smoothstep(0.0, 0.35, hondura));
          vec3 color = mix(relleno * luz, vec3(0.9) * max(luz, 0.85), glifo);
          float superficie = (1.0 - smoothstep(0.0, 0.5, glifo)) * (1.0 - pared);
          vec3 H = normalize(L + Vf);
          color += uBrillo * pow(max(dot(N, H), 0.0), 50.0) * 0.1 * dia * superficie;

          float borde = pow(1.0 - max(dot(N, Vf), 0.0), 2.4) * superficie;
          color += uBrillo * borde * (0.2 + 0.7 * dia) * (0.8 + 0.9 * uResalte);
          gl_FragColor = vec4(color, 1.0);
        }
      `,
    }),
  );
  esfera.scale.setScalar(radio);
  esfera.rotation.order = 'ZYX';
  esfera.rotation.z = inclinacionEje;
  cuerpo.add(esfera);

  const halo = new THREE.Mesh(
    geometriaCuadro,
    new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: {
        uBrillo: uniformes.uBrillo,
        uResalte: uniformes.uResalte,
        uMordisco: uniformes.uMordisco,
        uRadio: { value: radio },
        uTam: { value: 2.6 },
      },
      vertexShader: /* glsl */ `
        uniform float uRadio;
        uniform float uTam;
        varying vec2 vP;
        varying vec2 vSol;
        void main() {
          float escala = length(modelMatrix[0].xyz);
          vec4 centro = modelViewMatrix * vec4(0.0, 0.0, 0.0, 1.0);
          vec4 sol = viewMatrix * vec4(0.0, 0.0, 0.0, 1.0);
          vSol = normalize(sol.xy - centro.xy + vec2(1e-5));
          vP = position.xy * uTam;
          centro.xy += position.xy * uTam * uRadio * escala;
          gl_Position = projectionMatrix * centro;
        }
      `,
      fragmentShader: /* glsl */ `
        uniform vec3 uBrillo;
        uniform float uResalte;
        uniform float uMordisco;
        uniform float uTam;
        varying vec2 vP;
        varying vec2 vSol;
        ${RUIDO}
        ${MORDISCO_GLSL}

        void main() {
          float d = length(vP);
          float fuera = max(d - 1.0, 0.0);
          float halo = exp(-fuera * 7.5) * 0.5 + exp(-fuera * 2.2) * 0.1;
          float haciaSol = dot(vP / max(d, 1e-4), vSol) * 0.5 + 0.5;
          halo *= mix(0.3, 1.0, haciaSol) * (0.75 + uResalte * 1.1);
          halo *= smoothstep(0.97, 1.0, d) * smoothstep(uTam, uTam * 0.7, d);
          // Donde falta el trozo arrancado no hay atmósfera que brille.
          if (uMordisco > 0.5) halo *= mix(0.35, 1.0, smoothstep(CRATER_RADIO * 0.3, CRATER_RADIO, length(vP - CRATER_CENTRO.xy)));
          gl_FragColor = vec4(uBrillo * halo, 1.0);
        }
      `,
    }),
  );
  halo.frustumCulled = false;
  cuerpo.add(halo);

  // Los trozos arrancados flotan junto al mordisco.
  if (producto.mordisco) cuerpo.add(crearFragmentos(tonos.base, tonos.brillo, globales, radio));

  // Órbita: una hilera de cuadraditos que se ilumina como estela detrás del planeta.
  const cantidad = Math.round((TAU * radioOrbita) / 0.3);
  const posiciones = new Float32Array(cantidad * 3);
  const angulos = new Float32Array(cantidad);
  for (let i = 0; i < cantidad; i++) {
    const a = (i / cantidad) * TAU;
    posiciones.set([Math.cos(a) * radioOrbita, 0, -Math.sin(a) * radioOrbita], i * 3);
    angulos[i] = a;
  }
  const geometriaOrbita = new THREE.BufferGeometry();
  geometriaOrbita.setAttribute('position', new THREE.BufferAttribute(posiciones, 3));
  geometriaOrbita.setAttribute('aAngulo', new THREE.BufferAttribute(angulos, 1));

  const uniformesOrbita = {
    uColor: uniformes.uBrillo,
    uAngulo: { value: fase },
    uPixel: { value: 1 },
    uAparicion: { value: 1 },
    uResalte: uniformes.uResalte,
  };
  const puntos = new THREE.Points(
    geometriaOrbita,
    new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: uniformesOrbita,
      vertexShader: /* glsl */ `
        attribute float aAngulo;
        uniform float uAngulo;
        uniform float uPixel;
        uniform float uAparicion;
        uniform float uResalte;
        varying float vBrillo;
        void main() {
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          float detras = mod(uAngulo - aAngulo, 6.2831853);
          float estela = exp(-detras * 1.5);
          float trazada = step(detras, uAparicion * 6.2831853);
          vBrillo = (0.13 + 0.17 * uResalte + estela * 1.05) * trazada;
          float tam = uPixel * (1.0 + 1.6 * estela) * clamp(70.0 / -mv.z, 0.8, 2.6);
          gl_PointSize = max(tam, 1.0);
          gl_Position = projectionMatrix * mv;
        }
      `,
      fragmentShader: /* glsl */ `
        uniform vec3 uColor;
        varying float vBrillo;
        void main() {
          gl_FragColor = vec4(uColor * vBrillo, 1.0);
        }
      `,
    }),
  );
  orbita.add(puntos);

  const planeta = {
    producto,
    orbita,
    cuerpo,
    radio,
    radioOrbita,
    uniformes,
    uniformesOrbita,
    actualizar(tiempoOrbital) {
      const angulo = (fase + tiempoOrbital * velocidad) % TAU;
      cuerpo.position.set(Math.cos(angulo) * radioOrbita, 0, -Math.sin(angulo) * radioOrbita);
      esfera.rotation.y = tiempoOrbital * giro;
      uniformesOrbita.uAngulo.value = angulo;
    },
    aparecer(escala, trazado) {
      cuerpo.scale.setScalar(Math.max(escala, 1e-4));
      cuerpo.visible = escala > 0;
      uniformesOrbita.uAparicion.value = trazado;
    },
  };
  planeta.actualizar(0);
  return planeta;
}

function calcularTonos(color) {
  const hsl = color.getHSL({ h: 0, s: 0, l: 0 }, THREE.SRGBColorSpace);
  return {
    base: color.clone(),
    // Versión luminosa del color para el halo, el borde y la órbita.
    brillo: new THREE.Color().setHSL(hsl.h, Math.min(1, hsl.s * 1.05 + 0.05), Math.max(0.6, hsl.l + 0.12), THREE.SRGBColorSpace),
  };
}
