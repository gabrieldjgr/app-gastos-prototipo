# Changelog

Todos los cambios notables de este proyecto se documentan aquí.
Formato basado en [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/); versionado según [SemVer](https://semver.org/lang/es/).

## [0.2.0] - 2026-11-12

### Añadido
- Medios de pago configurables (por ejemplo "TDC BBVA", "Cuenta Bancomer"). Cada uno tiene tipo, últimos 4 dígitos opcionales y titular. Se pueden reordenar y archivar. La IA los usa para asignar cada movimiento, y se pueden crear al vuelo desde cualquier selector.
- Editor de imágenes antes de enviar a la IA: recortar y tapar datos sensibles con recuadros negros, con deshacer y restablecer. Los recuadros quedan grabados en la imagen enviada; la original no sale del dispositivo.
- Elección de proveedor de IA: Claude (Anthropic), Gemini (Google, con nivel gratuito) u OpenAI. Cada uno tiene su propia clave, su modelo y un botón "Probar conexión" sin costo de uso.
- Planes de presupuesto por centro de costo:
  - todas las categorías en una lista con su monto y el total en vivo;
  - sugerencia según el promedio de los últimos 3 meses;
  - "colchón sin asignar" opcional;
  - incorporación de presupuestos sueltos ya existentes;
  - una tarjeta agrupada en la pantalla de Presupuestos.

### Cambiado
- Los gastos y datos guardados de la v0.1 se migran solos. Los métodos de pago antiguos se convierten en medios configurados, y la clave de Anthropic se conserva.

### Limitaciones conocidas
- La lectura real con Gemini y OpenAI no se ha probado con una clave válida. Con OpenAI, el navegador bloqueó las respuestas de error al enviar archivos por CORS; falta confirmar si ocurre también con una clave válida.

## [0.1.0] - 2026-11-11

### Añadido
- Prototipo PWA inicial instalable con funcionamiento sin conexión.
- Gráfico de ritmo por presupuesto: ideal, real escalonado, hoy, proyección, exceso sombreado, carrusel deslizable y detalle al mantener presionado.
- Inicio personalizable: por categoría, evolución, centros de costo y top comercios.
- Captura por lote (capturas, CSV, Excel, PDF) y por recibo con Claude, más un modo demo sin clave.
- Bandeja de revisión con preguntas de la IA, detección de duplicados, swipe para confirmar o descartar, y deshacer.
- Registro manual con teclado numérico, varias monedas y tasa manual.
- Presupuestos con periodicidad (semanal, quincenal, mensual, anual o por fechas) y día de reinicio.
- Categorías predefinidas (mostrar u ocultar), categorías propias y centros de costo.
- Tema claro y oscuro, y datos de ejemplo.
