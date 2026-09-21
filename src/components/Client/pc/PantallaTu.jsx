import {
  Calendar,
  Camera,
  FolderOpen,
  Inbox,
  LifeBuoy,
  LogOut,
  Repeat,
  Moon,
  Ruler,
  Scale,
  Send,
  ShieldCheck,
  Sun,
} from 'lucide-react';

import { Avatar } from '@/components/ui/Avatar';
import { SegmentedControl } from '@/components/ui/primitives';
import { Caja, Fila, Filas, Teselas } from './Piezas';

/**
 * «TÚ» EN EL MONITOR — la persona, su rastro y sus mandos.
 *
 * ══ Qué había, y qué decía el dueño ════════════════════════════════════════
 *
 *   *«El "tú" es feo, no está bien ordenado, en dos bloques distintos sin mucha
 *   relación, no da opciones al atleta.»*
 *
 * Y las tres cosas eran ciertas y la misma:
 *
 *   · **Dos bloques sin relación.** «Tu rastro» a la izquierda con cuatro filas
 *     y «Tu cuenta» a la derecha con dos, de 1.360 px de ancho repartidos en
 *     5 + 4 columnas de doce: tres columnas de lienzo muerto a la derecha y la
 *     pantalla acabada a los 620 px de alto.
 *   · **No daba opciones.** Lo único que se podía TOCAR eran dos capas —la
 *     carpeta y la privacidad— y un menú desplegable con el nombre dentro. El
 *     tema, que es el ajuste que de verdad se cambia, estaba a dos clics dentro
 *     de ese menú; de ahí la otra queja de la misma noche: *«tiene modo noche
 *     pero no tiene ajustes donde ponerlo, ni ajustes donde hacer cosas»*.
 *
 * ══ Tres columnas, y cada una un trabajo ═══════════════════════════════════
 *
 *     ┌ Tu rastro ───────┐ ┌ Tus ajustes ─────┐ ┌ Tu cuenta ───────┐
 *     │ Peso y medidas   │ │ Tema ☼ ☾         │ │  MR  Marta Ruiz  │
 *     │ Revisiones       │ │ Datos y privac.  │ │      marta@…     │
 *     │ Fotos            │ │ Documentos       │ │ Tu entrenador    │
 *     │ Calendario       │ │ Cómo funciona    │ │ Cerrar sesión    │
 *     │ Lo que te mandó  │ │                  │ │                  │
 *     └──────────────────┘ └──────────────────┘ └──────────────────┘
 *
 * Lo que MIRAS · lo que CAMBIAS · quién ERES. Cuatro de doce cada una, así que
 * la rejilla se llena y el galón de cada fila cae a un palmo de su rótulo y no
 * a un metro, que era el argumento por el que esta pantalla se había quedado
 * estrecha. Ver `pc-c4` en `portal-pc.css`.
 *
 * ── El tema es un mando, no un ítem de menú ───────────────────────────────
 * Un carril de dos —Claro · Oscuro— en el primer renglón de los ajustes. Es
 * `SegmentedControl`, el mismo con el que se elige en el resto de la casa: un
 * ajuste con dos estados EXCLUYENTES no es un interruptor de encendido, y
 * «Tema oscuro» como botón que cambia de nombre al pulsarlo es un mando que no
 * dice en qué estado está hasta que lo lees dos veces.
 *
 * ── Y `AccountMenu` sale de aquí ──────────────────────────────────────────
 * Estaba montado como una fila al pie de «Tu cuenta», con el argumento de que
 * copiar sus opciones sería una cuarta copia del mismo menú. El argumento valía
 * mientras esas opciones no tuvieran sitio; ahora lo tienen, y el menú traía
 * además tres cosas que en el portal del cliente no significan nada —la puerta
 * de Ajustes del entrenador, las tres del taller y la radiografía—, todas
 * apagadas por un `isCoach` que hay que ir a leer para saber qué queda.
 *
 * En el teléfono sigue puesto: allí no hay sitio para tres columnas y la fila
 * desplegable es el mueble correcto. Ver `movil/PantallaTu`.
 *
 * ── Lo que NO está, y es a propósito ──────────────────────────────────────
 * Las conexiones con Hevy, Yazio, Lifta o Fitbit. El dueño las pone en futuro
 * —*«en un futuro el atleta deberá poder conectar con aplicaciones»*— y una
 * sección «Próximamente» es mobiliario: una oferta que no se puede aceptar.
 * Cuando exista, su sitio es esta columna, entre el tema y la privacidad.
 */
