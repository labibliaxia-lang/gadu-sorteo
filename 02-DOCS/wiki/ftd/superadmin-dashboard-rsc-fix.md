---
author: Gadu
branch: main
status: done
---
# Fix: client-side exception en `/admin/super`

## Intent

Que el superadmin pueda entrar después de validar la clave maestra sin que el dashboard explote.

## Causa

`app/admin/super/page.tsx` es un Server Component y pasaba `icon: Users` / `icon: Coins` a
`MetricBarChart`, un Client Component. React Server Components no permite pasar funciones entre el
servidor y el cliente. En desarrollo el error es explícito:

> Functions cannot be passed directly to Client Components unless you explicitly expose it by
> marking it with "use server".

En producción Next lo muestra como **“Application error: a client-side exception has occurred”**.
La clave se había aceptado: el redirect ocurría; el crash era al renderizar el dashboard.

## Fix

- `MetricBarChart` ahora recibe un icono **serializable** (`"users"` | `"coins"`) y lo mapea a
  `Users`/`Coins` dentro del Client Component.
- `app/admin/super/page.tsx` pasa strings, no componentes.

## Evidencia

- Prueba aislada de los gráficos reprodujo el error de RSC al pasar una función.
- `typecheck` 0 · `lint` 0 warnings · `test` 127/127 · `build` 0.
- La página `/admin/super` ya no pasa funciones a componentes cliente.

## Nota de seguridad

La clave maestra se compartió en el chat durante el diagnóstico. Debe rotarse después de confirmar
el acceso, con el mismo procedimiento de hash en `.env.local` o en Vercel.
