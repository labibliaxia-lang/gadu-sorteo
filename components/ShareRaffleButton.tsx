"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
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

/** Texto pre-armado del share nativo y de WhatsApp: incluye la URL. */
function textoConUrl(base: string, url: string): string {
  return `${base} ${url}`;
}

/**
 * Compartir un sorteo.
 *
 * - En móvil abre el menú nativo con la Web Share API.
 * - En escritorio, o si el navegador no la soporta, abre un menú con
 *   WhatsApp, Telegram, Facebook, Twitter y "Copiar enlace".
 *
 * A propósito NO se adjunta la portada: para mandarla como archivo hay que
 * descargarla antes de llamar a `navigator.share` y ese `await` consume el
 * gesto del usuario en iOS, con lo que el menú nativo nunca llega a abrir.
 * El texto y el enlace son los datos que pide el sorteo.
 */
export function ShareRaffleButton({
  raffleId,
  slug,
  titulo,
  className,
}: {
  raffleId: string;
  slug?: string | null;
  titulo: string;
  className?: string;
}) {
  const t = useTranslations("ShareRaffleButton");
  const locale = useLocale();
  const [abierto, setAbierto] = useState(false);
  const [copiado, setCopiado] = useState(false);
  const contenedor = useRef<HTMLDivElement>(null);
  const menuId = useId();
  const texto = t("shareText", { title: titulo });

  // Cerrar el menú al tocar/clicar fuera.
  useEffect(() => {
    function alClick(evento: MouseEvent) {
      if (contenedor.current && !contenedor.current.contains(evento.target as Node)) {
        setAbierto(false);
      }
    }
    document.addEventListener("mousedown", alClick);
    return () => document.removeEventListener("mousedown", alClick);
  }, []);

  // Cerrar con Escape: el menú se abre con teclado, tiene que poder cerrarse
  // con teclado.
  useEffect(() => {
    if (!abierto) return;
    function alTecla(evento: KeyboardEvent) {
      if (evento.key === "Escape") setAbierto(false);
    }
    document.addEventListener("keydown", alTecla);
    return () => document.removeEventListener("keydown", alTecla);
  }, [abierto]);

  /**
   * Enlace público del sorteo. Siempre con el slug: la página acepta UUID por
   * compatibilidad, pero lo que se comparte (y lo que indexa Google) es la
   * ruta amigable. Si el sorteo es viejo y no tiene slug, cae al id.
   *
   * Si ya estamos en la página del sorteo se usa el `href` real para no perder
   * parámetros de campaña (`?ref=`); si no, se arma contra el origen actual.
   */
  function urlParaCompartir(): string {
    if (typeof window === "undefined") return "";
    const { origin, pathname, href } = window.location;
    const clave = (slug ?? "").trim() || raffleId;
    const localPath = `/sorteos/${clave}`;
    const ruta = locale === "es" ? localPath : `/${locale}${localPath}`;
    if (
      pathname === localPath ||
      pathname === ruta ||
      pathname.startsWith(`${ruta}/`)
    ) {
      return href;
    }
    return `${origin.replace(/\/$/, "")}${ruta}`;
  }

  function enDispositivoMovil(): boolean {
    if (typeof window === "undefined") return false;
    const punteroGrueso = window.matchMedia
      ? window.matchMedia("(pointer: coarse)").matches
      : false;
    const userAgentMovil = /Android|iPhone|iPad|iPod|Mobile/i.test(
      navigator.userAgent,
    );
    return punteroGrueso || userAgentMovil;
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
    try {
      // Sin `files` y sin `url` aparte: el enlace va dentro del texto para que
      // el mensaje quede exactamente como se pide y no se duplique al
      // pegarlo en WhatsApp. Se llama sin `await` previo para conservar el
      // gesto del usuario (requisito de Safari/iOS).
      await navigator.share({ title: titulo, text: textoConUrl(texto, url) });
      track("native");
      return true;
    } catch (error) {
      // Cancelar el diálogo nativo no es un error para mostrar ni una razón
      // para abrir el menú de respaldo.
      if (error instanceof DOMException && error.name === "AbortError") {
        return true;
      }
      return false;
    }
  }

  async function alCompartir() {
    const url = urlParaCompartir();
    if (!url) return;

    if (enDispositivoMovil() && typeof navigator.share === "function") {
      const compartido = await compartirNativo(url);
      if (compartido) return;
    }

    // Escritorio, navegador sin Web Share o error al abrirlo: menú manual.
    setAbierto((previo) => !previo);
  }

  async function copiar(url: string) {
    try {
      await navigator.clipboard.writeText(url);
      setCopiado(true);
      toast.success(t("copied"));
      window.setTimeout(() => setCopiado(false), 2000);
      track("copy");
      setAbierto(false);
    } catch {
      toast.error(t("copyError"));
    }
  }

  const url = abierto ? urlParaCompartir() : "";
  const mensajeConUrl = textoConUrl(texto, url);

  const redes = [
    {
      nombre: "WhatsApp",
      icono: MessageCircle,
      href: `https://wa.me/?text=${encodeURIComponent(mensajeConUrl)}`,
    },
    {
      nombre: "Telegram",
      icono: Send,
      href: `https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(texto)}`,
    },
    {
      nombre: "Facebook",
      icono: Facebook,
      href: `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`,
    },
    {
      nombre: "Twitter",
      icono: Twitter,
      href: `https://twitter.com/intent/tweet?url=${encodeURIComponent(url)}&text=${encodeURIComponent(texto)}`,
    },
  ];

  return (
    <div
      ref={contenedor}
      className={cn("relative w-full sm:inline-block sm:w-auto", className)}
    >
      <Button
        type="button"
        variant="outline"
        onClick={() => void alCompartir()}
        aria-expanded={abierto}
        aria-haspopup="menu"
        aria-controls={menuId}
        className="w-full sm:w-auto"
      >
        <Share2 className="mr-1.5 h-4 w-4" aria-hidden="true" />
        {t("button")}
      </Button>

      {abierto && (
        <div
          id={menuId}
          role="menu"
          aria-label={t("menuAria")}
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
              className="flex items-center gap-2 rounded-lg px-3 py-2.5 text-sm text-fg transition-colors hover:bg-panel-2"
            >
              <red.icono className="h-4 w-4" aria-hidden="true" />
              {red.nombre}
            </a>
          ))}

          <button
            type="button"
            role="menuitem"
            onClick={() => void copiar(url)}
            className="flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-sm text-fg transition-colors hover:bg-panel-2"
          >
            {copiado ? (
              <Check className="h-4 w-4 text-emerald-500" aria-hidden="true" />
            ) : (
              <Copy className="h-4 w-4" aria-hidden="true" />
            )}
            {copiado ? t("copied") : t("copy")}
          </button>
        </div>
      )}
    </div>
  );
}
