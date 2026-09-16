import * as THREE from 'three';
import { RUIDO } from '../shaders/ruido.js';
import { EMBLEMA } from '../shaders/emblema.js';

/**
 * La estrella del centro: plasma en el azul de Tandem con la T incandescente
 * y una corona que la rodea.
 */
export function crearEstrella(logo, radio, globales) {
  const azul = logo ? logo.color.clone() : new THREE.Color('#1697d5');
  const grupo = new THREE.Group();

  const uniformes = {
    uTiempo: globales.uTiempo,
    uArribaCamara: globales.uArribaCamara,
    uMascara: { value: logo?.textura ?? null },
    uHayMascara: { value: logo ? 1 : 0 },
    // Igual que en los planetas: la T en su proporción dentro del cuadrado del logo.
    uMitad: { value: logo ? 0.5 / logo.escalaGlifo : 1 },
    uAzul: { value: azul },
    uEncendido: { value: 1 },
    uGlifo: { value: 1 },
    uResalte: { value: 0 },
  };

  const esfera = new THREE.Mesh(
    new THREE.SphereGeometry(radio, 128, 96),
    new THREE.ShaderMaterial({
      uniforms: uniformes,
      vertexShader: /* glsl */ `
        varying vec3 vPos;
        varying vec3 vCentro;
        varying vec3 vObjeto;
        void main() {
          vec4 mundo = modelMatrix * vec4(position, 1.0);
          vPos = mundo.xyz;
          vCentro = (modelMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
          vObjeto = normalize(position);
          gl_Position = projectionMatrix * viewMatrix * mundo;
        }
      `,
      fragmentShader: /* glsl */ `
        uniform float uTiempo;
        uniform vec3 uArribaCamara;
        uniform sampler2D uMascara;
        uniform float uHayMascara;
        uniform float uMitad;
        uniform vec3 uAzul;
        uniform float uEncendido;
        uniform float uGlifo;
        uniform float uResalte;
        varying vec3 vPos;
        varying vec3 vCentro;
        varying vec3 vObjeto;
        ${RUIDO}
        ${EMBLEMA}

        // Turbulencia: celdas brillantes separadas por surcos oscuros, como la granulación solar.
        float turbulencia(vec3 p) {
          float suma = 0.0;
          float amplitud = 0.5;
          for (int i = 0; i < 5; i++) {
            suma += amplitud * abs(snoise(p));
            p = p * 2.03 + vec3(3.1, 1.7, 5.3);
            amplitud *= 0.5;
          }
          return suma;
        }

        void main() {
          vec3 N = normalize(vPos - vCentro);
          vec3 V = normalize(cameraPosition - vCentro);
          float mu = max(dot(N, normalize(cameraPosition - vPos)), 0.0);

          float t = uTiempo * 0.035;
          vec3 p = vObjeto * 2.4;
          float regiones = fbm(p * 0.45 + vec3(t, -t, 0.5 * t), 3) * 0.5 + 0.5;
          float celdas = turbulencia(p + vec3(0.0, 1.6 * t, 0.0) + regiones * 0.9);
          float h = clamp(0.22 + celdas * 1.05 + (regiones - 0.5) * 0.5, 0.0, 1.0);

          vec3 plasma = mix(uAzul * 0.3, uAzul * 0.9, smoothstep(0.1, 0.55, h));
          plasma = mix(plasma, vec3(0.28, 0.7, 1.0), smoothstep(0.6, 1.0, h));
          plasma *= 0.8 + 0.3 * h;
          // Oscurecimiento del limbo, como en las estrellas reales.
          plasma *= mix(0.35, 1.0, pow(mu, 0.5));

          // La T de Tandem, incandescente y centrada.
          vec2 uv = uvEmblema(N, V, uArribaCamara, uMitad);
          float glifo = umbralSuave(0.5, texture2D(uMascara, uv).g) * dentroDeMascara(uv) * uHayMascara;

          vec3 color = plasma * uEncendido * (1.0 + 0.15 * uResalte);
          color = mix(color, vec3(1.5, 1.65, 1.8), glifo * uGlifo);
          gl_FragColor = vec4(color, 1.0);
        }
      `,
    }),
  );

  const corona = new THREE.Mesh(
    new THREE.PlaneGeometry(2, 2),
    new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: {
        uTiempo: globales.uTiempo,
        uAzul: { value: azul },
        uEncendido: uniformes.uEncendido,
        uRadio: { value: radio },
        uTam: { value: 5.5 },
      },
      vertexShader: /* glsl */ `
        uniform float uRadio;
        uniform float uTam;
        varying vec2 vP;
        void main() {
          vP = position.xy * uTam;
          vec4 centro = modelViewMatrix * vec4(0.0, 0.0, 0.0, 1.0);
          centro.xy += position.xy * uTam * uRadio;
          gl_Position = projectionMatrix * centro;
        }
      `,
      fragmentShader: /* glsl */ `
        uniform float uTiempo;
        uniform vec3 uAzul;
        uniform float uEncendido;
        uniform float uTam;
        varying vec2 vP;
        ${RUIDO}
        void main() {
          float r = length(vP);
          float fuera = max(r - 1.0, 0.0);
          vec2 direccion = vP / max(r, 1e-4);
          float rayos = fbm(vec3(direccion * 2.4, uTiempo * 0.035 - fuera * 0.3), 4) * 0.5 + 0.5;
          rayos = pow(rayos, 3.0) * 2.4;

          float cerca = exp(-fuera * 3.4);
          float medio = exp(-fuera * 1.2) * 0.2;
          float lejos = exp(-fuera * 0.45) * 0.035;
          vec3 claro = mix(uAzul, vec3(1.0), 0.55);
          vec3 color = uAzul * (cerca * 0.85 + medio + lejos) + claro * rayos * exp(-fuera * 1.6) * 0.3;
          color *= smoothstep(uTam, uTam * 0.6, r);
          gl_FragColor = vec4(color * uEncendido, 1.0);
        }
      `,
    }),
  );
  corona.frustumCulled = false;

  grupo.add(esfera, corona);
  return { grupo, uniformes, radio };
}
