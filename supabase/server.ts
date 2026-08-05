// lib/supabase/server.ts
// Cliente de Supabase para Server Components y Server Actions.
// Lee/escribe la sesión desde las cookies de Next.js para que
// supabase.auth.getUser() sepa quién está logueado en cada request.
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // setAll puede lanzar error si se llama desde un Server Component
            // (no desde una Server Action o Route Handler). Se puede ignorar
            // si ya tienes el middleware refrescando la sesión.
          }
        },
      },
    }
  );
}

// Devuelve el perfil (con su role: 'trainer' | 'client') del usuario logueado,
// o null si no hay sesión. Úsalo al principio de cualquier page.tsx protegida.
export async function getCurrentProfile() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single();

  return profile;
}
