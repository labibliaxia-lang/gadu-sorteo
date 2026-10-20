import { createClient } from "@supabase/supabase-js";

/**
 * Cliente con SERVICE ROLE. Omite RLS por diseño.
 *
 * ⚠️ USO EXCLUSIVO EN SERVIDOR: API routes, webhooks, cron y Server Actions.
 * NUNCA importar este archivo desde un componente de cliente.
 */
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error(
      "Faltan variables de servidor: NEXT_PUBLIC_SUPABASE_URL y/o SUPABASE_SERVICE_ROLE_KEY",
    );
  }

  return createClient(url, key, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
