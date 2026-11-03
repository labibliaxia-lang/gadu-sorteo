"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { CalendarDays, Receipt, Ticket, Wallet } from "lucide-react";

import { createClient } from "@/lib/supabase/client";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { formatDateTime, formatNumber, formatPrice } from "@/lib/utils";

interface PaymentRow {
  id: string;
  raffle_id: string;
  numbers: number[];
  amount: number;
  status: string;
  created_at: string;
  raffles: { title: string } | null;
}

interface TransferNumberRow {
  raffle_id: string;
  number: number;
  status: string;
  reserved_until: string | null;
  raffles: {
    id: string;
    title: string;
    price_per_number: number;
    status: string;
  } | null;
}

interface TransferGroup {
  raffleId: string;
  title: string;
  price: number;
  sold: number[];
  reserved: { number: number; until: string | null }[];
}

const STATUS_LABEL: Record<string, string> = {
  pending: "Pendiente",
  approved: "Aprobado",
  rejected: "Rechazado",
  cancelled: "Cancelado",
  expired: "Expirado",
};

const STATUS_VARIANT: Record<
  string,
  "warning" | "success" | "destructive" | "secondary"
> = {
  pending: "warning",
  approved: "success",
  rejected: "destructive",
  cancelled: "secondary",
  expired: "secondary",
};

