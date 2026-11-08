import { createNavigation } from "next-intl/navigation";

import { routing } from "./routing";

/**
 * Navegación que respeta el prefijo del locale actual.
 *
 * Usar este `Link` solo para rutas migradas a `app/[locale]`. Para rutas que
 * existen únicamente en español (admin, perfil, legales, etc.) se sigue usando
 * `next/link`: si se prefijaran con `/en`, darían 404.
 */
export const { Link, redirect, usePathname, useRouter, getPathname } =
  createNavigation(routing);
