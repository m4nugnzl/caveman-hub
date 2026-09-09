import { useMemo, useState } from 'react';
import { Trash2 } from 'lucide-react';

import { useActions, useApp } from '@/context/AppContext';
import { findByName, similarNames } from '@/domain/catalog';
import { MUSCLE_GROUPS } from '@/domain/training';
import { VIDEO_URL_HINT, parseVideoUrl } from '@/domain/video';
import { CuerpoFichaEjercicio } from '@/components/Client/FichaEjercicioCliente';
import { Notice } from '@/components/ui/primitives';
import { MenuAcciones } from '@/components/ui/MenuAcciones';
import { useConfirm } from '@/components/ui/ConfirmProvider';
import { useToast } from '@/components/ui/ToastProvider';
import { SelectorDeClase } from './SelectorDeClase';

/**
 * La ficha de un ejercicio, en DOS CAPAS que no se pisan.
 *
 * ══ La regla, que viene de la 0094 y sigue en pie ══════════════════════════
 *
 * **Lo del catálogo es referencia y no se toca.** Qué necesita («Barra») y cómo
 * se hace («escápulas retraídas, pies fijos») son verdad para todo el mundo y
 * viven una sola vez, en `catalog_exercises`. Copiarlas a cada biblioteca sería
 * repartir mil copias del mismo hecho.
 *
 * **Lo tuyo es tu voz**, y el catálogo no puede tenerlo: el vídeo en el que TÚ
 * lo explicas, las pautas que le repites siempre al cliente y con qué lo cambias
 * cuando la máquina está ocupada. Eso es la 0098, y vive en tu biblioteca.
 *
 * ══ Se llaman PAUTAS, y en los dos lados ═══════════════════════════════════
 *
 * Este campo se llamó «tu clave» mientras no salía de aquí. Desde la 0100 lo lee
 * el cliente en su rutina, y entonces el nombre dejó de ser un detalle interno:
 * una cosa conserva el suyo en todo el flujo —el botón «Publicar» produce un
 * aviso «Publicado»—, así que lo que aquí se escribe como «tus pautas» allí se
 * lee como «las pautas de tu entrenador».
 *
 * «Clave» era además jerga de gimnasio, y en una aplicación ya significa otra
 * cosa. La columna sigue llamándose `cue`: esto es vocabulario de pantalla, no
 * de esquema.
 *
 * ══ El vídeo: por enlace, y lo decide él ═══════════════════════════════════
 *
 * Nada de subir ficheros —almacenamiento, moderación y copias a cambio de nada
 * que un enlace no dé—. Y sobre todo: **si no lo pone el entrenador, no
 * existe**. No hay vídeo de fábrica, ni del catálogo, ni de terceros.
 *
 * ── Dónde se ve, y cómo llega ──────────────────────────────────────────────
 * En el móvil del cliente, detrás de una marca junto al nombre del ejercicio en
 * su rutina (`Client/FichaEjercicioCliente`). Y llega por la función
 * `exercise_sheets` (0100), que le devuelve solo la ficha de los ejercicios de
 * SU plan: la biblioteca es del equipo y sus políticas no la dejan leer.
 *
 * Aquí decía que se ve «solo si tiene encendido el módulo `videos` de su
 * protocolo». **Ese módulo nunca existió** —`MODULES` son seis y ninguno es ese—
 * y no se ha construido a propósito: el interruptor ya es el enlace. Un
 * ejercicio sin vídeo no enseña nada, así que un módulo que significara
 * «enseñar lo que ya has decidido escribir» no decidiría nada. Y sería peor que
 * nada, porque en `protocol.js` todo nace apagado: el entrenador que acaba de
 * pegar su vídeo seguiría sin verlo en el móvil de su cliente y sin saber por
 * qué.
 *
 * En la hoja del entrenador no se pinta nada — esa orden («miniatura de
 * ejercicio nada») sigue vigente y esto no la toca: es otra pantalla y otro
 * usuario. Se cumple sola, porque la marca solo la pide el portal.
 *
 * ══ Y el aviso de «esto es de un compañero» se preguntaba mal ══════════════
 *
 * Recibía un `editable` calculado con `canEditLibraryItem`, que devuelve falso
 * para **todo nombre que esté en el catálogo** —y con razón, porque eso es lo
 * que protege sus macros—. Pero aquí la pregunta es otra: de quién es la FILA.
 *
 * El resultado era que cualquier ejercicio del catálogo que tuvieras en tu
 * biblioteca —o sea, casi todos— se abría diciendo «lo dio de alta un compañero
 * de equipo» aunque lo hubieras puesto tú y estuvieras solo. Y encima decía lo
 * contrario de lo que la 0098 decidió a propósito: el press banca del catálogo
 * **sí** puede llevar tu vídeo, porque lo que se escribe es tu voz y no el dato
 * de referencia.
 *
 * Así que la ficha ya no recibe permiso de nadie: mira de quién es la fila.
 *
 * ══ Y lo tuyo se corrige ENTERO, nombre incluido ═══════════════════════════
 *
 * Hasta hoy el nombre y el músculo sólo se escribían **al dar de alta**: una
 * errata era para siempre y un ejercicio mal clasificado se quedaba en el
 * músculo equivocado. El dueño lo dijo seco: «no se pueden editar ni ejercicios
 * ni alimentos aunque sean tuyos». Tenía razón, y no era una pantalla apagada:
 * la puerta de escritura identificaba POR NOMBRE, así que renombrar por ahí
 * habría creado un segundo ejercicio en vez de corregir el que hay —o sea, el
 * duplicado que esta pantalla existe para limpiar—. Ahora hay una puerta por
 * `id` (`editLibraryExercise`) y el nombre puede cambiar.
 *
 * ── Sólo lo que diste de alta TÚ ──────────────────────────────────────────
 * Ni un ejercicio del catálogo —su nombre y su músculo son la referencia con la
 * que se entienden todas las bibliotecas— ni el de un compañero de equipo. Lo
 * demás sigue igual: en el press banca del catálogo se escribe tu voz, no su
 * dato.
 *
 * ── Y renombrar tiene un precio que se dice ANTES ─────────────────────────
 * El plan guarda el NOMBRE del ejercicio y la ficha se busca por él (0094), así
 * que las semanas ya escritas se quedan con el nombre viejo **y sin tu vídeo ni
 * tus pautas**. No es un descuido: es el modelo. Por eso el cambio de nombre
 * pasa por una confirmación que lo dice con esas palabras.
 */
