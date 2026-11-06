-- =====================================================================
-- 0094 — Enlace directo para que el comprador avise la devolución
-- =====================================================================
-- Idea del dueño: el organizador comparte un enlace y el jugador confirma
-- desde ahí, sin buscar en su panel ni iniciar sesión.
--
-- Qué agrega:
--   1. `refunds.confirmation_token`: token aleatorio y único por devolución.
--   2. `refund_by_token(token)`: datos mínimos para mostrar la página
--      (sorteo, importe, estado, si ya confirmó). Sin datos personales.
--   3. `confirm_refund_by_token(token)`: registra la confirmación y avisa al
--      organizador. Idempotente.
--
-- El token es la única llave: quien lo tiene puede confirmar esa devolución.
-- No expone nombre, teléfono ni email del comprador.
--
-- Idempotente.
-- =====================================================================

alter table public.refunds
  add column if not exists confirmation_token uuid not null default gen_random_uuid();

create unique index if not exists refunds_confirmation_token_idx
  on public.refunds (confirmation_token);

-- ---------------------------------------------------------------------
-- Lectura pública por token
-- ---------------------------------------------------------------------
create or replace function public.refund_by_token(p_token uuid)
returns table (
  raffle_title text,
  amount numeric,
  status text,
  confirmed boolean
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  return query
  select
    rf.title,
    r.amount,
    r.status,
    r.buyer_confirmed_at is not null
  from public.refunds r
  join public.raffles rf on rf.id = r.raffle_id
  where r.confirmation_token = p_token
  limit 1;
end;
$$;

revoke all on function public.refund_by_token(uuid) from public;
grant execute on function public.refund_by_token(uuid) to anon, authenticated, service_role;

-- ---------------------------------------------------------------------
-- Confirmación por token
-- ---------------------------------------------------------------------
create or replace function public.confirm_refund_by_token(p_token uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_refund record;
  v_owner uuid;
  v_nombre text;
  v_telefono text;
begin
  select r.id, r.raffle_id, r.amount, r.user_id, r.buyer_confirmed_at
    into v_refund
    from public.refunds r
   where r.confirmation_token = p_token
   for update;

  if not found then
    raise exception 'El enlace no es válido';
  end if;

  if v_refund.buyer_confirmed_at is not null then
    return true;
  end if;

  update public.refunds
     set buyer_confirmed_at = now()
   where id = v_refund.id;

  select rf.created_by into v_owner
    from public.raffles rf
   where rf.id = v_refund.raffle_id;

  if v_owner is null then
    return true;
  end if;

  select
    coalesce(nullif(btrim(p.full_name), ''), 'Un comprador'),
    nullif(btrim(p.phone), '')
    into v_nombre, v_telefono
    from public.profiles p
   where p.id = v_refund.user_id;

  insert into public.notifications (
    user_id, type, raffle_id, subject_user_id, payload, priority
  )
  values (
    v_owner,
    'refund_confirmed',
    v_refund.raffle_id,
    v_refund.user_id,
    jsonb_build_object(
      'refund_id', v_refund.id,
      'amount', v_refund.amount,
      'buyer_name', coalesce(v_nombre, 'Un comprador'),
      'buyer_phone', v_telefono,
      'via', 'link'
    ),
    'normal'
  );

  return true;
end;
$$;

revoke all on function public.confirm_refund_by_token(uuid) from public;
grant execute on function public.confirm_refund_by_token(uuid) to anon, authenticated, service_role;

-- ---------------------------------------------------------------------
-- Ledger
-- ---------------------------------------------------------------------
do $$
begin
  if to_regclass('public._applied_migrations') is not null then
    insert into public._applied_migrations (version, note)
    values ('0094', 'enlace con token para que el comprador confirme la devolucion sin login')
    on conflict (version) do nothing;
  end if;
end;
$$;
