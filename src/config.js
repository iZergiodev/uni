/**
 * Configuración de T-Universe.
 *
 * Los planetas salen solos de los PNG de la carpeta /productos: copia ahí un logo nuevo
 * y aparecerá un planeta más. Aquí solo se ajusta lo que no se puede deducir de la imagen.
 * La clave de cada producto es el nombre del archivo sin ".png".
 */

/** Logo de /productos que hace de estrella en el centro del universo. */
export const ESTRELLA = 'Tandem_logo';

/**
 * Datos opcionales de cada producto:
 *  - orden: posición de su órbita (1 = la más cercana a Tandem). Sin orden, va al final.
 *  - lema:  frase corta que aparece en su ficha.
 *  - url:   enlace a su web; si está vacío, la ficha no muestra enlace.
 *  - color: color del planeta en hexadecimal. Por defecto se toma del propio logo.
 *  - mordisco: arranca un trozo de roca de la parte superior derecha del planeta y deja los
 *    fragmentos flotando al lado, como el cuadrado que se separa en el logo de T-Stock.
 *
 * Los lemas son provisionales: sustitúyelos por la descripción real de cada producto.
 */
export const PRODUCTOS = {
  'T-Ofer': { orden: 1, lema: 'Ofertas y presupuestos', url: '' },
  'T-Config': { orden: 2, lema: 'Configuración de artículos', url: '' },
  'T-Planif': { orden: 3, lema: 'Planificación de la producción', url: '' },
  'T-Plant': { orden: 4, lema: 'Control de planta', url: '' },
  'T-Stock': { orden: 5, lema: 'Stock y almacenes', url: '', mordisco: true },
  'T-Logist': { orden: 6, lema: 'Logística y expediciones', url: '' },
  'T-Movil': { orden: 7, lema: 'Gestión desde el móvil', url: '' },
};

/** Proporciones y ritmo del universo (unidades de la escena y segundos). */
export const UNIVERSO = {
  radioEstrella: 3.2,
  radioPlaneta: 1.35,
  primeraOrbita: 8.5,
  separacionOrbitas: 2.8,
  // Segundos que tarda en dar la vuelta el planeta más cercano; los demás siguen a Kepler.
  periodoInterior: 55,
  // El cinturón de cubos va justo después de esta órbita (0 para quitarlo).
  cinturonTrasOrbita: 4,
};
