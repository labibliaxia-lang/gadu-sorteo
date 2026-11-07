import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/** Un UUID viejo también se acepta como destino directo (compatibilidad). */
const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface RaffleTarget {
  id: string;
  slug: string | null;
}

/**
 * Enlace corto de referido: `/r/<code>`.
 *
 * Resuelve el código contra `profiles.referral_code` y manda al sorteo activo
 * más reciente del organizador (o al último que tenga). Si el código no
 * existe, o el organizador no tiene sorteos, vuelve a la Home.
 *
 * Seguridad: el destino se arma siempre como ruta interna (`/sorteos/...`) a
 * partir de datos de la base. El único dato que viene de la URL es el código,
 * que viaja como valor de `?ref=` ya codificado: no hay Open Redirect.
 */
export default async function ReferralCodePage({
  params,
}: {
  params: { code: string };
}) {
  const code = (params.code ?? "").trim();
  if (!code) redirect("/");

  const supabase = createClient();

  // 1) Código → organizador. La RLS de `profiles` no deja leer filas ajenas,
  //    así que la traducción la hace una RPC SECURITY DEFINER que sólo
  //    devuelve el UUID.
  let organizerId: string | null = null;

  if (UUID.test(code)) {
    // Compatibilidad: un enlace `/r/<uuid>` también resuelve. Los enlaces
    // viejos `?ref=<uuid>` siguen funcionando sin pasar por acá.
    organizerId = code;
  } else {
    const { data, error } = await supabase.rpc("resolver_referral_code", {
      p_code: code,
    });

    if (!error && typeof data === "string") {
      organizerId = data;
    }
  }

  if (!organizerId) redirect("/");

  // 2) Sorteo activo más reciente; si no hay ninguno, el último del
  //    organizador (aunque esté cerrado, sorteado o pausado).
  const { data: activo } = await supabase
    .from("raffles")
    .select("id, slug")
    .eq("created_by", organizerId)
    .eq("status", "active")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  let destino = activo as RaffleTarget | null;

  if (!destino) {
    const { data: ultimo } = await supabase
      .from("raffles")
      .select("id, slug")
      .eq("created_by", organizerId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    destino = ultimo as RaffleTarget | null;
  }

  if (!destino) redirect("/");

  // 3) Ruta interna y slug codificado. El código se conserva en `?ref=` para
  //    que `ReferralCapture` registre el vínculo.
  const slug = destino.slug?.trim() || destino.id;
  redirect(
    `/sorteos/${encodeURIComponent(slug)}?ref=${encodeURIComponent(code)}`,
  );
}
