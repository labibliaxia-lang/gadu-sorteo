"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { AlignLeft, CalendarDays, Coins, Type } from "lucide-react";

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
import { updateRaffle } from "@/app/admin/sorteos/[id]/actions";

const schema = z.object({
  title: z.string().min(3, "El título debe tener al menos 3 caracteres"),
  description: z.string().optional(),
  draw_date: z.string().min(1, "La fecha del sorteo es obligatoria"),
  price_per_number: z.coerce.number().positive("El precio debe ser mayor a 0"),
  payment_type: z.enum(["mercadopago", "transferencia"]),
  transfer_alias: z.string().optional(),
  transfer_cbu: z.string().optional(),
  transfer_bank: z.string().optional(),
  whatsapp_contact: z.string().optional(),
});

type FormValues = z.infer<typeof schema>;

function toLocalInput(iso: string): string {
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(
    d.getHours(),
  )}:${p(d.getMinutes())}`;
}

export default function EditarSorteoPage({
  params,
}: {
  params: { id: string };
}) {
  const router = useRouter();
  const supabase = createClient();

  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    watch,
    formState: { errors },
  } = useForm<FormValues>({ resolver: zodResolver(schema) });

  const paymentType = watch("payment_type");

  useEffect(() => {
    async function load() {
      const { data } = await supabase
        .from("raffles")
        .select("*")
        .eq("id", params.id)
        .single();

      if (!data) {
        setNotFound(true);
        setLoading(false);
        return;
      }

      reset({
        title: data.title,
        description: data.description ?? "",
        price_per_number: data.price_per_number,
        draw_date: data.draw_date ? toLocalInput(data.draw_date) : "",
        payment_type: data.payment_type ?? "mercadopago",
        transfer_alias: data.transfer_alias ?? "",
        transfer_cbu: data.transfer_cbu ?? "",
        transfer_bank: data.transfer_bank ?? "",
        whatsapp_contact: data.whatsapp_contact ?? "",
      });
      setLoading(false);
    }
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.id]);

  async function onSubmit(values: FormValues) {
    setSaving(true);
    setError(null);

    const res = await updateRaffle(params.id, values);

    if (!res.ok) {
      setError(res.error ?? "No se pudo guardar los cambios.");
      setSaving(false);
      return;
    }

    router.push(`/admin/sorteos/${params.id}`);
    router.refresh();
  }

  if (notFound) {
    return <p className="text-muted-foreground">No se encontró el sorteo.</p>;
  }

  return (
    <div className="mx-auto max-w-xl">
      <Card>
        <CardHeader>
          <CardTitle>Editar sorteo</CardTitle>
          <p className="text-sm text-muted-foreground">
            La cantidad de números no se puede modificar una vez generados.
          </p>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-muted-foreground">Cargando…</p>
          ) : (
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
              <div className="space-y-2">
                <Label htmlFor="title">Título</Label>
                <div className="relative">
                  <Type className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    id="title"
                    className="pl-9"
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

              {/* Método de pago */}
              <div className="space-y-2">
                <Label htmlFor="payment_type">Método de pago</Label>
                <select
                  id="payment_type"
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  {...register("payment_type")}
                >
                  <option value="mercadopago">
                    Mercado Pago (automático)
                  </option>
                  <option value="transferencia">
                    Transferencia bancaria (manual)
                  </option>
                </select>
              </div>

              {paymentType === "transferencia" && (
                <div className="space-y-3 rounded-xl border p-4">
                  <p className="text-sm font-semibold">
                    Datos de transferencia
                  </p>
                  <div className="space-y-2">
                    <Label htmlFor="transfer_alias">Alias</Label>
                    <Input
                      id="transfer_alias"
                      placeholder="Ej: mi.alias.mp"
                      {...register("transfer_alias")}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="transfer_cbu">CBU</Label>
                    <Input
                      id="transfer_cbu"
                      placeholder="22 dígitos"
                      {...register("transfer_cbu")}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="transfer_bank">Banco</Label>
                    <Input
                      id="transfer_bank"
                      placeholder="Ej: Mercado Pago / Banco Nación"
                      {...register("transfer_bank")}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="whatsapp_contact">
                      WhatsApp del organizador
                    </Label>
                    <Input
                      id="whatsapp_contact"
                      placeholder="Ej: 5491123456789"
                      {...register("whatsapp_contact")}
                    />
                  </div>
                </div>
              )}

              {error && <p className="text-sm text-destructive">{error}</p>}

              <Button type="submit" className="w-full" disabled={saving}>
                {saving ? "Guardando…" : "Guardar cambios"}
              </Button>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
