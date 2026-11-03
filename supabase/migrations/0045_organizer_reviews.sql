-- =====================================================================
-- 0045 — Reseñas verificadas de organizadores (idempotente)
-- =====================================================================
-- Solo un comprador con al menos un número `sold` en un sorteo `drawn` del
-- organizador puede dejar UNA reseña por sorteo (rating 1-5, comentario <=500).
-- El organizador puede responder (reply) pero no editar la reseña; el dueño
-- puede editar/borrar la suya. Todo se refuerza con RLS + trigger.
--
-- No toca pagos, reservas ni el motor de sorteo.
-- =====================================================================

create table if not exists public.reviews (
  id uuid primary key default gen_random_uuid(),
  organizer_id uuid not null references public.profiles (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  raffle_id uuid not null references public.raffles (id) on delete cascade,
  user_name text not null default 'Comprador',
  rating integer not null check (rating between 1 and 5),
  comment text not null check (char_length(comment) between 3 and 500),
  reply text check (reply is null or char_length(reply) <= 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, raffle_id)
);

create index if not exists reviews_organizer_created_idx
  on public.reviews (organizer_id, created_at desc);
create index if not exists reviews_raffle_idx
  on public.reviews (raffle_id);

drop trigger if exists reviews_set_updated_at on public.reviews;
create trigger reviews_set_updated_at
  before update on public.reviews
  for each row execute procedure public.set_updated_at();

-- ---------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------
alter table public.reviews enable row level security;

drop policy if exists reviews_select_public on public.reviews;
create policy reviews_select_public
  on public.reviews for select
  using (true);

drop policy if exists reviews_insert_verified on public.reviews;
create policy reviews_insert_verified
  on public.reviews for insert
  to authenticated
  with check (
    auth.uid() = user_id
    and auth.uid() <> organizer_id
    and exists (
      select 1
      from public.raffle_numbers rn
      join public.raffles r on r.id = rn.raffle_id
      where rn.raffle_id = reviews.raffle_id
        and rn.status = 'sold'
        and rn.sold_to = auth.uid()
        and r.status = 'drawn'
        and r.created_by = reviews.organizer_id
    )
  );

drop policy if exists reviews_update_owner_or_organizer on public.reviews;
create policy reviews_update_owner_or_organizer
  on public.reviews for update
  to authenticated
  using (auth.uid() = user_id or auth.uid() = organizer_id)
  with check (auth.uid() = user_id or auth.uid() = organizer_id);

drop policy if exists reviews_delete_owner on public.reviews;
create policy reviews_delete_owner
  on public.reviews for delete
  to authenticated
  using (auth.uid() = user_id or public.is_superadmin());

revoke all on public.reviews from public, anon, authenticated;
grant select on public.reviews to anon, authenticated;
grant insert, update, delete on public.reviews to authenticated;
grant all on public.reviews to service_role;

-- ---------------------------------------------------------------------
-- Trigger: cada rol solo toca sus columnas
-- ---------------------------------------------------------------------
create or replace function public.guard_review_update()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if auth.uid() is null or public.is_superadmin() then
    return new;
  end if;

  -- Relaciones inmutables para cualquier editor humano.
  if new.organizer_id is distinct from old.organizer_id
     or new.user_id is distinct from old.user_id
     or new.raffle_id is distinct from old.raffle_id
     or new.user_name is distinct from old.user_name then
    raise exception 'No autorizado';
  end if;

  if auth.uid() = old.user_id then
    -- El comprador edita su rating/comentario, nunca la respuesta.
    if new.reply is distinct from old.reply then
      raise exception 'El comprador no puede escribir la respuesta del organizador';
    end if;
    return new;
  end if;

  if auth.uid() = old.organizer_id then
    -- El organizador solo escribe la respuesta.
    if new.rating is distinct from old.rating
       or new.comment is distinct from old.comment then
      raise exception 'El organizador no puede editar la reseña';
    end if;
    return new;
  end if;

  raise exception 'No autorizado';
end;
$$;

drop trigger if exists guard_review_update on public.reviews;
create trigger guard_review_update
  before update on public.reviews
  for each row execute procedure public.guard_review_update();

insert into public._applied_migrations (version, note)
values ('0045', 'resenas verificadas de organizadores con reply y RLS')
on conflict (version) do nothing;
