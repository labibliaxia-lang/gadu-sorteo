-- =====================================================================
-- 0073 — El organizador ve el contacto del comprador, no su fila entera
-- =====================================================================
-- Hallazgo (auditoría 2026-11-04, MEDIA nº 15):
--   `profiles_select_own_raffle_buyers` (0030:183) le daba al organizador la
--   fila COMPLETA de todo comprador de sus sorteos: email, teléfono, DNI,
--   dirección de entrega, plan, rol y sanciones.
--
--   El único uso real es nombre y teléfono, para validar una transferencia en
--   `app/admin/sorteos/[id]/page.tsx:165-176`. El resto (DNI, email, domicilio)
--   no lo necesita nadie para eso, y exponerlo contradice la propia política de
--   privacidad del sitio.
--
-- Qué hace:
--   1. Vista `raffle_buyers` con solo raffle_id, buyer_id, full_name, phone y
--      kind. Filtrada por dueño del sorteo o superadmin.
--   2. Quita la política amplia sobre `profiles`.
--
-- Por qué una vista y no columnas: RLS no oculta columnas. La vista corre con
-- los privilegios de su dueño (`security_invoker = false`), así que el WHERE es
-- la única barrera y tiene que cubrir los dos casos permitidos: el dueño del
-- sorteo y el superadmin. Por eso la verificación prueba las dos caras: el
-- dueño ve a sus compradores y otro organizador no ve nada.
--
-- Idempotente.
-- =====================================================================

create or replace view public.raffle_buyers
with (security_invoker = false) as
select distinct
       n.raffle_id,
       buyer.id as buyer_id,
       buyer.full_name,
       buyer.phone,
       case
         when n.reserved_by is not null then 'reserved'
         else 'sold'
       end as kind
  from public.raffle_numbers n
  join public.raffles r on r.id = n.raffle_id
  join public.profiles buyer on buyer.id = coalesce(n.reserved_by, n.sold_to)
 where coalesce(n.reserved_by, n.sold_to) is not null
   and (r.created_by = auth.uid() or public.is_superadmin());

comment on view public.raffle_buyers is
  'Contacto del comprador para el organizador dueño del sorteo: nombre y teléfono, nada más. Reemplaza la politica profiles_select_own_raffle_buyers (0073).';

revoke all on public.raffle_buyers from public, anon, authenticated;
grant select on public.raffle_buyers to authenticated;

-- La política amplia: el organizador ya no puede leer la fila entera del
-- comprador. El panel usa la vista de arriba.
drop policy if exists "profiles_select_own_raffle_buyers" on public.profiles;

-- ---------------------------------------------------------------------
-- Ledger
-- ---------------------------------------------------------------------
do $$
begin
  if to_regclass('public._applied_migrations') is not null then
    insert into public._applied_migrations (version, note)
    values ('0073', 'el organizador ve nombre y telefono del comprador por vista, no la fila entera del perfil')
    on conflict (version) do nothing;
  end if;
end;
$$;

-- =====================================================================
-- Verificación (prueba completa: supabase/tests/verificar_0073.sql)
-- =====================================================================
--   select column_name from information_schema.columns
--    where table_name = 'raffle_buyers';  -- 5 columnas, sin PII de más
--
-- Rollback:
--   drop view if exists public.raffle_buyers;
--   -- y recrear la política de 0030:183 si hiciera falta.
-- =====================================================================
