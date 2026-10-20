-- =====================================================================
-- 0003 — Otorgar rol 'admin' al usuario principal
-- =====================================================================
-- INSTRUCCIONES:
--   1. Reemplazá 'tu-email@gmail.com' por el email EXACTO de tu cuenta
--      (el que usás para iniciar sesión con Google en la app).
--   2. Ejecutá todo el archivo en: Supabase → SQL Editor → New query → Run.
--
-- SEGURIDAD:
--   - Solo actualiza el perfil cuyo auth.users.email coincide.
--   - Si el email no existe, NO modifica ninguna fila.
--   - No toca la estructura de profiles ni las políticas RLS.
-- =====================================================================

-- La tabla profiles no guarda el email, por eso lo localizamos cruzando
-- con auth.users (mismo id).
update public.profiles
set role = 'admin'
where id = (
  select u.id
  from auth.users u
  where lower(u.email) = lower('tu-email@gmail.com')  -- 👈 REEMPLAZÁ ESTE EMAIL
  limit 1
);

-- ---------------------------------------------------------------------
-- Verificación (solo lectura): debe devolver role = 'admin'.
-- Reemplazá el mismo email que usaste arriba.
-- ---------------------------------------------------------------------
select p.id, p.full_name, p.role, u.email
from public.profiles p
join auth.users u on u.id = p.id
where lower(u.email) = lower('tu-email@gmail.com');  -- 👈 REEMPLAZÁ ESTE EMAIL
