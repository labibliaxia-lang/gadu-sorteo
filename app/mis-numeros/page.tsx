"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { CalendarDays, Copy, Gift, Ticket, Trophy } from "lucide-react";

import { createClient } from "@/lib/supabase/client";
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
}

interface SoldNumberRow {
  raffle_id: string;
  number: number;
  raffles: RaffleRef | null;
}

const STATUS_LABEL: Record<string, string> = {
  active: "Activo",
  closed: "Cerrado",
  drawn: "Sorteado",
};

export default function MisNumerosPage() {
  const supabase = createClient();
  const [rows, setRows] = useState<SoldNumberRow[]>([]);
  const [userId, setUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);

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

      // Números vendidos al usuario (incluye los gratis por referidos).
      const { data } = await supabase
        .from("raffle_numbers")
        .select(
          "raffle_id, number, raffles(id, title, cover_image_url, draw_date, status, winner_number, winner_name)",
        )
        .eq("sold_to", user.id)
        .eq("status", "sold")
        .order("number", { ascending: true });

      setRows((data as unknown as SoldNumberRow[]) ?? []);
      setLoading(false);
    }
    load();
  }, [supabase]);

  const byRaffle = new Map<string, { raffle: RaffleRef; numbers: number[] }>();

  for (const r of rows) {
    if (!r.raffles) continue;
    const current = byRaffle.get(r.raffles.id) ?? {
      raffle: r.raffles,
      numbers: [],
    };
    current.numbers.push(r.number);
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

  return (
    <div className="space-y-8">
      <header className="space-y-2">
        <h1 className="text-3xl font-bold tracking-tight">Mis números</h1>
        <p className="text-muted-foreground">
          Los boletos que tenés en cada sorteo.
        </p>
      </header>

      {userId && (
        <Card>
          <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-2">
              <Gift className="mt-0.5 h-5 w-5 text-amber-500" />
              <div className="space-y-1">
                <p className="font-semibold">Invitá y ganá</p>
                <p className="text-sm text-muted-foreground">
                  Por cada amigo que se registre con tu enlace y compre un
                  número, recibís un número gratis.
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
                <div className="flex flex-col justify-between gap-4 border-t border-dashed p-5 sm:w-64 sm:border-l-0 sm:border-t-0">
                  <div>
                    <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      Tus números
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {g.numbers.map((n) => (
                        <span
                          key={`${g.raffle.id}-${n}`}
                          className="rounded-md border border-amber-500/40 bg-amber-500/15 px-2.5 py-1 font-mono text-sm font-bold text-amber-700 dark:text-amber-300"
                        >
                          {formatNumber(n)}
                        </span>
                      ))}
                    </div>
                  </div>
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
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
