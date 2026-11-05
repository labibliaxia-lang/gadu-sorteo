-- =====================================================================
-- 0078 — El compromiso de la semilla se publica con el sorteo en venta
-- =====================================================================
-- Hallazgo (auditoría 2026-11-04, MEDIA nº 17):
--   `commit_draw_seed` (0034) acepta `status in ('active', 'closed')`, así que
--   un organizador podía cerrar la venta, mirar qué números se vendieron y
--   recién ahí publicar el compromiso. La promesa pública —«la semilla estaba
--   fijada antes del sorteo»— no era comprobable desde afuera: el compromiso
--   podía nacer después del cierre.
--
-- Qué cambia:
--   Solo se publica con el sorteo `active` y `draw_date` futura. Si ya se
--   cerró o la fecha pasó, aborta con un mensaje claro. El sorteo puede
--   reabrirse para publicarlo, y eso es mejor que publicar a destiempo: el
--   `draw_commitment_at` queda antes de la fecha, que es lo que el público
--   puede verificar.
--
-- Qué NO cambia:
--   · la firma (`uuid` → `text`), los grants de 0034 ni el formato del hash;
--   · el motor del sorteo: `draw_winner_core` no llama a esta función;
--   · la regla de una sola publicación por sorteo.
--
-- Idempotente.
-- =====================================================================

create or replace function public.commit_draw_seed(p_raffle_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_seed text;
  v_commitment text;
begin
  if not public.is_admin() then
    raise exception 'No autorizado';
  end if;

  if not public.is_superadmin() and not exists (
    select 1 from public.raffles r
    where r.id = p_raffle_id and r.created_by = auth.uid()
  ) then
    raise exception 'No autorizado';
  end if;

  -- La ventana para comprometerse es la de la venta, no la de después.
  if not exists (
    select 1 from public.raffles
    where id = p_raffle_id
      and status = 'active'
      and draw_date > now()
  ) then
    raise exception
      'El compromiso se publica con el sorteo en venta y antes de la fecha del sorteo. Si ya lo cerraste, reabrilo para publicarlo.';
  end if;

  if exists (
    select 1 from public.raffle_draw_secrets
    where raffle_id = p_raffle_id
  ) then
    raise exception 'El compromiso de este sorteo ya fue publicado';
  end if;

  -- 256 bits de entropía: dos UUID v4 sin guiones.
  v_seed := replace(gen_random_uuid()::text, '-', '')
         || replace(gen_random_uuid()::text, '-', '');

  v_commitment := encode(
    sha256(
      convert_to(
        'gadu:v1|raffle:' || p_raffle_id::text || '|seed:' || v_seed,
        'UTF8'
      )
    ),
    'hex'
  );

  insert into public.raffle_draw_secrets (raffle_id, seed, commitment)
  values (p_raffle_id, v_seed, v_commitment);

  update public.raffles
  set draw_commitment = v_commitment,
      draw_commitment_at = now()
  where id = p_raffle_id;

  return v_commitment;
end;
$$;

-- ---------------------------------------------------------------------
-- Ledger
-- ---------------------------------------------------------------------
do $$
begin
  if to_regclass('public._applied_migrations') is not null then
    insert into public._applied_migrations (version, note)
    values ('0078', 'el compromiso de la semilla solo se publica con el sorteo en venta y antes de la fecha')
    on conflict (version) do nothing;
  end if;
end;
$$;

-- =====================================================================
-- Verificación (prueba: supabase/tests/verificar_0078.sql)
-- =====================================================================
-- Rollback: volver al cuerpo de 0034 (acepta active y closed).
-- =====================================================================
