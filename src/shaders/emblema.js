/**
 * Funciones para dibujar un emblema sobre una esfera a partir de su máscara
 * (R = silueta del logo, G = la T y el pictograma en blanco).
 */
export const EMBLEMA = /* glsl */ `
// Umbral con antialiasing: reconstruye bordes nítidos aunque el PNG original sea pequeño.
float umbralSuave(float umbral, float valor) {
  float ancho = max(fwidth(valor) * 0.75, 1e-4);
  return smoothstep(umbral - ancho, umbral + ancho, valor);
}

// Proyección azimutal equidistante centrada en el punto de la esfera que mira a la cámara:
// el emblema siempre se lee de frente y se curva hacia el borde como si estuviera impreso.
// N: normal del fragmento, V: dirección del centro a la cámara, arribaCamara: vertical de la
// pantalla, mitad: medio lado de la máscara (1 = del centro al borde visible de la esfera).
vec2 uvEmblema(vec3 N, vec3 V, vec3 arribaCamara, float mitad) {
  vec3 derecha = normalize(cross(arribaCamara, V));
  vec3 arriba = cross(V, derecha);
  vec2 d = vec2(dot(N, derecha), dot(N, arriba));
  float largo = length(d);
  float angulo = atan(largo, dot(N, V));
  vec2 q = d * (angulo / (1.5707963 * max(largo, 1e-5)));
  return q / mitad * 0.5 + 0.5;
}

float dentroDeMascara(vec2 uv) {
  vec2 dentro = step(vec2(0.0), uv) * step(uv, vec2(1.0));
  return dentro.x * dentro.y;
}
`;
