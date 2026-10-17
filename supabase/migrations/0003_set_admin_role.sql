-- =====================================================================
-- 0003 — Promover un usuario (Google) al rol de administrador
-- =====================================================================
-- INSTRUCCIONES:
--   1. Reemplazá el email de ejemplo por el email EXACTO de tu cuenta Google.
--      Buscalo en: Authentication → Users (o con el SELECT de abajo).
--   2. Ejecutá todo el archivo en el SQL Editor de Supabase.
--
-- SEGURIDAD:
--   - Solo actualiza el perfil cuyo auth.users.email coincide.
--   - Si el email no existe, no se modifica NINGUNA fila.
--   - No toca la estructura de profiles ni las políticas RLS.
-- =====================================================================

-- La tabla profiles NO almacena el email, por eso lo localizamos cruzando con
-- auth.users (mismo id).
update public.profiles
set role = 'admin'
where id = (
  select u.id
  from auth.users u
  where lower(u.email) = lower('TU_EMAIL_DE_GOOGLE_AQUI@gmail.com')
  limit 1
);

-- ---------------------------------------------------------------------
-- Verificación: debe devolver role = 'admin' para tu usuario.
-- (Reemplazá el mismo email que usaste arriba.)
-- ---------------------------------------------------------------------
select p.id, p.full_name, p.role, u.email
from public.profiles p
join auth.users u on u.id = p.id
where lower(u.email) = lower('TU_EMAIL_DE_GOOGLE_AQUI@gmail.com');

-- ---------------------------------------------------------------------
-- ALTERNATIVA por UUID (si preferís no usar el email):
--   1. Copiá el UUID desde Authentication → Users.
--   2. Reemplazá 'AQUI_EL_UUID' y descomentá las dos líneas siguientes.
-- ---------------------------------------------------------------------
-- update public.profiles
-- set role = 'admin'
-- where id = 'AQUI_EL_UUID';
