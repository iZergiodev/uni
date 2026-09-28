import * as THREE from 'three';
import { azarConSemilla, normal } from './azar.js';

// Distancia a la cámara (unidades de la escena) a la que un cubo empieza a encogerse y desaparece.
const CERCA_MAX = 6;
const CERCA_MIN = 2.5;

/** Cinturón de pequeños cubos entre dos órbitas, iluminado por la estrella. */
export function crearCinturon(radioMedio, ancho, cantidad = 800) {
  const azar = azarConSemilla(4815);
  const material = new THREE.MeshStandardMaterial({ roughness: 0.55, metalness: 0.2 });
  // Los cubos que pasan junto a la cámara se deshacen en polvo en vez de tapar el planeta enfocado.
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader.replace(
      '#include <begin_vertex>',
      /* glsl */ `#include <begin_vertex>
      float distanciaCamara = length((modelViewMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz);
      transformed *= smoothstep(${CERCA_MIN.toFixed(1)}, ${CERCA_MAX.toFixed(1)}, distanciaCamara);`,
    );
  };
  const malla = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), material, cantidad);

  const matriz = new THREE.Matrix4();
  const posicion = new THREE.Vector3();
  const giro = new THREE.Quaternion();
  const euler = new THREE.Euler();
  const escala = new THREE.Vector3();
  const color = new THREE.Color();
  const azulTandem = new THREE.Color('#1697d5');

  for (let i = 0; i < cantidad; i++) {
    const angulo = azar() * Math.PI * 2;
    const radio = radioMedio + THREE.MathUtils.clamp(normal(azar) * 0.32, -1, 1) * ancho;
    posicion.set(Math.cos(angulo) * radio, normal(azar) * 0.22, -Math.sin(angulo) * radio);
    giro.setFromEuler(euler.set(azar() * 6.3, azar() * 6.3, azar() * 6.3));
    escala.setScalar(0.03 + Math.pow(azar(), 4) * 0.17);
    malla.setMatrixAt(i, matriz.compose(posicion, giro, escala));

    if (azar() < 0.07) color.copy(azulTandem);
    else color.setHSL(0.58 + azar() * 0.05, 0.12 + azar() * 0.14, 0.3 + azar() * 0.28, THREE.SRGBColorSpace);
    malla.setColorAt(i, color);
  }

  const grupo = new THREE.Group();
  grupo.add(malla);
  return { grupo };
}
