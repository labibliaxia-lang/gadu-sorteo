"use client";

import { useEffect, useState } from "react";

import { createClient } from "@/lib/supabase/client";
import { Badge } from "@/components/ui/badge";
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

const statusLabel: Record<string, string> = {
  pending: "Pendiente",
  approved: "Aprobado",
  rejected: "Rechazado",
  cancelled: "Cancelado",
  expired: "Expirado",
};

const statusVariant: Record<string, "warning" | "success" | "destructive" | "secondary"> = {
  pending: "warning",
  approved: "success",
  rejected: "destructive",
  cancelled: "secondary",
  expired: "secondary",
};

export default function MisPagosPage() {
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
        .select("id, raffle_id, numbers, amount, status, created_at, raffles(title)")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });

      setPayments((data as unknown as PaymentRow[]) ?? []);
      setLoading(false);
    }
    load();
  }, [supabase]);

  if (loading) return <p className="text-muted-foreground">Cargando…</p>;

  if (payments.length === 0) {
    return (
      <p className="py-16 text-center text-muted-foreground">
        Todavía no tenés pagos registrados.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Mis pagos</h1>
      <div className="grid gap-4">
        {payments.map((p) => (
          <Card key={p.id}>
            <CardHeader className="flex-row items-center justify-between space-y-0">
              <CardTitle className="text-base">
                {p.raffles?.title ?? "Sorteo"}
              </CardTitle>
              <Badge variant={statusVariant[p.status] ?? "secondary"}>
                {statusLabel[p.status] ?? p.status}
              </Badge>
            </CardHeader>
            <CardContent className="space-y-1 text-sm text-muted-foreground">
              <p>
                Números:{" "}
                {p.numbers.map((n) => formatNumber(n)).join(", ")}
              </p>
              <p className="text-foreground">{formatPrice(Number(p.amount))}</p>
              <p>{formatDateTime(p.created_at)}</p>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
