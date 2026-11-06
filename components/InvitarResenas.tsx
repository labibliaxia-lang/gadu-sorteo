"use client";

import { useState } from "react";
import { ChevronDown, Copy, MessageCircle, Star } from "lucide-react";

import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export interface CompradorAResenar {
  nombre: string;
  telefono: string | null;
  numeros: number;
}

/**
 * Invitación a dejar reseña, después del sorteo.
 *
 * POR QUÉ POR WHATSAPP Y NO POR EMAIL
 * El organizador sólo ve nombre y teléfono de sus compradores (vista
 * `raffle_buyers`, 0073). El email no se expone, y mandar correos masivos desde
 * la plataforma no está implementado. WhatsApp es, además, el mismo canal por el
 * que ya se manda el comprobante: no se inventa un flujo nuevo.
 *
 * POR QUÉ NO ESCRIBE NADA EN LA BASE
 * No hay envío automático ni notificación interna: sería afirmar que la
 * invitación llegó cuando en realidad depende de que el organizador apriete
 * enviar. Queda como una lista de trabajo, con mensaje prellenado.
 *
 * POR QUÉ SE PUEDE COPIAR EL MENSAJE
 * Muchos sorteos se difunden en un grupo de WhatsApp o de Facebook. Un texto
 * listo para pegar sirve más que treinta envíos uno por uno.
 */
export function InvitarResenas({
  sorteoId,
  tituloSorteo,
  compradores,
}: {
  sorteoId: string;
  tituloSorteo: string;
  compradores: CompradorAResenar[];
}) {
  const [abierto, setAbierto] = useState(false);
  const [copiado, setCopiado] = useState(false);

  const enlaceResena = typeof window !== "undefined"
    ? `${window.location.origin}/organizador/${sorteoId}#resenas`
    : `/organizador/${sorteoId}#resenas`;

  const mensaje = `¡Gracias por participar en "${tituloSorteo}"! Si te sirvió la experiencia, ¿me dejás una reseña? Ayuda a que otros se animen. Es sólo para quienes compraron un número.`;

  function enlaceWhatsApp(telefono: string | null): string | null {
    if (!telefono) return null;
    const digitos = telefono.replace(/\D/g, "");
    if (!digitos) return null;
    const conPais = digitos.startsWith("54") ? digitos : `54${digitos}`;
    return `https://wa.me/${conPais}?text=${encodeURIComponent(mensaje)}`;
  }

  async function copiar() {
    try {
      await navigator.clipboard.writeText(mensaje);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2500);
    } catch {
      setCopiado(false);
    }
  }

  return (
    <div className="rounded-xl border bg-muted/30 p-3">
      <button
        type="button"
        onClick={() => setAbierto((v) => !v)}
        className="flex w-full items-center justify-between gap-2 text-left"
        aria-expanded={abierto}
      >
        <span className="flex items-center gap-2 text-sm font-medium">
          <Star className="h-4 w-4 text-amber-500" aria-hidden="true" />
          Invitar a los compradores a dejar su reseña
        </span>
        <ChevronDown
          className={cn("h-4 w-4 shrink-0 transition-transform", abierto && "rotate-180")}
          aria-hidden="true"
        />
      </button>

      {abierto && (
        <div className="mt-3 space-y-3">
          {compradores.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Todavía no hay compradores con números vendidos en este sorteo.
            </p>
          ) : (
            <>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="outline" onClick={() => void copiar()}>
                  <Copy className="mr-1.5 h-4 w-4" />
                  {copiado ? "Mensaje copiado" : "Copiar mensaje para el grupo"}
                </Button>
              </div>

              <p className="text-xs text-muted-foreground">
                Se manda uno por uno: sólo los compradores de este sorteo pueden reseñar, y
                la plataforma no envía mensajes por vos. El texto ya viene escrito.
              </p>

              <ul className="space-y-1.5">
                {compradores.map((c) => {
                  const href = enlaceWhatsApp(c.telefono);
                  return (
                    <li
                      key={`${c.nombre}-${c.telefono ?? "sin-telefono"}`}
                      className="flex flex-wrap items-center justify-between gap-2 rounded-lg border bg-card px-3 py-2"
                    >
                      <span className="text-sm">
                        <span className="font-medium">{c.nombre}</span>
                        <span className="ml-2 text-xs text-muted-foreground">
                          {c.numeros} número{c.numeros === 1 ? "" : "s"}
                        </span>
                      </span>
                      {href ? (
                        <a
                          href={href}
                          target="_blank"
                          rel="noopener noreferrer"
                          className={buttonVariants({ variant: "outline", size: "sm" })}
                        >
                          <MessageCircle className="mr-1.5 h-4 w-4" /> WhatsApp
                        </a>
                      ) : (
                        <span className="text-xs text-muted-foreground">sin teléfono</span>
                      )}
                    </li>
                  );
                })}
              </ul>
            </>
          )}

          <p className="text-xs text-muted-foreground">
            La reseña sólo la puede dejar quien compró un número de este sorteo, y recién
            cuando está sorteado. Enlace directo:{" "}
            <span className="font-mono">{enlaceResena}</span>
          </p>
        </div>
      )}
    </div>
  );
}
