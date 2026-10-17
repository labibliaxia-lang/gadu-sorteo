import { createClient } from "@supabase/supabase-js";

/**
 * Cliente con SERVICE ROLE. Omite RLS por diseño.
 *
 * ⚠️ USO EXCLUSIVO EN SERVIDOR: API routes, webhooks y cron.
 * NUNCA importar este archivo desde un componente de cliente.
 */
export function createAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    },
  );
}