export default function MisPagosPage() {
  const supabase = createClient();
  const [payments, setPayments] = useState<PaymentRow[]>([]);
  const [transferRows, setTransferRows] = useState<TransferNumberRow[]>([]);
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

      const [paymentsResult, transfersResult] = await Promise.all([
        supabase
          .from("payments")
          .select(
            "id, raffle_id, numbers, amount, status, created_at, raffles(title)",
          )
          .eq("user_id", user.id)
          .order("created_at", { ascending: false }),
        supabase
          .from("raffle_numbers")
          .select(
            "raffle_id, number, status, reserved_until, raffles(id, title, price_per_number, status)",
          )
          .or(`sold_to.eq.${user.id},reserved_by.eq.${user.id}`)
          .in("status", ["sold", "reserved"])
          .order("number", { ascending: true }),
      ]);

      setPayments((paymentsResult.data as unknown as PaymentRow[]) ?? []);
      setTransferRows(
        (transfersResult.data as unknown as TransferNumberRow[]) ?? [],
      );
      setLoading(false);
    }
    load();
  }, [supabase]);

  const transferGroups = new Map<string, TransferGroup>();

  for (const row of transferRows) {
    if (!row.raffles) continue;
    const group = transferGroups.get(row.raffles.id) ?? {
      raffleId: row.raffles.id,
      title: row.raffles.title,
      price: Number(row.raffles.price_per_number),
      sold: [],
      reserved: [],
    };

    if (row.status === "reserved") {
      group.reserved.push({ number: row.number, until: row.reserved_until });
    } else if (row.status === "sold") {
      group.sold.push(row.number);
    }

    transferGroups.set(row.raffles.id, group);
  }

  const transfers = Array.from(transferGroups.values());
  const transferSpent = transfers.reduce(
    (sum, group) => sum + group.sold.length * group.price,
    0,
  );
  const transferSoldCount = transfers.reduce(
    (sum, group) => sum + group.sold.length,
    0,
  );
  const transferReservedCount = transfers.reduce(
    (sum, group) => sum + group.reserved.length,
    0,
  );

  const approved = payments.filter((p) => p.status === "approved");
  const totalSpent =
    approved.reduce((sum, p) => sum + Number(p.amount), 0) + transferSpent;
  const rafflesCount = new Set([
    ...payments.map((p) => p.raffle_id),
    ...transfers.map((t) => t.raffleId),
  ]).size;
  const ticketsCount =
    approved.reduce((sum, p) => sum + (p.numbers?.length ?? 0), 0) +
    transferSoldCount;

  const stats = [
    { icon: Wallet, label: "Total gastado", value: formatPrice(totalSpent) },
    {
      icon: CalendarDays,
      label: "Sorteos participados",
      value: String(rafflesCount),
    },
    { icon: Ticket, label: "Boletos comprados", value: String(ticketsCount) },
  ];

  return (
    <div className="space-y-8">
      <header className="space-y-2">
        <h1 className="text-3xl font-bold tracking-tight">Mis pagos</h1>
        <p className="text-muted-foreground">
          Resumen de tus participaciones y comprobantes.
        </p>
      </header>

      {/* Estadísticas */}
      <div className="grid gap-4 sm:grid-cols-3">
        {stats.map((s) => (
          <Card key={s.label}>
            <CardContent className="flex items-center gap-3 p-4">
              <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-amber-500/10 text-amber-600">
                <s.icon className="h-5 w-5" />
              </span>
              <div className="min-w-0">
                <p className="truncate text-sm text-muted-foreground">
                  {s.label}
                </p>
                <p className="truncate text-lg font-bold">{s.value}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {loading ? (
        <p className="py-16 text-center text-muted-foreground">Cargando…</p>
      ) : payments.length === 0 && transfers.length === 0 ? (
        <EmptyState />
      ) : (
        <div className="space-y-6">
          {transfers.length > 0 && (
            <section className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-lg font-semibold">
                  Transferencias y reservas
                </h2>
                {transferReservedCount > 0 && (
                  <Badge variant="warning">
                    {transferReservedCount} pendiente
                    {transferReservedCount === 1 ? "" : "s"} de confirmar
                  </Badge>
                )}
              </div>

              {transfers.map((group) => {
                const confirmed = group.sold.length > 0;
                const pending = group.reserved.length > 0;
                const amount =
                  group.sold.length * group.price;

                return (
                  <Card key={group.raffleId}>
                    <CardHeader className="pb-2">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <CardTitle className="text-base">
                          {group.title}
                        </CardTitle>
                        <div className="flex flex-wrap gap-1.5">
                          {confirmed && (
                            <Badge variant="success">Pago confirmado</Badge>
                          )}
                          {pending && (
                            <Badge variant="warning">Pendiente de pago</Badge>
                          )}
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-2 text-sm text-muted-foreground">
                      <p>
                        Números confirmados:{" "}
                        <span className="font-medium text-foreground">
                          {group.sold.length > 0
                            ? group.sold.map((n) => formatNumber(n)).join(", ")
                            : "ninguno todavía"}
                        </span>
                      </p>

                      {pending && (
                        <p>
                          Reservados esperando confirmación:{" "}
                          <span className="font-medium text-foreground">
                            {group.reserved
                              .map((r) => formatNumber(r.number))
                              .join(", ")}
                          </span>
                          {group.reserved[0]?.until
                            ? ` · vence ${formatDateTime(
                                group.reserved[0].until,
                              )}`
                            : ""}
                        </p>
                      )}

                      <p className="text-base font-bold text-foreground">
                        {formatPrice(amount)}
                      </p>

                      <Link
                        href={`/sorteos/${group.raffleId}`}
                        className="inline-block text-xs text-amber-700 underline-offset-4 hover:underline dark:text-amber-400"
                      >
                        Ver sorteo y datos de pago
                      </Link>
                    </CardContent>
                  </Card>
                );
              })}
            </section>
          )}

          {payments.length > 0 && (
            <section className="space-y-3">
              <h2 className="text-lg font-semibold">Pagos registrados</h2>
              <div className="space-y-3">
                {payments.map((p) => (
                  <PaymentCard key={p.id} payment={p} />
                ))}
              </div>
            </section>
          )}
        </div>
      )}
    </div>
  );
}

function EmptyState() {
  return (
    <Card className="mx-auto max-w-md border-dashed text-center">
      <CardContent className="space-y-4 py-12">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-muted">
          <Receipt className="h-8 w-8 text-muted-foreground" />
        </div>
        <div className="space-y-1">
          <h2 className="text-xl font-semibold">
            Aún no tenés pagos registrados
          </h2>
          <p className="text-sm text-muted-foreground">
            Cuando compres tus números, acá vas a ver los comprobantes y el
            estado de cada pago.
          </p>
        </div>
        <Link href="/#sorteos" className={buttonVariants()}>
          Explorar sorteos
        </Link>
      </CardContent>
    </Card>
  );
}

function PaymentCard({ payment }: { payment: PaymentRow }) {
  const variant = STATUS_VARIANT[payment.status] ?? "secondary";

  return (
    <Card className="transition hover:shadow-md">
      <CardHeader className="pb-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="text-base">
            {payment.raffles?.title ?? "Sorteo"}
          </CardTitle>
          <Badge variant={variant}>
            {STATUS_LABEL[payment.status] ?? payment.status}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-2 text-sm text-muted-foreground">
        <p className="flex items-center gap-2">
          <Receipt className="h-4 w-4" />
          {formatDateTime(payment.created_at)}
        </p>
        <p>
          Números:{" "}
          <span className="font-medium text-foreground">
            {payment.numbers.map((n) => formatNumber(n)).join(", ")}
          </span>
        </p>
        <p className="text-base font-bold text-foreground">
          {formatPrice(Number(payment.amount))}
        </p>
      </CardContent>
    </Card>
  );
}
