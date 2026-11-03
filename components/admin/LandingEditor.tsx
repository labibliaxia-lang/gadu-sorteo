"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowDown,
  ArrowUp,
  Image as ImageIcon,
  Loader2,
  Plus,
  Save,
  Trash2,
  Type,
  Youtube,
} from "lucide-react";

import {
  landingContentSchema,
  type LandingBlock,
  youtubeEmbedUrl,
} from "@/lib/landing";
import { createClient } from "@/lib/supabase/client";
import { saveLandingContent } from "@/app/admin/sorteos/[id]/landing/actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

function newId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `block-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function LandingEditor({
  raffleId,
  raffleTitle,
  initialBlocks,
}: {
  raffleId: string;
  raffleTitle: string;
  initialBlocks: LandingBlock[];
}) {
  const router = useRouter();
  const supabase = createClient();
  const [blocks, setBlocks] = useState<LandingBlock[]>(initialBlocks);
  const [uploadingId, setUploadingId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  function addBlock(block: LandingBlock) {
    setBlocks((current) => [...current, block]);
  }

  function patchBlock(id: string, patch: Partial<LandingBlock>) {
    setBlocks((current) =>
      current.map((block) =>
        block.id === id ? ({ ...block, ...patch } as LandingBlock) : block,
      ),
    );
  }

  function removeBlock(id: string) {
    setBlocks((current) => current.filter((block) => block.id !== id));
  }

  function moveBlock(id: string, direction: -1 | 1) {
    setBlocks((current) => {
      const index = current.findIndex((block) => block.id === id);
      const target = index + direction;
      if (index < 0 || target < 0 || target >= current.length) return current;
      const next = [...current];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }

  async function uploadImage(id: string, file: File | undefined) {
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      setError("El archivo debe ser una imagen.");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setError("La imagen no puede superar los 5 MB.");
      return;
    }

    setUploadingId(id);
    setError(null);

    const ext = file.name.split(".").pop() ?? "jpg";
    const path = `landing-${Date.now()}-${Math.random()
      .toString(36)
      .slice(2)}.${ext}`;

    const { error: uploadError } = await supabase.storage
      .from("raffle-images")
      .upload(path, file);

    if (uploadError) {
      setError(uploadError.message);
      setUploadingId(null);
      return;
    }

    const { data } = supabase.storage
      .from("raffle-images")
      .getPublicUrl(path);

    patchBlock(id, { url: data.publicUrl } as Partial<LandingBlock>);
    setUploadingId(null);
  }

  async function save() {
    setBusy(true);
    setError(null);
    setMessage(null);

    const parsed = landingContentSchema.safeParse(blocks);
    if (!parsed.success) {
      setError(
        parsed.error.issues[0]?.message ??
          "Revisá los bloques: hay datos inválidos.",
      );
      setBusy(false);
      return;
    }

    const result = await saveLandingContent(raffleId, parsed.data);
    setBusy(false);

    if (!result.ok) {
      setError(result.error);
      return;
    }

    setMessage(
      `Landing guardada: ${result.count} bloque${result.count === 1 ? "" : "s"}.`,
    );
    router.refresh();
  }

  return (
    <div className="space-y-5">
      <Card>
        <CardContent className="space-y-3 p-5">
          <div>
            <p className="text-sm font-semibold">
              Bloques de la landing: {raffleTitle}
            </p>
            <p className="text-xs text-muted-foreground">
              Se muestran arriba del grid en la página pública. Máximo 20
              bloques. El texto es texto plano: no se permite HTML.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={blocks.length >= 20}
              onClick={() =>
                addBlock({
                  id: newId(),
                  type: "text",
                  title: "",
                  body: "",
                })
              }
            >
              <Type className="mr-1.5 h-4 w-4" />
              Texto
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={blocks.length >= 20}
              onClick={() =>
                addBlock({
                  id: newId(),
                  type: "image",
                  url: "",
                  alt: "",
                  caption: "",
                })
              }
            >
              <ImageIcon className="mr-1.5 h-4 w-4" />
              Imagen
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={blocks.length >= 20}
              onClick={() =>
                addBlock({
                  id: newId(),
                  type: "video",
                  url: "",
                })
              }
            >
              <Youtube className="mr-1.5 h-4 w-4" />
              Video de YouTube
            </Button>
          </div>
        </CardContent>
      </Card>

      {blocks.length === 0 ? (
        <p className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">
          Todavía no hay bloques. Agregá un texto, una imagen o un video.
        </p>
      ) : (
        <div className="space-y-4">
          {blocks.map((block, index) => (
            <Card key={block.id}>
              <CardContent className="space-y-3 p-4">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Bloque {index + 1} ·{" "}
                    {block.type === "text"
                      ? "Texto"
                      : block.type === "image"
                        ? "Imagen"
                        : "Video"}
                  </p>
                  <div className="flex items-center gap-1">
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      aria-label="Subir bloque"
                      disabled={index === 0}
                      onClick={() => moveBlock(block.id, -1)}
                    >
                      <ArrowUp className="h-4 w-4" />
                    </Button>
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      aria-label="Bajar bloque"
                      disabled={index === blocks.length - 1}
                      onClick={() => moveBlock(block.id, 1)}
                    >
                      <ArrowDown className="h-4 w-4" />
                    </Button>
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      aria-label="Eliminar bloque"
                      onClick={() => removeBlock(block.id)}
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </div>

                {block.type === "text" && (
                  <div className="space-y-2">
                    <Label htmlFor={`title-${block.id}`}>
                      Título (opcional)
                    </Label>
                    <Input
                      id={`title-${block.id}`}
                      value={block.title ?? ""}
                      maxLength={140}
                      onChange={(event) =>
                        patchBlock(block.id, { title: event.target.value })
                      }
                    />
                    <Label htmlFor={`body-${block.id}`}>Párrafo</Label>
                    <Textarea
                      id={`body-${block.id}`}
                      value={block.body}
                      maxLength={1200}
                      rows={4}
                      onChange={(event) =>
                        patchBlock(block.id, { body: event.target.value })
                      }
                    />
                  </div>
                )}

                {block.type === "image" && (
                  <div className="space-y-2">
                    <Label htmlFor={`img-${block.id}`}>
                      Imagen (máx. 5 MB)
                    </Label>
                    <Input
                      id={`img-${block.id}`}
                      type="file"
                      accept="image/*"
                      onChange={(event) =>
                        void uploadImage(block.id, event.target.files?.[0])
                      }
                    />
                    {uploadingId === block.id && (
                      <p className="flex items-center gap-2 text-xs text-muted-foreground">
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        Subiendo…
                      </p>
                    )}
                    {block.url && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={block.url}
                        alt={block.alt || "Imagen de la landing"}
                        className="max-h-56 w-full rounded-lg object-cover"
                      />
                    )}
                    <Label htmlFor={`alt-${block.id}`}>
                      Texto alternativo
                    </Label>
                    <Input
                      id={`alt-${block.id}`}
                      value={block.alt ?? ""}
                      maxLength={160}
                      onChange={(event) =>
                        patchBlock(block.id, { alt: event.target.value })
                      }
                    />
                    <Label htmlFor={`caption-${block.id}`}>
                      Epígrafe (opcional)
                    </Label>
                    <Input
                      id={`caption-${block.id}`}
                      value={block.caption ?? ""}
                      maxLength={200}
                      onChange={(event) =>
                        patchBlock(block.id, { caption: event.target.value })
                      }
                    />
                  </div>
                )}

                {block.type === "video" && (
                  <div className="space-y-2">
                    <Label htmlFor={`video-${block.id}`}>
                      Enlace de YouTube
                    </Label>
                    <Input
                      id={`video-${block.id}`}
                      value={block.url}
                      placeholder="https://www.youtube.com/watch?v=…"
                      onChange={(event) =>
                        patchBlock(block.id, { url: event.target.value })
                      }
                    />
                    {youtubeEmbedUrl(block.url) ? (
                      <iframe
                        src={youtubeEmbedUrl(block.url) ?? ""}
                        title="Vista previa del video"
                        className="aspect-video w-full rounded-lg border"
                        loading="lazy"
                        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                        allowFullScreen
                      />
                    ) : (
                      <p className="text-xs text-muted-foreground">
                        Pegá un enlace de YouTube (watch, youtu.be, shorts o
                        embed).
                      </p>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {error && (
        <p className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </p>
      )}
      {message && (
        <p className="rounded-md bg-emerald-500/10 p-3 text-sm text-emerald-700 dark:text-emerald-300">
          {message}
        </p>
      )}

      <Button onClick={() => void save()} disabled={busy || uploadingId !== null}>
        {busy ? (
          <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
        ) : (
          <Save className="mr-1.5 h-4 w-4" />
        )}
        {busy ? "Guardando…" : "Guardar landing"}
      </Button>
    </div>
  );
}
