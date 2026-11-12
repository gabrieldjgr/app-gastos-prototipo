# Ritmo · prototipo de control de gastos (PWA)

Prototipo navegable de una app de control de gastos personales. Se instala como app en el celular desde el navegador (PWA). Su idea central: **ponerse al día por lotes** subiendo capturas o archivos del banco, revisar en segundos lo que la IA propone y ver si vas **al ritmo** de tu presupuesto.

> Nombre provisional: "Ritmo". Es un prototipo para validar la experiencia, no el producto final.

## Qué incluye (v0.1.0)

- **Inicio** con un carrusel de gráficos de ritmo por presupuesto. Cada gráfico muestra:
  - la diagonal ideal;
  - el gasto real acumulado;
  - el día de hoy;
  - la proyección al cierre y el mensaje "A este ritmo terminarás X % por encima".
- **Gráficos personalizables**: por categoría, evolución por mes o semana, centros de costo y top comercios. Se pueden activar, desactivar y reordenar.
- **Ponerme al día**: sube capturas, CSV, Excel o PDF y la IA extrae los movimientos.
- **Escanear recibo**: una foto del ticket y el formulario se llena solo.
- **Registro manual** con teclado numérico propio, varias monedas y tasa de cambio manual.
- **Bandeja de revisión**:
  - agrupa los movimientos en dudosos, listos y "no son gasto";
  - muestra las preguntas de la IA con respuestas rápidas;
  - detecta posibles duplicados;
  - permite deslizar para confirmar o descartar, y deshacer.
- **Presupuestos** por centro de costo y, opcionalmente, por categoría. Periodicidad semanal, quincenal, mensual, anual o por fechas, con día de reinicio.
- **Categorías predefinidas** que se pueden mostrar u ocultar, más **categorías propias** y **centros de costo**.
- **Tema claro y oscuro.** Funciona sin conexión, excepto la lectura con IA.

## Inteligencia artificial

- **Sin clave**, la app funciona en **modo demo**: devuelve resultados de ejemplo para probar el flujo.
- **Con clave**: en *Ajustes → Inteligencia artificial* pega tu clave de la API de Anthropic. Las lecturas usan Claude con salida estructurada en JSON, a través del SDK oficial `@anthropic-ai/sdk`.

**Limitación conocida del prototipo:** la clave se guarda en el navegador y se envía directo a Anthropic. Sirve para pruebas personales, pero **no** es un diseño apto para usuarios reales. En el MVP la llamada a la IA debe pasar por un servidor propio.

## Datos

Todo se guarda en el propio dispositivo (`localStorage`). No hay cuentas ni sincronización entre personas. Compartir con la pareja requiere un servidor y llegará en el MVP.

## Ejecutar en local

```bash
node tools/serve.mjs 5173
```

Luego abre http://localhost:5173. Para regenerar los íconos: `node tools/make-icons.mjs`.

## Estructura

```
index.html            Punto de entrada
manifest.webmanifest  Metadatos de la PWA
sw.js                 Service worker (funcionamiento sin conexión)
css/styles.css        Estilos y tokens de diseño (claro/oscuro)
js/app.js             Pantallas, navegación y flujos
js/charts.js          Gráfico de ritmo y widgets del inicio
js/budget.js          Períodos, acumulados, proyección y estados
js/ai.js              Lectura con Claude y modo demo
js/store.js           Estado y persistencia local
js/sample.js          Datos de ejemplo
js/format.js          Formato de montos y fechas (es-MX/AR/VE)
js/ui.js              Sheets, toasts, swipe, confeti, iconos
js/data.js            Catálogos: categorías, monedas, métodos de pago
tools/                Servidor local y generador de íconos
```
