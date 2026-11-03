"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { Ticket } from "lucide-react";

import {
  youtubeEmbedUrl,
  type LandingBlock,
} from "@/lib/landing";

/**
 * Renderiza la landing promocional con componentes React (sin HTML crudo).
 * El CTA fijo lleva al grid de números y se oculta cuando el grid ya está a la
 * vista.
 */
export function RaffleLanding({
  blocks,
  showCta,
}: {
  blocks: LandingBlock[];
  showCta: boolean;
}) {
  const [gridVisible, setGridVisible] = useState(false);

  useEffect(() => {
    if (!showCta) return;

    const target = document.getElementById("elegir-numeros");
    if (!target) return;

    const observer = new IntersectionObserver(
      (entries) => {
        setGridVisible(entries[0]?.isIntersecting ?? false);
      },
      { rootMargin: "-80px 0px 0px 0px", threshold: 0.05 },
    );

    observer.observe(target);
    return () => observer.disconnect();
  }, [showCta]);

  function scrollToGrid() {
    document
      .getElementById("elegir-numeros")
      ?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  return (
    <section className="space-y-6">
      {blocks.map((block) => {
        if (block.type === "text") {
          return (
            <div key={block.id} className="space-y-2">
              {block.title && (
                <h2 className="text-2xl font-bold tracking-tight">
                  {block.title}
                </h2>
              )}
              <p className="whitespace-pre-line text-base leading-relaxed text-muted-foreground">
                {block.body}
              </p>
            </div>
          );
        }

        if (block.type === "image") {
          return (
            <figure key={block.id} className="space-y-2">
              <Image
                src={block.url}
                alt={block.alt || "Imagen del sorteo"}
                width={1200}
                height={675}
                sizes="(max-width: 768px) 100vw, 768px"
                className="h-auto w-full rounded-2xl object-cover shadow-sm"
              />
              {block.caption && (
                <figcaption className="text-center text-sm text-muted-foreground">
                  {block.caption}
                </figcaption>
              )}
            </figure>
          );
        }

        const embed = youtubeEmbedUrl(block.url);

        return (
          <div
            key={block.id}
            className="overflow-hidden rounded-2xl border shadow-sm"
          >
            {embed ? (
              <iframe
                src={embed}
                title="Video del sorteo"
                className="aspect-video w-full"
                loading="lazy"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
              />
            ) : (
              <p className="p-4 text-sm text-muted-foreground">
                El video no está disponible.
              </p>
            )}
          </div>
        );
      })}

      {showCta && !gridVisible && (
        <button
          type="button"
          onClick={scrollToGrid}
          className="fixed bottom-24 right-4 z-40 inline-flex items-center gap-2 rounded-full bg-emerald-700 px-5 py-3 text-sm font-semibold text-white shadow-lg transition hover:bg-emerald-800 lg:bottom-6"
        >
          <Ticket className="h-4 w-4" />
          Participar y elegir mis números
        </button>
      )}
    </section>
  );
}
