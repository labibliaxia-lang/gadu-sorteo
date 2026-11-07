-- =====================================================================
-- 0117 — Recálculo automático de precios locales al cambiar el USD
-- =====================================================================
-- Cuando el Superadmin guarda un nuevo `price_usd`, el trigger recalcula
-- `price_ars`, `price_mxn`, `price_cop` y `price_clp` con la cotización
-- vigente en `exchange_rates`.
--
-- Es BEFORE UPDATE OF price_usd:
--   - recalcula la misma fila (no hace un segundo UPDATE);
--   - no puede recursar, porque el UPDATE interno solo toca precio_usd;
--   - si price_usd = 0 (Free/Social), todos los locales quedan en 0.
--
-- No toca cron, UI, permisos ni otras columnas.
-- Idempotente.
-- =====================================================================

create or replace function public.recalcular_precios_plan()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ars numeric;
  v_mxn numeric;
  v_cop numeric;
  v_clp numeric;
begin
  -- Sin guard de «mismo valor»: si la sentencia incluye price_usd, se
  -- recalcula siempre. Así un guardado que reenvía el mismo USD también
  -- resincroniza los locales con la cotización vigente.
  if new.price_usd is null or new.price_usd <= 0 then
    new.price_ars := 0;
    new.price_mxn := 0;
    new.price_cop := 0;
    new.price_clp := 0;
    return new;
  end if;

  select
    max(rate_to_usd) filter (where currency_code = 'ARS'),
    max(rate_to_usd) filter (where currency_code = 'MXN'),
    max(rate_to_usd) filter (where currency_code = 'COP'),
    max(rate_to_usd) filter (where currency_code = 'CLP')
  into v_ars, v_mxn, v_cop, v_clp
  from public.exchange_rates;

  new.price_ars := round(new.price_usd * coalesce(v_ars, 0), 2);
  new.price_mxn := round(new.price_usd * coalesce(v_mxn, 0), 2);
  new.price_cop := round(new.price_usd * coalesce(v_cop, 0), 2);
  new.price_clp := round(new.price_usd * coalesce(v_clp, 0), 2);

  return new;
end;
$$;

drop trigger if exists recalcular_precios_plan on public.plan_configs;
create trigger recalcular_precios_plan
  before update of price_usd on public.plan_configs
  for each row execute procedure public.recalcular_precios_plan();

do $$
begin
  if to_regclass('public._applied_migrations') is not null then
    insert into public._applied_migrations (version, note)
    values ('0117', 'recalculo de precios locales al cambiar price_usd via trigger')
    on conflict (version) do nothing;
  end if;
end;
$$;
