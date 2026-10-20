-- =====================================================================
-- 0003 — Promover un usuario (Google) al rol de administrador
-- =====================================================================
-- INSTRUCCIONES:
--   - Usá el email EXACTO con el que iniciaste sesión con Google en la app.
--     Podés verificarlo en: Authentication → Users.
--   - Ejecutá todo el archivo en el SQL Editor de Supabase.
--
-- SEGURIDAD:
--   - Solo actualiza el perfil cuyo auth.users.email coincide.
--   - Si el email no existe, no se modifica NINGUNA fila.
-- =====================================================================

update public.profiles
set role = 'admin'
where id = (
  select u.id
  from auth.users u
  where lower(u.email) = lower('francofsm84@gmail.com')
  limit 1
);

-- Verificación: debe devolver role = 'admin' para tu usuario.
select p.id, p.full_name, p.role, u.email
from public.profiles p
join auth.users u on u.id = p.id
where lower(u.email) = lower('francofsm84@gmail.com');

-- ---------------------------------------------------------------------
-- ALTERNATIVA: si tu login de Google usa labibliaxia@gmail.com,
-- cambiá el email en las DOS sentencias de arriba por:
--   'labibliaxia@gmail.com'
-- (o descomentá el bloque siguiente y comentá el de arriba).
-- ---------------------------------------------------------------------
-- update public.profiles
-- set role = 'admin'
-- where id = (
--   select u.id
--   from auth.users u
--   where lower(u.email) = lower('labibliaxia@gmail.com')
--   limit 1
-- );
