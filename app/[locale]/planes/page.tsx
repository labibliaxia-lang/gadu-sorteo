import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
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
import { normalizePlan } from "@/lib/plans";
import { waLink } from "@/lib/superadmin";
import { createAdminClient } from "@/lib/supabase/admin";
import { PlanCurrencySelect } from "@/components/PlanCurrencySelect";
import { cn, formatDateTime, formatPriceIn } from "@/lib/utils";
import type { Plan } from "@/lib/types";

export const dynamic = "force-dynamic";

const PLANS: Plan[] = ["free", "organizador", "pro", "premium", "social"];

const PLAN_KEYS: Record<
  Plan,
  { name: string; description: string; benefits: string[] }
> = {
  free: {
    name: "planFreeName",
    description: "planFreeDescription",
    benefits: [
      "planFreeBenefit1",
      "planFreeBenefit2",
      "planFreeBenefit3",
      "planFreeBenefit4",
    ],
  },
  organizador: {
    name: "planStarterName",
    description: "planStarterDescription",
    benefits: [
      "planStarterBenefit1",
      "planStarterBenefit2",
      "planStarterBenefit3",
      "planStarterBenefit4",
    ],
  },
  pro: {
    name: "planProName",
    description: "planProDescription",
    benefits: [
      "planProBenefit1",
      "planProBenefit2",
      "planProBenefit3",
      "planProBenefit4",
    ],
  },
  premium: {
    name: "planPremiumName",
    description: "planPremiumDescription",
    benefits: [
      "planPremiumBenefit1",
      "planPremiumBenefit2",
      "planPremiumBenefit3",
      "planPremiumBenefit4",
      "planPremiumBenefit5",
    ],
  },
  social: {
    name: "planSocialName",
    description: "planSocialDescription",
    benefits: [
      "planSocialBenefit1",
      "planSocialBenefit2",
      "planSocialBenefit3",
      "planSocialBenefit4",
    ],
  },
};

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Planes");
  return {
    title: t("metaTitle"),
    description: t("metaDescription"),
  };
}

interface PlanConfigRow {
  plan_name: Plan;
  label: string;
  price_usd: number | string;
  price_ars: number | string;
  price_mxn: number | string;
  price_cop: number | string;
  price_clp: number | string;
  max_raffles: number;
  max_numbers: number;
}

const MONEDAS = ["USD", "ARS", "MXN", "COP", "CLP"] as const;
type Moneda = (typeof MONEDAS)[number];

