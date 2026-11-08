"use client";

import { useEffect, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  AlignLeft,
  CalendarDays,
  Coins,
  CreditCard,
  Hash,
  Landmark,
  MessageCircle,
  Type,
  UploadCloud,
  Wallet,
} from "lucide-react";

import { createClient } from "@/lib/supabase/client";
import { useRouter } from "@/src/i18n/navigation";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { PremiumGate } from "@/components/admin/PremiumGate";
import { getPlanContext } from "@/lib/plans";
import { generarBasesLegales } from "@/lib/raffle-terms";
import { datosPersonalesCompletos } from "@/lib/kyc";
import { cn, formatDateTime, formatPrice } from "@/lib/utils";

const schema = z.object({
  title: z.string().min(3, "El título debe tener al menos 3 caracteres"),
  description: z.string().optional(),
  draw_date: z.string().min(1, "La fecha del sorteo es obligatoria"),
  price_per_number: z.coerce.number().positive("El precio debe ser mayor a 0"),
  max_numbers: z.coerce
    .number()
    .int("Debe ser un número entero")
    .min(10, "Mínimo 10 números")
    .max(10000, "Máximo 10.000 números"),
  payment_type: z.enum(["mercadopago", "transferencia"]),
  currency: z.enum(["ARS", "MXN", "COP", "CLP", "USD"]),
  min_tickets_required: z.coerce
    .number()
    .int("El mínimo debe ser un número entero")
    .min(0, "El mínimo no puede ser negativo")
    .max(10000, "El mínimo no puede superar 10.000"),
  if_not_met: z.enum(["extend_date", "cancel_and_refund"]),
  winners_count: z.coerce
    .number()
    .int("La cantidad de premios debe ser entera")
    .min(1, "Mínimo un premio")
    .max(30, "Máximo 30 premios"),
  transfer_alias: z.string().optional(),
  transfer_cbu: z.string().optional(),
  transfer_bank: z.string().optional(),
  whatsapp_contact: z.string().optional(),
  // 0079: un sorteo puede existir sin figurar en los listados públicos. Se abre
  // igual por enlace, así que sirve para probarlo sin anunciarlo.
  // El campo se llama por lo que la persona marca («no listar»), no por la
  // columna: al revés, una casilla tildada terminaba publicando el sorteo.
  no_listado: z.boolean(),
  // 0118: «Invitá y Ganá» se configura también al crear (0102/0105).
  referral_enabled: z.boolean(),
  referral_min_numbers: z.coerce.number().int().min(1).max(1000),
  referral_max_per_user: z.coerce.number().int().min(0).max(1000),
  bonus_raffle_id: z.string().optional(),
}).superRefine((data, ctx) => {
  if (data.min_tickets_required > data.max_numbers) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["min_tickets_required"],
      message:
        "El mínimo de venta no puede superar la cantidad de números del sorteo.",
    });
  }

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

/**
 * KYC obligatorio para publicar sorteos. El mismo requisito se refuerza en la
 * base con el trigger `enforce_organizer_kyc` (0054), así que no se puede
 * saltear llamando directo a PostgREST. El superadmin queda exceptuado.
 */
const REQUIRE_KYC = true;

