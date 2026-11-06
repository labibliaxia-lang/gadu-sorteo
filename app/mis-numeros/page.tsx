"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  CalendarDays,
  Copy,
  Gift,
  MessageCircle,
  Share2,
  Star,
  Ticket,
  Trophy,
} from "lucide-react";

import { createClient } from "@/lib/supabase/client";
import { ReviewFormDialog } from "@/components/ReviewSection";
import { MisDevoluciones } from "@/components/MisDevoluciones";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardTitle } from "@/components/ui/card";
import { formatDateTime, formatNumber } from "@/lib/utils";

interface RaffleRef {
  id: string;
  title: string;
  cover_image_url: string | null;
  draw_date: string;
  status: string;
  winner_number: number | null;
  winner_name: string | null;
  whatsapp_contact: string | null;
  created_by: string | null;
}

interface NumberRow {
  raffle_id: string;
  number: number;
  status: string;
  reserved_until: string | null;
  raffles: RaffleRef | null;
}

interface RaffleNumbersGroup {
  raffle: RaffleRef;
  sold: number[];
  reserved: { number: number; until: string | null }[];
}

interface Premio {
  raffle_id: string;
  position: number;
  number: number;
  prize_title: string | null;
  raffles: { title: string; whatsapp_contact: string | null } | null;
}

const STATUS_LABEL: Record<string, string> = {
  active: "Activo",
  closed: "Cerrado",
  drawn: "Sorteado",
  cancelled: "Cancelado",
};

function whatsappHref(
  phone: string | null,
  message: string,
): string | null {
  const digits = (phone ?? "").replace(/\D/g, "");
  if (!digits) return null;
  const withCountry = digits.startsWith("54") ? digits : `54${digits}`;
  return `https://wa.me/${withCountry}?text=${encodeURIComponent(message)}`;
}

