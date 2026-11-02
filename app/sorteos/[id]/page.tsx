import type { Metadata } from "next";
import Image from "next/image";
import { headers } from "next/headers";
import { notFound } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { Badge } from "@/components/ui/badge";
import { DrawVerifier } from "@/components/DrawVerifier";
import { NumbersGrid } from "@/components/NumbersGrid";
import { OrganizerCard } from "@/components/OrganizerCard";
import { OrganizerContact } from "@/components/OrganizerContact";
import { PrizeCard } from "@/components/PrizeCard";
import { ShareButton } from "@/components/ShareButton";
import { formatDateTime, formatPrice } from "@/lib/utils";
import type { Prize, PublicOrganizer, Raffle } from "@/lib/types";

export const dynamic = "force-dynamic";

const statusLabel: Record<Raffle["status"], string> = {
  active: "Activo",
  closed: "Cerrado",
  drawn: "Sorteado",
};

/**
 * Metadata por sorteo: es lo que se ve al compartir el link por WhatsApp o
 * redes. No incluye el nombre del ganador (PII): título, premio y fecha.
 */
export async function generateMetadata({
  params,
}: {
  params: { id: string };
}): Promise<Metadata> {
  const supabase = createClient();
  const { data: raffle } = await supabase
    .from("raffles")
    .select(
      "title, description, cover_image_url, draw_date, price_per_number",
    )
    .eq("id", params.id)
    .maybeSingle();

  if (!raffle) {
    return { title: "Sorteo no encontrado | Gadu Sorteos" };
  }

  const description = raffle.description?.trim()
    ? String(raffle.description).trim().slice(0, 160)
    : `Participá por ${raffle.title} en Gadu Sorteos. Precio por número: ${formatPrice(
        Number(raffle.price_per_number),
      )}. Sorteo: ${formatDateTime(raffle.draw_date)}.`;

  const images = raffle.cover_image_url
    ? [{ url: raffle.cover_image_url as string }]
    : undefined;

  return {
    title: `${raffle.title} | Gadu Sorteos`,
    description,
    openGraph: {
      title: raffle.title,
      description,
      type: "website",
      images,
    },
    twitter: {
      card: "summary_large_image",
      title: raffle.title,
      description,
      images: images?.map((image) => image.url),
    },
  };
}

