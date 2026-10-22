"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Instagram, MapPin, Phone, User } from "lucide-react";

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
  full_name: z.string().min(2, "Ingresá tu nombre"),
  phone: z.string().optional(),
  instagram_url: z.string().optional(),
  location: z.string().optional(),
  purchase_message: z.string().optional(),
  prize_message: z.string().optional(),
});

type FormValues = z.infer<typeof schema>;

export default function AdminPerfilPage() {
  const router = useRouter();
  const supabase = createClient();

  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<FormValues>({ resolver: zodResolver(schema) });

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
        .from("profiles")
        .select("*")
        .eq("id", user.id)
        .single();

      if (data) {
        reset({
          full_name: data.full_name ?? "",
          phone: data.phone ?? "",
          instagram_url: data.instagram_url ?? "",
          location: data.location ?? "",
          purchase_message: data.purchase_message ?? "",
          prize_message: data.prize_message ?? "",
        });
        setAvatarUrl(data.avatar_url ?? null);
      }
      setLoading(false);
    }
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function onSubmit(values: FormValues) {
    setSaving(true);
    setError(null);
    setSuccess(null);

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setError("No estás autenticado.");
      setSaving(false);
      return;
    }

    const { error: updateError } = await supabase
      .from("profiles")
      .update({
        full_name: values.full_name,
        phone: values.phone || null,
        instagram_url: values.instagram_url || null,
        location: values.location || null,
        avatar_url: avatarUrl,
        purchase_message: values.purchase_message || null,
        prize_message: values.prize_message || null,
      })
      .eq("id", user.id);

    if (updateError) {
      setError(updateError.message);
      setSaving(false);
      return;
    }

    setSuccess("Perfil actualizado correctamente.");
    setSaving(false);
    router.refresh();
  }

  if (loading) {
    return <p className="text-muted-foreground">Cargando…</p>;
  }

  return (
    <div className="mx-auto max-w-xl">
      <Card>
        <CardHeader>
          <CardTitle>Mi perfil público</CardTitle>
          <p className="text-sm text-muted-foreground">
            Esta información se muestra en tus sorteos para generar confianza.
          </p>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
            <div className="space-y-2">
              <Label>Foto de perfil</Label>
              <ImageUploader value={avatarUrl} onChange={setAvatarUrl} />
            </div>

            <div className="space-y-2">
              <Label htmlFor="full_name">Nombre</Label>
              <div className="relative">
                <User className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="full_name"
                  className="pl-9"
                  {...register("full_name")}
                />
              </div>
              {errors.full_name && (
                <p className="text-sm text-destructive">
                  {errors.full_name.message}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="phone">Teléfono (WhatsApp)</Label>
              <div className="relative">
                <Phone className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="phone"
                  type="tel"
                  className="pl-9"
                  placeholder="+54 9 11 1234 5678"
                  {...register("phone")}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="instagram_url">Instagram (usuario o URL)</Label>
              <div className="relative">
                <Instagram className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="instagram_url"
                  className="pl-9"
                  placeholder="@tucuenta"
                  {...register("instagram_url")}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="location">Ciudad / Ubicación</Label>
              <div className="relative">
                <MapPin className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="location"
                  className="pl-9"
                  placeholder="Alta Gracia, Córdoba"
                  {...register("location")}
                />
              </div>
            </div>

            {/* Mensajes de notificación */}
            <div className="space-y-3 rounded-xl border p-4">
              <p className="text-sm font-semibold">Mensajes de notificación</p>
              <div className="space-y-2">
                <Label htmlFor="purchase_message">
                  Mensaje de confirmación de compra
                </Label>
                <Textarea
                  id="purchase_message"
                  rows={3}
                  placeholder="Ej: ¡Gracias por tu compra! Tus números quedaron confirmados…"
                  {...register("purchase_message")}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="prize_message">Mensaje de premios</Label>
                <Textarea
                  id="prize_message"
                  rows={3}
                  placeholder="Ej: ¡Felicitaciones! Te contactaremos para coordinar la entrega…"
                  {...register("prize_message")}
                />
              </div>
            </div>

            {error && <p className="text-sm text-destructive">{error}</p>}
            {success && <p className="text-sm text-green-600">{success}</p>}

            <Button type="submit" className="w-full" disabled={saving}>
              {saving ? "Guardando…" : "Guardar cambios"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
