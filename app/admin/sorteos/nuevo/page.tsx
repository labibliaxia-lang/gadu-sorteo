"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
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
  is_listed: z.boolean(),
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
      min_tickets_required: 0,
      if_not_met: "extend_date",
      winners_count: 1,
      is_listed: true,
    },
  });

  const title = watch("title");
  const price = watch("price_per_number");
  const drawDate = watch("draw_date");
  const maxNumbers = watch("max_numbers");
  const paymentType = watch("payment_type");
  const transferAlias = watch("transfer_alias");
  const whatsappContact = watch("whatsapp_contact");

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

      if (active) {
        const userPlan = (data?.plan as string | null) ?? "organizador";
        const userRole = (data?.role as string | null) ?? null;
        const ctx = getPlanContext({ plan: userPlan, role: userRole });

        setVerificationStatus(data?.verification_status ?? "pending");
        // Misma regla que el trigger `enforce_organizer_kyc` (0060). Antes acá
        // se pedían 4 campos y la base 9: el organizador completaba los tres
        // pasos y recibía «KYC incompleto» recién al crear.
        setKycDataComplete(Boolean(data) && datosPersonalesCompletos(data));
        setPlan(userPlan);
        setRole(userRole);
        setActiveRafflesCount(count ?? 0);

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
      setUploadError("El archivo debe ser una imagen.");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setUploadError("La imagen no puede superar los 5 MB.");
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
    // La portada viaja aparte del sorteo. Si el alta corre mientras el archivo
    // todavía sube, el sorteo queda sin portada y el archivo huérfano.
    if (uploading) {
      setError("Esperá a que termine de subir la portada antes de crear el sorteo.");
      return;
    }

    setLoading(true);
    setError(null);

    // Validación dinámica por plan (la base de datos también lo enforce).
    if (!planContext.isSuperadmin) {
      if (reachedActiveLimit) {
        setError(
          `Tu plan ${planContext.limits.label} permite hasta ${planContext.limits.maxActiveRaffles} sorteos activos. Finalizá uno o mejorá a Premium.`,
        );
        setLoading(false);
        return;
      }
      if (values.max_numbers > numbersLimit) {
        setError(
          `Tu plan ${planContext.limits.label} permite hasta ${numbersLimit} números por sorteo.`,
        );
        setLoading(false);
        return;
      }
      // El esquema acepta hasta 30 premios, pero la base limita por plan
      // (`enforce_raffle_rules`, 0059:33-52). Sin este chequeo el organizador
      // completaba el wizard y la base le rechazaba el alta al final.
      if (values.winners_count > prizesLimit) {
        setError(
          `Tu plan ${planContext.limits.label} permite hasta ${prizesLimit} premio(s) por sorteo.`,
        );
        setLoading(false);
        return;
      }
      if (values.payment_type === "mercadopago" && !canUseMercadoPago) {
        setError(
          "Mercado Pago es una función del plan Premium. Elegí transferencia o canjeá un código premium.",
        );
        setLoading(false);
        return;
      }
    }

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setError("No estás autenticado.");
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
        "Tu sesión no tiene rol de organizador en este momento. Cerrá sesión, volvé a entrar y reintentá.",
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
        transfer_alias: values.transfer_alias || null,
        transfer_cbu: values.transfer_cbu || null,
        transfer_bank: values.transfer_bank || null,
        whatsapp_contact: values.whatsapp_contact || null,
      is_listed: values.is_listed ?? true,
        min_tickets_required: values.min_tickets_required,
        if_not_met: values.if_not_met,
        winners_count: values.winners_count,
      })
      .select()
      .single();

    if (insertError || !raffle) {
      const rawMessage = insertError?.message ?? "No se pudo crear el sorteo.";

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
          "La base rechazó el sorteo por un problema de permisos. Cerrá sesión, volvé a entrar y reintentá. Si sigue, avisá al administrador de la plataforma.",
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
    return <p className="text-muted-foreground">Verificando identidad…</p>;
  }

  if (
    REQUIRE_KYC &&
    role !== "superadmin" &&
    (verificationStatus !== "approved" || !kycDataComplete)
  ) {
    return (
      <div className="mx-auto max-w-lg space-y-4 rounded-xl border bg-muted/40 p-8 text-center">
        <h1 className="text-xl font-bold">
          KYC obligatorio para publicar sorteos
        </h1>
        <p className="text-sm text-muted-foreground">
          Para crear y publicar sorteos necesitás cargar tus datos personales
          (nombre, teléfono, ubicación y DNI) y tener la identidad aprobada con
          DNI + selfie.
        </p>
        <div className="flex flex-wrap justify-center gap-2">
          <Button onClick={() => router.push("/admin/verificacion")}>
            Completar verificación
          </Button>
          <Button
            variant="outline"
            onClick={() => router.push("/perfil")}
          >
            Editar mis datos
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
              ? "Nuevo sorteo · Datos básicos"
              : step === 2
                ? "Nuevo sorteo · Cobro"
                : "Nuevo sorteo · Portada y revisión"}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
            {reachedActiveLimit && (
              <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
                Ya tenés {activeRafflesCount} sorteo(s) activo(s). Tu plan{" "}
                <strong>{planContext.limits.label}</strong> permite hasta{" "}
                {planContext.limits.maxActiveRaffles}. Finalizá uno o mejorá a
                Premium.
              </div>
            )}

            <div className="grid grid-cols-3 gap-2 text-xs">
              {[
                { n: 1, label: "Básicos" },
                { n: 2, label: "Cobro" },
                { n: 3, label: "Portada" },
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
                    Paso {item.n}
                  </span>
                  {item.label}
                </div>
              ))}
            </div>

            {step === 1 && (
              <>
            <div className="space-y-2">
              <Label htmlFor="title">Título</Label>
              <div className="relative">
                <Type className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="title"
                  className="pl-9"
                  placeholder="Ej: Sorteo de autos"
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
              <Label htmlFor="description">Descripción</Label>
              <div className="relative">
                <AlignLeft className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <Textarea
                  id="description"
                  className="pl-9"
                  placeholder="Contá de qué trata el sorteo"
                  {...register("description")}
                />
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="price_per_number">Precio por número</Label>
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
                <Label htmlFor="draw_date">Fecha del sorteo</Label>
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
              <Label htmlFor="max_numbers">Cantidad de números</Label>
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
                Tu plan <strong>{planContext.limits.label}</strong> permite entre
                10 y {numbersLimit.toLocaleString("es-AR")} números por sorteo.
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
                  feature="más números por sorteo"
                  description="Con Premium podés generar hasta 10.000 números por sorteo."
                >
                  <span />
                </PremiumGate>
              )}
            </div>

            <div className="space-y-2 rounded-xl border bg-muted/20 p-4">
              <p className="text-sm font-semibold">Regla de mínimo de venta</p>
              <p className="text-xs text-muted-foreground">
                Si al llegar la fecha no se alcanza este mínimo, el sorteo no se
                ejecuta y se aplica la regla elegida. Dejalo en 0 para no exigir
                mínimo.
              </p>
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="space-y-1.5">
                  <Label htmlFor="min_tickets_required">
                    Mínimo de números vendidos
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
                  <Label htmlFor="winners_count">Cantidad de premios</Label>
                  <Input
                    id="winners_count"
                    type="number"
                    min={1}
                    max={prizesLimit}
                    step={1}
                    {...register("winners_count")}
                  />
                  <p className="text-xs text-muted-foreground">
                    Tu plan permite hasta {prizesLimit}{" "}
                    {prizesLimit === 1 ? "premio" : "premios"}.
                  </p>
                  {errors.winners_count && (
                    <p className="text-sm text-destructive">
                      {errors.winners_count.message}
                    </p>
                  )}
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="if_not_met">Si no se alcanza</Label>
                  <select
                    id="if_not_met"
                    className="h-10 w-full rounded-lg border border-border bg-card px-3 text-sm"
                    {...register("if_not_met")}
                  >
                    <option value="extend_date">Reprogramar la fecha</option>
                    <option value="cancel_and_refund">
                      Cancelar y devolver el dinero
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
              <Label>Método de pago</Label>

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
                      <p className="font-semibold">Mercado Pago</p>
                      <p className="text-xs text-muted-foreground">
                        Automático / Modo Mock de Pruebas
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
                      <p className="font-semibold">Transferencia Bancaria</p>
                      <p className="text-xs text-muted-foreground">
                        Alias (Manual)
                      </p>
                    </div>
                  </div>
                </label>
              </div>

              {!canUseMercadoPago && (
                <PremiumGate
                  compact
                  plan={plan}
                  feature="Mercado Pago"
                  description="Cobrá automáticamente con Mercado Pago y accedé a los métodos de pago avanzados."
                >
                  <span />
                </PremiumGate>
              )}

              {paymentType === "mercadopago" ? (
                <p className="rounded-lg bg-muted/60 p-3 text-xs text-muted-foreground">
                  Si no hay un token real de Mercado Pago configurado, la
                  plataforma activará automáticamente el{" "}
                  <strong className="text-foreground">
                    Modo Simulación (Mock)
                  </strong>{" "}
                  para hacer pruebas locales sin costo.
                </p>
              ) : (
                <p className="rounded-lg bg-muted/60 p-3 text-xs text-muted-foreground">
                  Los compradores verán tus datos de transferencia y te
                  enviarán el comprobante por WhatsApp.
                </p>
              )}
            </div>

            {paymentType === "transferencia" && (
              <div className="space-y-3 rounded-xl border p-4">
                <p className="text-sm font-semibold">Datos de transferencia</p>
                <div className="space-y-2">
                  <Label htmlFor="transfer_alias">Alias</Label>
                  <div className="relative">
                    <Wallet className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      id="transfer_alias"
                      className="pl-9"
                      placeholder="Ej: mi.alias.mp"
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
                  <Label htmlFor="transfer_cbu">CBU</Label>
                  <div className="relative">
                    <Wallet className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      id="transfer_cbu"
                      className="pl-9"
                      placeholder="22 dígitos"
                      {...register("transfer_cbu")}
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="transfer_bank">Banco</Label>
                  <div className="relative">
                    <Landmark className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      id="transfer_bank"
                      className="pl-9"
                      placeholder="Ej: Mercado Pago / Banco Nación"
                      {...register("transfer_bank")}
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="whatsapp_contact">
                    WhatsApp de contacto
                  </Label>
                  <div className="relative">
                    <MessageCircle className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      id="whatsapp_contact"
                      className="pl-9"
                      placeholder="Ej: 5491123456789"
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
              <p className="font-semibold">Revisión final</p>
              <p className="text-muted-foreground">
                Título: <span className="text-foreground">{title || "—"}</span>
              </p>
              <p className="text-muted-foreground">
                Fecha:{" "}
                <span className="text-foreground">
                  {drawDate ? formatDateTime(drawDate) : "—"}
                </span>
              </p>
              <p className="text-muted-foreground">
                Precio:{" "}
                <span className="text-foreground">
                  {price ? formatPrice(Number(price)) : "$ 0"} por número ·{" "}
                  {maxNumbers || 0} números
                </span>
              </p>
              <p className="text-muted-foreground">
                Cobro:{" "}
                <span className="text-foreground">
                  {paymentType === "transferencia"
                    ? `Transferencia${transferAlias ? ` · ${transferAlias}` : ""}`
                    : "Mercado Pago"}
                </span>
              </p>
              {whatsappContact && (
                <p className="text-muted-foreground">
                  WhatsApp:{" "}
                  <span className="text-foreground">{whatsappContact}</span>
                </p>
              )}
              <p className="text-xs text-muted-foreground">
                Al crear se generan los números automáticamente. Los premios y
                el compromiso del sorteo se cargan después.
              </p>
            </div>

            {/* 0079: visible u oculto de los listados. No es privacidad: el
                enlace sigue funcionando, así se puede probar sin anunciarlo. */}
            <div className="rounded-xl border bg-muted/30 p-4">
              <label className="flex items-start gap-3 text-sm">
                <input
                  type="checkbox"
                  className="mt-0.5 h-4 w-4 rounded border-slate-300 accent-amber-600"
                  {...register("is_listed")}
                />
                <span>
                  <span className="font-medium">
                    No publicar en el listado
                  </span>
                  <span className="block text-xs text-muted-foreground">
                    No aparece en la home, en Ganadores ni en buscadores, pero se
                    abre igual con el enlace. Sirve para probarlo antes de
                    anunciarlo. Para publicarlo después, hay que activarlo desde
                    el panel.
                  </span>
                </span>
              </label>
            </div>
            {/* Dropzone */}
            <div className="space-y-2">
              <Label>Imagen de portada</Label>
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
                      alt="Portada"
                      className="max-h-40 rounded-lg object-cover"
                    />
                    <p className="text-xs text-muted-foreground">
                      Click para cambiar la imagen
                    </p>
                  </>
                ) : (
                  <>
                    <UploadCloud className="h-8 w-8 text-muted-foreground" />
                    <p className="text-sm text-muted-foreground">
                      Arrastrá una imagen o hacé click para subir
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
                <p className="text-sm text-muted-foreground">Subiendo…</p>
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
                  Atrás
                </Button>
              )}

              {step < 3 ? (
                <Button
                  type="button"
                  onClick={() => void nextStep()}
                  className="flex-1"
                >
                  Continuar
                </Button>
              ) : (
                <Button
                  type="submit"
                  className="flex-1"
                  disabled={loading || uploading}
                >
                  {loading
                    ? "Creando sorteo…"
                    : uploading
                      ? "Subiendo portada…"
                      : "Crear sorteo"}
                </Button>
              )}
            </div>
          </form>
        </CardContent>
      </Card>

      {/* ===== Vista previa en tiempo real ===== */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Vista previa</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="relative aspect-video overflow-hidden rounded-xl bg-panel-2">
            {previewUrl || coverUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={previewUrl ?? coverUrl ?? ""}
                alt="Portada"
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
              {title || "Título del sorteo"}
            </h3>
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <CalendarDays className="h-4 w-4" />
              {drawDate ? formatDateTime(drawDate) : "Fecha sin definir"}
            </p>
            <p className="text-lg font-bold text-amber-800 dark:text-amber-300">
              {price ? formatPrice(Number(price)) : "$ 0"}{" "}
              <span className="text-sm font-normal text-muted-foreground">
                por número
              </span>
            </p>
          </div>

          <div className="rounded-lg border bg-muted/40 p-3 text-sm text-muted-foreground">
            Se generarán{" "}
            <strong className="text-foreground">
              {maxNumbers || 0} números
            </strong>{" "}
            automáticamente al crear el sorteo.
          </div>

          <div className="space-y-2">
            <p className="text-sm font-medium">Premios</p>
            <p className="text-sm text-muted-foreground">
              Los premios se cargan en el siguiente paso.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
