import {
  Calendar,
  CheckCheck,
  FolderOpen,
  Inbox,
  Repeat,
  Ruler,
  Scale,
  ShieldCheck,
  TrendingUp,
} from 'lucide-react';

import { AccountMenu } from '@/components/AccountMenu';
import { SegmentedControl } from '@/components/ui/primitives';
import { Aire, Fila, Record } from './Piezas';

/**
 * «TÚ» EN EL TELÉFONO — el perfil del frame `328:7` (18 sep 2026).
 *
 * Se abre desde el avatar de arriba a la derecha de «Hoy»: desde el 18 sep la
 * barra lleva «Revisión» y la persona sale de ella.
 *
 *   1. **Quién eres**: tus iniciales, tu nombre y desde cuándo. Sin cabecera
 *      encima: el dibujo abre con el disco, y el nombre es el titular. Se
 *      vuelve con la barra o con el gesto de atrás del aparato.
 *   2. **Tres cifras**: entrenos, semanas y entregas. Es el registro —lo que no
 *      caduca cuando se acaba el bloque— hablando.
 *   3. **Lo que se hace de vez en cuando**, cada acción en su caja.
 *
 * ── Lo que el dibujo tiene y aquí no ───────────────────────────────────────
 * La tarjeta «Tu entrenador asignado» con su botón «Escribir». No hay chat, y
 * además su nombre no llega al cliente: `profiles` solo deja leer el propio.
 * El dueño decidió quitarla hasta que exista (18 sep).
 *
 * ── Cada acción en su caja, y la tesela en la señal ────────────────────────
 * Como en el dibujo: una caja con canto por acción y 12 px entre ellas. El
 * icono va en una tesela del azul suave de la casa —el verde del frame es el
 * azul en todo el teléfono, decisión del dueño del 18 sep—, el mismo en todas:
 * dice «esto se toca», no una categoría por fila.
 */
export const PantallaTu = ({ datos }) => {
  const { nombre, iniciales, desde, record, filas, cicloSolo, cuenta } = datos;

  return (
    <>
      <header className="tel-quien">
        <span className="tel-quien-disco" aria-hidden="true">
          {iniciales}
        </span>
        <h1 className="tel-quien-nom">{nombre}</h1>
        {desde ? <span className="tel-quien-desde">{desde}</span> : null}
      </header>

      <div className="tel-perfil">
        {record.length > 0 ? <Record items={record} /> : null}

        <div className="tel-acciones">
          {filas.map((f) => (
            <Fila
              key={f.titulo}
              delante={<Icono nombre={f.icono} />}
              titulo={f.titulo}
              sub={f.sub}
              derecha={f.espera ? <span className="tel-espera">{f.espera}</span> : null}
              to={f.to}
              onClick={f.onClick}
            />
          ))}
        </div>

        {/* Lo que la portada pregunta una vez, para cambiarlo después. El
            carril va debajo del rótulo: a 390 px no caben los dos en un renglón. */}
        {cicloSolo ? (
          <>
            <h2 className="tel-rotulo tel-rotulo-suelto">Tu rutina</h2>
            <div className="tel-acciones">
              <div className="tel-fila tel-fila-ajuste">
                <Icono nombre="ciclo" />
                <span className="tel-fila-tx">
                  <span className="tel-fila-tit">El siguiente {cicloSolo.unidad}</span>
                  <span className="tel-fila-sub">Al tener este entero apuntado</span>
                </span>
                <SegmentedControl
                  ancho
                  value={cicloSolo.valor}
                  onChange={cicloSolo.onCambiar}
                  options={[
                    { id: 'solo', label: 'Se abre solo' },
                    { id: 'yo', label: 'Lo abro yo' },
                  ]}
                  label={`Cómo se abre el siguiente ${cicloSolo.unidad}`}
                />
              </div>
            </div>
          </>
        ) : null}

        <h2 className="tel-rotulo tel-rotulo-suelto">Tu cuenta</h2>
        <div className="tel-acciones">
          {cuenta.map((f) => (
            <Fila
              key={f.titulo}
              delante={<Icono nombre={f.icono} />}
              titulo={f.titulo}
              sub={f.sub}
              onClick={f.onClick}
            />
          ))}
          {/* La cuenta es el menú que ya existe —tema, tutorial y salir— con
              su traje de fila, no una cuarta copia de sus tres opciones. */}
          <div className="tel-fila tel-fila-cuenta">
            <AccountMenu variante="fila" />
          </div>
        </div>
      </div>

      <Aire />
    </>
  );
};

const ICONOS = {
  peso: Scale,
  medidas: Ruler,
  semana: CheckCheck,
  mandado: Inbox,
  calendario: Calendar,
  progreso: TrendingUp,
  privacidad: ShieldCheck,
  documentos: FolderOpen,
  ciclo: Repeat,
};

const Icono = ({ nombre }) => {
  const Dibujo = ICONOS[nombre] || Scale;
  return (
    <span className="tel-tesela" aria-hidden="true">
      <Dibujo size={20} />
    </span>
  );
};
