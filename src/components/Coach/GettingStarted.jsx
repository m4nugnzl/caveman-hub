import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Check, Compass, X } from 'lucide-react';

import { useApp } from '@/context/AppContext';
import { clientPath } from '@/routes';
import { Panel, SectionTitle } from '@/components/ui/primitives';

/**
 * El mapa de la aplicación para quien acaba de entrar.
 *
 * ══ El problema que resuelve ════════════════════════════════════════════════
 *
 * Un entrenador preguntó dónde se hacía la rutina. No es que estuviera escondida:
 * es que TODO lo de un cliente vive dentro de él —`/c/:id/rutina`— y para llegar
 * hay que entender antes que aquí primero se entra en una persona y después se
 * elige qué hacerle. Eso es evidente cuando ya lo sabes y no lo es la primera
 * vez, porque el menú de arriba no nombra ni la rutina ni la dieta.
 *
 * Esto lo dice en cuatro líneas, con los enlaces puestos.
 *
 * ── Por qué no se marca solo lo hecho ───────────────────────────────────────
 * La rutina y la dieta se cargan cuando se abre a un cliente, no al arrancar. Un
 * indicador que dijera «rutina: sin programar» porque el dato aún no ha llegado
 * mentiría justo a quien menos puede detectarlo. Solo se comprueba lo que se sabe
 * de verdad al cargar la aplicación: si hay clientes.
 *
 * ── Por qué se puede cerrar ─────────────────────────────────────────────────
 * Porque deja de hacer falta y quedarse para siempre lo convertiría en ruido. Se
 * recuerda cerrado en este navegador; si se pierde, vuelve a salir, que es mejor
 * error que el contrario.
 */
const key = (userId) => `caveman-guia:${userId || 'anon'}`;

const leerCerrado = (userId) => {
  try {
    return localStorage.getItem(key(userId)) === '1';
  } catch {
    return false;
  }
};

export const GettingStarted = () => {
  const { clients, session } = useApp();
  const userId = session?.user?.id;
  const [cerrado, setCerrado] = useState(() => leerCerrado(userId));

  if (cerrado) return null;

  const primero = clients[0];
  const tieneClientes = clients.length > 0;

  /* Sin clientes, los tres pasos que van después no tienen a dónde llevar: se
     nombran igual, sin enlace, porque saber que existen es la mitad del mapa. */
  const pasos = [
    {
      id: 'alta',
      hecho: tieneClientes,
      titulo: 'Da de alta a un cliente',
      texto: 'En «Clientes». Solo hace falta su nombre; lo demás se completa luego.',
      to: '/clientes',
      accion: 'Ir a Clientes',
    },
    {
      id: 'entrar',
      titulo: 'Entra en él pulsando su tarjeta',
      texto:
        'Todo lo suyo vive dentro: su rutina, su dieta, sus fotos, sus medidas y su ficha. Cambias de sección en el carril que aparece bajo su nombre.',
      to: primero ? clientPath(primero.id, 'resumen') : null,
      accion: primero ? `Abrir a ${primero.name}` : null,
    },
    {
      id: 'rutina',
      titulo: 'Prográmale la rutina y la dieta',
      texto:
        'Dentro del cliente, en «Rutina» y «Nutrición». Son dos de las secciones de su carril.',
      to: primero ? clientPath(primero.id, 'rutina') : null,
      accion: primero ? 'Ver la rutina' : null,
    },
    {
      id: 'protocolo',
      titulo: 'Decide qué le pides a tus clientes',
      texto:
        'En Ajustes → Protocolo eliges los pasos de tu alta, qué preguntas al terminar de entrenar y qué módulos ve cada uno. Nada de eso viene impuesto.',
      to: '/ajustes/protocolo',
      accion: 'Configurar mi protocolo',
    },
  ];

  return (
    <Panel className="col gap-4">
      <div className="row between wrap gap-2">
        <SectionTitle icon={Compass}>Cómo funciona esto</SectionTitle>
        <button
          type="button"
          className="btn btn-icon"
          onClick={() => {
            setCerrado(true);
            try {
              localStorage.setItem(key(userId), '1');
            } catch {
              /* Sin almacenamiento la guía volverá a salir. Es lo de menos y
                 romper la pantalla por ello sería mucho peor. */
            }
          }}
          aria-label="Ocultar la guía"
          title="Ocultar"
        >
          <X size={15} />
        </button>
      </div>

      <ol className="col gap-3">
        {pasos.map((paso, i) => (
          <li key={paso.id} className="card-inset row gap-3">
            <span className="list-icon" aria-hidden="true">
              {paso.hecho ? <Check size={15} /> : i + 1}
            </span>
            <span className="col gap-1 grow" style={{ minWidth: 0 }}>
              <span className="t-sm" style={{ fontWeight: 650 }}>
                {paso.titulo}
              </span>
              <span className="t-xs t-secondary">{paso.texto}</span>
              {paso.to && (
                <Link className="t-xs link" to={paso.to}>
                  {paso.accion} →
                </Link>
              )}
            </span>
          </li>
        ))}
      </ol>
    </Panel>
  );
};
