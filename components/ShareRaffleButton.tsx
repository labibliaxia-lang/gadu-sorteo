"use client";

import { useEffect, useRef, useState } from "react";
import {
  Check,
  Copy,
  Facebook,
  MessageCircle,
  Send,
  Share2,
  Twitter,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Compartir un sorteo:
 *  - En móvil usa la Web Share API (con la portada si el navegador la acepta).
 *  - En escritorio, o si no hay soporte, abre un menú con WhatsApp, Telegram,
 *    Facebook, X y "copiar enlace".
 * No bloquea la carga: es un cliente liviano y sin datos sensibles.
 */
export function ShareRaffleButton({
  raffleId,
  titulo,
  imageUrl,
  className,
}: {
  raffleId: string;
  titulo: string;
  imageUrl?: string | null;
  className?: string;
}) {
  const [abierto, setAbierto] = useState(false);
  const [copiado, setCopiado] = useState(false);
  const contenedor = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function alClick(evento: MouseEvent) {
      if (contenedor.current && !contenedor.current.contains(evento.target as Node)) {
        setAbierto(false);
      }
    }
    document.addEventListener("mousedown", alClick);
    return () => document.removeEventListener("mousedown", alClick);
  }, []);

  function urlParaCompartir(): string {
    if (typeof window === "undefined") return "";
    const { origin, pathname, href } = window.location;
    const ruta = `/sorteos/${raffleId}`;
    if (pathname === ruta || pathname.startsWith(`${ruta}/`)) return href;
    const base = process.env.NEXT_PUBLIC_URL?.trim() || origin;
    return `${base.replace(/\/$/, "")}${ruta}`;
  }

  function texto(tituloSorteo: string): string {
    return `¡Participá en el sorteo de ${tituloSorteo}! Comprá tus números acá:`;
  }

  function track(red: string) {
    try {
      const gtag = (window as unknown as { gtag?: (...args: unknown[]) => void })
        .gtag;
      gtag?.("event", "share_click", { method: red });
    } catch {
      // Analítica opcional: si falla, no rompe el compartir.
    }
  }

  async function compartirNativo(url: string): Promise<boolean> {
    if (!navigator.share) return false;

    try {
      if (imageUrl && navigator.canShare) {
        const respuesta = await fetch(imageUrl);
        const blob = await respuesta.blob();
        const archivo = new File([blob], "portada-sorteo.jpg", {
          type: blob.type || "image/jpeg",
        });
        if (navigator.canShare({ files: [archivo] })) {
          await navigator.share({
            title: titulo,
            text: texto(titulo),
            url,
            files: [archivo],
          });
          track("native-image");
          return true;
        }
      }

      await navigator.share({ title: titulo, text: texto(titulo), url });
      track("native");
      return true;
    } catch (error) {
      // Cancelar el diálogo nativo no es un error para mostrar.
      if (error instanceof DOMException && error.name === "AbortError") {
        return true;
      }
      return false;
    }
  }

  async function alCompartir() {
    const url = urlParaCompartir();
    const esMovil =
      typeof window !== "undefined" &&
      window.matchMedia?.("(pointer: coarse)").matches;
    const soportaNativo = typeof navigator !== "undefined" && Boolean(navigator.share);

    if (soportaNativo && esMovil) {
      const compartido = await compartirNativo(url);
      if (compartido) return;
    }

    setAbierto((prev) => !prev);
  }

  async function copiar(url: string) {
    try {
      await navigator.clipboard.writeText(url);
      setCopiado(true);
      toast.success("Enlace copiado");
      window.setTimeout(() => setCopiado(false), 2000);
      track("copy");
      setAbierto(false);
    } catch {
      toast.error("No se pudo copiar el enlace");
    }
  }

  const url = urlParaCompartir();
  const mensaje = encodeURIComponent(`${texto(titulo)} ${url}`);

  const redes = [
    {
      nombre: "WhatsApp",
      icono: MessageCircle,
      href: `https://wa.me/?text=${mensaje}`,
    },
    {
      nombre: "Telegram",
      icono: Send,
      href: `https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(texto(titulo))}`,
    },
    {
      nombre: "Facebook",
      icono: Facebook,
      href: `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`,
    },
    {
      nombre: "X",
      icono: Twitter,
      href: `https://twitter.com/intent/tweet?url=${encodeURIComponent(url)}&text=${encodeURIComponent(texto(titulo))}`,
    },
  ];

  return (
    <div ref={contenedor} className={cn("relative inline-block", className)}>
      <Button
        type="button"
        variant="outline"
        onClick={() => void alCompartir()}
        aria-expanded={abierto}
        aria-haspopup="menu"
      >
        <Share2 className="mr-1.5 h-4 w-4" aria-hidden="true" />
        Compartir este sorteo
      </Button>

      {abierto && (
        <div
          role="menu"
          aria-label="Compartir sorteo"
          className="absolute left-0 z-50 mt-2 w-60 overflow-hidden rounded-xl border border-hairline bg-background p-1 shadow-xl"
        >
          {redes.map((red) => (
            <a
              key={red.nombre}
              href={red.href}
              target="_blank"
              rel="noopener noreferrer"
              role="menuitem"
              onClick={() => {
                track(red.nombre.toLowerCase());
                setAbierto(false);
              }}
              className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-fg transition-colors hover:bg-panel-2"
            >
              <red.icono className="h-4 w-4" aria-hidden="true" />
              {red.nombre}
            </a>
          ))}

          <button
            type="button"
            role="menuitem"
            onClick={() => void copiar(url)}
            className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-fg transition-colors hover:bg-panel-2"
          >
            {copiado ? (
              <Check className="h-4 w-4 text-emerald-500" aria-hidden="true" />
            ) : (
              <Copy className="h-4 w-4" aria-hidden="true" />
            )}
            {copiado ? "Enlace copiado" : "Copiar enlace"}
          </button>
        </div>
      )}
    </div>
  );
}
