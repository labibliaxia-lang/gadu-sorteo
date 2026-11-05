-- =====================================================================
-- 0067 — El resultado del sorteo solo lo escribe el motor
-- =====================================================================
-- Hallazgo (auditoría 2026-11-04, CRÍTICO):
--   `grant insert, update, delete on public.raffles to authenticated`
--   (0065:87) + la política `raffles_update_owner` (0065:127) permiten al
--   organizador actualizar CUALQUIER columna de su propio sorteo por PostgREST:
--   `status='drawn'`, `winner_number`, `winner_user_id`, `winner_name`,
--   `result_hash`, `numbers_hash`, `draw_seed` y `draw_commitment`.
--   El trigger de congelamiento (0034:295) solo actúa si `old.status='drawn'`,
--   así que un único UPDATE que ya traiga el ganador elegido a mano pasa
--   entero: el verificador público muestra un resultado "certificado" falso.
--
-- Enfoque (no toca el motor):
--   Las funciones del sorteo son `security definer` (0034:70, 0048:54,
--   0058:105, 0042:24), así que dentro de ellas `current_user` es el dueño de
--   la función; un PATCH de PostgREST corre como `authenticated`. Esa
--   diferencia es la firma del motor: no hace falta bandera de sesión ni editar
--   las funciones del sorteo.
--
-- Además (hallazgo ALTO):
--   `profiles_insert_own` (0001:424) permite insertar la propia fila de
--   `profiles` con `role` libre: todos los protectores de rol son BEFORE
--   UPDATE (0010:26, 0014:67). Quien no tenga fila —el código lo prevé en
--   `app/layout.tsx:122`— podía crearse `role='superadmin'`.
--   El trigger nuevo NO puede bloquear un alta (es BEFORE INSERT y solo
--   corrige valores), así que no hay riesgo de dejar a nadie sin registrarse.
--
-- Idempotente: se puede correr dos veces sin efectos distintos.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) Resultado del sorteo: columnas protegidas
-- ---------------------------------------------------------------------
create or replace function public.guard_raffle_result()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  -- service_role (cron, webhook, Server Actions) y el motor (security definer)
  -- escriben sin restricción: son los caminos legítimos.
  if current_user not in ('authenticated', 'anon') then
    return new;
  end if;

  -- Un cliente autenticado nunca cierra un sorteo: eso es salida del motor.
  if new.status = 'drawn' and old.status is distinct from 'drawn' then
    raise exception
      'Un sorteo solo lo cierra el motor de sorteo, no el panel';
  end if;

  if new.winner_number        is distinct from old.winner_number
     or new.winner_user_id    is distinct from old.winner_user_id
     or new.winner_name       is distinct from old.winner_name
     or new.result_hash       is distinct from old.result_hash
     or new.numbers_hash      is distinct from old.numbers_hash
     or new.hashes_at         is distinct from old.hashes_at
     or new.draw_seed         is distinct from old.draw_seed
     or new.draw_seed_revealed_at is distinct from old.draw_seed_revealed_at
     or new.draw_commitment   is distinct from old.draw_commitment
     or new.draw_commitment_at is distinct from old.draw_commitment_at
     or new.drawn_at          is distinct from old.drawn_at then
    raise exception
      'Las columnas del resultado y del compromiso las escribe únicamente el motor de sorteo';
  end if;

  return new;
end;
$$;

drop trigger if exists guard_raffle_result on public.raffles;
create trigger guard_raffle_result
  before update on public.raffles
  for each row execute procedure public.guard_raffle_result();

-- ---------------------------------------------------------------------
-- 2) Alta de perfil: el rol nunca lo elige el cliente
-- ---------------------------------------------------------------------
create or replace function public.force_profile_role_on_insert()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  -- El alta de un usuario nuevo (`handle_new_user`) corre sin sesión:
  -- `auth.uid()` es null y no se toca nada.
  --
  -- Con sesión, el rol es siempre 'user', sin mirar `current_user`: la prueba 7
  -- de `0025_profiles_hardening_report.sql` demuestra que una conexión
  -- privilegiada con claims de usuario saltea cualquier guarda basada en el rol
  -- de conexión. Promover a admin es un UPDATE, y ahí ya están 0010/0014.
  if auth.uid() is not null then
    new.role := 'user';
    new.is_banned := false;
  end if;
  return new;
end;
$$;

drop trigger if exists force_profile_role_on_insert on public.profiles;
create trigger force_profile_role_on_insert
  before insert on public.profiles
  for each row execute procedure public.force_profile_role_on_insert();

-- ---------------------------------------------------------------------
-- 3) Ledger
-- ---------------------------------------------------------------------
do $$
begin
  if to_regclass('public._applied_migrations') is not null then
    insert into public._applied_migrations (version, note)
    values ('0067', 'resultado del sorteo solo lo escribe el motor; rol fijo en el alta de perfil')
    on conflict (version) do nothing;
  end if;
end;
$$;

-- =====================================================================
-- Verificación (correr después de aplicar, en el SQL Editor)
-- =====================================================================
-- a) Los dos triggers existen y apuntan a su función:
--   select tgname, proname
--     from pg_trigger t join pg_proc p on p.oid = t.tgfoid
--    where not t.tgisinternal and tgname in ('guard_raffle_result','force_profile_role_on_insert');
--
-- b) Simulación del ataque, con la sesión de un organizador (debe fallar):
--   -- set local role authenticated;  (dentro de una transacción)
--   -- update public.raffles set status='drawn', winner_number=1 where id='<uuid>';
--   -- ERROR: Un sorteo solo lo cierra el motor de sorteo, no el panel
--
-- c) El motor sigue sorteando: ejecutar un sorteo de prueba desde el panel y
--    comprobar que `status`, `winner_number` y `result_hash` se escriben.
--
-- Rollback (si algo del panel dejara de guardar):
--   drop trigger if exists guard_raffle_result on public.raffles;
--   drop trigger if exists force_profile_role_on_insert on public.profiles;
-- =====================================================================