export const PantallaTu = ({ datos }) => {
  const { nombre, desde, teselas, rastro, ajustes, cuenta } = datos;

  return (
    <div className="pc-hoja">
      <div className="pc-titulo">
        <div>
          {desde ? <div className="pc-fecha">{desde}</div> : null}
          <h2>{nombre}</h2>
        </div>
      </div>

      {teselas.length > 0 ? <Teselas items={teselas} /> : null}

      <div className="pc-rejilla">
        <div className="pc-c4">
          <Caja tit="Tu rastro" sinRelleno>
            <Filas>
              {rastro.map((f) => (
                <Fila
                  key={f.rotulo}
                  icono={ICONO[f.icono] || Ruler}
                  rotulo={f.rotulo}
                  frase={f.frase}
                  cifra={f.cifra}
                  pildora={f.pildora}
                  to={f.to}
                  onClick={f.onClick}
                />
              ))}
            </Filas>
          </Caja>
        </div>

        <div className="pc-c4">
          <Caja tit="Tus ajustes" sinRelleno>
            <Filas>
              {/* EL TEMA, el primero: es el único que se cambia según la luz
                  que haya, o sea varias veces y sin pensarlo. */}
              <div className="pc-fila pc-ajuste">
                <span className="pc-icono">
                  {ajustes.oscuro ? <Moon size={15} /> : <Sun size={15} />}
                </span>
                <span className="pc-cuerpo">
                  <span className="pc-rotulo">Tema</span>
                  <span className="pc-frase">cómo se ve la aplicación</span>
                </span>
                <SegmentedControl
                  value={ajustes.oscuro ? 'dark' : 'light'}
                  onChange={ajustes.onTema}
                  options={[
                    { id: 'light', label: 'Claro' },
                    { id: 'dark', label: 'Oscuro' },
                  ]}
                  label="Tema de la aplicación"
                />
              </div>

              {ajustes.cicloSolo ? (
                <div className="pc-fila pc-ajuste is-dos-pisos">
                  <span className="pc-icono">
                    <Repeat size={15} />
                  </span>
                  <span className="pc-cuerpo">
                    <span className="pc-rotulo">El siguiente {ajustes.cicloSolo.unidad}</span>
                    <span className="pc-frase">al tener este entero apuntado</span>
                  </span>
                  <SegmentedControl
                    ancho
                    value={ajustes.cicloSolo.valor}
                    onChange={ajustes.cicloSolo.onCambiar}
                    options={[
                      { id: 'solo', label: 'Se abre solo' },
                      { id: 'yo', label: 'Lo abro yo' },
                    ]}
                    label={`Cómo se abre el siguiente ${ajustes.cicloSolo.unidad}`}
                  />
                </div>
              ) : null}

              {ajustes.filas.map((f) => (
                <Fila
                  key={f.rotulo}
                  icono={ICONO[f.icono] || ShieldCheck}
                  rotulo={f.rotulo}
                  frase={f.frase}
                  to={f.to}
                  onClick={f.onClick}
                />
              ))}
            </Filas>
          </Caja>
        </div>

        <div className="pc-c4">
          <Caja tit="Tu cuenta" sinRelleno>
            <Filas>
              {/* Quién eres. No es una fila que lleve a ningún sitio, así que
                  no lleva galón: es el encabezado de la caja con cara. */}
              <div className="pc-fila pc-quien">
                <Avatar name={cuenta.quien} size="sm" className="is-round" />
                <span className="pc-cuerpo">
                  <span className="pc-rotulo">{cuenta.quien}</span>
                  {cuenta.correo ? <span className="pc-frase">{cuenta.correo}</span> : null}
                </span>
              </div>

              {cuenta.entrenador ? (
                <Fila rotulo="Tu entrenador" frase={cuenta.entrenador} />
              ) : null}

              <Fila
                icono={LifeBuoy}
                rotulo="Cómo funciona"
                frase="guías sobre tu propia pantalla"
                onClick={cuenta.onTutorial}
              />

              {/* El último, y es el único verbo de la pantalla que no se puede
                  deshacer. Por eso va al final y en su tinta. */}
              <button type="button" className="pc-fila pc-tocable pc-salir" onClick={cuenta.onSalir}>
                <span className="pc-icono">
                  <LogOut size={15} />
                </span>
                <span className="pc-cuerpo">
                  <span className="pc-rotulo">Cerrar sesión</span>
                </span>
              </button>
            </Filas>
          </Caja>
        </div>
      </div>
    </div>
  );
};

const ICONO = {
  regla: Ruler,
  entrega: Send,
  calendario: Calendar,
  camara: Camera,
  carpeta: FolderOpen,
  escudo: ShieldCheck,
  balanza: Scale,
  bandeja: Inbox,
  salvavidas: LifeBuoy,
};