export const FichaEjercicio = ({
  nombre,
  nuevo = false,
  enCapa = false,
  lista = [],
  onIr,
  onCerrar,
  onBorrado,
}) => {
  const { exerciseLibrary, catalogExercises, session } = useApp();
  const { upsertLibraryExercise, saveExerciseSheet, editLibraryExercise, deleteLibraryExercise } =
    useActions();
  const toast = useToast();
  const confirm = useConfirm();

  const actual = useMemo(
    () => lista.find((e) => e.name.toLowerCase() === String(nombre || '').toLowerCase()) || null,
    [lista, nombre]
  );

  const [name, setName] = useState(nombre || '');
  const [muscle, setMuscle] = useState(actual?.muscle || MUSCLE_GROUPS[0]);
  const [videoUrl, setVideoUrl] = useState(actual?.videoUrl || '');
  const [cue, setCue] = useState(actual?.cue || '');
  const [guardando, setGuardando] = useState(false);

  /* Lo tocado desde que se montó. Misma mecánica y mismo porqué que en
     `FichaAlimento`: la `key` de quien monta la ficha la remonta al cambiar de
     ejercicio, así que la foto inicial siempre es la del que se está mirando.
     El NOMBRE entra en la foto desde que se puede corregir: sin él, cambiar sólo
     la errata dejaba «Guardar» apagado. */
  const foto = () => JSON.stringify([name.trim(), muscle, videoUrl, cue]);
  const [fotoInicial] = useState(foto);
  const tocado = foto() !== fotoInicial;

  const video = parseVideoUrl(videoUrl);
  const enlaceMalo = Boolean(videoUrl.trim()) && !video;

  /*
    ══ QUIÉN ES ESTE EJERCICIO ═══════════════════════════════════════════════

    Las tres preguntas se hacen con el nombre ORIGINAL —el de la fila que se
    está mirando—, nunca con el que hay tecleado. Si se hicieran con el tecleado,
    a la primera letra de una corrección el ejercicio dejaría de encontrarse a sí
    mismo: la ficha pasaría a creerse un alta, el «···» se vaciaría y el aviso de
    «esto es de un compañero» aparecería y desaparecería al escribir.
  */
  const original = String(nombre || '').trim();

  /* Del catálogo, para leer. Se busca por nombre porque la ficha vive allí y no
     se copia (0094). */
  const general = findByName(catalogExercises, original);
  /*
    De quién es la fila de la biblioteca, que es la única pregunta que este aviso
    necesita. `coachId` es QUIÉN LA DIO DE ALTA (ver `mappers.js`), y desde la
    0006 la biblioteca es del equipo: cualquiera puede escribirla, y la regla de
    que no se le reescribe la voz a un compañero sin que se entere es de
    producto. `upsertByName` la hace cumplir al guardar; esto solo la cuenta.
  */
  const filaBiblioteca = findByName(exerciseLibrary, original);
  const deOtro =
    Boolean(filaBiblioteca?.coachId) && filaBiblioteca.coachId !== (session?.user?.id || null);

  /*
    ── Lo que diste de alta TÚ, que es lo único que se corrige entero ────────
    Ni un ejercicio del catálogo —su nombre y su músculo son la referencia con la
    que se entienden todas las bibliotecas, y renombrar tu copia sólo la
    despegaría de él— ni el de un compañero de equipo.
  */
  const esMio = !nuevo && !general && Boolean(filaBiblioteca) && !deOtro;

  const limpio = name.trim();
  const renombra = esMio && limpio.toLowerCase() !== original.toLowerCase();

  /*
    ── Que el nombre nuevo no pise a otro ───────────────────────────────────
    `upsertByName` identifica por nombre y `editLibraryExercise` escribe por id,
    así que un nombre repetido no da error de base: deja dos filas que se llaman
    igual, y la mezcla del buscador (`mergeCatalog`) enseña una sola. O sea, el
    duplicado invisible. Se comprueba contra las DOS listas porque las dos son
    la misma lista para quien busca.
  */
  const choca = (nuevo && limpio) || renombra ? findByName(lista, limpio) : null;
  const errorNombre = choca
    ? `Ya tienes «${choca.name}». Ábrelo desde la lista o ponle otro nombre.`
    : null;

  const guardar = async () => {
    if (!limpio || enlaceMalo || errorNombre) return;

    /* El precio del cambio de nombre se dice ANTES, con esas palabras: el plan
       guarda el nombre y la ficha se busca por él (0094). */
    if (renombra) {
      const vale = await confirm({
        title: `¿Renombrarlo «${limpio}»?`,
        message:
          'Las semanas que ya tengas escritas guardan el nombre viejo, así que se quedan sin tu vídeo y sin tus pautas. Lo que montes a partir de ahora lleva el nombre nuevo.',
        confirmLabel: 'Renombrarlo',
      });
      if (!vale) return;
    }

    setGuardando(true);

    /* Un ejercicio nuevo entra primero por la puerta de siempre —la que respeta
       el grupo muscular del catálogo— y después recibe tu capa. Dos escrituras
       y no una: `upsertLibraryExercise` es quien sabe de músculos y no tiene por
       qué aprender de vídeos. */
    if (nuevo) await upsertLibraryExercise(limpio, muscle);

    /* Y lo tuyo se corrige por ID, que es la única puerta por la que el nombre y
       el músculo cambian. Va ANTES de la capa de tu voz para que
       `saveExerciseSheet` encuentre la fila ya renombrada; al revés crearía una
       segunda con el nombre nuevo. */
    if (esMio && !(await editLibraryExercise(filaBiblioteca.id, { name: limpio, muscle }))) {
      setGuardando(false);
      toast({ text: 'No se ha podido guardar. Vuelve a intentarlo en un momento.' });
      return;
    }

    /* El músculo viaja aunque esta puerta no lo corrija: la columna es NOT NULL
       y `upsertByName` lo necesita si la fila nace aquí —pegarle tu vídeo a un
       ejercicio del catálogo que todavía no tenías—. Ver `alCrear`. */
    const fila = await saveExerciseSheet(limpio, { videoUrl, cue, muscle });
    setGuardando(false);

    if (!fila) {
      toast({ text: 'No se ha podido guardar. Vuelve a intentarlo en un momento.' });
      return;
    }
    toast({ text: `«${limpio}» guardado.` });
    /* Renombrar cambia la fila que la lista tiene señalada: hay que llevar el
       carril al nombre nuevo o se quedaría apuntando a uno que ya no existe. */
    if (renombra) onIr?.(limpio);
    onCerrar();
  };

  /* Los que se llaman casi igual. La misma señal que en la despensa y por el
     mismo motivo — ver `similarNames`. */
  const parecidos = useMemo(
    () => (nuevo ? [] : similarNames(original, lista.map((e) => e.name))),
    [nuevo, original, lista]
  );

  /*
    ── Quitarlo de tu biblioteca ────────────────────────────────────────────
    Sólo lo TUYO —lo decide de quién es la fila, no `canEditLibraryItem`, que
    contesta otra pregunta—. Un ejercicio del catálogo que quites vuelve a estar
    donde estaba: el catálogo no es de nadie y no se toca.

    ── Aquí había una segunda condición y se ha ido con su dato ─────────────
    «Y sólo si nadie lo nombra como recambio»: se leía la lista buscando quién lo
    tenía puesto como alternativa. Las alternativas de biblioteca salieron de la
    ficha por orden del dueño, así que esa condición se había quedado invisible —
    un verbo que desaparecía sin decir por qué, decidido por un dato que ya no se
    puede ver ni corregir. Un candado sin cerradura a la vista es peor que no
    tenerlo.

    Lo que esto NO comprueba es si está escrito en la hoja de alguien: esa
    respuesta exige una consulta que no existe —desde la 0024 los programas no se
    descargan al arrancar—. No rompe nada, porque el plan guarda el NOMBRE y la
    ficha se busca por él (0094), así que la hoja sigue igual y lo que se pierde
    es tu vídeo y tus pautas; pero es un cabo declarado y por eso la confirmación
    lo dice en voz alta.
  */
  const puedeBorrarse = !nuevo && !deOtro && Boolean(filaBiblioteca);

  const borrar = async () => {
    const vale = await confirm({
      title: `¿Quitar «${original}» de tu biblioteca?`,
      message:
        'Se pierden tu vídeo y tus pautas. Las hojas donde ya esté escrito no cambian: guardan el nombre, no la ficha.',
      confirmLabel: 'Quitarlo',
      tone: 'danger',
    });
    if (!vale) return;

    const fuera = await deleteLibraryExercise(filaBiblioteca.id);
    if (!fuera) {
      toast({ text: 'No se ha podido quitar. Vuelve a intentarlo en un momento.' });
      return;
    }
    toast({ text: `«${name.trim()}» ya no está en tu biblioteca.` });
    onBorrado?.(name.trim());
  };

  const acciones = [
    puedeBorrarse && {
      label: 'Quitarlo de tu biblioteca',
      icon: Trash2,
      danger: true,
      run: borrar,
    },
  ].filter(Boolean);

  return (
    <div className="col ficha-ej">
      {/*
        ══ QUIÉN ES, ARRIBA Y EN UNA PIEZA ═══════════════════════════════════

        El nombre en grande y debajo el músculo. Cuando el ejercicio es tuyo, el
        titular se escribe encima y el músculo es una chapa con menú — sin
        rótulos, sin cajas hasta que se tocan. Antes eran tres piezas para dos
        palabras: el nombre como titular de 15 px, otra vez como campo «Cómo se
        llama», y el músculo en un `select` de 40 px con su propio rótulo.

        Sin «Material»: el dueño lo tumbó dos veces, la segunda con estas
        palabras —«material y con qué se cambia en ejercicios no me gusta
        tenerlo»—, y no queda ni aquí ni en la columna de la tabla.
      */}
      <header className="ficha-id">
        {nuevo || esMio ? (
          <input
            className="ficha-id-nom"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Press banca con barra"
            aria-label="Cómo se llama"
            aria-invalid={errorNombre ? 'true' : undefined}
            autoFocus={nuevo}
          />
        ) : (
          /* En la CAPA no: el título del diálogo ya es el nombre. Ver la
             hermana, `FichaAlimento`. */
          !enCapa && <h2 className="ficha-id-nom">{original}</h2>
        )}

        <div className="ficha-id-clase">
          <SelectorDeClase
            valor={nuevo || esMio ? muscle : actual?.muscle || null}
            opciones={MUSCLE_GROUPS}
            editable={nuevo || esMio}
            onElegir={setMuscle}
            ariaLabel="Qué músculo trabaja"
          />
          {/* De dónde viene, en voz baja: explica por qué el nombre y el
              músculo no se tocan cuando no se tocan. */}
          {!nuevo && !esMio && !deOtro && <span className="t-xs t-tertiary">Del catálogo</span>}
          {/* Y que es tuyo, con la MISMA chapa que lo dice en la lista. La
              ficha de algo tuyo y la de algo del catálogo se veían idénticas
              hasta que pasabas el ratón por encima del nombre: que todo esto se
              corrige entero no lo decía nada. */}
          {esMio && <span className="badge badge-info">Tuyo</span>}
        </div>

        {errorNombre && <p className="ficha-id-error">{errorNombre}</p>}

        {acciones.length > 0 && (
          <MenuAcciones items={acciones} ariaLabel={`Más cosas que hacer con ${original}`} />
        )}
      </header>

      {/*
        ══ LA HOJA: EL VÍDEO A LA IZQUIERDA, TU VOZ A LA DERECHA ═════════════

        Aquí vivió la CURVA DE CARGA, un dibujo que decía cómo se comporta la
        resistencia a lo largo del recorrido deducido del material. La idea era
        buena y el dato era honesto en lo que afirmaba; lo que se ENTENDÍA no lo
        era. El dueño: «la información de la curva longitud-tensión y el perfil
        no es correcto; si no es claro no lo pongas». Y llevaba razón por debajo
        de la queja: el eje se rotulaba «estirado → contraído», que es la
        longitud del MÚSCULO, mientras la curva hablaba del recorrido de la
        CARGA, que no son lo mismo ni van en el mismo sentido según el gesto.

        La salida no era rotularlo mejor: la curva de verdad depende del gesto y
        de la persona, y eso `resistencia.js` ya declaraba que no se podía saber
        sin inventarlo. Se fue entera —componente, dominio, prueba y CSS—.

        Lo que queda a la izquierda es lo que de verdad se viene a hacer aquí:
        el vídeo. Su enlace y, debajo, el reproductor cuando lo hay.
      */}
      <div className="ficha-hoja es-espejo">
        {/*
          ══ EL ESPEJO: LO QUE VE TU CLIENTE ════════════════════════════════

          La pieza que le faltaba a esta mitad, y la que contesta el encargo
          original con el que nació todo esto: «la idea principal era poder
          tener anotaciones y vídeo del entrenador para los ejercicios, **de
          forma que el cliente pudiese verlos**».

          Hasta aquí, escribir un enlace y una frase en dos cajas grises no
          enseñaba nada: había que creerse que aquello llegaba a algún sitio. Es
          literalmente lo que hacía la pantalla sosa —no había NADA que mirar—.
          Ahora la mitad izquierda es la tarjeta del móvil de tu cliente,
          montada con lo que estás escribiendo ahora mismo: pegas el enlace y
          aparece el vídeo, escribes la pauta y aparece la pauta.

          Y no es una maqueta parecida: es **el mismo componente** que pinta esa
          tarjeta en su portal (`CuerpoFichaEjercicio`). Un espejo construido
          aparte deja de ser un espejo el día que uno de los dos cambie.
        */}
        {/*
          ── Y AQUÍ SE ESCRIBE, que es lo que faltaba ──────────────────────
          Enfrente del espejo vivían «Tu vídeo» y «Tus pautas»: dos campos con
          su rótulo, su ayuda y su caja, o sea el formulario que la otra mitad
          de la Librería ya se había quitado cuando la etiqueta nutricional pasó
          a ser el editor. Escribías a la derecha y comprobabas a la izquierda,
          con el mismo dato dicho dos veces en 700 px.

          Ahora el enlace se teclea donde va a salir el vídeo y la pauta donde
          el cliente la va a leer. Las dos ayudas se van con los dos rótulos: el
          hueco del enlace dice lo que hay que pegar, y una pauta escrita en el
          renglón del cliente no necesita que le expliquen que la lee el cliente.
        */}
        <section className="ficha-capa espejo">
          <p className="ficha-capa-rot">Lo que ve tu cliente</p>
          <CuerpoFichaEjercicio
            nombre={limpio || 'este ejercicio'}
            vivo
            edicion={{
              videoUrl,
              onVideoUrl: setVideoUrl,
              cue,
              onCue: setCue,
              /* Un enlace escrito que no se reconoce. Antes eran dos mensajes a
                 la vez —el error y la ayuda— porque los dos colgaban de la
                 misma condición; aquí es uno, y el que dice qué hacer. */
              error: enlaceMalo ? VIDEO_URL_HINT : null,
            }}
            ficha={{
              videoUrl: enlaceMalo ? '' : videoUrl,
              cue,
              /* El músculo NO: en su móvil esa línea sitúa el ejercicio, pero
                 aquí la cabecera lo acaba de decir dos dedos más arriba, y
                 repetirlo es el mismo eco que este rediseño ha venido a
                 quitar. Lo único que el espejo omite, y a propósito. */
              muscle: null,
              description: general?.description || null,
            }}
          />
        </section>

        {deOtro && !nuevo && (
          <div className="es-ancho">
            <Notice tone="info">
              Este ejercicio lo dio de alta un compañero de equipo. La biblioteca es compartida, así
              que su vídeo y sus pautas los corrige quien los puso.
            </Notice>
          </div>
        )}

        {/*
          ── Y aquí estuvo «Con qué se cambia» ──────────────────────────────
          Las alternativas de BIBLIOTECA: con qué se cambia este ejercicio por
          defecto, para que `AddExerciseForm` las trajera puestas al escribirlo
          en una hoja. El dueño las ha tumbado dos veces, la segunda con nombre y
          apellidos. Fuera de aquí, de la marca de la lista y del alta de la hoja.

          Y el 9 sep 2026 cayeron también las del PLAN —«prever una alternativa»
          en la hoja—, así que la idea ya no existe en ninguna parte del
          producto: «no me gusta la idea de dar alternativas». Ver
          `domain/training.js`.
        */}

        {!nuevo && parecidos.length > 0 && (
          <div className="es-ancho">
            <Notice tone="info">
              Tienes {parecidos.length === 1 ? 'otro que se llama' : 'otros que se llaman'} casi
              igual:{' '}
              {parecidos.map((otro, i) => (
                <span key={otro}>
                  {i > 0 && ', '}
                  <button type="button" className="cab-accion is-puerta" onClick={() => onIr?.(otro)}>
                    {otro}
                  </button>
                </span>
              ))}
              . Quédate con uno y ponle ahí tu vídeo.
            </Notice>
          </div>
        )}
      </div>
      {/* El pie sólo cuando hay algo que hacer con él. El porqué largo, en el
          mismo sitio de `FichaAlimento`: en un carril no hay nada que cerrar, y
          un botón primario encendido sobre una ficha que no has tocado promete
          trabajo que no hay. */}
      {(enCapa || nuevo || tocado) && (
        <div className="row-end ficha-ej-pie">
          {(enCapa || nuevo) && (
            <button type="button" className="btn btn-sm" onClick={onCerrar}>
              Cancelar
            </button>
          )}
          <button
            type="button"
            className="btn btn-primary btn-sm"
            onClick={guardar}
            disabled={
              guardando || !limpio || enlaceMalo || Boolean(errorNombre) || (!nuevo && !tocado)
            }
          >
            Guardar
          </button>
        </div>
      )}
    </div>
  );
};
