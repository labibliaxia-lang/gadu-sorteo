import { createNavigation } from "next-intl/navigation";

import { routing } from "./routing";

/**
 * Navegación que respeta el prefijo del locale actual.
 *
 * Usar este `Link` para rutas migradas a `app/[locale]` (públicas, auth,
 * legales y admin). Para rutas que existen únicamente en español (perfil,
 * ayuda, seguridad, etc.) se sigue usando `next/link`: si se prefijaran con
 * `/en`, darían 404.
 */
export const { Link, redirect, usePathname, useRouter, getPathname } =
  createNavigation(routing);
