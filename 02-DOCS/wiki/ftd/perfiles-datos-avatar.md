---
author: Gadu
branch: main
status: in-progress
---
# Perfiles editables: datos, foto y adaptación por rol/plan

## Intent

Que cada cuenta pueda completar su perfil desde `/perfil`: foto, nombre y teléfono para todos;
ubicación, Instagram, bio y sitio web para organizadores. Premium se distingue con su insignia y el
perfil público del organizador muestra esos datos.

## Scope

**In:**

- `supabase/migrations/0053_profile_details.sql`: columnas `bio` (≤400) y `website_url`; vista
  `public_organizers` ampliada con bio, web, ubicación e Instagram; bucket público `avatars` con
  lectura pública y escritura solo en la carpeta del dueño.
- `components/ProfileEditor.tsx`: subida de foto (máx. 5 MB) al bucket `avatars`, nombre, teléfono
  privado, y campos públicos solo para organizadores (ubicación, Instagram, bio, web). Guarda con la
  Server Action y refresca.
- `app/perfil/actions.ts` (`updateProfile`): Zod, normaliza web/Instagram, permite avatares del bucket
  propio (o mantener el actual de Google), y solo actualiza campos de presentación.
- `app/perfil/page.tsx`: usa el editor, muestra badge de rol/plan y una tarjeta de KYC para
  organizadores con estado y acceso a `/admin/verificacion`.
- `app/organizador/[slug]/page.tsx` + `lib/types.ts`: muestra bio, ubicación, sitio web e Instagram
  en el perfil público.

**Out:** roles, planes, verificación, pagos y datos de KYC. No se puede cambiar rol ni plan desde el
perfil.

## Checklist

| # | Task | Proof it is done |
|---|------|------------------|
| 1 | Foto de perfil con bucket propio | `ProfileEditor` + migración |
| 2 | Campos por rol/plan | Usuario vs organizador/premium |
| 3 | Bio y web públicas | Vista + perfil público |
| 4 | Privacidad | Teléfono/email no salen en la vista pública |
| 5 | KYC visible para organizadores | Tarjeta con estado |
| 6 | Gates verdes | typecheck/lint/test/build |

## Evidence

**1 — observado.** El editor sube la imagen a `avatars/<user-id>/…`, obtiene la URL pública y la
guarda en `profiles.avatar_url`; la acción rechaza URLs que no sean de ese bucket salvo la actual.

**2 — observado.** Todos ven nombre, foto y teléfono; los organizadores ven además ubicación,
Instagram, bio y web. La insignia muestra «Usuario», «Organizador» u «Organizador Premium» según rol y
plan.

**3, 4 — observado.** La vista `public_organizers` expone solo los campos públicos; el perfil público
los renderiza. Teléfono y email no están en la vista.

**5 — observado.** La tarjeta de KYC aparece solo para admin/superadmin, con estado y link al flujo
existente; el texto aclara que con prepago manual no es obligatorio.

**6 — observado.** `npm run typecheck` → 0. `npm run lint` → `✔ No ESLint warnings or errors`.
`npm test` → 43/43. `npm run build` → 0.

**Pendiente.** Aplicar 0053 y probar la subida de foto y el perfil público con un organizador real.

## KYC (decisión de producto)

Hoy **no es obligatorio**: el flujo de DNI + selfie existe (0017) y el superadmin puede aprobarlo,
pero la exigencia está apagada con `NEXT_PUBLIC_REQUIRE_KYC`. Con prepago manual el riesgo lo asume el
organizador; si se quiere operar como plataforma de pagos, recomiendo exigirlo antes de permitir
publicar sorteos.
