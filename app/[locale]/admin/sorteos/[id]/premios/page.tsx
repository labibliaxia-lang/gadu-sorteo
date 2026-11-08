"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { ArrowLeft } from "lucide-react";

import { Link as LocaleLink } from "@/src/i18n/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button, buttonVariants } from "@/components/ui/button";
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
import {
  deletePrize,
  upsertPrize,
} from "@/app/[locale]/admin/sorteos/[id]/actions";
import type { Prize } from "@/lib/types";

export default function PremiosPage({ params }: { params: { id: string } }) {
  const t = useTranslations("AdminSorteosPremios");
  const supabase = createClient();

  const [prizes, setPrizes] = useState<Prize[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Formulario (sirve para crear y para editar)
  const [editingId, setEditingId] = useState<string | null>(null);
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

  function resetForm() {
    setEditingId(null);
    setTitle("");
    setDescription("");
    setToolNumber("");
    setImageUrl(null);
    setImageUrl2(null);
    setError(null);
    setSuccess(null);
  }

  function startEdit(prize: Prize) {
    setEditingId(prize.id);
    setPosition(prize.position);
    setTitle(prize.title);
    setDescription(prize.description ?? "");
    setToolNumber(prize.tool_number != null ? String(prize.tool_number) : "");
    setImageUrl(prize.image_url);
    setImageUrl2(prize.image_url_2 ?? null);
    setError(null);
    setSuccess(null);
  }

  async function submitPrize(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setSuccess(null);

    const res = await upsertPrize(params.id, {
      id: editingId ?? undefined,
      position,
      title,
      description: description || null,
      tool_number: toolNumber ? parseInt(toolNumber, 10) : null,
      image_url: imageUrl,
      image_url_2: imageUrl2,
    });

    if (!res.ok) {
      setError(res.error);
      setSaving(false);
      return;
    }

    setSuccess(editingId ? t("success.updated") : t("success.created"));
    resetForm();
    setSaving(false);
    load();
  }

  async function removePrize(id: string) {
    setError(null);
    setSuccess(null);

    const res = await deletePrize(params.id, id);

    if (!res.ok) {
      setError(res.error);
      return;
    }

    setSuccess(t("success.deleted"));
    if (editingId === id) resetForm();
    load();
  }

  const canAdd = prizes.length < 10 || editingId !== null;

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-xl font-semibold">{t("title")}</h2>
          <p className="text-sm text-muted-foreground">
            {t("subtitle")}
          </p>
        </div>
        <LocaleLink
          href={`/admin/sorteos/${params.id}`}
          className={buttonVariants({ variant: "outline", size: "sm" })}
        >
          <ArrowLeft className="mr-1.5 h-4 w-4" />
          {t("back")}
        </LocaleLink>
      </div>
      <div>
        <h2 className="text-xl font-semibold">
          {t("listTitle", { count: prizes.length })}
        </h2>
        <p className="text-sm text-muted-foreground">
          {t("listHint")}
        </p>
      </div>

      {loading ? (
        <p className="text-muted-foreground">{t("loading")}</p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {prizes.map((prize) => (
            <div key={prize.id} className="space-y-2">
              <PrizeCard prize={prize} />
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => startEdit(prize)}
                >
                  {t("edit")}
                </Button>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => removePrize(prize.id)}
                >
                  {t("delete")}
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {!canAdd ? (
        <p className="text-sm text-muted-foreground">
          {t("limitReached")}
        </p>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">
              {editingId ? t("editPrize") : t("addPrize")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={submitPrize} className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="position">{t("position")}</Label>
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
                  <Label htmlFor="tool_number">{t("toolNumber")}</Label>
                  <Input
                    id="tool_number"
                    type="number"
                    value={toolNumber}
                    onChange={(e) => setToolNumber(e.target.value)}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="title">{t("titleLabel")}</Label>
                <Input
                  id="title"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="description">{t("description")}</Label>
                <Textarea
                  id="description"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                />
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>{t("photo1")}</Label>
                  <ImageUploader value={imageUrl} onChange={setImageUrl} />
                </div>
                <div className="space-y-2">
                  <Label>{t("photo2")}</Label>
                  <ImageUploader value={imageUrl2} onChange={setImageUrl2} />
                </div>
              </div>

              {error && <p className="text-sm text-destructive">{error}</p>}
              {success && <p className="text-sm text-green-600">{success}</p>}

              <div className="flex flex-wrap gap-2">
                <Button type="submit" disabled={saving}>
                  {saving
                    ? t("saving")
                    : editingId
                      ? t("saveChanges")
                      : t("addPrize")}
                </Button>
                {editingId && (
                  <Button type="button" variant="outline" onClick={resetForm}>
                    {t("cancelEdit")}
                  </Button>
                )}
              </div>
            </form>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
