# MenteActiva

Aplicación de desafíos mentales (memoria, cálculo, lógica, palabras y reflejos) con una landing page asociada. Construida con HTML, CSS y JavaScript puro, sin dependencias ni build step.

## Estructura

```
├── index.html          # Redirige a la landing page
├── landing/             # Landing page de marketing
│   ├── index.html
│   └── style.css
└── app/                 # Aplicación de juegos
    ├── index.html
    ├── style.css
    └── app.js
```

## Cómo usarla

No requiere instalación. Basta con abrir `landing/index.html` (o `index.html` en la raíz) en un navegador, o servir la carpeta con cualquier servidor estático:

```bash
python3 -m http.server 8080
# luego abre http://localhost:8080
```

## Juegos incluidos

- **Memoria**: encuentra las parejas de símbolos con el menor número de movimientos (3 niveles de dificultad).
- **Cálculo rápido**: responde 10 operaciones matemáticas eligiendo la opción correcta.
- **Secuencia lógica**: adivina el siguiente número de la serie; sube de nivel con cada acierto.
- **Palabras revueltas**: ordena las letras para formar la palabra correcta usando una pista.
- **Tiempo de reacción**: mide en milisegundos qué tan rápido reaccionas ante un estímulo visual.

El progreso y los mejores puntajes se guardan en `localStorage`, por lo que persisten entre sesiones en el mismo navegador.
