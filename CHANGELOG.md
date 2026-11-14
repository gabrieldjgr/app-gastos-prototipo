# Changelog

Todos los cambios notables de este proyecto se documentan aquí.
Formato basado en [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/); versionado según [SemVer](https://semver.org/lang/es/).

## [0.10.0] - 2026-11-13

### Añadido
- **Presupuesto en "Por categoría" (Inicio).** Las categorías con presupuesto muestran "$2,368 de $2,200":
  - una barra de avance de color: verde en ritmo, amarillo adelantado al ritmo o cerca del tope, rojo excedido;
  - en el período en curso, la marca de dónde deberías ir hoy;
  - "Quedan $1,761" o "Te pasaste $168".
- Si el presupuesto es de un centro de costo (por ejemplo, "Día a día"), la barra cuenta solo los gastos de ese centro. Los de otros centros aparecen aparte: "+$2,810 fuera de Día a día".
- Las categorías con presupuesto se muestran siempre, aunque aún no tengan gastos.
- Viendo una semana con presupuestos mensuales, el monto se ajusta a la semana y se marca con "≈".
- El pie suma lo gastado contra lo presupuestado en todas las categorías con presupuesto.

## [0.9.0] - 2026-11-13

### Añadido
- **Cortes de tarjeta en Gastos.** Al filtrar una sola tarjeta de crédito con día de corte, arriba de la lista aparece su estado de cuenta:
  - **Último corte:** el que se paga. Muestra el total, la fecha en que cerró y cuándo se paga ("paga el 15 nov, en 2 días").
  - **En curso:** lo que llevas en el corte abierto y en cuántos días cierra.
  - **Anteriores:** lista de cortes pasados con su total.
  - Avisa si hay movimientos de ese corte por revisar, porque aún no cuentan en el total.
  - El día de corte cuenta en el corte que cierra ese día. Se ajusta en meses cortos: un corte el 31 cae el 28 o 29 en febrero.
- El filtro **Período** ofrece los cortes de la tarjeta filtrada.
- Si la tarjeta no tiene día de corte, un aviso permite agregarlo ahí mismo.
- El aviso de pago de tarjeta en Inicio ("Ver gastos") abre directo el **último corte** de esa tarjeta, con el mismo total del aviso.

## [0.8.0] - 2026-11-13

### Añadido
- **Filtros de varios valores en Gastos.** Los filtros de **Tarjeta / medio**, **Centro** y **Categoría** permiten elegir varios a la vez; el chip muestra "TDC BBVA +1".
  - Nueva opción **Sin medio de pago**, para encontrar gastos sin tarjeta asignada.
  - El filtro de tarjetas incluye medios archivados o escritos a mano que aparecen en gastos.
  - Con dos o más medios elegidos, el pie desglosa el total por medio.
- **Modo selección en Gastos:** se entra con **Seleccionar** o manteniendo presionado un gasto.
  - Toca gastos para marcarlos, el día para marcarlo completo, o **Todos** para marcar lo filtrado.
  - La barra inferior muestra cuántos van y cuánto suman, con **Medio**, **Centro**, **Categoría** y **Eliminar** para todos a la vez. Todo con deshacer.
  - Se sale con **Listo**, con el gesto atrás o al cambiar de pestaña.
- Cada gasto muestra su medio de pago en la lista.

## [0.7.0] - 2026-11-13

### Añadido
- **Período en Inicio:** el selector `‹ noviembre ›` debajo del saludo cambia todo el tablero.
  - Las flechas avanzan o retroceden un período. Al tocar el nombre se abre una lista con el total de cada mes o semana, y la opción de cambiar entre meses y semanas.
  - En un período pasado, el título cambia a "Así cerró octubre", el selector se pinta de color y aparece **Volver a hoy ↺**.
  - Al abrir la app siempre vuelve al período actual.
- **Evolución interactiva:**
  - Tocar una barra selecciona ese mes o semana; tocarla de nuevo vuelve a hoy.
  - La barra elegida se resalta con su monto.
  - El período actual se ve rayado y con "hoy", porque aún no termina.
- **Presupuestos cerrados:** en un período pasado, cada tarjeta de Ritmo muestra cómo cerró el período del presupuesto: "✓ Cerró 42 % abajo" o "● Se pasó $741", y Gastado, Presupuesto y Diferencia.
- **Comparaciones:**
  - El total trae "▲ 12 % vs oct". En el período actual se compara al mismo día: "vs oct al día 13".
  - Las categorías marcan cambios de 15 % o más.
- **Ver el detalle:** tocar una categoría, un centro de costo o un comercio abre Gastos filtrado por ese período.
- Un período pasado sin gastos muestra un solo aviso con "Importar movimientos".

### Cambiado
- Por categoría, Centros de costo y Top comercios usan el período elegido, que se indica en cada tarjeta. Antes cada uno usaba una ventana distinta: mes, período del presupuesto o últimos 30 días.
- En un período pasado, se ocultan los centros de costo sin gastos.
- La etiqueta del promedio en Evolución ya no queda tapada.

## [0.6.0] - 2026-11-13

### Añadido
- **Respaldo** en Ajustes → Datos:
  - **Diario y automático:** una vez al día, al usar la app, guarda `ritmo-respaldo-AAAA-MM-DD.json` en Descargas. Solo lo hace si tus datos cambiaron.
  - **Enviar respaldo** abre el menú de compartir del teléfono (WhatsApp, Drive, correo…). **Guardar en Descargas** lo descarga en el momento.
  - **Restaurar desde un archivo** muestra un resumen y pide confirmación. Antes de reemplazar, descarga una copia de los datos actuales.
  - El archivo nunca incluye las claves de IA. Al restaurar, se conservan las del teléfono.
- **Recordatorio semanal de respaldo**: un aviso en Inicio si llevas 7 días sin enviarte el archivo.
  - "Ahora no" lo pospone una semana.
  - Se puede apagar en Respaldo o en Avisos inteligentes.
- **Medio de pago del lote en Revisar**:
  - Una barra muestra el medio de pago de los movimientos pendientes (o "Varios", con cuántos de cada uno).
  - "Cambiar" o "Asignar a todos" lo aplica a todo el lote, con deshacer.
  - Si hay pendientes de varias importaciones, aparece una barra por lote.
- Cada pendiente muestra su medio de pago, y la edición rápida de los "Listos" incluye el campo **Medio**.

### Corregido
- La edición rápida de los "Listos" se salía de la pantalla en teléfonos.

## [0.5.3] - 2026-11-12

### Corregido
- Con algunas claves, `gemini-flash-latest` no responde ni a una lectura mínima, mientras que `gemini-flash-lite-latest` responde en menos de 2 segundos. Lo detectó el diagnóstico.
  - Si un modelo no responde en 90 segundos, la app lee esa vez con un modelo ligero (Flash-Lite, mini o Haiku) y te avisa.
  - Ante saturación o falta de cupo también se prefiere un modelo ligero.

### Cambiado
- Diagnóstico de IA:
  - Cada prueba espera como máximo 30 segundos (antes 90).
  - Si la lectura de texto no responde, se omite la de imagen con ese mismo modelo.
  - Con Gemini, se prueba la misma lectura con razonamiento limitado, para saber si el razonamiento es la causa de la demora.
  - Si otro modelo funciona, aparece el botón "Usar … desde ahora".

## [0.5.2] - 2026-11-12

### Añadido
- **Diagnóstico de IA** en Ajustes → Inteligencia artificial.
  - Hace lecturas de prueba (texto e imagen) con un ticket inventado, sin enviar tus datos.
  - Muestra el código y el mensaje original del proveedor, el tiempo de respuesta, y si otro modelo sí funciona.
  - Incluye las últimas 6 lecturas reales (tipo y tamaño de archivo, modelo, resultado y error), sin su contenido.
  - "Copiar resultado" copia todo como texto. La clave nunca se muestra: solo su inicio y su largo.
- Los mensajes de error de lectura sugieren abrir el diagnóstico.

### Cambiado
- Si se agota el cupo de un modelo (429), la app prueba una vez con otro modelo, porque en Gemini el cupo gratuito es por modelo. No reintenta con el mismo.

## [0.5.1] - 2026-11-12

### Corregido
- Error "Error de Gemini (503): This model is currently experiencing high demand". Viene de los servidores del proveedor, no de la clave.
  - La app reintenta sola 2 veces (a los 3 y a los 8 segundos) y muestra el avance.
  - Si sigue saturado, lee una vez con otro modelo disponible para tu clave y te avisa. Tu modelo elegido no cambia.
  - Si todo falla, el mensaje explica en español que es saturación del proveedor.
- La lectura con IA se quedaba "procesando" para siempre si el proveedor no respondía. Ahora se cancela a los 90 segundos con un aviso claro. Aplica a Claude, Gemini y OpenAI.

## [0.5.0] - 2026-11-12

### Añadido
- **Buscar actualizaciones** en Ajustes, junto a la versión.
  - Muestra si tienes la última versión o si hay una nueva, con sus novedades.
  - "Actualizar ahora" descarga los archivos nuevos sin tocar tus datos.
  - Al abrir la app se revisa en silencio una vez al día; si hay versión nueva, aparece un punto en el engrane.
- **Gesto atrás en Android**:
  - primero cierra la ventana o el editor abierto;
  - luego vuelve a Inicio;
  - en Inicio pide hacer el gesto otra vez para salir;
  - se puede desactivar en Ajustes → Confirmar al salir.

### Cambiado
- El service worker revalida los archivos con el servidor. Ya no hace falta recargar varias veces para ver una versión nueva.

## [0.4.1] - 2026-11-12

### Corregido
- Error "El modelo gemini-2.5-flash no existe o no está disponible". Los modelos fijos en el código pueden ser retirados por el proveedor.
  - El selector de modelo ahora consulta la lista real de modelos disponibles para tu clave (Claude, Gemini u OpenAI).
  - "Probar conexión" revisa también que el modelo elegido siga existiendo y, si no, cambia al mejor disponible.
  - Si una lectura falla porque el modelo ya no existe, la app elige otro, reintenta una vez y te avisa.

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
