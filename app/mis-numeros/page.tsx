"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { CalendarDays, Ticket, Trophy } from "lucide-react";

import { createClient } from "@/lib/supabase/client";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
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

interface PaymentRow {
  raffle_id: string;
  numbers: number[];
  raffles: RaffleRef | null;
}

const STATUS_LABEL: Record<string, string> = {
  active: "Activo",
  closed: "Cerrado",
  drawn: "Sorteado",
};

export default function MisNumerosPage() {
  const supabase = createClient();
  const [payments, setPayments] = useState<PaymentRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        setLoading(false);
        return;
      }

      const { data } = await supabase
        .from("payments")
        .select(
          "raffle_id, numbers, raffles(id, title, cover_image_url, draw_date, status, winner_number, winner_name)",
        )
        .eq("user_id", user.id)
        .eq("status", "approved")
        .order("created_at", { ascending: false });

      setPayments((data as unknown as PaymentRow[]) ?? []);
      setLoading(false);
    }
    load();
  }, [supabase]);

  // Agrupa los números por sorteo.
  const byRaffle = new Map<string, { raffle: RaffleRef; numbers: number[] }>();

  for (const p of payments) {
    if (!p.raffles) continue;
    const current = byRaffle.get(p.raffles.id) ?? {
      raffle: p.raffles,
      numbers: [],
    };
    current.numbers.push(...(p.numbers ?? []));
    byRaffle.set(p.raffles.id, current);
  }

  const groups = Array.from(byRaffle.values()).sort(
    (a, b) =>
      new Date(b.raffle.draw_date).getTime() -
      new Date(a.raffle.draw_date).getTime(),
  );

  return (
    <div className="space-y-8">
      <header className="space-y-2">
        <h1 className="text-3xl font-bold tracking-tight">Mis números</h1>
        <p className="text-muted-foreground">
          Los boletos que compraste en cada sorteo.
        </p>
      </header>

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
            <Card key={g.raffle.id}>
              <CardContent className="flex gap-4 p-4">
                <div className="h-24 w-24 shrink-0 overflow-hidden rounded-lg bg-muted">
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

                <div className="min-w-0 flex-1 space-y-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <CardTitle className="text-lg">{g.raffle.title}</CardTitle>
                    <Badge variant="secondary">
                      {STATUS_LABEL[g.raffle.status] ?? g.raffle.status}
                    </Badge>
                  </div>

                  <p className="flex items-center gap-2 text-sm text-muted-foreground">
                    <CalendarDays className="h-4 w-4" />
                    {formatDateTime(g.raffle.draw_date)}
                  </p>

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

                  <div className="flex flex-wrap gap-1.5">
                    {g.numbers.map((n) => (
                      <span
                        key={`${g.raffle.id}-${n}`}
                        className="rounded-md bg-amber-500/15 px-2 py-1 text-xs font-semibold text-amber-700 dark:text-amber-300"
                      >
                        {formatNumber(n)}
                      </span>
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
