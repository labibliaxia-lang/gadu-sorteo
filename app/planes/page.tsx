import Link from "next/link";
import { Check, Crown, KeyRound, MessageCircle, Ticket } from "lucide-react";

import { createClient } from "@/lib/supabase/server";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { RedeemCodeForm } from "@/components/RedeemCodeForm";
import { PLAN_BENEFITS, PLAN_LIMITS, normalizePlan } from "@/lib/plans";
import { waLink } from "@/lib/superadmin";
import { cn, formatDateTime, formatPrice } from "@/lib/utils";
import type { Plan } from "@/lib/types";

export const dynamic = "force-dynamic";

const PLANS: Plan[] = ["organizador", "pro", "premium", "social"];

interface PlanPriceRow {
  plan: Plan;
  price_ars: number | string;
}

export default async function PlanesPage() {
  const supabase = createClient();
  const salesWhatsapp = process.env.NEXT_PUBLIC_SALES_WHATSAPP?.trim() || null;

  // Precios: lectura pública (RLS de 0032). Si la migración no está aplicada,
  // la página sigue funcionando y muestra «consultar».
  const { data: priceRows } = await supabase
    .from("plan_prices")
    .select("plan, price_ars");

  const priceByPlan = new Map<string, number>(
    ((priceRows ?? []) as PlanPriceRow[]).map((row) => [
      row.plan,
      Number(row.price_ars),
    ]),
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: profile } = user
    ? await supabase
        .from("profiles")
        .select("plan, plan_expires_at, role_expires_at, full_name")
        .eq("id", user.id)
        .single()
    : { data: null };

  const { data: redeemed } = user
    ? await supabase
        .from("license_codes")
        .select("code, plan, redeemed_at")
        .eq("redeemed_by", user.id)
        .order("redeemed_at", { ascending: false })
        .limit(10)
    : { data: null };

  const currentPlan = normalizePlan(profile?.plan);
  const premiumUntil = profile?.plan_expires_at
    ? formatDateTime(profile.plan_expires_at)
    : null;
  const organizerUntil = profile?.role_expires_at
    ? formatDateTime(profile.role_expires_at)
    : null;

  function salesHref(plan: Plan): string | null {
    const price = priceByPlan.get(plan) ?? 0;
    const priceText = price > 0 ? formatPrice(price) : "a convenir";
    const msg = `Hola! Quiero contratar el plan ${
      PLAN_LIMITS[plan].label
    } de Gadu Sorteos (${priceText} por mes)${
      profile?.full_name ? `. Mi nombre es ${profile.full_name}` : ""
    }.`;
    return waLink(salesWhatsapp, msg);
  }

  return (
    <div className="mx-auto max-w-4xl space-y-10">
      <header className="space-y-3 text-center">
        <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-brand-800 dark:text-brand-300">
          Organizadores
        </p>
        <h1 className="font-display text-[2.2rem] font-semibold leading-tight tracking-[-0.03em]">
          Planes para organizadores
        </h1>
        <p className="mx-auto max-w-xl text-[13px] text-fg-subtle">
          Publicá tus sorteos con tu cuenta. Pagás por mes y, si preferís otro
          esquema, la comisión se acuerda por WhatsApp.
        </p>
        {user && (
          <div className="flex flex-wrap items-center justify-center gap-2 pt-1">
            {currentPlan === "premium" ? (
              <Badge variant="secondary">
                <Crown className="mr-1 h-3.5 w-3.5" />
                Plan Premium activo
                {premiumUntil ? ` hasta ${premiumUntil}` : ""}
              </Badge>
            ) : (
              <Badge variant="secondary">Plan Organizador</Badge>
            )}
            {organizerUntil && (
              <span className="text-xs text-muted-foreground">
                Acceso de organizador hasta {organizerUntil}
              </span>
            )}
          </div>
        )}
      </header>

      <section className="grid gap-5 md:grid-cols-2">
        {PLANS.map((plan) => {
          const limits = PLAN_LIMITS[plan];
          const price = priceByPlan.get(plan) ?? 0;
          const href = salesHref(plan);
          const isPremium = plan === "premium";

          return (
            <Card
              key={plan}
              className={cn(
                "flex flex-col",
                isPremium && "border-hairline-strong",
              )}
            >
              <CardHeader className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <CardTitle className="text-xl">{limits.label}</CardTitle>
                  {isPremium && <Badge variant="secondary">Recomendado</Badge>}
                </div>
                <p className="text-[13px] text-fg-subtle">
                  {limits.description}
                </p>
                <div className="pt-2">
                  <p className="font-mono text-[11px] uppercase tracking-[0.1em] text-fg-subtle">
                    Precio mensual
                  </p>
                  <p className="mt-1 font-mono text-2xl font-medium tracking-tight text-fg">
                    {price > 0 ? (
                      <>
                        {formatPrice(price)}
                        <span className="ml-1 font-normal text-fg-subtle">
                          / mes
                        </span>
                      </>
                    ) : (
                      "A convenir"
                    )}
                  </p>
                </div>
              </CardHeader>

              <CardContent className="flex flex-1 flex-col gap-5">
                <ul className="space-y-2 text-[13px]">
                  {PLAN_BENEFITS[plan].map((benefit) => (
                    <li key={benefit} className="flex items-start gap-2">
                      <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />
                      {benefit}
                    </li>
                  ))}
                </ul>

                <div className="mt-auto space-y-2">
                  {href ? (
                    <a
                      href={href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={cn(buttonVariants(), "w-full")}
                    >
                      <MessageCircle className="mr-1.5 h-4 w-4" />
                      {plan === "social"
                        ? "Solo por contacto"
                        : "Contratar por WhatsApp"}
                    </a>
                  ) : (
                    <Link
                      href="/ayuda"
                      className={cn(buttonVariants(), "w-full")}
                    >
                      <MessageCircle className="mr-1.5 h-4 w-4" />
                      Hablar con ventas
                    </Link>
                  )}
                  <p className="text-center text-[12px] text-fg-subtle">
                    {plan === "social"
                      ? "El Plan Social lo asigna el equipo desde soporte. No hay autoservicio."
                      : "Prepago manual: transferís, mandás el comprobante y te entregamos el código de 30 días."}
                  </p>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </section>

      <section className="rounded-xl border border-hairline bg-panel-1/50 p-5">
        <h2 className="text-lg font-semibold">
          ¿Preferís pagar por comisión?
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          También trabajamos por comisión sobre las ventas, a convenir con cada
          organizador. La comisión se acuerda por WhatsApp y se factura aparte;
          no se descuenta automáticamente de los cobros del sorteo.
        </p>
        {salesWhatsapp && (
          <a
            href={
              waLink(
                salesWhatsapp,
                "Hola! Quiero consultar por el esquema de comisión de Gadu Sorteos.",
              ) ?? "#"
            }
            target="_blank"
            rel="noopener noreferrer"
            className={cn(buttonVariants({ variant: "outline" }), "mt-4")}
          >
            <MessageCircle className="mr-1.5 h-4 w-4" />
            Consultar por comisión
          </a>
        )}
      </section>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <KeyRound className="h-5 w-5 text-amber-500" />
            ¿Ya compraste? Canjeá tu código
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            Pegá el código de activación de 25 caracteres que te enviamos. Cada
            código suma 30 días.
          </p>
        </CardHeader>
        <CardContent>
          {user ? (
            <RedeemCodeForm />
          ) : (
            <Link
              href="/login?next=/planes"
              className={buttonVariants({ variant: "outline" })}
            >
              Iniciá sesión para canjear
            </Link>
          )}
        </CardContent>
      </Card>

      {user && (
        <section className="space-y-3">
          <h2 className="text-lg font-semibold">Mis códigos canjeados</h2>

          {redeemed && redeemed.length > 0 ? (
            <div className="space-y-2">
              {redeemed.map((item) => (
                <div
                  key={item.code}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-xl border p-3"
                >
                  <code className="break-all font-mono text-xs sm:text-sm">
                    {item.code}
                  </code>
                  <div className="flex items-center gap-2">
                    <Badge variant="success" className="capitalize">
                      {item.plan}
                    </Badge>
                    <span className="text-xs text-muted-foreground">
                      {item.redeemed_at
                        ? new Date(item.redeemed_at).toLocaleDateString("es-AR")
                        : ""}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">
              Todavía no canjeaste ningún código.
            </p>
          )}
        </section>
      )}
    </div>
  );
}
