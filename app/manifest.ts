import type { MetadataRoute } from "next";

/**
 * PWA: permite "Agregar a pantalla de inicio" en Chrome y Safari.
 * Los íconos usan el logo existente; si mañana hay íconos cuadrados propios,
 * se cambian estas rutas.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Gadu Sorteos",
    short_name: "Gadu",
    description:
      "Sorteos verificables con premios reales. Elegí tus números y participá.",
    start_url: "/",
    display: "standalone",
    background_color: "#0b0f19",
    theme_color: "#0b0f19",
    lang: "es-AR",
    orientation: "portrait",
    icons: [
      {
        src: "/icons/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
