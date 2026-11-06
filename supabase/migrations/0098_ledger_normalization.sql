-- =====================================================================
-- 0098 — Normalización del ledger (revisada)
-- =====================================================================
-- La versión anterior de este archivo se llamaba 0097, pero ese número ya
-- estaba ocupado en la base por una migración del otro chat aplicada sin
-- archivo en el repo ("notificaciones con telefono y pago", que duplica la
-- pieza de notificaciones de 0090). Por eso se renumera a 0098 y se anota esa
-- fila.
--
-- Dos sesiones trabajaron en paralelo sobre los mismos números. Los objetos
-- están todos aplicados (verificado con una consulta a pg_proc/columnas), pero
-- el ledger guarda UNA nota por número, así que el historial miente:
--
--   · 0079: se aplicaron `raffles_is_listed` y `refunds_use_paid_amount`.
--   · 0090: se aplicaron `notifications_phone_and_payment` y
--           `raffles_transfer_note`.
--   · 0086/0087 no tienen fila: se aplicaron cuando se llamaban 0082/0083,
--     cuyos números quedaron ocupados por las migraciones del otro chat.
--
-- Esta migración NO toca objetos: solo corrige las notas y registra las dos
-- versiones que faltaban. Idempotente.
-- =====================================================================

do $$
begin
  if to_regclass('public._applied_migrations') is null then
    return;
  end if;

  -- 0079: dos archivos, ambos aplicados.
  update public._applied_migrations
     set note = 'is_listed: sorteos internos fuera de los listados publicos + las devoluciones usan lo cobrado (dos archivos 0079)'
   where version = '0079';

  -- 0090: dos archivos, ambos aplicados.
  update public._applied_migrations
     set note = 'notificaciones con telefono del comprador y aviso de pago acreditado + nota libre en los datos de transferencia (dos archivos 0090)'
   where version = '0090';

  -- 0094/0096: enlace con token y liberación al pagar son piezas distintas.
  update public._applied_migrations
     set note = 'enlace con token para que el comprador confirme la devolucion sin login (la liberacion al pagar llega en 0096)'
   where version = '0094';

  -- 0097: aplicada sin archivo en el repo. Se anota para no perder la
  -- procedencia; su funcionalidad duplica la de 0090.
  update public._applied_migrations
     set note = case
       when note ilike '%sin archivo en el repo%' then note
       else note || ' (aplicada sin archivo en el repo; duplica la pieza de notificaciones de 0090)'
     end
   where version = '0097';

  -- Aplicadas bajo el nombre viejo 0082/0083.
  insert into public._applied_migrations (version, note)
  values ('0086', 'baja de cuenta: solicitudes, validaciones y pagos que no se borran en cascada')
  on conflict (version) do nothing;

  insert into public._applied_migrations (version, note)
  values ('0087', 'un sorteo con participantes, pagos, devoluciones o compromiso no se puede eliminar')
  on conflict (version) do nothing;
end;
$$;

-- ---------------------------------------------------------------------
-- Ledger
-- ---------------------------------------------------------------------
do $$
begin
  if to_regclass('public._applied_migrations') is not null then
    insert into public._applied_migrations (version, note)
    values ('0098', 'normalizacion del ledger: 0079 y 0090 con dos piezas, 0086/0087 registradas y 0097 anotada')
    on conflict (version) do nothing;
  end if;
end;
$$;
