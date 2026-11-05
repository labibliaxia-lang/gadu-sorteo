-- =====================================================================
-- 0079 — `is_listed`: sorteos que existen pero no se listan
-- =====================================================================
-- Qué resuelve: no había forma de tener un sorteo interno (una prueba, un
-- borrador, un ensayo) sin que apareciera en la home al instante. La lectura de
-- `raffles` es pública (`using (true)`, 0041:43-45) y la home lista todo sin
-- filtro, así que cualquier fila nueva quedaba a la vista de los clientes.
--
-- Qué NO es: no es control de acceso. Un sorteo deslistado sigue siendo legible
-- por quien tenga el enlace y por la API. Sirve para no publicitarlo, no para
-- esconderlo. Si algún día hace falta privacidad real, eso es una política de
-- RLS aparte, y rompería la página pública del comprador.
--
-- Default `true`: los sorteos que ya existen siguen listados. El cambio no
-- altera nada hasta que alguien ponga `false` a propósito.
--
-- Cómo se usa:
--   update public.raffles set is_listed = false where id = '<uuid>';
--
-- Las consultas públicas que respetan el flag son la home (app/page.tsx), la
-- página de ganadores (app/ganadores/page.tsx) y el sitemap (app/sitemap.ts).
-- El panel del organizador NO filtra: tiene que poder ver y operar sus sorteos
-- internos.
--
-- Por qué NO lleva guard, a diferencia de `is_featured` (0077):
--   Destacar es una herramienta comercial del dueño del producto, por eso 0077
--   bloquea al organizador. Deslistar es una decisión del organizador sobre su
--   propio sorteo: la RLS de UPDATE de `raffles` ya lo limita a sus filas
--   (`is_superadmin() or (is_admin() and created_by = auth.uid())`), así que un
--   organizador no puede deslistar el sorteo de otro. No hace falta trigger.
-- =====================================================================

alter table public.raffles
  add column if not exists is_listed boolean not null default true;

comment on column public.raffles.is_listed is
  'false = el sorteo no aparece en listados públicos (home, ganadores, sitemap). No es control de acceso: sigue accesible por enlace directo.';

-- Índice parcial: al armar los listados sólo interesan las filas listadas, y son
-- la enorme mayoría; un índice completo no aportaría nada.
create index if not exists raffles_is_listed_idx
  on public.raffles (created_at desc)
  where is_listed;

-- ---------------------------------------------------------------------
-- Ledger
-- ---------------------------------------------------------------------
do $$
begin
  if to_regclass('public._applied_migrations') is not null then
    insert into public._applied_migrations (version, note)
    values ('0079', 'is_listed: sorteos internos fuera de los listados públicos')
    on conflict (version) do nothing;
  end if;
end
$$;
