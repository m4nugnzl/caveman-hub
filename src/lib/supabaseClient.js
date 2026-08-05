// src/lib/supabaseClient.js
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  // Falla rápido y claro en vez de dejar que cada query falle en silencio.
  console.error(
    'Faltan VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY en tu .env — copia .env.example a .env y rellénalo.'
  );
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
