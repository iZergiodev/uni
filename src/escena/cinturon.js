import * as THREE from 'three';
import { azarConSemilla, normal } from './azar.js';

/** Cinturón de pequeños cubos entre dos órbitas, iluminado por la estrella. */
export function crearCinturon(radioMedio, ancho, cantidad = 800) {
  const azar = azarConSemilla(4815);
  const malla = new THREE.InstancedMesh(
    new THREE.BoxGeometry(1, 1, 1),
    new THREE.MeshStandardMaterial({ roughness: 0.55, metalness: 0.2 }),
    cantidad,
  );

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
