import { useState } from 'react';
import { Check, ChevronRight, Eye, MessageCircle, Send } from 'lucide-react';

import { initials } from '@/lib/initials';
import { memberName } from '@/domain/team';

/**
 * La bandeja de tareas del entrenador.
 *
 * ══ Por qué esto es un componente y no dos pantallas ════════════════════════
 *
 * Llegó a haber DOS bandejas distintas. «Hoy» tenía la suya —tres tipos de aviso
 * calculados aparte— y «Clientes» tenía la de verdad, con siete tareas y su
 * reparto en `domain/portfolio.js`. Dos listas de «lo que te espera» que no
 * coincidían: una decía dos cosas pendientes y la otra cinco.
 *
 * Ahora hay una, vive aquí, y la calcula `portfolioInbox`. «Hoy» la enseña —que
 * es donde se empieza el día— y «Clientes» vuelve a ser lo que su nombre dice:
 * la lista de tus clientes.
 */

/** Un cliente dentro de una tarea. */
const TaskRow = ({ row, trainer, onOpen, action }) => {
  const { client } = row;

  return (
    <div className="task-row">
      {/*
        La fila entera abre al cliente, con una capa de clic por debajo del
        contenido. Envolverlo todo en un `<button>` no vale: dentro hay otro
        botón, y anidarlos es HTML inválido y una trampa con el teclado.
      */}
      <button
        type="button"
        className="task-hit"
        onClick={onOpen}
        /* «Abrir a X» y no «abrir su ficha»: cada tarea aterriza donde se
           trabaja —la respuesta en su semana, la rutina en su plan— y su ficha
           es solo uno de esos sitios. */
        aria-label={`Abrir a ${client.name}`}
      />

      <span className="mark" aria-hidden="true">
        {initials(client.name)}
      </span>

      <span className="who">
        <span className="name">{client.name}</span>
        <span className="sub">
          {[row.why, trainer !== null ? (trainer ? memberName(trainer) : 'sin asignar') : null]
            .filter(Boolean)
            .join(' · ')}
        </span>
      </span>

      {/* Un botón, no un chip: estas acciones ESCRIBEN (cobrar, invitar, cerrar
          una revisión). En el resto del producto el chip significa «estar en un
          sitio» —la semana elegida, el filtro activo—, y es la misma regla por
          la que la cola de revisiones dejó de usarlos (ver `ReviewQueue`). */}
      {action && (
        <button
          type="button"
          className="btn btn-secondary btn-sm"
          onClick={action.onClick}
          title={action.title}
        >
          <action.icon size={12} /> {action.label}
        </button>
      )}

      {/*
        La flecha SOLO cuando la fila no tiene botón.

        Con los dos, [inicial][nombre][botón][flecha] no cabe en la columna de
        «Hoy» —unos 300 px— y la fila envolvía: el botón y la flecha caían a un
        segundo renglón, y la flecha sola debajo de cada tarjeta parecía un
        trozo de maquetación rota.

        Y no se pierde nada: la flecha no hace nada por su cuenta, es la señal de
        que la fila entera se puede pulsar. Donde hay botón, esa señal ya la da
        el botón — y la fila sigue abriendo al cliente por su capa de clic.
      */}
      {!action && <ChevronRight size={15} className="chevron" aria-hidden="true" />}
    </div>
  );
};

/**
 * La acción que CIERRA cada tarea, y solo esa.
 *
 * El grupo ya dice qué hay que hacer, así que la fila no necesita ofrecer las
 * cuatro acciones posibles y dejar que el entrenador elija cuál aplica.
 *
 * Las que no se resuelven en un clic —programar una rutina, poner en marcha a
 * alguien— no llevan botón a propósito: no hay nada honesto que poner ahí salvo
 * «abrir al cliente», y para eso ya sirve la fila entera.
 */
