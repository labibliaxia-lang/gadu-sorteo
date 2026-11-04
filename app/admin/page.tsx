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
import { OrganizerOnboarding } from "@/components/OrganizerOnboarding";
import { AdvancedAnalytics } from "@/components/admin/AdvancedAnalytics";
import { PremiumGate } from "@/components/admin/PremiumGate";
import { EmptyState } from "@/components/ui/empty-state";
import { getPlanContext } from "@/lib/plans";
import { formatDateTime, formatPrice } from "@/lib/utils";
import type { Raffle } from "@/lib/types";

export const dynamic = "force-dynamic";

const statusLabel: Record<Raffle["status"], string> = {
  active: "Activo",
  closed: "Cerrado",
  drawn: "Sorteado",
  cancelled: "Cancelado",
};

const statusVariant: Record<
  Raffle["status"],
  "success" | "warning" | "secondary"
> = {
  active: "success",
  closed: "warning",
  drawn: "secondary",
  cancelled: "secondary",
};

export default async function AdminDashboardPage() {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, plan")
    .eq("id", user.id)
    .single();
  const isSuper = profile?.role === "superadmin";
  const planContext = getPlanContext(profile);

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

  // Vendidos por sorteo (para habilitar «Sortear» solo si hay al menos uno).
  const soldByRaffle = new Map<string, number>();
  if (list.length > 0) {
    const entries = await Promise.all(
      list.map(async (raffle) => {
        const { count } = await supabase
          .from("raffle_numbers")
          .select("*", { count: "exact", head: true })
          .eq("raffle_id", raffle.id)
          .eq("status", "sold");
        return [raffle.id, count ?? 0] as const;
      }),
    );
    for (const [id, count] of entries) soldByRaffle.set(id, count);
  }

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
      {/* Tutorial de bienvenida: solo organizadores sin sorteos, una vez. */}
      <OrganizerOnboarding
        userId={user.id}
        show={profile?.role === "admin" && list.length === 0}
      />

      {/* Tarjetas de resumen */}
      <div className="grid gap-px overflow-hidden rounded-xl border border-hairline bg-hairline sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((s) => (
          <div key={s.label} className="bg-panel-1 p-5">
            <div className="flex items-center justify-between gap-2">
              <p className="font-mono text-[11px] uppercase tracking-[0.1em] text-fg-subtle">
                {s.label}
              </p>
              <s.icon className="h-4 w-4 text-fg-faint" aria-hidden="true" />
            </div>
            <p className="mt-4 font-mono text-2xl font-medium tracking-tight text-fg">
              {s.value}
            </p>
          </div>
        ))}
      </div>

      {/* Analíticas avanzadas (exclusivo del plan Premium) */}
      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-display text-2xl font-semibold tracking-tight">
            Analíticas avanzadas
          </h2>
          <Badge variant={planContext.isPremium ? "success" : "secondary"}>
            Plan {planContext.limits.label}
          </Badge>
        </div>

        <PremiumGate
          plan={planContext.plan}
          feature="Analíticas Avanzadas"
          description="Gráficos de tendencia, ticket promedio, tasa de aprobación y exportación a CSV. Disponible con el plan Premium."
        >
          <AdvancedAnalytics planLabel={`Plan ${planContext.limits.label}`} />
        </PremiumGate>
      </section>

      {/* Lista de sorteos */}
      <div className="space-y-4">
        <h2 className="font-display text-2xl font-semibold tracking-tight">
          Sorteos
        </h2>

        {list.length === 0 ? (
          <EmptyState
            icon={Wrench}
            title="Todavía no creaste ningún sorteo"
            description="Creá el primero para empezar a vender números: definís el premio, el precio y la fecha."
            action={
              <Link
                href="/admin/sorteos/nuevo"
                className={buttonVariants({ variant: "outline" })}
              >
                Crear el primero
              </Link>
            }
          />
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
                  <div className="flex flex-wrap gap-x-6 gap-y-1 font-mono text-[12px] text-fg-subtle">
                    <span className="flex items-center gap-1.5">
                      <Coins className="h-4 w-4" aria-hidden="true" />
                      {formatPrice(Number(raffle.price_per_number))}
                    </span>
                    <span className="flex items-center gap-1.5">
                      <CalendarDays className="h-4 w-4" aria-hidden="true" />
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
                    <RaffleActions
                      raffleId={raffle.id}
                      status={raffle.status}
                      drawDate={raffle.draw_date}
                      autoDraw={Boolean(raffle.auto_draw)}
                      hasCommitment={Boolean(raffle.draw_commitment)}
                      soldCount={soldByRaffle.get(raffle.id) ?? 0}
                    />
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