export default function NuevoSorteoPage() {
  const t = useTranslations("AdminSorteosForm");
  const locale = useLocale();
  const router = useRouter();
  const supabase = createClient();

  const [coverUrl, setCoverUrl] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const [verificationStatus, setVerificationStatus] = useState<string | null>(
    null,
  );
  const [kycDataComplete, setKycDataComplete] = useState(false);
  const [checkingVerification, setCheckingVerification] = useState(true);
  const [plan, setPlan] = useState<string | null>(null);
  const [role, setRole] = useState<string | null>(null);
  const [organizerName, setOrganizerName] = useState("");
  const [organizerDoc, setOrganizerDoc] = useState("");
  const [termsAccepted, setTermsAccepted] = useState(false);
  // Candidatos a «sorteo bonus»: sorteos activos del mismo organizador.
  const [sorteosBonus, setSorteosBonus] = useState<
    { id: string; title: string }[]
  >([]);
  const [activeRafflesCount, setActiveRafflesCount] = useState<number | null>(
    null,
  );

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    trigger,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      max_numbers: 100,
      payment_type: "transferencia",
      currency: "ARS",
      min_tickets_required: 0,
      if_not_met: "extend_date",
      winners_count: 1,
      no_listado: false,
      referral_enabled: false,
      referral_min_numbers: 2,
      referral_max_per_user: 3,
      bonus_raffle_id: "",
    },
  });

  const title = watch("title");
  const price = watch("price_per_number");
  const currency = watch("currency");
  const drawDate = watch("draw_date");
  const maxNumbers = watch("max_numbers");
  const paymentType = watch("payment_type");
  const transferAlias = watch("transfer_alias");
  const whatsappContact = watch("whatsapp_contact");
  const referralEnabled = watch("referral_enabled");

  useEffect(() => {
    let active = true;
    async function check() {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        if (active) setCheckingVerification(false);
        return;
      }
      const { data } = await supabase
        .from("profiles")
        .select(
          "verification_status, plan, role, full_name, phone, location, dni_number, dni_address, address_line, city, province, postal_code",
        )
        .eq("id", user.id)
        .single();

      const { count } = await supabase
        .from("raffles")
        .select("id", { count: "exact", head: true })
        .eq("created_by", user.id)
        .eq("status", "active");

      const { data: candidatos } = await supabase
        .from("raffles")
        .select("id, title")
        .eq("created_by", user.id)
        .eq("status", "active")
        .order("created_at", { ascending: false })
        .limit(50);

      if (active) {
        const userPlan = (data?.plan as string | null) ?? "organizador";
        const userRole = (data?.role as string | null) ?? null;
        const ctx = getPlanContext({ plan: userPlan, role: userRole });

        setVerificationStatus(data?.verification_status ?? "pending");
        setOrganizerName((data?.full_name as string | null) ?? "");
        setOrganizerDoc((data?.dni_number as string | null) ?? "");
        // Misma regla que el trigger `enforce_organizer_kyc` (0060). Antes acá
        // se pedían 4 campos y la base 9: el organizador completaba los tres
        // pasos y recibía «KYC incompleto» recién al crear.
        setKycDataComplete(Boolean(data) && datosPersonalesCompletos(data));
        setPlan(userPlan);
        setRole(userRole);
        setActiveRafflesCount(count ?? 0);
        setSorteosBonus(
          (candidatos ?? []) as { id: string; title: string }[],
        );

        // Ajusta los valores por defecto al plan real del organizador.
        setValue(
          "max_numbers",
          Math.min(1000, ctx.limits.maxNumbersPerRaffle),
        );
        if (!ctx.limits.paymentMethods.includes("mercadopago")) {
          setValue("payment_type", "transferencia");
        }

        setCheckingVerification(false);
      }
    }
    check();
    return () => {
      active = false;
    };
  }, [supabase, setValue]);

  const planContext = getPlanContext({ plan, role });
  const numbersLimit = planContext.isSuperadmin
    ? 10000
    : planContext.limits.maxNumbersPerRaffle;
  const prizesLimit = planContext.isSuperadmin
    ? 30
    : planContext.limits.maxPrizesPerRaffle;
  const canUseMercadoPago = planContext.limits.paymentMethods.includes(
    "mercadopago",
  );
  const reachedActiveLimit =
    activeRafflesCount !== null &&
    !planContext.isSuperadmin &&
    activeRafflesCount >= planContext.limits.maxActiveRaffles;

  const [step, setStep] = useState(1);

  const STEP_FIELDS: Record<number, (keyof FormValues)[]> = {
    1: [
      "title",
      "description",
      "price_per_number",
      "draw_date",
      "max_numbers",
      "min_tickets_required",
      "winners_count",
      "if_not_met",
    ],
    2: [
      "payment_type",
      "transfer_alias",
      "transfer_cbu",
      "transfer_bank",
      "whatsapp_contact",
    ],
  };

  async function nextStep() {
    const fields = STEP_FIELDS[step];
    if (!fields) return;
    const valid = await trigger(fields);
    if (!valid) return;

    // El botón «Continuar» y el «Crear sorteo» son el mismo nodo del DOM: React
    // lo reutiliza al cambiar de paso. Si conserva el foco, el Enter con el que
    // se confirma el diálogo de archivo lo activa y crea el sorteo sin portada.
    (document.activeElement as HTMLElement | null)?.blur();
    setStep((current) => Math.min(3, current + 1));
  }

  async function uploadFile(file: File | undefined) {
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      setUploadError(t("errors.imageType"));
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setUploadError(t("errors.imageTooLarge"));
      return;
    }

    setUploading(true);
    setUploadError(null);
    setPreviewUrl(URL.createObjectURL(file)); // previsualización inmediata

    const ext = file.name.split(".").pop() ?? "jpg";
    const path = `${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;

    const { error: uploadErr } = await supabase.storage
      .from("raffle-images")
      .upload(path, file);

    if (uploadErr) {
      setUploadError(uploadErr.message);
      setUploading(false);
      return;
    }

    const { data } = supabase.storage.from("raffle-images").getPublicUrl(path);
    setCoverUrl(data.publicUrl);
    setUploading(false);
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragging(false);
    uploadFile(e.dataTransfer.files?.[0]);
  }

  async function onSubmit(values: FormValues) {
    // Cinturón además de los tirantes: el alta sólo puede venir del paso 3. Si
    // un envío se escapa desde otro paso (B13), no se crea nada.
    if (step !== 3) return;

    // La portada viaja aparte del sorteo. Si el alta corre mientras el archivo
    // todavía sube, el sorteo queda sin portada y el archivo huérfano.
    if (uploading) {
      setError(t("errors.waitUpload"));
      return;
    }

    setLoading(true);
    setError(null);

    // 0113: las bases legales son obligatorias para publicar.
    if (!termsAccepted) {
      setError(
        t("errors.acceptTerms"),
      );
      setLoading(false);
      return;
    }

    const basesLegales = generarBasesLegales({
      organizerName,
      organizerDoc,
      raffleTitle: values.title,
      drawDateLabel: formatDateTime(new Date(values.draw_date)),
      priceLabel: `${values.price_per_number} ${values.currency}`,
      numbersCount: values.max_numbers,
      transferAlias: values.transfer_alias,
      transferCbu: values.transfer_cbu,
      transferBank: values.transfer_bank,
      whatsapp: values.whatsapp_contact,
    });

    // Validación dinámica por plan (la base de datos también lo enforce).
    if (!planContext.isSuperadmin) {
      if (reachedActiveLimit) {
        setError(
          t("errors.planActiveLimit", {
            plan: planContext.limits.label,
            max: planContext.limits.maxActiveRaffles,
          }),
        );
        setLoading(false);
        return;
      }
      if (values.max_numbers > numbersLimit) {
        setError(
          t("errors.planNumbersLimit", {
            plan: planContext.limits.label,
            max: numbersLimit,
          }),
        );
        setLoading(false);
        return;
      }
      // El esquema acepta hasta 30 premios, pero la base limita por plan
      // (`enforce_raffle_rules`, 0059:33-52). Sin este chequeo el organizador
      // completaba el wizard y la base le rechazaba el alta al final.
      if (values.winners_count > prizesLimit) {
        setError(
          t("errors.planPrizesLimit", {
            plan: planContext.limits.label,
            max: prizesLimit,
          }),
        );
        setLoading(false);
        return;
      }
      if (values.payment_type === "mercadopago" && !canUseMercadoPago) {
        setError(
          t("errors.mercadoPagoPremium"),
        );
        setLoading(false);
        return;
      }
    }

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setError(t("errors.notAuthenticated"));
      setLoading(false);
      return;
    }

    // La RLS de `raffles` exige `is_admin()` y `created_by = auth.uid()`.
    // Si la pestaña quedó abierta y la sesión cambió de cuenta (otra pestaña,
    // token viejo), la comprobación de montaje ya no vale: la repetimos acá
    // para dar un mensaje claro en vez del 42501 crudo de Postgres.
    const { data: submitProfile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .maybeSingle();
    const submitRole = (submitProfile?.role as string | null) ?? null;
    // Solo bloqueamos cuando la fila existe y su rol no es de panel. Si la
    // lectura falla (sin fila), dejamos que el insert responda: el error de la
    // base es más honesto que suponer un rol que no pudimos leer.
    if (
      submitProfile &&
      submitRole !== "admin" &&
      submitRole !== "superadmin"
    ) {
      setError(
        t("errors.noOrganizerRole"),
      );
      setLoading(false);
      return;
    }

    const { data: raffle, error: insertError } = await supabase
      .from("raffles")
      .insert({
        title: values.title,
        description: values.description || null,
        draw_date: new Date(values.draw_date).toISOString(),
        price_per_number: values.price_per_number,
        cover_image_url: coverUrl,
        created_by: user.id,
        payment_type: values.payment_type,
        currency: values.currency,
        transfer_alias: values.transfer_alias || null,
        transfer_cbu: values.transfer_cbu || null,
        transfer_bank: values.transfer_bank || null,
        whatsapp_contact: values.whatsapp_contact || null,
      // La casilla dice «no publicar»; la columna dice lo contrario.
      is_listed: !values.no_listado,
        min_tickets_required: values.min_tickets_required,
        if_not_met: values.if_not_met,
        winners_count: values.winners_count,
        // 0102/0105: el wizard ya configura «Invitá y Ganá» en el paso 3; hay
        // que persistirlo en el alta. Antes sólo lo guardaba la pantalla de
        // edición y el organizador creía haberlo activado sin efecto.
        referral_enabled: values.referral_enabled,
        referral_min_numbers: values.referral_min_numbers,
        referral_max_per_user: values.referral_max_per_user,
        bonus_raffle_id: values.bonus_raffle_id || null,
        terms_accepted_by_organizer: true,
        player_terms_text: basesLegales,
      })
      .select()
      .single();

    if (insertError || !raffle) {
      const rawMessage = insertError?.message ?? t("errors.createFailed");

      // El error de Postgres no se le puede mostrar a un organizador: no dice
      // qué hacer. Lo dejamos en consola con el contexto y mostramos la acción.
      if (rawMessage.includes("row-level security")) {
        console.error("[crear sorteo] la base rechazó el alta por RLS", {
          userId: user.id,
          role: submitRole,
          message: rawMessage,
          hint: "Corré supabase/tests/diagnostico_crear_sorteo.sql en el SQL Editor y aplicá 0065 si hay CRÍTICO.",
        });
        setError(
          t("errors.rlsRejected"),
        );
      } else {
        setError(rawMessage);
      }

      setLoading(false);
      return;
    }

    // Genera la cantidad de números elegida automáticamente.
    const { error: numbersError } = await supabase.rpc(
      "create_raffle_numbers",
      { p_raffle_id: raffle.id, p_max_numbers: values.max_numbers },
    );

    if (numbersError) {
      // Limpieza: evita dejar un sorteo huérfano sin números.
      await supabase.from("raffles").delete().eq("id", raffle.id);
      setError(numbersError.message);
      setLoading(false);
      return;
    }

    // El detalle abre con el banner «Sorteo creado»: muestra el enlace de la
    // landing recién generada para que el organizador la comparta al instante.
    router.push(`/admin/sorteos/${raffle.id}?creado=1`);
    router.refresh();
  }

  if (checkingVerification) {
    return <p className="text-muted-foreground">{t("verifying")}</p>;
  }

  if (
    REQUIRE_KYC &&
    role !== "superadmin" &&
    (verificationStatus !== "approved" || !kycDataComplete)
  ) {
    return (
      <div className="mx-auto max-w-lg space-y-4 rounded-xl border bg-muted/40 p-8 text-center">
        <h1 className="text-xl font-bold">
          {t("kyc.title")}
        </h1>
        <p className="text-sm text-muted-foreground">
          {t("kyc.description")}
        </p>
        <div className="flex flex-wrap justify-center gap-2">
          <Button onClick={() => router.push("/admin/verificacion")}>
            {t("kyc.complete")}
          </Button>
          <Button
            variant="outline"
            onClick={() => router.push("/perfil")}
          >
            {t("kyc.editData")}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      {/* ===== Formulario ===== */}
      <Card>
        <CardHeader>
          <CardTitle>
            {step === 1
              ? t("stepTitle1")
              : step === 2
                ? t("stepTitle2")
                : t("stepTitle3")}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
            {reachedActiveLimit && (
              <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
                {plan === "free" ? (
                  <>
                    {t.rich("limit.freeReached", {
                      strong: (chunks) => <strong>{chunks}</strong>,
                    })}
                  </>
                ) : (
                  <>
                    {t.rich("limit.planReached", {
                      count: activeRafflesCount ?? 0,
                      plan: planContext.limits.label,
                      max: planContext.limits.maxActiveRaffles,
                      strong: (chunks) => <strong>{chunks}</strong>,
                    })}
                  </>
                )}
              </div>
            )}

            <div className="grid grid-cols-3 gap-2 text-xs">
              {[
                { n: 1, label: t("steps.basics") },
                { n: 2, label: t("steps.collection") },
                { n: 3, label: t("steps.cover") },
              ].map((item) => (
                <div
                  key={item.n}
                  className={cn(
                    "rounded-lg border p-2 text-center",
                    step === item.n
                      ? "border-amber-500 bg-amber-500/10 font-semibold"
                      : step > item.n
                        ? "border-emerald-500/40 text-emerald-700 dark:text-emerald-400"
                        : "text-muted-foreground",
                  )}
                >
                  <span className="block text-[10px] uppercase tracking-wide">
                    {t("steps.label", { n: item.n })}
                  </span>
                  {item.label}
                </div>
              ))}
            </div>

            {step === 1 && (
              <>
            <div className="space-y-2">
              <Label htmlFor="title">{t("fields.title")}</Label>
              <div className="relative">
                <Type className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="title"
                  className="pl-9"
                  placeholder={t("fields.titlePlaceholder")}
                  {...register("title")}
                />
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
                  placeholder={t("fields.descriptionPlaceholder")}
                  {...register("description")}
                />
              </div>
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
                    placeholder="100"
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
                <div className="relative">
                  <CalendarDays className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    id="draw_date"
                    type="datetime-local"
                    className="pl-9"
                    {...register("draw_date")}
                  />
                </div>
                {errors.draw_date && (
                  <p className="text-sm text-destructive">
                    {errors.draw_date.message}
                  </p>
                )}
              </div>
            </div>

            <div className="space-y-2">
              <div className="space-y-2">
                <Label htmlFor="currency">{t("fields.currency")}</Label>
                <select
                  id="currency"
                  className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                  {...register("currency")}
                >
                  <option value="ARS">{t("currency.ars")}</option>
                  <option value="MXN">{t("currency.mxn")}</option>
                  <option value="COP">{t("currency.cop")}</option>
                  <option value="CLP">{t("currency.clp")}</option>
                  <option value="USD">{t("currency.usd")}</option>
                </select>
                <p className="text-[11px] text-muted-foreground">
                  {t("fields.currencyHint")}
                </p>
              </div>

              <Label htmlFor="max_numbers">{t("fields.maxNumbers")}</Label>
              <div className="relative">
                <Hash className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="max_numbers"
                  type="number"
                  min={10}
                  max={numbersLimit}
                  step={1}
                  list="number-options"
                  className="pl-9"
                  placeholder={String(Math.min(100, numbersLimit))}
                  {...register("max_numbers")}
                />
              </div>
              <datalist id="number-options">
                {[100, 500, 1000, 2000, 5000, 10000]
                  .filter((option) => option <= numbersLimit)
                  .map((option) => (
                    <option key={option} value={option} />
                  ))}
              </datalist>
              <p className="text-xs text-muted-foreground">
                {t.rich("fields.maxNumbersHint", {
                  plan: planContext.limits.label,
                  max: numbersLimit.toLocaleString(locale),
                  strong: (chunks) => <strong>{chunks}</strong>,
                })}
              </p>
              {errors.max_numbers && (
                <p className="text-sm text-destructive">
                  {errors.max_numbers.message}
                </p>
              )}
              {!planContext.isPremium && !planContext.isSuperadmin && (
                <PremiumGate
                  compact
                  plan={plan}
                  feature={t("premiumNumbers.feature")}
                  description={t("premiumNumbers.description")}
                >
                  <span />
                </PremiumGate>
              )}
            </div>

            <div className="space-y-2 rounded-xl border bg-muted/20 p-4">
              <p className="text-sm font-semibold">{t("minRule.title")}</p>
              <p className="text-xs text-muted-foreground">
                {t("minRule.description")}
              </p>
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="space-y-1.5">
                  <Label htmlFor="min_tickets_required">
                    {t("fields.minTicketsRequired")}
                  </Label>
                  <Input
                    id="min_tickets_required"
                    type="number"
                    min={0}
                    max={numbersLimit}
                    step={1}
                    {...register("min_tickets_required")}
                  />
                  {errors.min_tickets_required && (
                    <p className="text-sm text-destructive">
                      {errors.min_tickets_required.message}
                    </p>
                  )}
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="winners_count">{t("fields.winnersCount")}</Label>
                  <Input
                    id="winners_count"
                    type="number"
                    min={1}
                    max={prizesLimit}
                    step={1}
                    {...register("winners_count")}
                  />
                  <p className="text-xs text-muted-foreground">
                    {t("fields.winnersHint", { count: prizesLimit })}
                  </p>
                  {errors.winners_count && (
                    <p className="text-sm text-destructive">
                      {errors.winners_count.message}
                    </p>
                  )}
                </div>
                <div className="space-y-1.5">
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
              </div>
            </div>
              </>
            )}

            {step === 2 && (
              <>
            {/* Método de pago */}
            <div className="space-y-3">
              <Label>{t("payment.title")}</Label>

              <div className="grid gap-3 sm:grid-cols-2">
                <label
                  className={cn(
                    "rounded-xl border-2 p-4 transition",
                    canUseMercadoPago ? "cursor-pointer" : "cursor-not-allowed opacity-60",
                    paymentType === "mercadopago"
                      ? "border-amber-500 bg-amber-500/5"
                      : "border-slate-300 hover:border-slate-400 dark:border-slate-700",
                  )}
                >
                  <input
                    type="radio"
                    value="mercadopago"
                    className="sr-only"
                    disabled={!canUseMercadoPago}
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

              {!canUseMercadoPago && (
                <PremiumGate
                  compact
                  plan={plan}
                  feature={t("premiumPayments.feature")}
                  description={t("premiumPayments.description")}
                >
                  <span />
                </PremiumGate>
              )}

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
              </>
            )}

            {step === 3 && (
              <>
            <div className="space-y-1 rounded-xl border bg-muted/30 p-4 text-sm">
              <p className="font-semibold">{t("review.title")}</p>
              <p className="text-muted-foreground">
                {t("review.titleLabel")} <span className="text-foreground">{title || "—"}</span>
              </p>
              <p className="text-muted-foreground">
                {t("review.dateLabel")}{" "}
                <span className="text-foreground">
                  {drawDate ? formatDateTime(drawDate, locale) : "—"}
                </span>
              </p>
              <p className="text-muted-foreground">
                {t("review.priceLabel")}{" "}
                <span className="text-foreground">
                  {price ? formatPrice(Number(price), locale) : "$ 0"}{" "}
                  {t("review.perNumber")} · {maxNumbers || 0}{" "}
                  {t("review.numbers")}
                </span>
              </p>
              <p className="text-muted-foreground">
                {t("review.paymentLabel")}{" "}
                <span className="text-foreground">
                  {paymentType === "transferencia"
                    ? transferAlias
                      ? t("review.transferWithAlias", { alias: transferAlias })
                      : t("review.transfer")
                    : t("review.mercadoPago")}
                </span>
              </p>
              {whatsappContact && (
                <p className="text-muted-foreground">
                  {t("review.whatsappLabel")}{" "}
                  <span className="text-foreground">{whatsappContact}</span>
                </p>
              )}
              <p className="text-xs text-muted-foreground">
                {t("review.note")}
              </p>
            </div>

            {/* 0113: bases legales obligatorias para publicar. */}
            <div className="space-y-3 rounded-xl border bg-muted/30 p-4">
              <div>
                <p className="font-semibold">
                  {t("terms.title")}
                </p>
                <p className="text-xs text-muted-foreground">
                  {t("terms.description")}
                </p>
              </div>

              <pre className="max-h-64 overflow-y-auto whitespace-pre-wrap rounded-lg border bg-background p-3 text-[11px] leading-relaxed text-muted-foreground">
{generarBasesLegales({
  organizerName,
  organizerDoc,
  raffleTitle: title,
  drawDateLabel: drawDate ? formatDateTime(drawDate) : "a definir",
  priceLabel: `${price || 0} ${currency || "ARS"}`,
  numbersCount: Number(maxNumbers) || null,
  transferAlias,
  transferCbu: watch("transfer_cbu"),
  transferBank: watch("transfer_bank"),
  whatsapp: whatsappContact,
})}
              </pre>

              <label className="flex items-start gap-3 text-sm">
                <input
                  type="checkbox"
                  className="mt-0.5 h-4 w-4 accent-amber-600"
                  checked={termsAccepted}
                  onChange={(e) => setTermsAccepted(e.target.checked)}
                />
                <span className="font-medium">
                  {t("terms.accept")}
                </span>
              </label>
            </div>

            {/* 0118: «Invitá y Ganá» se configura también al crear; antes sólo
                existía al editar. El sorteo bonus lista los activos propios. */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">
                  {t("referral.title")}
                </CardTitle>
                <p className="text-xs text-muted-foreground">
                  {t("referral.description")}
                </p>
              </CardHeader>
              <CardContent className="space-y-4">
                <label
                  htmlFor="referral_enabled"
                  className="flex items-start gap-3 text-sm"
                >
                  <input
                    type="checkbox"
                    id="referral_enabled"
                    className="mt-0.5 h-4 w-4 accent-amber-600"
                    {...register("referral_enabled")}
                  />
                  <span className="font-medium">
                    {t("referral.enable")}
                  </span>
                </label>

                {referralEnabled && (
                  <>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div className="space-y-1">
                        <Label htmlFor="referral_min_numbers">
                          {t("referral.minNumbers")}
                        </Label>
                        <Input
                          id="referral_min_numbers"
                          type="number"
                          min={1}
                          {...register("referral_min_numbers")}
                        />
                        <p className="text-xs text-muted-foreground">
                          {t("referral.minNumbersHint")}
                        </p>
                      </div>
                      <div className="space-y-1">
                        <Label htmlFor="referral_max_per_user">
                          {t("referral.maxPerUser")}
                        </Label>
                        <Input
                          id="referral_max_per_user"
                          type="number"
                          min={0}
                          {...register("referral_max_per_user")}
                        />
                        <p className="text-xs text-muted-foreground">
                          {t("referral.maxPerUserHint")}
                        </p>
                      </div>
                    </div>

                    <div className="space-y-1">
                      <Label htmlFor="bonus_raffle_id">{t("referral.bonusRaffle")}</Label>
                      <select
                        id="bonus_raffle_id"
                        className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                        {...register("bonus_raffle_id")}
                      >
                        <option value="">
                          {t("referral.bonusNone")}
                        </option>
                        {sorteosBonus.map((sorteo) => (
                          <option key={sorteo.id} value={sorteo.id}>
                            {sorteo.title}
                          </option>
                        ))}
                      </select>
                      <p className="text-xs text-muted-foreground">
                        {t("referral.bonusHint")}
                      </p>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
            {/* 0079: visible u oculto de los listados. No es privacidad: el
                enlace sigue funcionando, así se puede probar sin anunciarlo. */}
            <div className="rounded-xl border bg-muted/30 p-4">
              <label className="flex items-start gap-3 text-sm">
                <input
                  type="checkbox"
                  className="mt-0.5 h-4 w-4 rounded border-slate-300 accent-amber-600"
                  {...register("no_listado")}
                />
                <span>
                  <span className="font-medium">
                    {t("hidden.title")}
                  </span>
                  <span className="block text-xs text-muted-foreground">
                    {t("hidden.description")}
                  </span>
                </span>
              </label>
            </div>
            {/* Dropzone */}
            <div className="space-y-2">
              <Label>{t("cover.label")}</Label>
              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragging(true);
                }}
                onDragLeave={() => setDragging(false)}
                onDrop={handleDrop}
                onClick={() => {
                  // Si quedó enfocado el botón de submit (mismo nodo que
                  // «Continuar»), el Enter del diálogo lo activaría.
                  (document.activeElement as HTMLElement | null)?.blur();
                  inputRef.current?.click();
                }}
                className={cn(
                  "flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed p-8 text-center transition",
                  dragging
                    ? "border-amber-500 bg-amber-500/5"
                    : "border-muted-foreground/30 hover:border-amber-500/60",
                )}
              >
                {previewUrl || coverUrl ? (
                  <>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={previewUrl ?? coverUrl ?? ""}
                      alt={t("cover.alt")}
                      className="max-h-40 rounded-lg object-cover"
                    />
                    <p className="text-xs text-muted-foreground">
                      {t("cover.change")}
                    </p>
                  </>
                ) : (
                  <>
                    <UploadCloud className="h-8 w-8 text-muted-foreground" />
                    <p className="text-sm text-muted-foreground">
                      {t("cover.drop")}
                    </p>
                  </>
                )}
                <input
                  ref={inputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => uploadFile(e.target.files?.[0])}
                />
              </div>
              {uploading && (
                <p className="text-sm text-muted-foreground">{t("cover.uploading")}</p>
              )}
              {uploadError && (
                <p className="text-sm text-destructive">{uploadError}</p>
              )}
            </div>
              </>
            )}

            {error && <p className="text-sm text-destructive">{error}</p>}

            <div className="flex flex-wrap gap-2">
              {step > 1 && (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setStep((current) => Math.max(1, current - 1))}
                  disabled={loading}
                >
                  {t("buttons.back")}
                </Button>
              )}

              {step < 3 ? (
                // Las claves distintas obligan a React a montar un nodo nuevo al
                // cambiar de paso. Sin ellas reutiliza el mismo <button> y le
                // cambia `type` a "submit" a mitad del clic: ahí se crea el
                // sorteo sin pasar por la revisión (B13).
                <Button
                  key="continuar"
                  type="button"
                  onClick={() => void nextStep()}
                  className="flex-1"
                >
                  {t("buttons.next")}
                </Button>
              ) : (
                <Button
                  key="crear"
                  type="submit"
                  className="flex-1"
                  disabled={loading || uploading}
                >
                  {loading
                    ? t("buttons.creating")
                    : uploading
                      ? t("buttons.uploadingCover")
                      : t("buttons.create")}
                </Button>
              )}
            </div>
          </form>
        </CardContent>
      </Card>

      {/* ===== Vista previa en tiempo real ===== */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">{t("preview.title")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="relative aspect-video overflow-hidden rounded-xl bg-panel-2">
            {previewUrl || coverUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={previewUrl ?? coverUrl ?? ""}
                alt={t("cover.alt")}
                className="h-full w-full object-cover"
              />
            ) : (
              <div className="flex h-full items-center justify-center text-5xl">
                🛠️
              </div>
            )}
          </div>

          <div className="space-y-2">
            <h3 className="text-xl font-bold">
              {title || t("preview.titleFallback")}
            </h3>
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <CalendarDays className="h-4 w-4" />
              {drawDate ? formatDateTime(drawDate, locale) : t("preview.dateUndefined")}
            </p>
            <p className="text-lg font-bold text-amber-800 dark:text-amber-300">
              {price ? formatPrice(Number(price), locale) : "$ 0"}{" "}
              <span className="text-sm font-normal text-muted-foreground">
                {t("preview.perNumber")}
              </span>
            </p>
          </div>

          <div className="rounded-lg border bg-muted/40 p-3 text-sm text-muted-foreground">
            {t.rich("preview.numbersGenerated", {
              count: maxNumbers || 0,
              strong: (chunks) => (
                <strong className="text-foreground">{chunks}</strong>
              ),
            })}
          </div>

          <div className="space-y-2">
            <p className="text-sm font-medium">{t("preview.prizes")}</p>
            <p className="text-sm text-muted-foreground">
              {t("preview.prizesHint")}
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
