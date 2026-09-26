import { Notice } from '@/components/ui/primitives';

import { inviteMessage } from './useInvite';

/**
 * El aviso que sale después de invitar, igual en la ficha y en la cartera.
 *
 * Cuando el portapapeles no deja, el mensaje entero va debajo, seleccionable de
 * un toque (`user-select: all`): antes salía el enlace pelado en mitad de una
 * frase y había que acertar con el dedo sus 64 caracteres.
 */
export const AvisoDeInvitacion = ({ result }) => {
  if (!result) return null;
  if (!result.ok) return <Notice tone="error">{result.error}</Notice>;

  return (
    <Notice tone={result.copied ? 'success' : 'info'}>
      {inviteMessage(result)}
      {!result.copied && <span className="aviso-mensaje">{result.mensaje}</span>}
    </Notice>
  );
};
