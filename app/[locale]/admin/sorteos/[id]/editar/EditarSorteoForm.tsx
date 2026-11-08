"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  AlignLeft,
  CalendarDays,
  Coins,
  CreditCard,
  Landmark,
  MessageCircle,
  Type,
  Wallet,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { useRouter } from "@/src/i18n/navigation";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ImageUploader } from "@/components/ImageUploader";
import { cn, formatDateTime } from "@/lib/utils";
import { updateRaffle } from "@/app/[locale]/admin/sorteos/[id]/actions";
import type { Raffle } from "@/lib/types";

const schema = z.object({
  title: z.string().min(3, "El título debe tener al menos 3 caracteres"),
  description: z.string().optional(),
  draw_date: z.string().min(1, "La fecha del sorteo es obligatoria"),
  price_per_number: z.coerce.number().positive("El precio debe ser mayor a 0"),
  payment_type: z.enum(["mercadopago", "transferencia"]),
  min_tickets_required: z.coerce.number().int().min(0).max(10000),
  if_not_met: z.enum(["extend_date", "cancel_and_refund"]),
  winners_count: z.coerce.number().int().min(1).max(30),
  // 0102: "Invitá y ganá" lo decide el organizador, sorteo por sorteo.
  referral_enabled: z.boolean().optional(),
  referral_min_numbers: z.coerce.number().int().min(1).max(1000).optional(),
  referral_require_buyer_min: z.coerce.number().int().min(0).max(1000).optional(),
  referral_max_per_user: z.coerce.number().int().min(0).max(1000).optional(),
  bonus_raffle_id: z.string().optional(),
  transfer_alias: z.string().optional(),
  transfer_cbu: z.string().optional(),
  transfer_bank: z.string().optional(),
  whatsapp_contact: z.string().optional(),
}).superRefine((data, ctx) => {
  if (data.payment_type !== "transferencia") return;

  const alias = data.transfer_alias?.trim();
  const cbu = data.transfer_cbu?.trim();

  if (!alias && !cbu) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["transfer_alias"],
      message: "Cargá un alias o un CBU: sin eso nadie puede transferirte.",
    });
  }

  const whatsapp = (data.whatsapp_contact ?? "").replace(/\D/g, "");
  if (whatsapp.length < 8) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["whatsapp_contact"],
      message: "El WhatsApp es obligatorio: por ahí recibís el comprobante.",
    });
  }
});

type FormValues = z.infer<typeof schema>;

