-- =====================================================================
-- 0062 — Vistas públicas sin user_id para reseñas y preguntas
-- =====================================================================
-- La UI nunca mostró user_id, pero la API con anon podía leerlo desde las
-- tablas base. Estas vistas exponen solo columnas públicas y el acceso anon
-- directo a las tablas queda revocado. Los usuarios autenticados conservan
-- el acceso a las tablas para sus propias consultas y para moderación.
-- =====================================================================

create or replace view public.public_reviews as
select
  id,
  organizer_id,
  raffle_id,
  user_name,
  rating,
  comment,
  reply,
  created_at,
  updated_at
from public.reviews;

create or replace view public.public_questions as
select
  id,
  raffle_id,
  question,
  answer,
  created_at,
  answered_at
from public.raffle_questions;

grant select on public.public_reviews to anon, authenticated;
grant select on public.public_questions to anon, authenticated;
grant all on public.public_reviews to service_role;
grant all on public.public_questions to service_role;

-- El visitante anónimo lee solo la vista; no puede pedir user_id a la tabla.
revoke select on public.reviews from anon;
revoke select on public.raffle_questions from anon;

insert into public._applied_migrations (version, note)
values ('0062', 'vistas publicas sin user_id para resenas y preguntas')
on conflict (version) do nothing;
