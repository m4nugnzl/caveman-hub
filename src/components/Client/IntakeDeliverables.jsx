import { useEffect, useState } from 'react';
import { ExternalLink, FileText, PlayCircle } from 'lucide-react';

import { useActions } from '@/context/AppContext';
import { attachmentName } from '@/domain/attachments';
import { clientIntake, intakeDeliverables } from '@/domain/intake';
import { Panel, SectionTitle } from '@/components/ui/primitives';

/**
 * Lo que el entrenador le ha dejado al cliente al darle de alta.
 *
 * ══ Por qué esto existe ═════════════════════════════════════════════════════
 *
 * Los pasos del alta eran casillas privadas del entrenador: «onboarding: hecho».
 * Pero el onboarding de verdad es un vídeo explicando cómo va todo, y ese vídeo
 * viajaba por WhatsApp — donde a las dos semanas está enterrado bajo cien
 * mensajes y no se vuelve a encontrar.
 *
 * Aquí queda puesto. El entrenador pega el enlace una vez en la ficha y al
 * cliente le aparece siempre en el mismo sitio, que es la diferencia entre
 * mandar algo y entregarlo.
 *
 * ── Por qué un enlace y no el vídeo dentro ──────────────────────────────────
 * Porque incrustar reproductores de terceros significa cargar su código en la
 * página, y con él sus cookies y su rastreo, en una aplicación que guarda el peso
 * y las fotos del cuerpo de esta persona. Un enlace que se abre en otra pestaña
 * entrega lo mismo sin meter a nadie más dentro.
 *
 * ══ Y por qué algunos hay que firmarlos ════════════════════════════════════
 *
 * Un paso puede entregar dos cosas distintas: un enlace de fuera —que se abre tal
 * cual— o un archivo que el entrenador subió (migración 0039). Lo segundo vive en
 * un bucket PRIVADO, así que lo guardado es la ruta y la dirección para abrirlo
 * se pide al entrar, con caducidad. Es lo mismo que se hace con sus fotos.
 *
 * Firmar es una llamada de red, así que se hace UNA por pantalla y con todas las
 * rutas juntas, no una por fila.
 */
/**
 * @param desnudo Dentro de una capa: sin `Panel` ni cabecera, que ya las pone la
 *   ventana. Es como se abre desde la fila «De tu entrenador» de su portada, que
 *   es donde vive desde que el pie de esa pantalla se convirtió en tres filas.
 */
export const IntakeDeliverables = ({ client, desnudo = false }) => {
  const { signPaths } = useActions();
  const items = intakeDeliverables(clientIntake(client?.preferences));
  const [urls, setUrls] = useState(() => new Map());

  /* Las rutas, en una cadena estable: sin esto el efecto se dispararía en cada
     render porque `items` es un array nuevo cada vez. */
  const rutas = items.map((i) => i.path).filter(Boolean).join('|');

  useEffect(() => {
    if (!rutas) {
      setUrls(new Map());
      return undefined;
    }
    let vivo = true;
    signPaths(rutas.split('|')).then((mapa) => {
      if (vivo) setUrls(mapa);
    });
    return () => {
      vivo = false;
    };
  }, [rutas, signPaths]);

  if (items.length === 0) return null;

  const Marco = desnudo ? 'div' : Panel;

  return (
    <Marco className="col gap-3">
      {!desnudo && (
        <>
          <SectionTitle icon={PlayCircle}>De tu entrenador</SectionTitle>
          <p className="t-sm t-secondary">
            Lo que te dejó preparado al empezar. Está aquí siempre, no hace falta que lo busques.
          </p>
        </>
      )}

      {/*
        ══ EN CUADRÍCULA, Y NO EN FILAS ══════════════════════════════════════

        Eran cuatro `card-inset` apiladas con «Abrir ›» al canto derecho de cada
        una: cuatro renglones idénticos que hay que leerse para distinguir el
        vídeo de bienvenida del contrato. Un documento no se lee, se BUSCA —por
        el dibujo y por el sitio—, y eso es lo que hace una cuadrícula.

        El verbo «Abrir» se va con las filas: la tarjeta entera es el enlace, y
        un enlace dentro de un enlace era dos objetivos para el mismo gesto. Ver
        `la ley de los gestos`.
      */}
      <div className="papeles">
        {items.map((step) => {
          /* El archivo manda sobre el enlace, igual que al leer las preferencias:
             de todas formas nunca hay los dos, pero el orden se escribe una sola
             vez y así no depende de quién pregunte. */
          const destino = step.path ? urls.get(step.path) || null : step.url;
          const esArchivo = Boolean(step.path);

          /* El dibujo dice de qué clase es: un archivo suyo o algo que se abre
             fuera. Es la única distinción que hay entre estas cosas y la que
             decide si hace falta conexión con otra casa. */
          const Dibujo = esArchivo ? FileText : ExternalLink;

          /*
            Un archivo cuya URL no se ha podido firmar se pinta APAGADO en vez de
            desaparecer: quien lo espera —porque su entrenador le dijo «te he
            dejado la anamnesis»— tiene que ver que existe y que algo falla, no un
            hueco donde no había nada.
          */
          if (!destino) {
            return (
              <div className="papel is-roto" key={step.id}>
                <span className="list-icon" aria-hidden="true">
                  <Dibujo size={15} />
                </span>
                <b>{step.label}</b>
                <span>
                  No se puede abrir ahora mismo. Recarga la página; si sigue igual, díselo a tu
                  entrenador.
                </span>
              </div>
            );
          }

          return (
            <a
              key={step.id}
              className="papel"
              href={destino}
              target="_blank"
              rel="noreferrer noopener"
            >
              <span className="list-icon" aria-hidden="true">
                <Dibujo size={15} />
              </span>
              <b>{step.label}</b>
              {/* Del archivo se dice su nombre: «anamnesis-marta.pdf» explica
                  qué se va a abrir mejor que la descripción del paso. */}
              <span>{esArchivo ? attachmentName(step.path) : step.hint}</span>
            </a>
          );
        })}
      </div>
    </Marco>
  );
};
