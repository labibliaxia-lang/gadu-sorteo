"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  AlignLeft,
  CalendarDays,
  Coins,
  Hash,
  Type,
  UploadCloud,
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
});

type FormValues = z.infer<typeof schema>;

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

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { max_numbers: 10000 },
  });

  const title = watch("title");
  const price = watch("price_per_number");
  const drawDate = watch("draw_date");
  const maxNumbers = watch("max_numbers");

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
    setLoading(true);
    setError(null);

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setError("No estás autenticado.");
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
      })
      .select()
      .single();

    if (insertError || !raffle) {
      setError(insertError?.message ?? "No se pudo crear el sorteo.");
      setLoading(false);
      return;
    }

    // Genera la cantidad de números elegida automáticamente.
    console.log("[Sorteo] create_raffle_numbers_v2 =>", {
      p_raffle_id: raffle.id,
      p_max_numbers: values.max_numbers,
    });
    const { error: numbersError } = await supabase.rpc(
      "create_raffle_numbers_v2",
      { p_raffle_id: raffle.id, p_max_numbers: values.max_numbers },
    );

    if (numbersError) {
      setError(numbersError.message);
      setLoading(false);
      return;
    }

    router.push(`/admin/sorteos/${raffle.id}`);
    router.refresh();
  }

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      {/* ===== Formulario ===== */}
      <Card>
        <CardHeader>
          <CardTitle>Nuevo sorteo</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="title">Título</Label>
              <div className="relative">
                <Type className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="title"
                  className="pl-9"
                  placeholder="Ej: Sorteo de herramientas"
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
                  max={10000}
                  step={1}
                  className="pl-9"
                  placeholder="10000"
                  {...register("max_numbers")}
                />
              </div>
              <p className="text-xs text-muted-foreground">
                Entre 10 y 10.000 números.
              </p>
              {errors.max_numbers && (
                <p className="text-sm text-destructive">
                  {errors.max_numbers.message}
                </p>
              )}
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
                onClick={() => inputRef.current?.click()}
                className={cn(
                  "flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed p-8 text-center transition",
                  dragging
                    ? "border-amber-500 bg-amber-500/5"
                    : "border-muted-foreground/30 hover:border-amber-500/60",
                )}
              >
                {previewUrl || coverUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={previewUrl ?? coverUrl ?? ""}
                    alt="Portada"
                    className="max-h-40 rounded-lg object-cover"
                  />
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

            {error && <p className="text-sm text-destructive">{error}</p>}

            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "Creando sorteo…" : "Crear sorteo"}
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* ===== Vista previa en tiempo real ===== */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Vista previa</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="relative aspect-video overflow-hidden rounded-xl bg-gradient-to-br from-zinc-900 to-amber-950">
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
            <p className="text-lg font-bold text-amber-600">
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
