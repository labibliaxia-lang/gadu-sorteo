-- =====================================================================
-- 0046 — Preguntas y respuestas por sorteo (idempotente)
-- =====================================================================
-- Compradores logueados pueden preguntar (máx. 3 por día por sorteo); el
-- organizador dueño responde; el autor, el organizador o el superadmin pueden
-- borrar. El texto es plano (sin HTML) y se valida también en la app con Zod.
--
-- No toca pagos, reservas ni el motor de sorteo.
-- =====================================================================

create table if not exists public.raffle_questions (
  id uuid primary key default gen_random_uuid(),
  raffle_id uuid not null references public.raffles (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  question text not null check (char_length(question) between 5 and 300),
  answer text check (answer is null or char_length(answer) between 2 and 500),
  created_at timestamptz not null default now(),
  answered_at timestamptz
);

create index if not exists raffle_questions_raffle_created_idx
  on public.raffle_questions (raffle_id, created_at desc);
create index if not exists raffle_questions_user_idx
  on public.raffle_questions (user_id, created_at desc);

alter table public.raffle_questions enable row level security;

-- Todos leen; cualquier autenticado pregunta (el trigger limita a 3/día).
drop policy if exists raffle_questions_select_public on public.raffle_questions;
create policy raffle_questions_select_public
  on public.raffle_questions for select
  using (true);

drop policy if exists raffle_questions_insert_auth on public.raffle_questions;
create policy raffle_questions_insert_auth
  on public.raffle_questions for insert
  to authenticated
  with check (auth.uid() = user_id);

-- Solo el organizador dueño del sorteo (o superadmin) responde.
drop policy if exists raffle_questions_update_organizer on public.raffle_questions;
create policy raffle_questions_update_organizer
  on public.raffle_questions for update
  to authenticated
  using (
    public.is_superadmin()
    or exists (
      select 1 from public.raffles r
      where r.id = raffle_questions.raffle_id
        and r.created_by = auth.uid()
    )
  )
  with check (
    public.is_superadmin()
    or exists (
      select 1 from public.raffles r
      where r.id = raffle_questions.raffle_id
        and r.created_by = auth.uid()
    )
  );

-- Autores, dueño del sorteo y superadmin pueden borrar.
drop policy if exists raffle_questions_delete_moderation on public.raffle_questions;
create policy raffle_questions_delete_moderation
  on public.raffle_questions for delete
  to authenticated
  using (
    auth.uid() = user_id
    or public.is_superadmin()
    or exists (
      select 1 from public.raffles r
      where r.id = raffle_questions.raffle_id
        and r.created_by = auth.uid()
    )
  );

revoke all on public.raffle_questions from public, anon, authenticated;
grant select on public.raffle_questions to anon, authenticated;
grant insert, update, delete on public.raffle_questions to authenticated;
grant all on public.raffle_questions to service_role;

-- ---------------------------------------------------------------------
-- Rate limit: máximo 3 preguntas por usuario/sorteo en 24 h
-- ---------------------------------------------------------------------
create or replace function public.enforce_question_rate_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  select count(*) into v_count
  from public.raffle_questions
  where user_id = new.user_id
    and raffle_id = new.raffle_id
    and created_at > now() - interval '24 hours';

  if v_count >= 3 then
    raise exception 'Máximo 3 preguntas por día en este sorteo';
  end if;

  return new;
end;
$$;

drop trigger if exists enforce_question_rate_limit on public.raffle_questions;
create trigger enforce_question_rate_limit
  before insert on public.raffle_questions
  for each row execute procedure public.enforce_question_rate_limit();

-- ---------------------------------------------------------------------
-- Trigger: relaciones inmutables y answered_at automático
-- ---------------------------------------------------------------------
create or replace function public.guard_question_update()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if auth.uid() is not null
     and not public.is_superadmin()
     and not exists (
       select 1 from public.raffles r
       where r.id = old.raffle_id and r.created_by = auth.uid()
     ) then
    raise exception 'No autorizado';
  end if;

  if new.user_id is distinct from old.user_id
     or new.raffle_id is distinct from old.raffle_id
     or new.question is distinct from old.question then
    raise exception 'No se puede editar la pregunta';
  end if;

  new.answered_at := case
    when new.answer is null then null
    else coalesce(old.answered_at, now())
  end;

  return new;
end;
$$;

drop trigger if exists guard_question_update on public.raffle_questions;
create trigger guard_question_update
  before update on public.raffle_questions
  for each row execute procedure public.guard_question_update();

insert into public._applied_migrations (version, note)
values ('0046', 'preguntas y respuestas por sorteo con rate limit y moderacion')
on conflict (version) do nothing;
