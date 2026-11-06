"use client";

import { useRef, useState } from "react";
import { Camera, Check, Loader2, Trash2, X } from "lucide-react";

import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export interface FotoEntrega {
  id: string;
  url: string;
  caption: string | null;
  status: "pending" | "approved";
  uploaded_by: string;
}

const BUCKET = "raffle-images";
const MAX_BYTES = 5 * 1024 * 1024;

/**
 * Fotos de los premios entregados.
 *
 * Todo pasa con el cliente del navegador: la RLS de
 * `raffle_delivery_photos` (0091) es la que decide quién publica y quién
 * aprueba. No hay Server Action que repetir ni permiso que chequear dos veces:
 * si la RLS dice que no, el insert falla.
 *
 * El estado inicial no lo elige el cliente: el trigger pone `approved` si sube
 * el organizador y `pending` si sube el ganador. Acá sólo se muestra.
 */
export function FotosEntrega({
  raffleId,
  fotos,
  puedeSubir,
  esOrganizador,
  usuarioId,
}: {
  raffleId: string;
  fotos: FotoEntrega[];
  puedeSubir: boolean;
  esOrganizador: boolean;
  usuarioId: string | null;
}) {
  const [subiendo, setSubiendo] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ocupada, setOcupada] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  async function subir(archivo: File) {
    setError(null);

    if (!archivo.type.startsWith("image/")) {
      setError("Tiene que ser una imagen.");
      return;
    }
    if (archivo.size > MAX_BYTES) {
      setError("La imagen no puede superar los 5 MB.");
      return;
    }

    setSubiendo(true);
    try {
      const supabase = createClient();
      const ext = archivo.name.split(".").pop()?.toLowerCase() || "jpg";
      const ruta = `entregas/${raffleId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;

      const { error: errorSubida } = await supabase.storage
        .from(BUCKET)
        .upload(ruta, archivo, { contentType: archivo.type, upsert: false });

      if (errorSubida) {
        setError(errorSubida.message);
        return;
      }

      const { data: publica } = supabase.storage.from(BUCKET).getPublicUrl(ruta);

      const { error: errorFila } = await supabase.from("raffle_delivery_photos").insert({
        raffle_id: raffleId,
        uploaded_by: usuarioId,
        url: publica.publicUrl,
      });

      if (errorFila) {
        setError(errorFila.message);
        return;
      }

      window.location.reload();
    } finally {
      setSubiendo(false);
    }
  }

  async function aprobar(id: string) {
    setOcupada(id);
    const supabase = createClient();
    const { error: e } = await supabase
      .from("raffle_delivery_photos")
      .update({ status: "approved" })
      .eq("id", id);
    setOcupada(null);
    if (e) setError(e.message);
    else window.location.reload();
  }

  async function borrar(id: string) {
    setOcupada(id);
    const supabase = createClient();
    const { error: e } = await supabase.from("raffle_delivery_photos").delete().eq("id", id);
    setOcupada(null);
    if (e) setError(e.message);
    else window.location.reload();
  }

  const aprobadas = fotos.filter((f) => f.status === "approved");
  const pendientes = esOrganizador ? fotos.filter((f) => f.status === "pending") : [];

  return (
    <section className="space-y-3 rounded-xl border bg-card p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-lg font-semibold">
          <Camera className="h-5 w-5" aria-hidden="true" />
          Premios entregados
        </h2>
        {puedeSubir && (
          <>
            <input
              ref={inputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const archivo = e.target.files?.[0];
                if (archivo) void subir(archivo);
              }}
            />
            <Button
              size="sm"
              variant="outline"
              disabled={subiendo}
              onClick={() => inputRef.current?.click()}
            >
              {subiendo ? (
                <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
              ) : (
                <Camera className="mr-1.5 h-4 w-4" />
              )}
              {subiendo ? "Subiendo…" : "Subir foto"}
            </Button>
          </>
        )}
      </div>

      {error && (
        <p className="rounded-lg border border-red-500/40 bg-red-500/10 p-2 text-xs text-red-900 dark:text-red-200">
          {error}
        </p>
      )}

      {puedeSubir && !esOrganizador && (
        <p className="text-xs text-muted-foreground">
          Tu foto queda pendiente hasta que el organizador la apruebe.
        </p>
      )}

      {aprobadas.length === 0 && pendientes.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Todavía no hay fotos de la entrega.
        </p>
      ) : (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {[...aprobadas, ...pendientes].map((foto) => (
            <figure
              key={foto.id}
              className={cn(
                "overflow-hidden rounded-lg border",
                foto.status === "pending" && "border-amber-500/50",
              )}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={foto.url} alt={foto.caption || "Foto de la entrega del premio"} className="aspect-square w-full object-cover" />
              <figcaption className="space-y-1 p-2">
                {foto.status === "pending" && (
                  <span className="inline-block rounded bg-amber-500/20 px-1.5 py-0.5 text-[10px] font-medium uppercase text-amber-900 dark:text-amber-200">
                    Pendiente
                  </span>
                )}
                {foto.caption && <p className="text-xs">{foto.caption}</p>}
                {(esOrganizador || foto.uploaded_by === usuarioId) && (
                  <div className="flex gap-1 pt-1">
                    {esOrganizador && foto.status === "pending" && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 px-2 text-xs"
                        disabled={ocupada === foto.id}
                        onClick={() => void aprobar(foto.id)}
                      >
                        <Check className="mr-1 h-3 w-3" /> Aprobar
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 px-2 text-xs text-red-600"
                      disabled={ocupada === foto.id}
                      onClick={() => void borrar(foto.id)}
                    >
                      {ocupada === foto.id ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        <Trash2 className="h-3 w-3" />
                      )}
                    </Button>
                  </div>
                )}
              </figcaption>
            </figure>
          ))}
        </div>
      )}
    </section>
  );
}
