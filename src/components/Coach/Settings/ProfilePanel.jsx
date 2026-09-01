import { useEffect, useState } from 'react';
import { Check } from 'lucide-react';

import { useActions, useSession } from '@/context/AppContext';
import { Field, Notice, PageHead, Panel, TextInput } from '@/components/ui/primitives';

/**
 * Tu perfil: quién eres dentro de la aplicación.
 *
 * ══ Por qué existe esta pantalla, y por qué no era un ítem del menú ════════
 *
 * `profiles.full_name` se leía en cinco sitios —el saludo de la portada, el pie
 * de la barra, la lista del equipo, el historial de cambios y la radiografía— y
 * no se escribía en ninguno. El alta SÍ lo pide (`Login.jsx`, y el disparador
 * `handle_new_user` lo guarda), pero quien entró con Google, quien lo dejó en
 * blanco o quien se equivocó al teclearlo se quedaba con lo que hubiera —a
 * menudo su propio correo— y sin ninguna manera de corregirlo desde dentro.
 *
 * El primer intento fue un «Cambiar mi nombre» en el menú de la cuenta. Estaba
 * mal y se retiró: un ajuste que se toca UNA VEZ no puede ocupar el primer
 * renglón de un menú que se abre a diario. Un menú de cuenta es identidad, la
 * puerta de los ajustes, el tema y salir — que es lo que tiene Linear, lo que
 * tiene Notion y lo que tiene Stripe. Los campos de tu perfil están detrás de
 * esa puerta, no delante.
 *
 * ── Y por qué en el grupo «Tu cuenta» ──────────────────────────────────────
 * Porque Ajustes ya está repartido por asunto: lo que le das a tus clientes, lo
 * que la aplicación tiene conectado y lo tuyo. Tu nombre es lo tuyo, al lado de
 * tu suscripción.
 *
 * ── El correo se enseña y no se toca ───────────────────────────────────────
 * Es la identidad con la que se entra: cambiarlo es cambiar de credencial, con
 * su confirmación por correo y su ventana en la que la cuenta queda a medias.
 * Enseñarlo aquí contesta «¿con qué cuenta estoy?», que es la pregunta que
 * trae a la mitad de la gente a esta pantalla; cambiarlo es otra cosa y
 * todavía no está.
 */
export const ProfilePanel = () => {
  const { profileName, session, profileRole } = useSession();
  const { updateProfileName } = useActions();

  const email = session?.user?.email || '';
  /*
    Si lo guardado es el correo, el campo empieza vacío: eso lo dejó ahí el alta
    por no tener nada mejor —o lo trajo Google—, no es un nombre que alguien haya
    escrito. Obligar a borrarlo antes de escribir sería cobrarle al usuario un
    fallo nuestro.
  */
  const guardado = profileName && !profileName.includes('@') ? profileName : '';

  const [valor, setValor] = useState(guardado);
  const [estado, setEstado] = useState(null);
  const [guardando, setGuardando] = useState(false);

  /* Si el perfil llega después que la pantalla —o cambia desde otra pestaña—, el
     campo se pone al día mientras no se esté escribiendo en él. */
  useEffect(() => {
    setValor(guardado);
  }, [guardado]);

  const limpio = valor.trim();
  const cambiado = limpio !== guardado;

  const guardar = async (e) => {
    e.preventDefault();
    if (!cambiado) return;
    setGuardando(true);
    setEstado(null);
    const res = await updateProfileName(limpio);
    setGuardando(false);
    setEstado(res?.ok === false ? { error: res.error } : { ok: true });
  };

  return (
    <div className="stack">
      <PageHead title="Perfil" sub="Quién eres dentro de la aplicación" />

      {estado?.error && <Notice tone="error">{estado.error}</Notice>}
      {estado?.ok && (
        <Notice tone="success">
          <Check size={15} aria-hidden="true" /> Guardado. Es el nombre que verás al entrar.
        </Notice>
      )}

      <Panel as="form" onSubmit={guardar} className="col gap-4">
        <Field
          label="Tu nombre"
          hint="Es el que te saluda al entrar, el del pie de la barra y el que ve tu equipo."
        >
          {(props) => (
            <TextInput
              {...props}
              value={valor}
              onChange={setValor}
              placeholder="Nombre y apellido"
              autoComplete="name"
              maxLength={80}
            />
          )}
        </Field>

        <Field label="Tu correo" hint="Es con el que entras. Para cambiarlo, escríbenos desde Ayuda.">
          {(props) => <input {...props} className="input" value={email} readOnly disabled />}
        </Field>

        <div className="row gap-2">
          <button type="submit" className="btn btn-primary" disabled={!cambiado || guardando}>
            {guardando ? 'Guardando…' : 'Guardar'}
          </button>
          {cambiado && !guardando && (
            <button type="button" className="btn btn-secondary" onClick={() => setValor(guardado)}>
              Deshacer
            </button>
          )}
        </div>
      </Panel>

      <p className="t-sm t-tertiary">
        Entras como {profileRole === 'coach' ? 'entrenador' : 'cliente'}.
      </p>
    </div>
  );
};
