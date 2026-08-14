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
        aria-label={`Abrir la ficha de ${client.name}`}
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

      {action && (
        <button type="button" className="chip" onClick={action.onClick} title={action.title}>
          <action.icon size={12} /> {action.label}
        </button>
      )}

      <ChevronRight size={15} className="chevron" aria-hidden="true" />
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
      onClick: () => handlers.review(row.review.id),
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

export const TaskInbox = ({ tasks, trainerOf = () => null, onOpen, handlers, emptyMessage }) => {
  if (tasks.length === 0) {
    return <p className="t-sm t-secondary">{emptyMessage}</p>;
  }

  return (
    <div className="col gap-3">
      {tasks.map((task) => (
        <section className={`task is-${task.tone}`} key={task.id}>
          <header className="task-head">
            <span className="k">{task.label}</span>
            <span className="n">{task.rows.length}</span>
            <span className="hint">{task.hint}</span>
          </header>

          <div className="task-rows">
            {task.rows.map((row) => (
              <TaskRow
                key={row.client.id}
                row={row}
                trainer={trainerOf(row.client.assignedTo)}
                onOpen={() => onOpen(row.client.id)}
                action={taskAction(task.id, row, handlers)}
              />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
};
