# Changelog

Todos los cambios notables de este proyecto se documentan aquí.
Formato basado en [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/); versionado según [SemVer](https://semver.org/lang/es/).

## [0.4.0] - 2026-11-12

### Añadido
- Avisos proactivos en Inicio:
  - **Pago de tarjeta**, 3 días antes de la fecha límite, con lo que llevas en el corte. Hay nuevos campos de día de corte y día de pago en las tarjetas de crédito.
  - **Ritmo**: cuando un presupuesto va más de 15 % arriba de lo ideal pasado el día 7.
  - **Inicio de período** de un plan, con opción de ajustarlo.
  - **Importación atrasada** por medio de pago (más de 10 días).
  - **Cargos recurrentes**: mismo comercio, monto y día del mes en 2 o 3 meses. Se marcan con 🔁.
- Avisos en la bandeja de revisión:
  - **Aprender comercios**: "¿Siempre pongo Uber en Transporte?". Las reglas se aplican en las lecturas, en los recibos y al escribir a mano.
  - **Tarjeta no registrada**, integrada al nuevo sistema de avisos.
  - **Gasto inusual**: 3 o más veces la mediana de su categoría, con confirmación.
- Aviso de tasa de cambio con más de 7 días al registrar en otra moneda.
- Reglas anti-molestia:
  - máximo un aviso al día en Inicio;
  - "No" silencia ese aviso para siempre;
  - si se ignora dos veces, se pausa 30 días;
  - máximo 3 avisos a la vez en la bandeja.
- Ajustes → Avisos inteligentes:
  - interruptor por tipo de aviso;
  - lista de comercios aprendidos y de cargos recurrentes;
  - opción para volver a mostrar los avisos descartados.

### Corregido
- Acentos y emojis dañados por la codificación en la v0.3.0 publicada.

## [0.3.0] - 2026-11-12

### Añadido
- Aviso proactivo de tarjeta no registrada. Si la IA ve los últimos 4 dígitos de una tarjeta o cuenta que no tienes, la bandeja de revisión pregunta "No reconocí la tarjeta ••XXXX".
  - "Agregar tarjeta" la crea con los dígitos ya puestos y se la asigna a esos movimientos.
  - "No es mía" no vuelve a preguntar por ella, y se puede deshacer.
- Las lecturas asignan el medio de pago también por sus últimos 4 dígitos.

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
