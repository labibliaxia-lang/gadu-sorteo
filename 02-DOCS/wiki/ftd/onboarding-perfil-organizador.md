---
author: Gadu
branch: main
status: in-progress
---
# Experiencia del organizador: onboarding y perfil público

## Intent

Un organizador nuevo entraba al panel sin una guía y no tenía una página que lo representara frente a
los compradores. Este cambio agrega un tutorial de tres pasos que se muestra una sola vez, y un perfil
público con su nombre, avatar y sorteos activos, enlazado desde cada sorteo.

## Scope

**In:**

- `components/OrganizerOnboarding.tsx` (nuevo): modal con los tres pasos («Creá tu sorteo»,
  «Compartí el link», «Validá los pagos y sorteá»), botón «Entendido» y «Crear mi primer sorteo».
  Se muestra solo si el rol es `admin` y no tiene sorteos; se recuerda por cuenta en localStorage.
- `app/admin/page.tsx`: monta el onboarding con `show = rol admin && sin sorteos`.
- `app/organizador/[slug]/page.tsx` (nuevo): perfil público. Slug = UUID del organizador validado con
  regex; lee solo `public_organizers` (nombre, avatar, sello) y los sorteos `active` con columnas
  públicas.
- `components/OrganizerCard.tsx` + `app/sorteos/[id]/page.tsx`: la tarjeta del organizador en el
  sorteo público enlaza a `/organizador/<id>`.

**Out:** pagos, webhook, motor de sorteos, base de datos (no hay migración) y cualquier acceso a
`profiles` desde la página pública.

## Checklist

| # | Task | Proof it is done |
|---|------|------------------|
| 1 | Onboarding con 3 pasos, solo para admin sin sorteos | Lectura del componente y del dashboard |
| 2 | «Entendido» cierra y no vuelve a aparecer por cuenta | Lectura de localStorage |
| 3 | Perfil público con avatar, nombre y sorteos activos | Lectura + build |
| 4 | Sin email, teléfono ni KYC en el perfil | Lectura de la consulta a `public_organizers` |
| 5 | Slug validado (UUID) y página 404 si no existe | Lectura de la página |
| 6 | Nombre del organizador clickeable en el sorteo | Lectura de `OrganizerCard` |
| 7 | Tipos, lint, tests y build limpios | Los cuatro gates |

## Evidence

**1, 2 — observado.** El modal renderiza los tres pasos con íconos y se controla con
`show={profile?.role === "admin" && list.length === 0}` en el dashboard. La clave
`gadu:onboarding:<userId>` se guarda al tocar «Entendido», la X, Escape o «Crear mi primer sorteo»; si
`localStorage` está bloqueado se muestra igual y se cierra en la visita.

**3, 4 — observado.** `app/organizador/[slug]/page.tsx` consulta `public_organizers`
(`id, full_name, avatar_url, is_verified`) y `raffles` filtrando `created_by` y `status = 'active'`.
No consulta `profiles`, así que email, teléfono y KYC no están disponibles en esa ruta.

**5 — observado.** El slug se valida con `UUID_RE` antes de consultar; cualquier otro valor o un id
inexistente cae en `notFound()`. Es un UUID v4 aleatorio: no se puede enumerar por secuencia y no
mapea a datos internos sensibles (los sorteos activos ya son públicos).

**6 — observado.** `OrganizerCard` acepta `href` y envuelve la tarjeta en un `Link`; la página del
sorteo pasa `/organizador/<created_by>`.

**7 — observado.** `npm run typecheck` → 0. `npm run lint` → `✔ No ESLint warnings or errors`.
`npm test` → 38/38. `npm run build` → 0; `/organizador/[slug]` 191 B.

**Límite conocido.** La vista `public_organizers` filtra `role = 'admin'`: si un sorteo lo creó un
superadmin, no tiene perfil público y la tarjeta del organizador no se muestra (tampoco antes de este
cambio). El slug es el UUID; no hay URL amigable por nombre porque no existe columna de slug.

## Next

Probar el onboarding con una cuenta de organizador sin sorteos y el perfil desde un sorteo activo.
Después: slug amigable (nombre + sufijo) con migración propia, y en el perfil mostrar también los
sorteos finalizados del organizador.
