"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ImageUploader } from "@/components/ImageUploader";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

const schema = z.object({
  title: z.string().min(3, "El título debe tener al menos 3 caracteres"),
  description: z.string().optional(),
  draw_date: z.string().min(1, "La fecha del sorteo es obligatoria"),
  price_per_number: z.coerce.number().positive("El precio debe ser mayor a 0"),
});

type FormValues = z.infer<typeof schema>;

export default function NuevoSorteoPage() {
  const router = useRouter();
  const supabase = createClient();
  const [coverUrl, setCoverUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormValues>({ resolver: zodResolver(schema) });

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

    // Genera los 10.000 números automáticamente.
    const { error: numbersError } = await supabase.rpc(
      "create_raffle_numbers",
      { p_raffle_id: raffle.id },
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
    <div className="mx-auto max-w-xl">
      <Card>
        <CardHeader>
          <CardTitle>Nuevo sorteo</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="title">Título</Label>
              <Input id="title" {...register("title")} />
              {errors.title && (
                <p className="text-sm text-destructive">
                  {errors.title.message}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">Descripción</Label>
              <Textarea id="description" {...register("description")} />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="draw_date">Fecha del sorteo</Label>
                <Input
                  id="draw_date"
                  type="datetime-local"
                  {...register("draw_date")}
                />
                {errors.draw_date && (
                  <p className="text-sm text-destructive">
                    {errors.draw_date.message}
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="price_per_number">Precio por número (ARS)</Label>
                <Input
                  id="price_per_number"
                  type="number"
                  step="0.01"
                  min="0"
                  {...register("price_per_number")}
                />
                {errors.price_per_number && (
                  <p className="text-sm text-destructive">
                    {errors.price_per_number.message}
                  </p>
                )}
              </div>
            </div>

            <div className="space-y-2">
              <Label>Imagen de portada</Label>
              <ImageUploader value={coverUrl} onChange={setCoverUrl} />
            </div>

            {error && <p className="text-sm text-destructive">{error}</p>}

            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "Creando sorteo…" : "Crear sorteo"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
