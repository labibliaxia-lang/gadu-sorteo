-- ============================================================================
-- 0119 — Arreglo de la política de captura de referidos (0118 en producción)
-- ============================================================================
-- Qué pasó: la 0118 escribió el chequeo de «el referente existe» como
--   exists (select 1 from public.profiles p where p.id = referrer_id)
-- dentro del WITH CHECK. Esa subconsulta se evalúa con la RLS del invitado, y
-- en producción `profiles` sólo deja ver la fila propia
-- (`profiles_select_own`: auth.uid() = id). Resultado: el chequeo era siempre
-- falso y el insert legítimo se rechazaba con
-- «new row violates row-level security policy for table referrals».
--
-- Arreglo: la existencia del perfil se consulta con una función SECURITY
-- DEFINER (corre como dueño, sin RLS). Se mantiene el resto de la política:
-- sólo puedo registrarme a mí mismo y no puedo auto-referirme.
--
-- Idempotente. No toca pagos, números ni sorteo.
-- ============================================================================

create or replace function public.perfil_existe(p_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.profiles where id = p_id);
$$;

revoke all on function public.perfil_existe(uuid) from public, anon;
grant execute on function public.perfil_existe(uuid) to authenticated, service_role;

drop policy if exists "referrals_insert_propio" on public.referrals;
create policy "referrals_insert_propio"
  on public.referrals for insert
  to authenticated
  with check (
    -- Sólo puedo registrarme a mí mismo como invitado…
    referred_id = auth.uid()
    -- …y no puedo auto-referirme.
    and referrer_id <> auth.uid()
    -- El referente tiene que ser un perfil real (sin pasar por la RLS de
    -- profiles, que no deja ver perfiles ajenos).
    and public.perfil_existe(referrer_id)
  );

-- El SELECT de la 0118 queda igual: propia o donde soy referente.
drop policy if exists "referrals_select_propio" on public.referrals;
create policy "referrals_select_propio"
  on public.referrals for select
  to authenticated
  using (referred_id = auth.uid() or referrer_id = auth.uid());

-- ----------------------------------------------------------------------------
-- Ledger
-- ----------------------------------------------------------------------------
do $$
begin
  if to_regclass('public._applied_migrations') is not null then
    insert into public._applied_migrations (version, note)
    values ('0119', 'referidos: la política de captura no depende de la RLS de profiles')
    on conflict (version) do nothing;
  end if;
end;
$$;
