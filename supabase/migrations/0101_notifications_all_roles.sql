-- =====================================================================
-- 0101 — Notificaciones para los tres roles
-- =====================================================================
-- Antes la tabla era solo del organizador y guardaba `type` + `payload`.
-- Ahora sirve para jugadores, organizadores y superadmin:
--
--   · `title` y `message`: texto listo para mostrar (campana y toasts).
--   · `audience`: buyer | organizer | superadmin.
--   · tipos nuevos por rol.
--   · disparadores para reseñas, preguntas, denuncias y KYC pendiente.
--
-- Seguridad: la lectura queda aislada a `user_id = auth.uid()`. El cliente no
-- tiene política de INSERT: escriben las funciones `security definer` y las
-- Server Actions con service role.
--
-- Idempotente.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) Columnas de presentación
-- ---------------------------------------------------------------------
alter table public.notifications
  add column if not exists title text;

alter table public.notifications
  add column if not exists message text;

alter table public.notifications
  add column if not exists audience text;

alter table public.notifications
  drop constraint if exists notifications_audience_check;

alter table public.notifications
  add constraint notifications_audience_check check (
    audience is null or audience in ('buyer', 'organizer', 'superadmin')
  );

-- Las notificaciones viejas son todas del organizador.
update public.notifications
   set audience = 'organizer'
 where audience is null;

-- ---------------------------------------------------------------------
-- 2) Tipos por rol
-- ---------------------------------------------------------------------
alter table public.notifications
  drop constraint if exists notifications_type_check;

alter table public.notifications
  add constraint notifications_type_check check (type in (
    -- organizador (existentes)
    'reservation_pending',
    'payment_approved',
    'reservation_expired',
    'refund_requested',
    'refund_confirmed',
    'winner_unreachable',
    'draw_ready',
    'report_pending',
    -- organizador (nuevos)
    'organizer_review',
    'organizer_question',
    -- jugador
    'buyer_reservation_approved',
    'buyer_reservation_released',
    'buyer_payment_approved',
    'buyer_won',
    -- superadmin
    'super_report',
    'super_kyc'
  ));

-- ---------------------------------------------------------------------
-- 3) RLS: cada uno ve solo lo suyo
-- ---------------------------------------------------------------------
drop policy if exists notifications_select_own on public.notifications;
create policy notifications_select_own
on public.notifications for select
to authenticated
using (user_id = auth.uid());

drop policy if exists notifications_update_own on public.notifications;
create policy notifications_update_own
on public.notifications for update
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

-- ---------------------------------------------------------------------
-- 4) Helper de inserción
-- ---------------------------------------------------------------------
create or replace function public.notificar_usuario(
  p_user_id uuid,
  p_type text,
  p_title text,
  p_message text,
  p_audience text,
  p_raffle_id uuid default null,
  p_subject uuid default null,
  p_payload jsonb default '{}'::jsonb,
  p_priority text default 'normal'
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_user_id is null then
    return;
  end if;

  insert into public.notifications (
    user_id, type, title, message, audience, raffle_id, subject_user_id,
    payload, priority
  )
  values (
    p_user_id, p_type, p_title, p_message, p_audience, p_raffle_id, p_subject,
    coalesce(p_payload, '{}'::jsonb), coalesce(p_priority, 'normal')
  );
end;
$$;

revoke all on function public.notificar_usuario(uuid, text, text, text, text, uuid, uuid, jsonb, text)
  from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- 5) Reseña nueva → organizador
-- ---------------------------------------------------------------------
create or replace function public.notificar_resena()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.notificar_usuario(
    new.organizer_id,
    'organizer_review',
    'Nueva reseña',
    format('%s te dejó %s estrella(s): %s', new.user_name, new.rating, left(new.comment, 160)),
    'organizer',
    new.raffle_id,
    new.user_id,
    jsonb_build_object('rating', new.rating)
  );
  return new;
end;
$$;

drop trigger if exists notificar_resena on public.reviews;
create trigger notificar_resena
  after insert on public.reviews
  for each row execute procedure public.notificar_resena();

-- ---------------------------------------------------------------------
-- 6) Pregunta nueva → organizador
-- ---------------------------------------------------------------------
create or replace function public.notificar_pregunta()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner uuid;
begin
  select created_by into v_owner from public.raffles where id = new.raffle_id;
  if v_owner is null then
    return new;
  end if;

  perform public.notificar_usuario(
    v_owner,
    'organizer_question',
    'Nueva pregunta',
    left(new.question, 200),
    'organizer',
    new.raffle_id,
    new.user_id
  );
  return new;
end;
$$;

drop trigger if exists notificar_pregunta on public.raffle_questions;
create trigger notificar_pregunta
  after insert on public.raffle_questions
  for each row execute procedure public.notificar_pregunta();

-- ---------------------------------------------------------------------
-- 7) Denuncia nueva → todos los superadmin
-- ---------------------------------------------------------------------
create or replace function public.notificar_denuncia()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin record;
begin
  for v_admin in
    select id from public.profiles where role = 'superadmin'
  loop
    perform public.notificar_usuario(
      v_admin.id,
      'super_report',
      'Nueva denuncia de sorteo',
      format('Motivo: %s', new.reason),
      'superadmin',
      new.raffle_id,
      new.reporter_id,
      jsonb_build_object('report_id', new.id, 'reason', new.reason),
      'urgent'
    );
  end loop;
  return new;
end;
$$;

drop trigger if exists notificar_denuncia on public.raffle_reports;
create trigger notificar_denuncia
  after insert on public.raffle_reports
  for each row execute procedure public.notificar_denuncia();

-- ---------------------------------------------------------------------
-- 8) KYC pendiente → todos los superadmin
-- ---------------------------------------------------------------------
create or replace function public.notificar_kyc_pendiente()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin record;
begin
  if new.verification_status <> 'pending'
     or coalesce(old.verification_status, '') = 'pending' then
    return new;
  end if;

  for v_admin in
    select id from public.profiles where role = 'superadmin'
  loop
    perform public.notificar_usuario(
      v_admin.id,
      'super_kyc',
      'Solicitud de verificación',
      'Un organizador necesita revisión de identidad.',
      'superadmin',
      null,
      new.id,
      jsonb_build_object('profile_id', new.id),
      'normal'
    );
  end loop;
  return new;
end;
$$;

drop trigger if exists notificar_kyc_pendiente on public.profiles;
create trigger notificar_kyc_pendiente
  after update of verification_status on public.profiles
  for each row execute procedure public.notificar_kyc_pendiente();

-- ---------------------------------------------------------------------
-- 9) Realtime: la tabla tiene que estar en la publicación para que
--    lleguen los toasts y se actualicen las vistas sin recargar.
-- ---------------------------------------------------------------------
do $$
begin
  if exists (
    select 1 from pg_publication where pubname = 'supabase_realtime'
  ) and not exists (
    select 1
      from pg_publication_tables
     where pubname = 'supabase_realtime'
       and schemaname = 'public'
       and tablename = 'notifications'
  ) then
    alter publication supabase_realtime add table public.notifications;
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
    values ('0101', 'notificaciones multi-rol: title, message, audience, RLS por usuario y disparadores de organizador y superadmin')
    on conflict (version) do nothing;
  end if;
end;
$$;
