// lib/supabase/client.ts
// Cliente de Supabase para usar en componentes del navegador ('use client').
// Usa la anon key: es segura de exponer porque toda la seguridad real
// vive en las políticas de Row Level Security de schema.sql.
import { createBrowserClient } from '@supabase/ssr';

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