export default async function RafflePage({
  params,
}: {
  params: { id: string };
}) {
  const supabase = createClient();
  const isDev = process.env.NODE_ENV === "development";

  const { data: raffle } = await supabase
    .from("raffles")
    .select("*")
    .eq("id", params.id)
    .single();

  if (!raffle) notFound();

  // Tracking de visitas para las analíticas del organizador.
  //
  // Antes contaba CUALQUIER render: cada prefetch del router de Next, cada
  // revalidación y cada recarga sumaban una visita, así que el número que veía
  // el organizador salía inflado y la "conversión visitas → pago" quedaba
  // artificialmente baja. Ahora sólo cuenta una navegación real.
  //
  // El error se lee: `insert` de supabase no lanza, devuelve `{ error }`, así
  // que el `try/catch` anterior no atrapaba nada y un fallo de RLS o una tabla
  // ausente se perdían en silencio.
  const requestHeaders = headers();
  const isPrefetch = Boolean(
    requestHeaders.get("next-router-prefetch") ??
      requestHeaders.get("sec-purpose") ??
      requestHeaders.get("purpose"),
  );
  const fetchMode = requestHeaders.get("sec-fetch-mode");
  const isNavigation = fetchMode === null || fetchMode === "navigate";

  if (raffle.status === "active" && !isPrefetch && isNavigation) {
    const { error: visitError } = await supabase
      .from("raffle_visits")
      .insert({ raffle_id: raffle.id });

    // Sin tracking disponible (migración 0026 pendiente): no rompe la página,
    // pero deja de ser invisible.
    if (visitError) {
      console.warn("[visitas] no se pudo registrar:", visitError.message);
    }
  }

  const { data: prizes } = await supabase
    .from("prizes")
    .select("*")
    .eq("raffle_id", params.id)
    .order("position", { ascending: true });

  // Perfil público del organizador: se lee de la vista `public_organizers`
  // (migración 0030), que no expone email, teléfono ni datos del KYC. Anon ya
  // no tiene SELECT sobre `profiles`.
  const { data: organizer } = raffle.created_by
    ? await supabase
        .from("public_organizers")
        .select("*")
        .eq("id", raffle.created_by)
        .single()
    : { data: null };

  // Listado vendido para el verificador: es público por RLS (solo números).
  const { data: soldNumbersData } =
    raffle.status === "drawn" && raffle.draw_seed
      ? await supabase
          .from("raffle_numbers")
          .select("number")
          .eq("raffle_id", raffle.id)
          .eq("status", "sold")
          .order("number", { ascending: true })
      : { data: null };

  const soldNumbers = ((soldNumbersData ?? []) as { number: number }[]).map(
    (row) => row.number,
  );

  return (
    <div className="space-y-8">
      <section className="grid gap-6 md:grid-cols-2">
        <div className="relative aspect-video w-full overflow-hidden rounded-lg bg-muted">
          {raffle.cover_image_url ? (
            <Image
              src={raffle.cover_image_url}
              alt={raffle.title}
              fill
              sizes="(max-width: 768px) 100vw, 50vw"
              className="object-cover"
            />
          ) : (
            <div className="flex h-full items-center justify-center text-6xl">
              🛠️
            </div>
          )}
        </div>

        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <h1 className="text-3xl font-bold">{raffle.title}</h1>
            <Badge variant="secondary">
              {statusLabel[raffle.status as Raffle["status"]]}
            </Badge>
          </div>
          <ShareButton sorteoId={raffle.id} titulo={raffle.title} />
          {raffle.description && (
            <p className="text-muted-foreground">{raffle.description}</p>
          )}
          <p className="text-sm text-muted-foreground">
            Fecha del sorteo: {formatDateTime(raffle.draw_date)}
          </p>
          <p className="text-lg font-semibold">
            {formatPrice(Number(raffle.price_per_number))}{" "}
            <span className="text-sm font-normal text-muted-foreground">
              por número
            </span>
          </p>

          {raffle.status === "drawn" && raffle.winner_number != null && (
            <div className="rounded-lg border bg-secondary/50 p-4">
              <p className="font-semibold">🎉 Sorteo finalizado</p>
              <p>
                Ganador: {raffle.winner_name ?? "Anónimo"} — Nº{" "}
                {raffle.winner_number}
              </p>
            </div>
          )}

          {organizer && (
            <OrganizerCard
              organizer={organizer as PublicOrganizer}
              href={
                organizer.slug
                  ? `/organizador/${organizer.slug}`
                  : raffle.created_by
                    ? `/organizador/${raffle.created_by}`
                    : null
              }
            />
          )}
        </div>
      </section>

      {raffle.status !== "drawn" && raffle.draw_commitment && (
        <section className="space-y-3 rounded-xl border bg-muted/30 p-5">
          <h2 className="text-lg font-semibold">
            Compromiso del sorteo publicado
          </h2>
          <p className="text-sm text-muted-foreground">
            El organizador publicó, antes del sorteo, el hash de una semilla
            secreta. Nadie conoce la semilla hasta que se sortea: cuando se
            revele, cualquiera podrá comprobar que el ganador se calculó a partir
            de ella y de los números vendidos. El compromiso ya no se puede
            cambiar.
          </p>
          <div className="space-y-1 text-xs">
            <p className="font-medium">Compromiso (hash de la semilla)</p>
            <code className="block break-all rounded-md bg-muted/60 p-3 font-mono">
              {raffle.draw_commitment}
            </code>
            {raffle.draw_commitment_at && (
              <p className="text-muted-foreground">
                Publicado: {formatDateTime(raffle.draw_commitment_at)}
              </p>
            )}
          </div>
        </section>
      )}

      {raffle.status === "drawn" &&
        raffle.numbers_hash &&
        raffle.result_hash && (
          <section className="space-y-4 rounded-xl border bg-card p-5 shadow-sm">
            <div className="space-y-1">
              <h2 className="text-lg font-semibold">
                Huellas del sorteo (verificable)
              </h2>
              <p className="text-sm text-muted-foreground">
                Estas huellas SHA-256 se calcularon en el momento del sorteo y
                quedaron congeladas. Además, la semilla del sorteo se publicó
                comprometida antes de sortear y ahora está revelada: con el
                listado de números vendidos que se muestra en esta página,
                cualquiera puede recomputar el ganador y comprobar que no se
                eligió después de conocer los números.
              </p>
              {raffle.hashes_at && (
                <p className="text-xs text-muted-foreground">
                  Calculadas: {formatDateTime(raffle.hashes_at)} · Sorteo:{" "}
                  <span className="font-mono">{raffle.id}</span>
                </p>
              )}
            </div>

            <div className="space-y-3 text-xs">
              <div className="space-y-1">
                <p className="font-medium">
                  Huella del listado vendido (<code>numbers_hash</code>)
                </p>
                <code className="block break-all rounded-md bg-muted/60 p-3 font-mono">
                  {raffle.numbers_hash}
                </code>
              </div>
              <div className="space-y-1">
                <p className="font-medium">
                  Huella del resultado (<code>result_hash</code>)
                </p>
                <code className="block break-all rounded-md bg-muted/60 p-3 font-mono">
                  {raffle.result_hash}
                </code>
              </div>
              {raffle.draw_commitment && (
                <div className="space-y-1">
                  <p className="font-medium">
                    Compromiso publicado antes del sorteo{" "}
                    (<code>draw_commitment</code>)
                  </p>
                  <code className="block break-all rounded-md bg-muted/60 p-3 font-mono">
                    {raffle.draw_commitment}
                  </code>
                </div>
              )}
              {raffle.draw_seed && (
                <div className="space-y-1">
                  <p className="font-medium">
                    Semilla revelada (<code>draw_seed</code>)
                  </p>
                  <code className="block break-all rounded-md bg-muted/60 p-3 font-mono">
                    {raffle.draw_seed}
                  </code>
                  {raffle.draw_seed_revealed_at && (
                    <p className="text-muted-foreground">
                      Revelada: {formatDateTime(raffle.draw_seed_revealed_at)}
                    </p>
                  )}
                </div>
              )}
            </div>

            {raffle.draw_seed &&
              raffle.draw_commitment &&
              raffle.winner_number != null && (
                <DrawVerifier
                  raffleId={raffle.id}
                  seed={raffle.draw_seed}
                  commitment={raffle.draw_commitment}
                  winnerNumber={raffle.winner_number}
                  numbersHash={raffle.numbers_hash!}
                  resultHash={raffle.result_hash!}
                  soldNumbers={soldNumbers}
                />
              )}

            <details className="rounded-md border p-3 text-sm">
              <summary className="cursor-pointer font-medium">
                Cómo verificarlo
              </summary>
              <ol className="mt-3 list-decimal space-y-2 pl-5 text-muted-foreground">
                <li>
                  <strong>Compromiso:</strong> calculá el SHA-256 (hexadecimal) de{" "}
                  <code className="break-all font-mono">
                    gadu:v1|raffle:{raffle.id}|seed:&lt;semilla&gt;
                  </code>
                  . Tiene que coincidir con <code>draw_commitment</code>: eso
                  prueba que la semilla ya estaba fijada antes del sorteo.
                </li>
                <li>
                  <strong>Listado vendido:</strong> tomá los números vendidos de
                  este sorteo, ordenados de menor a mayor, separados por coma y
                  sin espacios: <code className="font-mono">n1,n2,...,nN</code>.
                </li>
                <li>
                  <strong>Ganador:</strong> calculá el SHA-256 de{" "}
                  <code className="break-all font-mono">
                    gadu:v1|raffle:{raffle.id}|seed:&lt;semilla&gt;|numbers:n1,n2,...,nN
                  </code>
                  . Tomá sus primeros 15 caracteres hexadecimales como número,
                  dividilo por la cantidad de números vendidos y usá el resto
                  como posición (empezando en 0) del listado ordenado: ese es el
                  número ganador y tiene que coincidir con el publicado.
                </li>
                <li>
                  <strong>Huellas:</strong> el SHA-256 de{" "}
                  <code className="break-all font-mono">
                    gadu:v1|raffle:{raffle.id}|numbers:n1,n2,...,nN
                  </code>{" "}
                  debe ser <code>numbers_hash</code>, y el de{" "}
                  <code className="break-all font-mono">
                    gadu:v1|raffle:{raffle.id}|winner:{raffle.winner_number}
                    |numbers:n1,n2,...,nN
                  </code>{" "}
                  debe ser <code>result_hash</code>.
                </li>
                <li>
                  Cualquier diferencia significa que la semilla, el listado o el
                  resultado se modificaron después del sorteo.
                </li>
              </ol>
            </details>
          </section>
        )}

      {raffle.status === "active" && (
        <section className="space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-xl font-semibold">Elegí tus números</h2>
            {isDev && (
              <span className="rounded-full bg-yellow-500/20 px-3 py-1 text-xs font-medium text-yellow-700 dark:text-yellow-300">
                Modo simulación de pagos activo
              </span>
            )}
          </div>
          {raffle.payment_type === "transferencia" && (
            <div className="rounded-xl border bg-muted/40 p-4">
              <p className="text-sm font-semibold">Datos para transferencia</p>
              <div className="mt-2 grid gap-3 text-sm sm:grid-cols-3">
                {raffle.transfer_alias && (
                  <div>
                    <p className="text-muted-foreground">Alias</p>
                    <p className="font-mono font-semibold">
                      {raffle.transfer_alias}
                    </p>
                  </div>
                )}
                {raffle.transfer_cbu && (
                  <div>
                    <p className="text-muted-foreground">CBU</p>
                    <p className="font-mono font-semibold">
                      {raffle.transfer_cbu}
                    </p>
                  </div>
                )}
                {raffle.transfer_bank && (
                  <div>
                    <p className="text-muted-foreground">Banco</p>
                    <p className="font-semibold">{raffle.transfer_bank}</p>
                  </div>
                )}
              </div>
            </div>
          )}

          <NumbersGrid
            raffleId={raffle.id}
            raffleTitle={raffle.title}
            pricePerNumber={Number(raffle.price_per_number)}
            raffleStatus={raffle.status}
            isDev={isDev}
            paymentType={raffle.payment_type}
            transferInfo={{
              alias: raffle.transfer_alias,
              cbu: raffle.transfer_cbu,
              bank: raffle.transfer_bank,
              // El WhatsApp sale del sorteo; el perfil ya no expone teléfono.
              whatsapp: raffle.whatsapp_contact || null,
            }}
          />
        </section>
      )}

      <section className="space-y-4">
        <h2 className="text-xl font-semibold">Premios</h2>
        {prizes && prizes.length > 0 ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {prizes.map((prize: Prize) => (
              <PrizeCard key={prize.id} prize={prize} />
            ))}
          </div>
        ) : (
          <p className="text-muted-foreground">
            Los premios se publicarán pronto.
          </p>
        )}
      </section>

      {organizer && (
        <OrganizerContact
          organizer={{
            phone: raffle.whatsapp_contact,
            instagram_url: null,
          }}
        />
      )}
    </div>
  );
}