function toLocalInput(iso: string): string {
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(
    d.getHours(),
  )}:${p(d.getMinutes())}`;
}

export function EditarSorteoForm({
  raffle,
  sorteosBonus = [],
  basesSugeridas = "",
}: {
  raffle: Raffle;
  sorteosBonus?: { id: string; title: string }[];
  basesSugeridas?: string;
}) {
  const t = useTranslations("AdminSorteosForm");
  const locale = useLocale();
  const router = useRouter();

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [termsAccepted, setTermsAccepted] = useState(
    raffle.terms_accepted_by_organizer ?? false,
  );
  const [coverUrl, setCoverUrl] = useState<string | null>(
    raffle.cover_image_url ?? null,
  );

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      title: raffle.title,
      description: raffle.description ?? "",
      price_per_number: Number(raffle.price_per_number),
      draw_date: raffle.draw_date ? toLocalInput(raffle.draw_date) : "",
      payment_type: raffle.payment_type ?? "mercadopago",
      transfer_alias: raffle.transfer_alias ?? "",
      transfer_cbu: raffle.transfer_cbu ?? "",
      transfer_bank: raffle.transfer_bank ?? "",
      whatsapp_contact: raffle.whatsapp_contact ?? "",
      min_tickets_required: raffle.min_tickets_required ?? 0,
      if_not_met: raffle.if_not_met ?? "extend_date",
      winners_count: raffle.winners_count ?? 1,
      referral_enabled: raffle.referral_enabled ?? false,
      referral_min_numbers: raffle.referral_min_numbers ?? 1,
      referral_require_buyer_min: raffle.referral_require_buyer_min ?? 0,
      referral_max_per_user: raffle.referral_max_per_user ?? 0,
      bonus_raffle_id: raffle.bonus_raffle_id ?? "",
    },
  });

  const paymentType = watch("payment_type");
  const referralEnabled = watch("referral_enabled");

  async function onSubmit(values: FormValues) {
    setSaving(true);
    setError(null);

    if (!termsAccepted) {
      setError(
        t("errors.acceptTermsSave"),
      );
      setSaving(false);
      return;
    }

    const res = await updateRaffle(raffle.id, {
      ...values,
      cover_image_url: coverUrl,
      bonus_raffle_id: values.bonus_raffle_id ? values.bonus_raffle_id : null,
      terms_accepted_by_organizer: true,
      player_terms_text: raffle.player_terms_text || basesSugeridas || null,
    });

    if (!res.ok) {
      setError(res.error ?? t("errors.saveFailed"));
      setSaving(false);
      return;
    }

    router.push(`/admin/sorteos/${raffle.id}`);
    router.refresh();
  }

  return (
    <div className="mx-auto max-w-xl">
      <Card>
        <CardHeader>
          <CardTitle>{t("editTitle")}</CardTitle>
          <p className="text-sm text-muted-foreground">
            {t("editHint")}
          </p>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
            <div className="space-y-2">
              <Label>{t("cover.label")}</Label>
              <ImageUploader value={coverUrl} onChange={setCoverUrl} />
            </div>

            <div className="space-y-2">
              <Label htmlFor="title">{t("fields.title")}</Label>
              <div className="relative">
                <Type className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input id="title" className="pl-9" {...register("title")} />
              </div>
              {errors.title && (
                <p className="text-sm text-destructive">
                  {errors.title.message}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">{t("fields.description")}</Label>
              <div className="relative">
                <AlignLeft className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <Textarea
                  id="description"
                  className="pl-9"
                  {...register("description")}
                />
              </div>
            </div>

            <div className="grid gap-4 rounded-xl border bg-muted/20 p-4 sm:grid-cols-3">
              <div className="space-y-2">
                <Label htmlFor="min_tickets_required">
                  {t("fields.minTicketsRequired")}
                </Label>
                <Input
                  id="min_tickets_required"
                  type="number"
                  min={0}
                  max={10000}
                  {...register("min_tickets_required")}
                />
                {errors.min_tickets_required && (
                  <p className="text-sm text-destructive">
                    {errors.min_tickets_required.message}
                  </p>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="winners_count">{t("fields.winnersCount")}</Label>
                <Input
                  id="winners_count"
                  type="number"
                  min={1}
                  max={30}
                  {...register("winners_count")}
                />
                {errors.winners_count && (
                  <p className="text-sm text-destructive">
                    {errors.winners_count.message}
                  </p>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="if_not_met">{t("fields.ifNotMet")}</Label>
                <select
                  id="if_not_met"
                  className="h-10 w-full rounded-lg border border-border bg-card px-3 text-sm"
                  {...register("if_not_met")}
                >
                  <option value="extend_date">{t("fields.ifNotMetExtend")}</option>
                  <option value="cancel_and_refund">
                    {t("fields.ifNotMetCancel")}
                  </option>
                </select>
              </div>
              <p className="text-xs text-muted-foreground sm:col-span-3">
                {t("fields.minRuleHint")}
              </p>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="price_per_number">{t("fields.pricePerNumber")}</Label>
                <div className="relative">
                  <Coins className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    id="price_per_number"
                    type="number"
                    step="0.01"
                    min="0"
                    className="pl-9"
                    {...register("price_per_number")}
                  />
                </div>
                {errors.price_per_number && (
                  <p className="text-sm text-destructive">
                    {errors.price_per_number.message}
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="draw_date">{t("fields.drawDate")}</Label>
                {raffle.status === "active" ? (
                  <>
                    <div className="rounded-md border border-input bg-muted px-3 py-2 font-mono text-sm">
                      {formatDateTime(raffle.draw_date, locale)}
                    </div>
                    {/* La fecha viaja igual: con el sorteo en venta no se toca. */}
                    <input type="hidden" {...register("draw_date")} />
                    <p className="text-xs text-muted-foreground">
                      {t("fields.drawDateFixedHint")}
                    </p>
                  </>
                ) : (
                  <div className="relative">
                    <CalendarDays className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      id="draw_date"
                      type="datetime-local"
                      className="pl-9"
                      {...register("draw_date")}
                    />
                  </div>
                )}
                {errors.draw_date && (
                  <p className="text-sm text-destructive">
                    {errors.draw_date.message}
                  </p>
                )}
              </div>
            </div>

            {/* Método de pago */}
            <div className="space-y-3">
              <Label>{t("payment.title")}</Label>

              <div className="grid gap-3 sm:grid-cols-2">
                <label
                  className={cn(
                    "cursor-pointer rounded-xl border-2 p-4 transition",
                    paymentType === "mercadopago"
                      ? "border-amber-500 bg-amber-500/5"
                      : "border-slate-300 hover:border-slate-400 dark:border-slate-700",
                  )}
                >
                  <input
                    type="radio"
                    value="mercadopago"
                    className="sr-only"
                    {...register("payment_type")}
                  />
                  <div className="flex items-start gap-3">
                    <CreditCard className="mt-0.5 h-5 w-5 shrink-0 text-amber-500" />
                    <div className="space-y-0.5">
                      <p className="font-semibold">{t("payment.mercadoPago")}</p>
                      <p className="text-xs text-muted-foreground">
                        {t("payment.mercadoPagoSub")}
                      </p>
                    </div>
                  </div>
                </label>

                <label
                  className={cn(
                    "cursor-pointer rounded-xl border-2 p-4 transition",
                    paymentType === "transferencia"
                      ? "border-emerald-500 bg-emerald-500/5"
                      : "border-slate-300 hover:border-slate-400 dark:border-slate-700",
                  )}
                >
                  <input
                    type="radio"
                    value="transferencia"
                    className="sr-only"
                    {...register("payment_type")}
                  />
                  <div className="flex items-start gap-3">
                    <Landmark className="mt-0.5 h-5 w-5 shrink-0 text-emerald-700 dark:text-emerald-400" />
                    <div className="space-y-0.5">
                      <p className="font-semibold">{t("payment.transfer")}</p>
                      <p className="text-xs text-muted-foreground">
                        {t("payment.transferSub")}
                      </p>
                    </div>
                  </div>
                </label>
              </div>

              {paymentType === "mercadopago" ? (
                <p className="rounded-lg bg-muted/60 p-3 text-xs text-muted-foreground">
                  {t.rich("payment.mockInfo", {
                    strong: (chunks) => (
                      <strong className="text-foreground">{chunks}</strong>
                    ),
                  })}
                </p>
              ) : (
                <p className="rounded-lg bg-muted/60 p-3 text-xs text-muted-foreground">
                  {t("payment.transferInfo")}
                </p>
              )}
            </div>

            {paymentType === "transferencia" && (
              <div className="space-y-3 rounded-xl border p-4">
                <p className="text-sm font-semibold">{t("transfer.title")}</p>
                <div className="space-y-2">
                  <Label htmlFor="transfer_alias">{t("transfer.alias")}</Label>
                  <div className="relative">
                    <Wallet className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      id="transfer_alias"
                      className="pl-9"
                      placeholder={t("transfer.aliasPlaceholder")}
                      {...register("transfer_alias")}
                    />
                  </div>
                  {errors.transfer_alias && (
                    <p className="text-xs text-destructive">
                      {errors.transfer_alias.message}
                    </p>
                  )}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="transfer_cbu">{t("transfer.cbu")}</Label>
                  <div className="relative">
                    <Wallet className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      id="transfer_cbu"
                      className="pl-9"
                      placeholder={t("transfer.cbuPlaceholder")}
                      {...register("transfer_cbu")}
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="transfer_bank">{t("transfer.bank")}</Label>
                  <div className="relative">
                    <Landmark className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      id="transfer_bank"
                      className="pl-9"
                      placeholder={t("transfer.bankPlaceholder")}
                      {...register("transfer_bank")}
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="whatsapp_contact">
                    {t("transfer.whatsapp")}
                  </Label>
                  <div className="relative">
                    <MessageCircle className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      id="whatsapp_contact"
                      className="pl-9"
                      placeholder={t("transfer.whatsappPlaceholder")}
                      {...register("whatsapp_contact")}
                    />
                  </div>
                  {errors.whatsapp_contact && (
                    <p className="text-xs text-destructive">
                      {errors.whatsapp_contact.message}
                    </p>
                  )}
                </div>
              </div>
            )}

            {error && <p className="text-sm text-destructive">{error}</p>}

            <div className="space-y-3 rounded-xl border p-4">
              <div>
                <p className="text-sm font-semibold">
                  {t("terms.title")}
                </p>
                <p className="text-xs text-muted-foreground">
                  {t("terms.descriptionEdit")}
                </p>
              </div>
              <pre className="max-h-56 overflow-y-auto whitespace-pre-wrap rounded-lg border bg-muted/30 p-3 text-[11px] leading-relaxed text-muted-foreground">
{raffle.player_terms_text || basesSugeridas || t("terms.empty")}
              </pre>
              <label className="flex items-start gap-3 text-sm">
                <input
                  type="checkbox"
                  className="mt-1 h-4 w-4 accent-primary"
                  checked={termsAccepted}
                  onChange={(e) => setTermsAccepted(e.target.checked)}
                />
                <span className="font-medium">
                  {t("terms.accept")}
                </span>
              </label>
            </div>

            <div className="space-y-3 rounded-xl border p-4">
              <label htmlFor="referral_enabled" className="flex items-start gap-3">
                <input
                  id="referral_enabled"
                  type="checkbox"
                  className="mt-1 h-4 w-4 accent-primary"
                  {...register("referral_enabled")}
                />
                <span>
                  <span className="block text-sm font-semibold">
                    {t("referral.enableEdit")}
                  </span>
                  <span className="block text-xs text-muted-foreground">
                    {t.rich("referral.descriptionEdit", {
                      strong: (chunks) => <strong>{chunks}</strong>,
                    })}
                  </span>
                </span>
              </label>

              {referralEnabled && (
                <div className="grid gap-3 sm:grid-cols-3">
                  <div className="space-y-1">
                    <Label htmlFor="referral_min_numbers">
                      {t("referral.minNumbers")}
                    </Label>
                    <Input
                      id="referral_min_numbers"
                      type="number"
                      min={1}
                      max={1000}
                      {...register("referral_min_numbers")}
                    />
                    <p className="text-[11px] text-muted-foreground">
                      {t("referral.minNumbersHintEdit")}
                    </p>
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="referral_require_buyer_min">
                      {t("referral.requireBuyerMin")}
                    </Label>
                    <Input
                      id="referral_require_buyer_min"
                      type="number"
                      min={0}
                      max={1000}
                      {...register("referral_require_buyer_min")}
                    />
                    <p className="text-[11px] text-muted-foreground">
                      {t("referral.requireBuyerMinHint")}
                    </p>
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="referral_max_per_user">
                      {t("referral.maxPerUserEdit")}
                    </Label>
                    <Input
                      id="referral_max_per_user"
                      type="number"
                      min={0}
                      max={1000}
                      {...register("referral_max_per_user")}
                    />
                    <p className="text-[11px] text-muted-foreground">
                      {t("referral.maxPerUserHintLong")}
                    </p>
                  </div>

                  <div className="space-y-1 sm:col-span-3">
                    <Label htmlFor="bonus_raffle_id">
                      {t("referral.bonusQuestion")}
                    </Label>
                    <select
                      id="bonus_raffle_id"
                      className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                      {...register("bonus_raffle_id")}
                    >
                      <option value="">{t("referral.bonusSame")}</option>
                      {sorteosBonus.map((sorteo) => (
                        <option key={sorteo.id} value={sorteo.id}>
                          {t("referral.bonusExclusive", { title: sorteo.title })}
                        </option>
                      ))}
                    </select>
                    <p className="text-[11px] text-muted-foreground">
                      {t("referral.bonusEditHint")}
                    </p>
                  </div>
                </div>
              )}
            </div>

            <Button type="submit" className="w-full" disabled={saving}>
              {saving ? t("buttons.saving") : t("buttons.save")}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
