-- =====================================================================
-- 0090 — Nota libre en los datos de transferencia
-- =====================================================================
-- Qué resuelve: no había forma de decirle algo al comprador JUSTO donde copia
-- el alias, que es el momento en que decide si transfiere. El organizador podía
-- llenar alias, CBU y banco, pero nada más.
--
-- Caso concreto que lo motivó: un sorteo de demostración, publicado para mostrar
-- cómo funciona la plataforma, con el alias cargado como «sorteo de prueba. no
-- transferir». La pantalla igual decía «Transferí el total y después enviá el
-- comprobante», que contradice al alias. Con una nota por sorteo se aclara ahí
-- mismo, sin tocar el flujo real de los sorteos que sí venden.
--
-- Por qué una columna y no un texto fijo: la advertencia aplica a UN sorteo.
-- Ponerla en el código la haría aparecer en todos, incluidos los reales.
--
-- Alcance: se muestra arriba del bloque «Datos para transferir», en el resumen
-- que aparece al reservar. No se muestra en la grilla ni en la página pública
-- antes de reservar.
--
-- Idempotente.
-- =====================================================================

alter table public.raffles
  add column if not exists transfer_note text;

comment on column public.raffles.transfer_note is
  'Aviso libre que se muestra arriba de los datos de transferencia al reservar. Sirve para advertencias propias del sorteo (demostración, no transferir, etc.).';

-- ---------------------------------------------------------------------
-- Ledger
-- ---------------------------------------------------------------------
do $$
begin
  if to_regclass('public._applied_migrations') is not null then
    insert into public._applied_migrations (version, note)
    values ('0090', 'nota libre en los datos de transferencia')
    on conflict (version) do nothing;
  end if;
end
$$;