export default function MisNumerosPage() {
  const supabase = createClient();
  const [rows, setRows] = useState<NumberRow[]>([]);
  const [userId, setUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const [reviewedRaffles, setReviewedRaffles] = useState<Set<string>>(
    new Set(),
  );
  const [reviewTarget, setReviewTarget] = useState<string | null>(null);
  const [premios, setPremios] = useState<Premio[]>([]);
  const [refreshKey, setRefreshKey] = useState(0);
  const [referralRegla, setReferralRegla] = useState<{
    min: number;
    max: number;
  } | null>(null);

  useEffect(() => {
    async function load() {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        setLoading(false);
        return;
      }

      setUserId(user.id);

      // Números vendidos y reservas pendientes del usuario.
      const { data } = await supabase
        .from("raffle_numbers")
        .select(
          "raffle_id, number, status, reserved_until, raffles(id, title, cover_image_url, draw_date, status, winner_number, winner_name, whatsapp_contact, created_by)",
        )
        .or(`sold_to.eq.${user.id},reserved_by.eq.${user.id}`)
        .in("status", ["sold", "reserved"])
        .order("number", { ascending: true });

      setRows((data as unknown as NumberRow[]) ?? []);

      const { data: myReviews } = await supabase
        .from("reviews")
        .select("raffle_id")
        .eq("user_id", user.id);

      setReviewedRaffles(
        new Set(
          (myReviews ?? []).map((review) => review.raffle_id as string),
        ),
      );

      // Premios ganados: lo que el jugador necesita ver al entrar, sin
      // depender de un email que puede no tener cargado.
      const { data: wins } = await supabase
        .from("raffle_winners")
        .select(
          "raffle_id, position, number, prize_title, raffles(title, whatsapp_contact)",
        )
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(10);

      setPremios((wins as unknown as Premio[]) ?? []);

      // "Invitá y ganá" solo se muestra si algún sorteo activo lo habilitó
      // (0102). Si nadie lo habilitó, no se promete nada.
      const { data: conReferidos } = await supabase
        .from("raffles")
        .select("referral_min_numbers, referral_max_per_user")
        .eq("referral_enabled", true)
        .eq("status", "active")
        .order("draw_date", { ascending: true })
        .limit(1)
        .maybeSingle();

      setReferralRegla(
        conReferidos
          ? {
              min: Number(conReferidos.referral_min_numbers ?? 1),
              max: Number(conReferidos.referral_max_per_user ?? 0),
            }
          : null,
      );

      setLoading(false);
    }
    load();
  }, [supabase, refreshKey]);

  // Si el organizador aprueba, libera, o el sorteo se ejecuta, el jugador ve el
  // cambio sin recargar: la campana y esta pantalla escuchan la misma tabla.
  useEffect(() => {
    if (!userId) return;

    const canal = supabase
      .channel(`mis-numeros-${userId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "notifications",
          filter: `user_id=eq.${userId}`,
        },
        () => setRefreshKey((k) => k + 1),
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(canal);
    };
  }, [userId, supabase]);

  const byRaffle = new Map<string, RaffleNumbersGroup>();

  for (const r of rows) {
    if (!r.raffles) continue;
    const current: RaffleNumbersGroup = byRaffle.get(r.raffles.id) ?? {
      raffle: r.raffles,
      sold: [],
      reserved: [],
    };
    if (r.status === "reserved") {
      current.reserved.push({ number: r.number, until: r.reserved_until });
    } else if (r.status === "sold") {
      current.sold.push(r.number);
    }
    byRaffle.set(r.raffles.id, current);
  }

  const groups = Array.from(byRaffle.values()).sort(
    (a, b) =>
      new Date(b.raffle.draw_date).getTime() -
      new Date(a.raffle.draw_date).getTime(),
  );

  const referralLink = userId
    ? `${window.location.origin}/?ref=${userId}`
    : "";

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(referralLink);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // clipboard no disponible
    }
  }

  /**
   * Comparte el boleto: usa Web Share API si el navegador la soporta y, si no,
   * cae a WhatsApp. El texto no incluye datos de la cuenta, solo el sorteo y
   * los números del propio usuario.
   */
  async function shareTicket(group: {
    raffle: RaffleRef;
    sold: number[];
    reserved: { number: number; until: string | null }[];
  }) {
    const url = `${window.location.origin}/sorteos/${group.raffle.id}`;
    const allNumbers = [
      ...group.sold,
      ...group.reserved.map((r) => r.number),
    ].sort((a, b) => a - b);
    const numbers = allNumbers.map(formatNumber).join(", ");
    const text = `¡Estoy participando en el sorteo de ${group.raffle.title} en Gadu Sorteos! Mis números son ${numbers}. ¡Entra y participa! ${url}`;

    const nav = navigator as Navigator & {
      share?: (data: {
        title?: string;
        text?: string;
        url?: string;
      }) => Promise<void>;
    };

    if (nav.share) {
      try {
        await nav.share({ title: group.raffle.title, text, url });
        return;
      } catch {
        // El usuario canceló o el share falló: se intenta por WhatsApp.
      }
    }

    window.open(
      `https://wa.me/?text=${encodeURIComponent(text)}`,
      "_blank",
      "noopener,noreferrer",
    );
  }

  return (
    <div className="space-y-8">
      <header className="space-y-2">
        <h1 className="text-3xl font-bold tracking-tight">Mis números</h1>
        <p className="text-muted-foreground">
          Tus números confirmados y las reservas que están esperando el pago.
        </p>
      </header>

      {premios.length > 0 && (
        <section className="space-y-3 rounded-xl border border-emerald-600/40 bg-emerald-500/5 p-4">
          <h2 className="text-lg font-semibold">🏆 ¡Saliste ganador!</h2>
          <p className="text-sm text-muted-foreground">
            Escribile al organizador para coordinar la entrega del premio.
          </p>
          <ul className="space-y-2">
            {premios.map((premio) => {
              const texto = `Hola, salí ganador del sorteo ${
                premio.raffles?.title ?? ""
              } con el número ${premio.number}. Te escribo para coordinar la entrega del premio.`;
              const wa = whatsappHref(
                premio.raffles?.whatsapp_contact ?? null,
                texto,
              );

              return (
                <li
                  key={`${premio.raffle_id}-${premio.position}`}
                  className="rounded-lg border bg-card p-3 text-sm"
                >
                  <p className="font-medium">
                    {premio.raffles?.title ?? "Sorteo"}
                  </p>
                  <p className="text-muted-foreground">
                    {premio.position === 1
                      ? "1.er premio"
                      : `${premio.position}º premio`}
                    {premio.prize_title ? ` · ${premio.prize_title}` : ""} · Nº{" "}
                    {premio.number}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {wa && (
                      <a
                        href={wa}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={buttonVariants({ variant: "outline", size: "sm" })}
                      >
                        <MessageCircle className="mr-1.5 h-4 w-4" />
                        Escribir al organizador
                      </a>
                    )}
                    <Link
                      href={`/sorteos/${premio.raffle_id}`}
                      className={buttonVariants({ variant: "ghost", size: "sm" })}
                    >
                      Ver sorteo
                    </Link>
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <MisDevoluciones />

      {userId && referralRegla && (
        <Card>
          <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-2">
              <Gift className="mt-0.5 h-5 w-5 text-amber-500" />
              <div className="space-y-1">
                <p className="font-semibold">Invitá y ganá</p>
                <p className="text-sm text-muted-foreground">
                  En los sorteos que lo habilitan, tu amigo debe comprar al
                  menos {referralRegla.min} número
                  {referralRegla.min === 1 ? "" : "s"} y vos recibís uno gratis
                  en ese sorteo.
                  {referralRegla.max > 0
                    ? ` Máximo ${referralRegla.max} por persona.`
                    : ""}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <code className="min-w-0 flex-1 truncate rounded-md bg-muted px-2 py-1.5 text-xs">
                {referralLink}
              </code>
              <Button variant="outline" size="sm" onClick={copyLink}>
                <Copy className="mr-1.5 h-4 w-4" />
                {copied ? "¡Copiado!" : "Copiar"}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {loading ? (
        <p className="py-16 text-center text-muted-foreground">Cargando…</p>
      ) : groups.length === 0 ? (
        <Card className="mx-auto max-w-md border-dashed text-center">
          <CardContent className="space-y-4 py-12">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-muted">
              <Ticket className="h-8 w-8 text-muted-foreground" />
            </div>
            <div className="space-y-1">
              <h2 className="text-xl font-semibold">
                Aún no tenés números comprados
              </h2>
              <p className="text-sm text-muted-foreground">
                Cuando compres tus números, los vas a ver acá.
              </p>
            </div>
            <Link href="/#sorteos" className={buttonVariants()}>
              Explorar sorteos
            </Link>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {groups.map((g) => (
            <Card key={g.raffle.id} className="overflow-hidden">
              <div className="flex flex-col sm:flex-row">
                {/* Lado principal del boleto */}
                <div className="flex flex-1 gap-4 p-5">
                  <div className="h-24 w-24 shrink-0 overflow-hidden rounded-xl border bg-muted">
                    {g.raffle.cover_image_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={g.raffle.cover_image_url}
                        alt={g.raffle.title}
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-3xl">
                        🛠️
                      </div>
                    )}
                  </div>

                  <div className="min-w-0 flex-1 space-y-1.5">
                    <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                      🎟 Boleto digital
                    </p>
                    <CardTitle className="text-lg leading-tight">
                      {g.raffle.title}
                    </CardTitle>
                    <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
                      <CalendarDays className="h-4 w-4" />
                      {formatDateTime(g.raffle.draw_date)}
                    </p>
                    <Badge variant="secondary">
                      {STATUS_LABEL[g.raffle.status] ?? g.raffle.status}
                    </Badge>
                    {g.reserved.length > 0 && (
                      <Badge variant="warning">Pago pendiente</Badge>
                    )}

                    {g.raffle.status === "cancelled" && (
                      <p className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-2 text-xs">
                        Sorteo cancelado. Contactá al organizador para
                        coordinar la devolución de tus números pagados.
                      </p>
                    )}

                    {g.raffle.status === "drawn" &&
                      g.raffle.winner_number != null && (
                        <div className="flex items-center gap-2 rounded-lg border bg-secondary/50 p-2 text-sm">
                          <Trophy className="h-4 w-4 text-amber-500" />
                          <span>
                            Ganador: {g.raffle.winner_name ?? "Anónimo"} — Nº{" "}
                            {g.raffle.winner_number}
                          </span>
                        </div>
                      )}
                  </div>
                </div>

                {/* Línea perforada */}
                <div className="relative hidden border-l border-dashed border-border sm:block" />

                {/* Talón con los números */}
                <div className="flex flex-col justify-between gap-4 border-t border-dashed p-5 sm:w-72 sm:border-l-0 sm:border-t-0">
                  <div className="space-y-3">
                    <div>
                      <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                        Tus números
                      </p>
                      {g.sold.length === 0 ? (
                        <p className="text-sm text-muted-foreground">
                          Todavía no hay números confirmados.
                        </p>
                      ) : (
                        <div className="flex flex-wrap gap-1.5">
                          {g.sold.map((n) => (
                            <span
                              key={`${g.raffle.id}-${n}`}
                              className="rounded-md border border-amber-500/40 bg-amber-500/15 px-2.5 py-1 font-mono text-sm font-bold text-amber-700 dark:text-amber-300"
                            >
                              {formatNumber(n)}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>

                    {g.reserved.length > 0 && (
                      <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-2.5">
                        <p className="text-xs font-semibold text-amber-800 dark:text-amber-200">
                          Reservados · pendiente de pago
                        </p>
                        <div className="mt-1.5 flex flex-wrap gap-1.5">
                          {g.reserved.map((r) => (
                            <span
                              key={`${g.raffle.id}-reserved-${r.number}`}
                              className="rounded-md border border-dashed border-amber-500/60 px-2 py-0.5 font-mono text-xs font-semibold text-amber-800 dark:text-amber-200"
                            >
                              {formatNumber(r.number)}
                            </span>
                          ))}
                        </div>
                        {g.reserved[0]?.until && (
                          <p className="mt-2 text-xs text-muted-foreground">
                            La reserva vence{" "}
                            {formatDateTime(g.reserved[0].until)}.
                          </p>
                        )}
                        {whatsappHref(
                          g.raffle.whatsapp_contact,
                          `Hola! Envié el comprobante de la reserva en "${g.raffle.title}" por los números: ${g.reserved
                            .map((r) => r.number)
                            .join(", ")}.`,
                        ) && (
                          <a
                            href={
                              whatsappHref(
                                g.raffle.whatsapp_contact,
                                `Hola! Envié el comprobante de la reserva en "${g.raffle.title}" por los números: ${g.reserved
                                  .map((r) => r.number)
                                  .join(", ")}.`,
                              ) ?? "#"
                            }
                            target="_blank"
                            rel="noopener noreferrer"
                            className={buttonVariants({
                              size: "sm",
                              className:
                                "mt-2 w-full bg-emerald-700 text-white hover:bg-emerald-800",
                            })}
                          >
                            <MessageCircle className="mr-1.5 h-4 w-4" />
                            Enviar comprobante
                          </a>
                        )}
                      </div>
                    )}
                  </div>
                  <div className="flex flex-col gap-2">
                    <Link
                      href={`/sorteos/${g.raffle.id}`}
                      className={buttonVariants({
                        variant: "outline",
                        size: "sm",
                        className: "w-full",
                      })}
                    >
                      Ver sorteo
                    </Link>
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full"
                      onClick={() => shareTicket(g)}
                    >
                      <Share2 className="mr-1.5 h-4 w-4" />
                      Compartir mis números
                    </Button>

                    {g.raffle.status === "drawn" && g.sold.length > 0 && (
                      reviewedRaffles.has(g.raffle.id) ? (
                        <p className="text-center text-xs text-emerald-700 dark:text-emerald-400">
                          ✓ Reseña enviada
                        </p>
                      ) : (
                        <Button
                          size="sm"
                          className="w-full bg-amber-700 text-white hover:bg-amber-800"
                          onClick={() => setReviewTarget(g.raffle.id)}
                        >
                          <Star className="mr-1.5 h-4 w-4" />
                          Calificar organizador
                        </Button>
                      )
                    )}
                  </div>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      <ReviewFormDialog
        open={reviewTarget !== null}
        raffleId={reviewTarget ?? ""}
        organizerName="este organizador"
        onClose={() => setReviewTarget(null)}
        onSaved={() => {
          if (reviewTarget) {
            setReviewedRaffles((prev) => {
              const next = new Set(prev);
              next.add(reviewTarget);
              return next;
            });
          }
          setReviewTarget(null);
        }}
      />
    </div>
  );
}