export default async function PlanesPage({
  searchParams,
}: {
  searchParams?: { currency?: string };
}) {
  const t = await getTranslations("Planes");
  const supabase = createClient();
  const salesWhatsapp = process.env.NEXT_PUBLIC_SALES_WHATSAPP?.trim() || null;
  const moneda: Moneda = MONEDAS.includes(
    (searchParams?.currency ?? "").toUpperCase() as Moneda,
  )
    ? ((searchParams?.currency ?? "").toUpperCase() as Moneda)
    : "USD";

  // Precios y límites: fuente única `plan_configs` (donde los edita el
  // Superadmin). Se lee con service role en el servidor y solo se renderizan
  // datos públicos; la tabla no es legible por anon.
  const admin = createAdminClient();
  const { data: configRows } = await admin
    .from("plan_configs")
    .select(
      "plan_name, label, price_usd, price_ars, price_mxn, price_cop, price_clp, max_raffles, max_numbers",
    );

  const configByPlan = new Map<string, PlanConfigRow>(
    ((configRows ?? []) as PlanConfigRow[]).map((row) => [row.plan_name, row]),
  );

  const priceByPlan = new Map<string, number>(
    [...configByPlan.entries()].map(([plan, row]) => [
      plan,
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
    const cfg = configByPlan.get(plan);
    const usd = Number(cfg?.price_usd ?? 0);
    const ars = Number(cfg?.price_ars ?? 0);
    const precio =
      usd > 0
        ? t("pricePerMonth", { price: formatPriceIn(usd, "USD") })
        : ars > 0
          ? t("pricePerMonth", { price: formatPriceIn(ars, "ARS") })
          : t("priceByAgreement");
    const msg = t("planMessage", {
      plan: t(PLAN_KEYS[plan].name),
      price: precio,
      name: profile?.full_name
        ? t("planMessageName", { name: profile.full_name })
        : "",
    });
    return waLink(salesWhatsapp, msg);
  }

  return (
    <div className="mx-auto max-w-4xl space-y-10">
      <header className="space-y-3 text-center">
        <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-brand-800 dark:text-brand-300">
          {t("eyebrow")}
        </p>
        <h1 className="font-display text-[2.2rem] font-semibold leading-tight tracking-[-0.03em]">
          {t("title")}
        </h1>
        <p className="mx-auto max-w-xl text-[13px] text-fg-subtle">
          {t("description")}
        </p>
        {user && (
          <div className="flex flex-wrap items-center justify-center gap-2 pt-1">
            {currentPlan === "premium" ? (
              <Badge variant="secondary">
                <Crown className="mr-1 h-3.5 w-3.5" />
                {premiumUntil
                  ? t("premiumUntil", { date: premiumUntil })
                  : t("premiumActive")}
              </Badge>
            ) : (
              <Badge variant="secondary">{t("organizerPlan")}</Badge>
            )}
            {organizerUntil && (
              <span className="text-xs text-muted-foreground">
                {t("organizerAccessUntil", { date: organizerUntil })}
              </span>
            )}
          </div>
        )}
      </header>

      <div className="flex justify-end">
        <PlanCurrencySelect actual={moneda} />
      </div>

      <section className="grid gap-5 md:grid-cols-2">
        {PLANS.map((plan) => {
          const planCopy = PLAN_KEYS[plan];
          const cfg = configByPlan.get(plan);
          const usd = Number(cfg?.price_usd ?? 0);
          const ars = Number(cfg?.price_ars ?? 0);
          const precioLocal =
            moneda === "USD"
              ? usd
              : Number(
                  cfg?.[`price_${moneda.toLowerCase()}` as keyof PlanConfigRow] ??
                    0,
                );
          const href = salesHref(plan);
          const isPremium = plan === "premium";
          const esGratis = usd <= 0 && ars <= 0;

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
                  <CardTitle className="text-xl">
                    {t(planCopy.name)}
                  </CardTitle>
                  {isPremium && (
                    <Badge variant="secondary">{t("recommended")}</Badge>
                  )}
                </div>
                <p className="text-[13px] text-fg-subtle">
                  {t(planCopy.description)}
                </p>
                <div className="pt-2">
                  <p className="font-mono text-[11px] uppercase tracking-[0.1em] text-fg-subtle">
                    {t("monthlyPrice")}
                  </p>
                  <p className="mt-1 font-mono text-2xl font-medium tracking-tight text-fg">
                    {esGratis ? (
                      t("free")
                    ) : (
                      <>
                        {formatPriceIn(precioLocal, moneda)}
                        <span className="ml-1 font-normal text-fg-subtle">
                          {t("perMonth")}
                        </span>
                      </>
                    )}
                  </p>
                  {!esGratis && moneda !== "USD" && (
                    <p className="text-[11px] text-fg-subtle">
                      {t("basePrice", { price: formatPriceIn(usd, "USD") })}
                    </p>
                  )}
                  {!esGratis && moneda === "USD" && ars > 0 && (
                    <p className="text-[11px] text-fg-subtle">
                      {t("equalsPrice", { price: formatPriceIn(ars, "ARS") })}
                    </p>
                  )}
                </div>
              </CardHeader>

              <CardContent className="flex flex-1 flex-col gap-5">
                <ul className="space-y-2 text-[13px]">
                  {planCopy.benefits.map((benefit) => (
                    <li key={benefit} className="flex items-start gap-2">
                      <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />
                      {t(benefit)}
                    </li>
                  ))}
                </ul>

                <div className="mt-auto space-y-2">
                  {plan === "free" ? (
                    <Link
                      href="/register"
                      className={cn(buttonVariants(), "w-full")}
                    >
                      {t("startFree")}
                    </Link>
                  ) : href ? (
                    <a
                      href={href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={cn(buttonVariants(), "w-full")}
                    >
                      <MessageCircle className="mr-1.5 h-4 w-4" />
                      {plan === "social"
                        ? t("contactOnly")
                        : t("hireWhatsapp")}
                    </a>
                  ) : (
                    <Link
                      href="/ayuda"
                      className={cn(buttonVariants(), "w-full")}
                    >
                      <MessageCircle className="mr-1.5 h-4 w-4" />
                      {t("talkToSales")}
                    </Link>
                  )}
                  <p className="text-center text-[12px] text-fg-subtle">
                    {plan === "free"
                      ? t("freeNote")
                      : plan === "social"
                        ? t("socialNote")
                        : t("paidNote")}
                  </p>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </section>

      <section className="rounded-xl border border-hairline bg-panel-1/50 p-5">
        <h2 className="text-lg font-semibold">{t("commissionTitle")}</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {t("commissionDescription")}
        </p>
        {salesWhatsapp && (
          <a
            href={
              waLink(salesWhatsapp, t("commissionWhatsapp")) ?? "#"
            }
            target="_blank"
            rel="noopener noreferrer"
            className={cn(buttonVariants({ variant: "outline" }), "mt-4")}
          >
            <MessageCircle className="mr-1.5 h-4 w-4" />
            {t("commissionCta")}
          </a>
        )}
      </section>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <KeyRound className="h-5 w-5 text-amber-500" />
            {t("redeemTitle")}
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            {t("redeemDescription")}
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
              {t("loginToRedeem")}
            </Link>
          )}
        </CardContent>
      </Card>

      {user && (
        <section className="space-y-3">
          <h2 className="text-lg font-semibold">{t("myCodes")}</h2>

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
              {t("noCodes")}
            </p>
          )}
        </section>
      )}
    </div>
  );
}
