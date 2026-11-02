-- =====================================================================
-- 0027 — Endurecimiento del tracking de visitas (idempotente)
-- =====================================================================
-- Qué arregla: en 0026 la política de inserción era `with check (true)`.
-- Con eso, cualquiera —incluido un anónimo— podía insertar visitas para
-- CUALQUIER raffle_id, exista o no, esté activo o no. El contador que ve el
-- organizador se podía inflar desde fuera sin tocar la app.
--
-- Ahora una visita sólo se acepta para un sorteo que existe y está activo.
-- El tráfico legítimo no cambia: la página pública sólo registra visitas de
-- sorteos activos.
--
-- Lo que NO resuelve: varias visitas del mismo visitante siguen contando
-- varias veces (no hay identificador de visitante, y guardarlo sería un dato
-- personal que 0026 decidió no guardar). La métrica sigue siendo "por render",
-- y así se rotula en el panel.
-- =====================================================================

drop policy if exists "raffle_visits_insert_public" on public.raffle_visits;

create policy "raffle_visits_insert_public"
  on public.raffle_visits for insert
  to anon, authenticated
  with check (
    exists (
      select 1
      from public.raffles r
      where r.id = raffle_visits.raffle_id
        and r.status = 'active'
    )
  );
