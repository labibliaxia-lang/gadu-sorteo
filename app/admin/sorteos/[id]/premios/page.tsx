"use client";

import { useEffect, useState } from "react";

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
import { PrizeCard } from "@/components/PrizeCard";
import type { Prize } from "@/lib/types";

export default function PremiosPage({ params }: { params: { id: string } }) {
  const supabase = createClient();

  const [prizes, setPrizes] = useState<Prize[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Formulario
  const [position, setPosition] = useState(1);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [toolNumber, setToolNumber] = useState("");
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [imageUrl2, setImageUrl2] = useState<string | null>(null);

  async function load() {
    const { data } = await supabase
      .from("prizes")
      .select("*")
      .eq("raffle_id", params.id)
      .order("position", { ascending: true });

    const list = (data as Prize[]) ?? [];
    setPrizes(list);
    if (list.length < 10) {
      const used = new Set(list.map((p) => p.position));
      let next = 1;
      while (used.has(next)) next++;
      setPosition(next);
    }
    setLoading(false);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.id]);

  async function addPrize(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setSuccess(null);

    if (position < 1 || position > 10) {
      setError("La posición debe estar entre 1 y 10.");
      setSaving(false);
      return;
    }

    const { error: insertError } = await supabase.from("prizes").insert({
      raffle_id: params.id,
      position,
      title,
      description: description || null,
      tool_number: toolNumber ? parseInt(toolNumber, 10) : null,
      image_url: imageUrl,
      image_url_2: imageUrl2,
    });

    if (insertError) {
      setError(
        insertError.code === "23505"
          ? "Ya existe un premio en esa posición."
          : insertError.message,
      );
      setSaving(false);
      return;
    }

    setSuccess("Premio agregado correctamente.");
    setTitle("");
    setDescription("");
    setToolNumber("");
    setImageUrl(null);
    setImageUrl2(null);
    setSaving(false);
    load();
  }

  async function deletePrize(id: string) {
    setError(null);
    setSuccess(null);
    const { error: deleteError } = await supabase
      .from("prizes")
      .delete()
      .eq("id", id);

    if (deleteError) {
      setError(deleteError.message);
      return;
    }
    setSuccess("Premio eliminado.");
    load();
  }

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-xl font-semibold">Premios ({prizes.length}/10)</h2>
        <p className="text-sm text-muted-foreground">
          Cada premio ocupa una posición del 1 al 10.
        </p>
      </div>

      {loading ? (
        <p className="text-muted-foreground">Cargando…</p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {prizes.map((prize) => (
            <div key={prize.id} className="space-y-2">
              <PrizeCard prize={prize} />
              <Button
                variant="destructive"
                size="sm"
                onClick={() => deletePrize(prize.id)}
              >
                Eliminar
              </Button>
            </div>
          ))}
        </div>
      )}

      {prizes.length >= 10 ? (
        <p className="text-sm text-muted-foreground">
          Has alcanzado el límite de 10 premios para este sorteo.
        </p>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Agregar premio</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={addPrize} className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="position">Posición (1-10)</Label>
                  <Input
                    id="position"
                    type="number"
                    min={1}
                    max={10}
                    value={position}
                    onChange={(e) => setPosition(parseInt(e.target.value, 10))}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="tool_number">Nº de herramienta asociado</Label>
                  <Input
                    id="tool_number"
                    type="number"
                    value={toolNumber}
                    onChange={(e) => setToolNumber(e.target.value)}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="title">Título</Label>
                <Input
                  id="title"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="description">Descripción</Label>
                <Textarea
                  id="description"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                />
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>Foto 1 (principal)</Label>
                  <ImageUploader value={imageUrl} onChange={setImageUrl} />
                </div>
                <div className="space-y-2">
                  <Label>Foto 2 (opcional)</Label>
                  <ImageUploader value={imageUrl2} onChange={setImageUrl2} />
                </div>
              </div>

              {error && <p className="text-sm text-destructive">{error}</p>}
              {success && <p className="text-sm text-green-600">{success}</p>}

              <Button type="submit" disabled={saving}>
                {saving ? "Guardando…" : "Agregar premio"}
              </Button>
            </form>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
