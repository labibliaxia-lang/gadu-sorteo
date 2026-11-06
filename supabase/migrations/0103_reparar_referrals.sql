-- =====================================================================
-- 0103 — Reparar `referrals`: deduplicar y restaurar el unique
-- =====================================================================
-- La tabla real no coincide con la 0007 del repo:
--   · tiene `raffle_id` (la app no la usa al insertar),
--   · las FKs apuntan a `profiles` en vez de `auth.users`,
--   · **no tiene** `unique (referrer_id, referred_id)`.
--
-- Sin ese unique, `ReferralCapture` inserta el mismo par una y otra vez (su
-- comentario espera 23505, que nunca llega) y `reward_referral` premia una vez
-- por fila: un mismo invitado podía generar varios números gratis.
--
-- Esta migración:
--   1. Conserva una fila por par: la que ya está premiada, si existe.
--   2. Agrega el unique que el código asume.
--   3. Deja `raffle_id` nullable (la app no lo envía).
--
-- Idempotente.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 0) raffle_id nullable: la app inserta solo referrer_id y referred_id
-- ---------------------------------------------------------------------
do $$
begin
  if exists (
    select 1 from information_schema.columns
     where table_schema = 'public'
       and table_name = 'referrals'
       and column_name = 'raffle_id'
       and is_nullable = 'NO'
  ) then
    alter table public.referrals alter column raffle_id drop not null;
  end if;
end;
$$;

-- ---------------------------------------------------------------------
-- 1) Deduplicar. Primero borra duplicados sin premio si el par tiene uno
--    premiado; después conserva la fila más antigua de cada par.
-- ---------------------------------------------------------------------
delete from public.referrals a
 using public.referrals b
 where a.referrer_id = b.referrer_id
   and a.referred_id = b.referred_id
   and b.rewarded
   and not a.rewarded;

delete from public.referrals a
 using public.referrals b
 where a.referrer_id = b.referrer_id
   and a.referred_id = b.referred_id
   and (a.created_at, a.id) > (b.created_at, b.id);

-- ---------------------------------------------------------------------
-- 2) Unique que el código ya daba por sentado
-- ---------------------------------------------------------------------
do $$
begin
  if not exists (
    select 1
      from pg_constraint
     where conrelid = 'public.referrals'::regclass
       and contype = 'u'
       and pg_get_constraintdef(oid) ilike '%(referrer_id, referred_id)%'
  ) then
    alter table public.referrals
      add constraint referrals_unique unique (referrer_id, referred_id);
  end if;
end;
$$;

-- ---------------------------------------------------------------------
-- Ledger
-- ---------------------------------------------------------------------
do $$
begin
  if to_regclass('public._applied_migrations') is not null then
    insert into public._applied_migrations (version, note)
    values ('0103', 'reparar referrals: deduplicar, unique real y raffle_id nullable')
    on conflict (version) do nothing;
  end if;
end;
$$;
