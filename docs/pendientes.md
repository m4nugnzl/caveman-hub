# Pendientes anotados

Averías vistas de paso, en otras tareas, y apartadas para no mezclarlas. Cada
una dice qué pasa, por qué y dónde tocar. Ninguna está arreglada.

1. **`tusSemanas.js` con cadencia quincenal empareja la entrega por lunes
   exacto.** `entregas.get(s.semana)` busca la entrega por el lunes de cada
   semana, y en quincenal la entrega cuelga del lunes de la primera de las dos.
   La segunda semana del periodo sale «sin entregar» aunque el periodo esté
   entregado o revisado. Lo mismo con `cerradas` (la respuesta del entrenador).
   Tocar: casar cada semana con el periodo que la contiene. `entregaDelPeriodo`
   (`src/domain/calendar.js`) ya sabe si una entrega cae dentro de un periodo;
   usar la misma partición que las casillas de Revisiones.

2. **El contador del archivo de fotos mezcla dos cifras.** Con un ángulo
   filtrado dice «23 fotos en 5 semanas»: las fotos son TODAS las del cliente
   (`suyas`) y las semanas son las del filtro (`carpetas`). Ya era así en
   `a2b2c11`. Tocar: `PhotoArchive.jsx`, el `contexto` del `Mando`; contar
   `filtradas` cuando hay filtro.

3. **El Estudio abre con una fila vacía de «Lateral (antiguo)».** Al entrar monta
   las dos últimas semanas con `availableAngles(photos)`, que son los ángulos de
   TODO el archivo. Si quedan laterales antiguas sin declarar, la fila entra
   aunque esas dos semanas no tengan ninguna, y sale en blanco entre el
   izquierdo y el derecho. Tocar: `usePhotoStudio.js`, marcar solo los ángulos
   que tienen foto en las semanas elegidas.

4. **El PNG de la rejilla se llama `…-evolucion-s1-8-1-8-8-1-8.png`.** El nombre
   junta la semana de cada hueco, pensado para el antes/después de dos. En la
   rejilla repite las semanas una vez por ángulo. Tocar: `PhotoStudio.jsx`,
   quitar las repetidas (`s1-8`).

5. **«Tus semanas» no ordena las fotos de una semana.** La ventana las enseña en
   el orden en que llegan de la base (se vio Espalda, Frontal, Lateral), y el
   resto de la aplicación va en F, I, D, E. Tocar: `semanasDelRastro` en
   `tusSemanas.js`, ordenar con `sortPhotos`, que ya usa `celdaDeLaFoto`.

6. **Las referencias de la lente Entreno no sobreviven a un renombrado en la
   propia hoja.** (Anotado el 22 sep 2026, al aprobar el borrador del bloque.)
   La referencia se guarda como `{ ejercicioId?, nombre }` y casa los registros
   del nombre guardado y los del nombre actual de ese id en la Librería. Eso
   cubre renombrar en la Librería, pero no cambiar el nombre escribiendo en la
   hoja: para la app es otro ejercicio y la referencia pierde el historial
   nuevo. Pasa porque la hoja y los registros solo guardan el NOMBRE del
   ejercicio (`Exercise` en `src/types.d.ts`; la ficha, 0094/0100, también casa
   por nombre), y renombrar en la Librería no reescribe las hojas ya montadas
   (`corregirEnLaBiblioteca`, `src/context/useLibraries.js`). El arreglo de
   fondo: que cada ejercicio de la hoja guarde el id de la Librería
   (`exercises.id` o `catalog_exercises.id`) y que registros, ficha y lente
   casen por id, con el nombre como respaldo para los escritos a mano. Es un
   cambio grande (hojas, registros, la función de la ficha, el importador y el
   copiar); no entra en el borrador ni en la lente.
