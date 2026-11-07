-- =====================================================================
-- 0115 — URLs amigables para sorteos (slug)
-- =====================================================================
-- Agrega `raffles.slug` único, rellena los sorteos existentes desde el
-- título y genera el slug automáticamente en las altas nuevas.
--
-- Los enlaces viejos con UUID siguen funcionando: la ruta resuelve por id
-- cuando el parámetro tiene formato UUID.
--
-- Idempotente. No toca sorteos, pagos ni referidos.
-- =====================================================================

alter table public.raffles
  add column if not exists slug text;

-- Normaliza un título a slug: minúsculas, sin acentos, guiones simples.
create or replace function public.slugify(p_texto text)
returns text
language sql
immutable
as $$
  select trim(both '-' from
    regexp_replace(
      regexp_replace(
        translate(lower(coalesce(p_texto, '')), 'áéíóúüñçàèìòùâêîôûäëïö', 'aeiouunca eiouaeiouaeiou'),
        '[^a-z0-9]+', '-', 'g'
      ),
      '-{2,}', '-', 'g'
    )
  );
$$;

-- Rellena los sorteos existentes. Si el slug ya está tomado, agrega sufijo.
do $$
declare
  r record;
  v_base text;
  v_slug text;
  v_intento int;
begin
  for r in
    select id, title from public.raffles where slug is null order by created_at
  loop
    v_base := nullif(public.slugify(r.title), '');
    if v_base is null then
      v_base := 'sorteo';
    end if;
    v_base := left(v_base, 60);

    v_slug := v_base;
    v_intento := 0;

    while exists (select 1 from public.raffles where slug = v_slug) loop
      v_intento := v_intento + 1;
      v_slug := v_base || '-' || substr(md5(random()::text || r.id::text), 1, 4);
      if v_intento > 8 then
        v_slug := v_base || '-' || substr(r.id::text, 1, 8);
        exit;
      end if;
    end loop;

    update public.raffles set slug = v_slug where id = r.id;
  end loop;
end;
$$;

create unique index if not exists raffles_slug_key on public.raffles (slug)
  where slug is not null;

-- Genera el slug en altas nuevas (si viene nulo). No lo cambia al editar el
-- título: así los enlaces compartidos no se rompen.
create or replace function public.asignar_slug_sorteo()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_base text;
  v_slug text;
  v_intento int := 0;
begin
  if new.slug is not null then
    return new;
  end if;

  v_base := nullif(public.slugify(new.title), '');
  if v_base is null then
    v_base := 'sorteo';
  end if;
  v_base := left(v_base, 60);

  v_slug := v_base;

  while exists (select 1 from public.raffles where slug = v_slug) loop
    v_intento := v_intento + 1;
    v_slug := v_base || '-' || substr(md5(random()::text || new.id::text), 1, 4);
    if v_intento > 8 then
      v_slug := v_base || '-' || substr(new.id::text, 1, 8);
      exit;
    end if;
  end loop;

  new.slug := v_slug;
  return new;
end;
$$;

drop trigger if exists asignar_slug_sorteo on public.raffles;
create trigger asignar_slug_sorteo
  before insert on public.raffles
  for each row execute procedure public.asignar_slug_sorteo();

do $$
begin
  if to_regclass('public._applied_migrations') is not null then
    insert into public._applied_migrations (version, note)
    values ('0115', 'slugs unicos para sorteos con backfill y generacion automatica en altas')
    on conflict (version) do nothing;
  end if;
end;
$$;
