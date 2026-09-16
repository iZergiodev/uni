import * as THREE from 'three';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { azarConSemilla } from './azar.js';

/**
 * Mordisco opcional de un planeta (ver `mordisco` en config.js): un trozo de corteza arrancado
 * en la esquina superior derecha y los fragmentos que se han desprendido, como el cuadrado
 * que se separa en el logo de T-Stock.
 *
 * Todo se mide en radios del planeta y en el marco de la cámara (x a la derecha, y hacia arriba,
 * z hacia la cámara), igual que el logo blanco: el mordisco siempre queda arriba a la derecha.
 */

// Necesita el ruido (fbm) declarado antes.
export const MORDISCO_GLSL = /* glsl */ `
  const vec3 CRATER_CENTRO = vec3(0.69, 0.65, 0.45);
  const float CRATER_RADIO = 0.63;

  // Distancia al hueco: una esfera deformada con ruido para que el borde parezca roto.
  float distanciaCrater(vec3 p) {
    return length(p - CRATER_CENTRO) - CRATER_RADIO + fbm(p * 2.7 + vec3(3.7, 1.9, 5.3), 3) * 0.12;
  }

  // Distancia al planeta mordido: la esfera menos el hueco.
  float distanciaSolido(vec3 p) {
    return max(length(p) - 1.0, -distanciaCrater(p));
  }
`;

/** Fragmentos desprendidos: una roca principal y dos pequeñas, girando despacio. */
export function crearFragmentos(color, brillo, globales, radio) {
  const grupo = new THREE.Group();
  const fragmentos = [
    { centro: [1.16, 1.1, 0.15], tamano: 0.26, eje: [0.4, 1, 0.3], velocidad: 0.22, semilla: 11 },
    { centro: [1.42, 0.86, 0.3], tamano: 0.09, eje: [1, 0.2, 0.5], velocidad: 0.5, semilla: 23 },
    { centro: [0.98, 1.4, -0.1], tamano: 0.065, eje: [0.2, 0.6, 1], velocidad: 0.65, semilla: 37 },
  ];

  for (const fragmento of fragmentos) {
    const roca = new THREE.Mesh(
      crearRoca(fragmento.semilla),
      new THREE.ShaderMaterial({
        uniforms: {
          uTiempo: globales.uTiempo,
          uArribaCamara: globales.uArribaCamara,
          uColor: { value: color },
          uBrillo: { value: brillo },
          uRadio: { value: radio },
          uCentro: { value: new THREE.Vector3(...fragmento.centro) },
          uTamano: { value: fragmento.tamano },
          uEje: { value: new THREE.Vector3(...fragmento.eje).normalize() },
          uVelocidad: { value: fragmento.velocidad },
          uFase: { value: fragmento.semilla },
        },
        vertexShader: /* glsl */ `
          uniform float uTiempo;
          uniform vec3 uArribaCamara;
          uniform float uRadio;
          uniform vec3 uCentro;
          uniform float uTamano;
          uniform vec3 uEje;
          uniform float uVelocidad;
          uniform float uFase;
          varying vec3 vNormal;
          varying vec3 vNormalLocal;
          varying vec3 vPosMundo;

          mat3 rotacion(vec3 eje, float angulo) {
            float s = sin(angulo);
            float c = cos(angulo);
            float oc = 1.0 - c;
            return mat3(
              oc * eje.x * eje.x + c, oc * eje.x * eje.y + eje.z * s, oc * eje.z * eje.x - eje.y * s,
              oc * eje.x * eje.y - eje.z * s, oc * eje.y * eje.y + c, oc * eje.y * eje.z + eje.x * s,
              oc * eje.z * eje.x + eje.y * s, oc * eje.y * eje.z - eje.x * s, oc * eje.z * eje.z + c
            );
          }

          void main() {
            vec3 centro = (modelMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
            float escala = length(modelMatrix[0].xyz) * uRadio;
            vec3 V = normalize(cameraPosition - centro);
            vec3 derecha = normalize(cross(uArribaCamara, V));
            mat3 marco = mat3(derecha, cross(V, derecha), V);
            mat3 giro = rotacion(uEje, uTiempo * uVelocidad + uFase);
            // Se aleja y se acerca un poco, como si siguiera flotando tras desprenderse.
            vec3 deriva = normalize(uCentro) * sin(uTiempo * 0.35 + uFase) * 0.03;
            vPosMundo = centro + marco * (uCentro + deriva + giro * position * uTamano) * escala;
            vNormal = marco * (giro * normal);
            vNormalLocal = normal;
            gl_Position = projectionMatrix * viewMatrix * vec4(vPosMundo, 1.0);
          }
        `,
        fragmentShader: /* glsl */ `
          uniform vec3 uColor;
          uniform vec3 uBrillo;
          varying vec3 vNormal;
          varying vec3 vNormalLocal;
          varying vec3 vPosMundo;
          void main() {
            vec3 N = normalize(vNormal);
            float dia = smoothstep(-0.25, 0.6, dot(N, normalize(-vPosMundo)));
            // La cara plana superior es la corteza del planeta; el resto, roca del interior.
            float corteza = smoothstep(0.75, 0.9, normalize(vNormalLocal).y);
            vec3 albedo = mix(mix(uColor * 0.6, uBrillo * 0.45, 0.5), uColor, corteza);
            // Canto iluminado, como la atmósfera del planeta, para que se distinga del espacio.
            float canto = pow(1.0 - abs(dot(N, normalize(cameraPosition - vPosMundo))), 2.0);
            gl_FragColor = vec4(albedo * mix(0.3, 1.0, dia) + uBrillo * canto * 0.35, 1.0);
          }
        `,
      }),
    );
    roca.frustumCulled = false;
    grupo.add(roca);
  }
  return grupo;
}

/** Roca irregular de caras planas con una cara superior lisa (la corteza). */
function crearRoca(semilla) {
  const azar = azarConSemilla(semilla);
  let geometria = new THREE.IcosahedronGeometry(1, 1);
  geometria.deleteAttribute('normal');
  geometria.deleteAttribute('uv');
  geometria = mergeVertices(geometria);

  const posiciones = geometria.attributes.position;
  const v = new THREE.Vector3();
  for (let i = 0; i < posiciones.count; i++) {
    v.fromBufferAttribute(posiciones, i).multiplyScalar(0.7 + azar() * 0.55);
    if (v.y > 0.35) v.y = 0.35 + (v.y - 0.35) * 0.15;
    posiciones.setXYZ(i, v.x, v.y, v.z * 0.85);
  }

  geometria = geometria.toNonIndexed();
  geometria.computeVertexNormals();
  return geometria;
}