export const taskAction = (taskId, row, handlers) => {
  if (taskId === 'access') {
    return {
      icon: Send,
      label: 'Invitar',
      title: 'Generar su enlace de acceso',
      onClick: () => handlers.invite(row.client),
    };
  }
  if (taskId === 'payment') {
    return {
      icon: Check,
      label: 'Cobrado',
      title: 'Marcar el pago como recibido',
      onClick: () => handlers.paid(row.client.id),
    };
  }
  /* Solo cuando hay un check-in de verdad que marcar: con la aproximación no hay
     nada que escribir en la base de datos. */
  if (taskId === 'review' && row.review?.pending && row.review.id) {
    return {
      icon: Eye,
      label: 'Revisado',
      title: 'Marcar su check-in como revisado',
      /* El cliente viaja con el id de la revisión porque cerrarla guarda una foto
         de SU plan. Sin esto, cerrar desde aquí dejaba la foto vacía y el
         histórico salía con huecos según por dónde se hubiera cerrado. */
      onClick: () => handlers.review(row.review.id, row.client.id),
    };
  }
  if (taskId === 'inactive' && row.client.phone) {
    return {
      icon: MessageCircle,
      label: 'WhatsApp',
      title: 'Escribirle por WhatsApp',
      onClick: () =>
        window.open(
          `https://wa.me/${row.client.phone.replace(/[^\d]/g, '')}`,
          '_blank',
          'noopener,noreferrer'
        ),
    };
  }
  return null;
};

/**
 * Un grupo de la bandeja, plegable.
 *
 * ══ Por qué se pliega, y por qué solo empieza plegado en el móvil ═══════════
 * Recorriendo «Hoy» a 390 px, la bandeja medía sola ~1.400 px: cuatro grupos con
 * seis clientes cada uno, todos abiertos, antes del pulso y del movimiento. La
 * cabecera de cada grupo YA es el triaje —qué tarea, cuánta gente—, así que en
 * el móvil los grupos empiezan plegados y se abre el que se va a trabajar.
 *
 * En escritorio empiezan abiertos: allí caben en la columna lateral y plegarlos
 * sería esconder trabajo. El estado inicial se decide UNA vez al montar; no es
 * algo que deba perseguir los cambios de tamaño de ventana.
 *
 * Es un componente y no un `<details>` porque el estado inicial depende del
 * tamaño, y el atributo `open` de `details` no puede decidirse desde CSS.
 */
const TaskGroup = ({ task, trainerOf, onOpen, handlers }) => {
  const [open, setOpen] = useState(
    () => typeof window === 'undefined' || !window.matchMedia('(max-width: 1023.98px)').matches
  );

  return (
    <section className={`task is-${task.tone}`}>
      <button type="button" className="task-head" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        <span className="k">{task.label}</span>
        <span className="n">{task.rows.length}</span>
        <span className="hint">{task.hint}</span>
        <ChevronRight size={15} className="chevron" aria-hidden="true" />
      </button>

      {open && (
        <div className="task-rows">
          {task.rows.map((row) => (
            <TaskRow
              key={row.client.id}
              row={row}
              trainer={trainerOf(row.client.assignedTo)}
              /* La tarea viaja con el cliente: abrir a alguien porque le debes
                 una respuesta y abrirlo porque no tiene rutina no llevan al
                 mismo sitio. Antes las nueve tareas aterrizaban en el mismo
                 cajón —su resumen—, así que «Responder check-ins» dejaba en una
                 gráfica de seis meses y sin nada que responder. */
              onOpen={() => onOpen(row.client.id, task.id, row)}
              action={taskAction(task.id, row, handlers)}
            />
          ))}
        </div>
      )}
    </section>
  );
};

export const TaskInbox = ({ tasks, trainerOf = () => null, onOpen, handlers, emptyMessage }) => {
  if (tasks.length === 0) {
    return <p className="t-sm t-secondary">{emptyMessage}</p>;
  }

  return (
    <div className="col gap-3">
      {tasks.map((task) => (
        <TaskGroup
          key={task.id}
          task={task}
          trainerOf={trainerOf}
          onOpen={onOpen}
          handlers={handlers}
        />
      ))}
    </div>
  );
};
