-- =====================================================================
-- 0091 — Fotos de los premios entregados
-- =====================================================================
-- Qué resuelve: un sorteo terminado no dejaba ninguna prueba de que el premio
-- se entregó. El ganador aparecía en el certificado y nada más. Quien entra a
-- mirar sorteos viejos de un organizador no tenía forma de saber si paga.
--
-- Quién publica:
--   · el organizador dueño del sorteo  -> se publica directo (approved)
--   · el ganador del sorteo            -> queda pendiente hasta que el
--     organizador lo apruebe. Es lo que se pidió: las fotos del ganador pasan
--     por aprobación.
--
-- Por qué el ganador se identifica por el número y no por un campo aparte:
-- `raffles.winner_number` es el número sorteado, y `raffle_numbers.sold_to` dice
-- de quién era. Esa es la única definición de ganador que ya existe y que se
-- puede verificar contra el hash. Crear un `winner_user_id` nuevo daría dos
-- fuentes de verdad para lo mismo.
--
-- Solo en sorteos terminados: el insert exige `status = 'drawn'`. Una foto de
-- entrega en un sorteo activo sería una promesa, no una prueba.
--
-- La imagen se guarda en el bucket `raffle-images` (0001), que ya es público
-- para lectura, bajo la carpeta `entregas/<raffle_id>/`. Lo que se protege es
-- la FILA de la tabla, no el archivo: la política de storage permite subir a
-- cualquier autenticado, así que alguien podría dejar archivos huérfanos en el
-- bucket. No son visibles (no tienen fila que los muestre) pero ocupan espacio.
--
-- Idempotente.
-- =====================================================================

create table if not exists public.raffle_delivery_photos (
  id uuid primary key default gen_random_uuid(),
  raffle_id uuid not null references public.raffles (id) on delete cascade,
  uploaded_by uuid not null references auth.users (id) on delete cascade,
  url text not null,
  caption text check (caption is null or char_length(caption) <= 200),
  status text not null default 'pending' check (status in ('pending', 'approved')),
  approved_by uuid references auth.users (id) on delete set null,
  approved_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists raffle_delivery_photos_raffle_idx
  on public.raffle_delivery_photos (raffle_id, status, created_at desc);

alter table public.raffle_delivery_photos enable row level security;

-- Permisos de tabla. Sin esto la RLS es decorativa: la política dice «sí» pero
-- el rol no tiene con qué escribir. `anon` sólo lee (las fotos aprobadas son
-- públicas); escribir, aprobar y borrar es para `authenticated`, y la RLS de
-- abajo decide el resto.
grant select on public.raffle_delivery_photos to anon, authenticated;
grant insert, update, delete on public.raffle_delivery_photos to authenticated;
grant all on public.raffle_delivery_photos to service_role;

-- ---------------------------------------------------------------------
-- Quién ve qué
--   · todos: las aprobadas (es el punto de la feature: prueba pública)
--   · el organizador: todas las de sus sorteos, para poder aprobar
--   · el que subió: la suya, aunque esté pendiente
-- ---------------------------------------------------------------------
drop policy if exists raffle_delivery_photos_select on public.raffle_delivery_photos;
create policy raffle_delivery_photos_select
  on public.raffle_delivery_photos for select
  using (
    status = 'approved'
    or uploaded_by = auth.uid()
    or exists (
      select 1 from public.raffles r
      where r.id = raffle_delivery_photos.raffle_id
        and (r.created_by = auth.uid() or public.is_superadmin())
    )
  );

-- ---------------------------------------------------------------------
-- Quién publica: el dueño del sorteo o el ganador, y sólo si está sorteado.
-- El estado inicial lo decide el trigger, no el cliente.
-- ---------------------------------------------------------------------
drop policy if exists raffle_delivery_photos_insert on public.raffle_delivery_photos;
create policy raffle_delivery_photos_insert
  on public.raffle_delivery_photos for insert
  to authenticated
  with check (
    auth.uid() = uploaded_by
    and exists (
      select 1 from public.raffles r
      where r.id = raffle_delivery_photos.raffle_id
        and r.status = 'drawn'
        and (
          r.created_by = auth.uid()
          or exists (
            select 1
            from public.raffle_numbers n
            where n.raffle_id = r.id
              and n.number = r.winner_number
              and n.sold_to = auth.uid()
          )
        )
    )
  );

-- Aprobar o rechazar: sólo el organizador dueño (o superadmin). El ganador no
-- puede aprobarse sus propias fotos.
drop policy if exists raffle_delivery_photos_update on public.raffle_delivery_photos;
create policy raffle_delivery_photos_update
  on public.raffle_delivery_photos for update
  using (
    exists (
      select 1 from public.raffles r
      where r.id = raffle_delivery_photos.raffle_id
        and (r.created_by = auth.uid() or public.is_superadmin())
    )
  )
  with check (
    exists (
      select 1 from public.raffles r
      where r.id = raffle_delivery_photos.raffle_id
        and (r.created_by = auth.uid() or public.is_superadmin())
    )
  );

-- Borrar: el que la subió o el organizador.
drop policy if exists raffle_delivery_photos_delete on public.raffle_delivery_photos;
create policy raffle_delivery_photos_delete
  on public.raffle_delivery_photos for delete
  using (
    uploaded_by = auth.uid()
    or exists (
      select 1 from public.raffles r
      where r.id = raffle_delivery_photos.raffle_id
        and (r.created_by = auth.uid() or public.is_superadmin())
    )
  );

-- ---------------------------------------------------------------------
-- El estado inicial no se elige desde el cliente: lo pone el trigger.
--   organizador -> approved (publica y se hace cargo)
--   ganador     -> pending   (espera la aprobación del organizador)
-- ---------------------------------------------------------------------
create or replace function public.decidir_estado_foto_entrega()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_duenio uuid;
begin
  select created_by into v_duenio
  from public.raffles
  where id = new.raffle_id;

  if v_duenio is not null and v_duenio = auth.uid() then
    new.status := 'approved';
    new.approved_by := auth.uid();
    new.approved_at := now();
  else
    new.status := 'pending';
    new.approved_by := null;
    new.approved_at := null;
  end if;

  return new;
end;
$$;

drop trigger if exists decidir_estado_foto_entrega on public.raffle_delivery_photos;
create trigger decidir_estado_foto_entrega
  before insert on public.raffle_delivery_photos
  for each row execute procedure public.decidir_estado_foto_entrega();

-- Aprobar desde la app: al pasar a approved se completa quién y cuándo.
create or replace function public.sellar_aprobacion_foto_entrega()
returns trigger
language plpgsql
security invoker
as $$
begin
  if new.status = 'approved' and old.status is distinct from 'approved' then
    new.approved_by := auth.uid();
    new.approved_at := now();
  end if;
  return new;
end;
$$;

drop trigger if exists sellar_aprobacion_foto_entrega on public.raffle_delivery_photos;
create trigger sellar_aprobacion_foto_entrega
  before update on public.raffle_delivery_photos
  for each row execute procedure public.sellar_aprobacion_foto_entrega();

-- ---------------------------------------------------------------------
-- Ledger
-- ---------------------------------------------------------------------
do $$
begin
  if to_regclass('public._applied_migrations') is not null then
    insert into public._applied_migrations (version, note)
    values ('0095', 'fotos de premios entregados con aprobacion del organizador')
    on conflict (version) do nothing;
  end if;
end;
$$;
