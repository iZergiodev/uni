# T-Universe

El universo de productos de Tandem en Three.js. La estrella del centro es el logo de Tandem y cada
planeta es un producto: una esfera con el color de su logo y el logo blanco centrado.

## Arrancar

```bash
npm install
npm run dev     # abre el universo en http://localhost:5173
npm run build   # genera dist/, lista para subir a cualquier servidor web
```

## Productos

- Cada PNG de `productos/` es un planeta: copia ahí un logo nuevo y aparecerá sin tocar código.
  El color, la T y el pictograma se extraen de la propia imagen; el nombre escrito debajo del logo se ignora.
- `Tandem_logo.png` es la estrella del centro (`ESTRELLA` en `src/config.js`).
- En `src/config.js` se ajusta el orden de las órbitas, el lema y la web de cada ficha, un color
  distinto al del logo o el `mordisco` (el trozo arrancado de T-Stock). Los lemas actuales son provisionales.

## Uso

- Arrastrar para girar, rueda o pellizco para acercar.
- Pulsar un planeta (o su icono en la barra inferior) lo enfoca y abre su ficha; `Esc` vuelve a la vista general
  y las flechas pasan al producto anterior o siguiente.
- `index.html#T-Stock` abre directamente ese planeta.
