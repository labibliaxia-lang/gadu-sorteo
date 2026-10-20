import Link from "next/link";
import { redirect } from "next/navigation";
import {
  BarChart3,
  CalendarDays,
  Coins,
  Eye,
  Gift,
  Plus,
  Settings,
  Ticket,
  Wrench,
} from "lucide-react";

import { createClient } from "@/lib/supabase/server";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { RaffleActions } from "@/components/RaffleActions";
import { formatDateTime, formatPrice } from "@/lib/utils";
import type { Raffle } from "@/lib/types";

export const dynamic = "force-dynamic";

const statusLabel: Record<Raffle["status"], string> = {
  active: "Activo",
  closed: "Cerrado",
  drawn: "Sorteado",
};

const statusVariant: Record<
  Raffle["status"],
  "success" | "warning" | "secondary"
> = {
  active: "success",
  closed: "warning",
  drawn: "secondary",
};

export default async function AdminDashboardPage() {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  const isSuper = profile?.role === "superadmin";

  let rafflesQuery = supabase
    .from("raffles")
    .select("*")
    .order("created_at", { ascending: false });

  // Organizadores: solo sus propios sorteos; superadmin: todos.
  if (!isSuper) rafflesQuery = rafflesQuery.eq("created_by", user.id);

  const { data: raffles } = await rafflesQuery;

  const list = (raffles as Raffle[]) ?? [];
  const activeCount = list.filter((r) => r.status === "active").length;
  const raffleIds = list.map((r) => r.id);

  // Métricas: globales para superadmin; acotadas al organizador.
  let soldCount = 0;
  let revenue = 0;
  const scoped = !isSuper && raffleIds.length > 0;
  if (isSuper || scoped) {
    let soldQuery = supabase
      .from("raffle_numbers")
      .select("*", { count: "exact", head: true })
      .eq("status", "sold");
    let paymentsQuery = supabase
      .from("payments")
      .select("amount")
      .eq("status", "approved");

    if (scoped) {
      soldQuery = soldQuery.in("raffle_id", raffleIds);
      paymentsQuery = paymentsQuery.in("raffle_id", raffleIds);
    }

    const [soldRes, paymentsRes] = await Promise.all([
      soldQuery,
      paymentsQuery,
    ]);

    soldCount = soldRes.count ?? 0;
    revenue = (paymentsRes.data ?? []).reduce(
      (sum, p) => sum + Number(p.amount),
      0,
    );
  }

  const stats = [
    { icon: BarChart3, label: "Total de sorteos", value: String(list.length) },
    { icon: Ticket, label: "Sorteos activos", value: String(activeCount) },
    { icon: Coins, label: "Recaudación estimada", value: formatPrice(revenue) },
    { icon: Wrench, label: "Números vendidos", value: String(soldCount ?? 0) },
  ];

  return (
    <div className="space-y-8">
      {/* Tarjetas de resumen */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((s) => (
          <Card key={s.label}>
            <CardContent className="flex items-center gap-3 p-4">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-amber-500 to-orange-600 text-white">
                <s.icon className="h-5 w-5" />
              </span>
              <div className="min-w-0">
                <p className="truncate text-sm text-muted-foreground">
                  {s.label}
                </p>
                <p className="truncate text-xl font-bold">{s.value}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Lista de sorteos */}
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-xl font-semibold">Sorteos</h2>
          <Link
            href="/admin/sorteos/nuevo"
            className={buttonVariants({ size: "sm" })}
          >
            <Plus className="mr-1.5 h-4 w-4" />
            Nuevo sorteo
          </Link>
        </div>

        {list.length === 0 ? (
          <Card className="border-dashed text-center">
            <CardContent className="space-y-3 py-12">
              <Wrench className="mx-auto h-10 w-10 text-muted-foreground" />
              <p className="text-muted-foreground">
                Todavía no creaste ningún sorteo.
              </p>
              <Link
                href="/admin/sorteos/nuevo"
                className={buttonVariants()}
              >
                Crear el primero
              </Link>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {list.map((raffle) => (
              <Card key={raffle.id}>
                <CardHeader className="pb-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <CardTitle className="text-lg">{raffle.title}</CardTitle>
                    <Badge variant={statusVariant[raffle.status]}>
                      {statusLabel[raffle.status]}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm text-muted-foreground">
                    <span className="flex items-center gap-1.5">
                      <Coins className="h-4 w-4" />
                      {formatPrice(Number(raffle.price_per_number))}
                    </span>
                    <span className="flex items-center gap-1.5">
                      <CalendarDays className="h-4 w-4" />
                      {formatDateTime(raffle.draw_date)}
                    </span>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <Link
                      href={`/sorteos/${raffle.id}`}
                      className={buttonVariants({
                        variant: "outline",
                        size: "sm",
                      })}
                    >
                      <Eye className="mr-1.5 h-4 w-4" />
                      Ver
                    </Link>
                    <Link
                      href={`/admin/sorteos/${raffle.id}`}
                      className={buttonVariants({
                        variant: "outline",
                        size: "sm",
                      })}
                    >
                      <Settings className="mr-1.5 h-4 w-4" />
                      Gestionar
                    </Link>
                    <Link
                      href={`/admin/sorteos/${raffle.id}/premios`}
                      className={buttonVariants({
                        variant: "outline",
                        size: "sm",
                      })}
                    >
                      <Gift className="mr-1.5 h-4 w-4" />
                      Premios
                    </Link>
                    <RaffleActions raffleId={raffle.id} status={raffle.status} />
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
