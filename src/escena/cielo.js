import * as THREE from 'three';
import { RUIDO } from '../shaders/ruido.js';
import { azarConSemilla, normal } from './azar.js';

// Orientación de la franja de la galaxia (vía láctea) que cruza el cielo.
const ORIENTACION_FRANJA = new THREE.Euler(1.05, 0.35, 0.42);

/**
 * Fondo del universo: nebulosa horneada en un cubemap (se calcula una vez) y
 * un campo de estrellas que titilan.
 */
export function crearCielo(renderer, { titilar = true } = {}) {
  const franja = new THREE.Matrix4().makeRotationFromEuler(ORIENTACION_FRANJA);
  const fondo = hornearNebulosa(renderer, franja);
  const estrellas = crearEstrellas(franja, titilar);
  return { fondo, estrellas, uniformes: estrellas.material.uniforms };
}

function hornearNebulosa(renderer, franja) {
  const escena = new THREE.Scene();
  const material = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    uniforms: {
      uFranja: { value: new THREE.Matrix3().setFromMatrix4(franja.clone().invert()) },
    },
    vertexShader: /* glsl */ `
      varying vec3 vDireccion;
      void main() {
        vDireccion = position;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform mat3 uFranja;
      varying vec3 vDireccion;
      ${RUIDO}
      void main() {
        vec3 d = normalize(vDireccion);
        vec3 enFranja = uFranja * d;
        float franja = exp(-enFranja.y * enFranja.y * 6.0);

        float n1 = fbm(d * 1.7, 5) * 0.5 + 0.5;
        float n2 = fbm(d * 4.1 + vec3(n1 * 1.7), 5) * 0.5 + 0.5;
        float nubes = smoothstep(0.36, 0.92, n1 * 0.55 + n2 * 0.55);

        vec3 color = vec3(0.0005, 0.0012, 0.0036);
        color += vec3(0.003, 0.018, 0.05) * nubes * (0.2 + 1.2 * franja);
        color += vec3(0.0, 0.022, 0.024) * pow(nubes, 2.2) * franja;
        color += vec3(0.016, 0.006, 0.032) * smoothstep(0.56, 1.0, n2) * franja;

        float polvo = smoothstep(0.5, 0.8, fbm(d * 8.5, 4) * 0.5 + 0.5) * franja;
        color *= 1.0 - 0.6 * polvo;
        gl_FragColor = vec4(color, 1.0);
      }
    `,
  });
  const esfera = new THREE.Mesh(new THREE.SphereGeometry(10, 64, 32), material);
  escena.add(esfera);

  const destino = new THREE.WebGLCubeRenderTarget(1024, { type: THREE.HalfFloatType });
  new THREE.CubeCamera(0.1, 100, destino).update(renderer, escena);

  esfera.geometry.dispose();
  material.dispose();
  return destino.texture;
}

function crearEstrellas(franja, titilar) {
  const cantidad = 7000;
  const azar = azarConSemilla(20260916);
  const posiciones = new Float32Array(cantidad * 3);
  const colores = new Float32Array(cantidad * 3);
  const tamanos = new Float32Array(cantidad);
  const fases = new Float32Array(cantidad);
  const tonos = [new THREE.Color('#a9c8ff'), new THREE.Color('#ffffff'), new THREE.Color('#ffe0bd')];
  const v = new THREE.Vector3();

  for (let i = 0; i < cantidad; i++) {
    if (azar() < 0.4) {
      const angulo = azar() * Math.PI * 2;
      v.set(Math.cos(angulo), normal(azar) * 0.13, Math.sin(angulo)).normalize().applyMatrix4(franja);
    } else {
      const z = azar() * 2 - 1;
      const angulo = azar() * Math.PI * 2;
      const r = Math.sqrt(1 - z * z);
      v.set(r * Math.cos(angulo), z, r * Math.sin(angulo));
    }
    v.multiplyScalar(1500);
    posiciones.set([v.x, v.y, v.z], i * 3);

    const brillo = 0.18 + Math.pow(azar(), 2.4) * 1.5;
    const t = azar();
    const tono = tonos[t < 0.3 ? 0 : t < 0.86 ? 1 : 2];
    colores.set([tono.r * brillo, tono.g * brillo, tono.b * brillo], i * 3);
    tamanos[i] = 1.1 + Math.pow(azar(), 9) * 3.6;
    fases[i] = azar() * Math.PI * 2;
  }

  const geometria = new THREE.BufferGeometry();
  geometria.setAttribute('position', new THREE.BufferAttribute(posiciones, 3));
  geometria.setAttribute('aColor', new THREE.BufferAttribute(colores, 3));
  geometria.setAttribute('aTam', new THREE.BufferAttribute(tamanos, 1));
  geometria.setAttribute('aFase', new THREE.BufferAttribute(fases, 1));

  const material = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: {
      uTiempo: { value: 0 },
      uPixel: { value: 1 },
      uAparicion: { value: 1 },
      uTitilar: { value: titilar ? 1 : 0 },
    },
    vertexShader: /* glsl */ `
      attribute vec3 aColor;
      attribute float aTam;
      attribute float aFase;
      uniform float uTiempo;
      uniform float uPixel;
      uniform float uAparicion;
      uniform float uTitilar;
      varying vec3 vColor;
      void main() {
        float ritmo = 0.6 + fract(aFase * 3.7) * 2.2;
        float titileo = 1.0 - uTitilar * 0.4 * (0.5 + 0.5 * sin(uTiempo * ritmo + aFase));
        vColor = aColor * titileo * uAparicion;
        gl_PointSize = aTam * uPixel;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      varying vec3 vColor;
      void main() {
        float r = length(gl_PointCoord - 0.5) * 2.0;
        float intensidad = 1.0 - smoothstep(0.45, 1.0, r);
        gl_FragColor = vec4(vColor * intensidad, 1.0);
      }
    `,
  });

  const estrellas = new THREE.Points(geometria, material);
  // Siguen a la cámara: están tan lejos que nunca se alcanzan.
  estrellas.frustumCulled = false;
  return estrellas;
}
