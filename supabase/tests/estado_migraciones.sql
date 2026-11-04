-- =====================================================================
-- Estado de migraciones aplicadas en Supabase (sólo lectura)
-- =====================================================================
-- Pegar TODO en el SQL Editor y ejecutar. No modifica nada: arma una tabla
-- temporal con una línea por comprobación y la devuelve como texto.
--
-- Para qué sirve: responde "¿están todos los SQL aplicados en la base?".
--   * 0028 en adelante: compara el ledger `public._applied_migrations` con la
--     lista de migraciones del repositorio.
--   * 0017 (KYC): columnas, índice, bucket privado y políticas de Storage.
--   * 0063 (cancelaciones/devoluciones) y 0064 (tráfico/reportes/auditoría):
--     objetos que esas migraciones crean.
--
-- Para el detalle fino de 0001–0027 (RLS, triggers, RPC de dinero) correr
-- además `supabase/tests/verificar_esquema.sql`.
-- =====================================================================

drop table if exists pg_temp.estado_migraciones;

create temp table estado_migraciones (
  orden integer primary key,
  linea text not null
);

do $bloque$
declare
  v_faltantes text;
  v_total integer;
  v_max text;
  v_faltan_cols text;
  v_index boolean;
  v_bucket_encontrado boolean := false;
  v_bucket_publico boolean;
  v_mimes text[];
  v_limite bigint;
  v_policies text;
  v_refunds_ok boolean;
  v_page_views_ok boolean;
  v_reports_ok boolean;
begin
  -- ------------------------------------------------------------------
  -- 1) Ledger: qué migraciones desde 0028 están registradas
  -- ------------------------------------------------------------------
  if to_regclass('public._applied_migrations') is null then
    insert into estado_migraciones (orden, linea) values (
      1,
      'AVISO   falta public._applied_migrations (0028): no hay registro de lo aplicado'
    );
    insert into estado_migraciones (orden, linea) values (
      2,
      'AVISO   sin ledger no se puede comparar automáticamente; usá verificar_esquema.sql'
    );
  else
    execute $q$select count(*), max(version) from public._applied_migrations$q$
      into v_total, v_max;

    execute $q$
      select string_agg(e.v, ', ' order by e.v)
      from (
        select lpad(g::text, 4, '0') as v
        from generate_series(28, 65) as g
      ) e
      where not exists (
        select 1 from public._applied_migrations m where m.version = e.v
      )
    $q$ into v_faltantes;

    insert into estado_migraciones (orden, linea) values (
      1,
      'OK      ledger presente: ' || v_total || ' migraciones registradas, última ' ||
      coalesce(v_max, '—')
    );

    if v_faltantes is null then
      insert into estado_migraciones (orden, linea) values (
        2, 'OK      todas las migraciones 0028–0065 están en el ledger'
      );
    else
      insert into estado_migraciones (orden, linea) values (
        2, 'FALTA   aplicar en el SQL Editor: ' || v_faltantes
      );
    end if;
  end if;

  -- ------------------------------------------------------------------
  -- 2) 0017 — KYC: columnas de profiles
  -- ------------------------------------------------------------------
  select string_agg(c, ', ' order by c) into v_faltan_cols
  from unnest(array[
    'dni_front_url', 'dni_back_url', 'face_url',
    'dni_verified', 'face_verified', 'verification_status'
  ]) c
  where not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'profiles'
      and column_name::text = c
  );

  if v_faltan_cols is null then
    insert into estado_migraciones (orden, linea) values (
      3, 'OK      0017 KYC: columnas de DNI frente/dorso, selfie y flags presentes'
    );
  else
    insert into estado_migraciones (orden, linea) values (
      3, 'CRÍTICO 0017 KYC incompleto: faltan columnas ' || v_faltan_cols
    );
  end if;

  -- Índice parcial de la cola del superadmin.
  select exists (
    select 1 from pg_indexes
    where schemaname = 'public' and indexname = 'profiles_verification_pending_idx'
  ) into v_index;
  if v_index then
    insert into estado_migraciones (orden, linea) values (
      4, 'OK      0017 KYC: índice profiles_verification_pending_idx'
    );
  else
    insert into estado_migraciones (orden, linea) values (
      4, 'FALTA   0017 KYC: índice profiles_verification_pending_idx'
    );
  end if;

  -- ------------------------------------------------------------------
  -- 3) 0017 — bucket organizer-kyc (privado, JPG/PNG, 5 MB)
  -- ------------------------------------------------------------------
  select b."public", b.allowed_mime_types, b.file_size_limit
    into v_bucket_publico, v_mimes, v_limite
  from storage.buckets b
  where b.id = 'organizer-kyc';
  v_bucket_encontrado := found;

  if not v_bucket_encontrado then
    insert into estado_migraciones (orden, linea) values (
      5, 'CRÍTICO 0017 KYC: no existe el bucket organizer-kyc'
    );
  elsif v_bucket_publico then
    insert into estado_migraciones (orden, linea) values (
      5, 'CRÍTICO 0017 KYC: el bucket organizer-kyc es PÚBLICO (debe ser privado)'
    );
  else
    insert into estado_migraciones (orden, linea) values (
      5, 'OK      0017 KYC: bucket organizer-kyc privado'
    );
  end if;

  if v_bucket_encontrado then
    if v_mimes is null
       or not ('image/jpeg' = any(v_mimes))
       or not ('image/png' = any(v_mimes)) then
      insert into estado_migraciones (orden, linea) values (
        6, 'AVISO   0017 KYC: el bucket no limita MIME a JPG/PNG (ver 0061)'
      );
    elsif v_limite is null or v_limite > 5242880 then
      insert into estado_migraciones (orden, linea) values (
        6, 'AVISO   0017 KYC: el bucket no limita a 5 MB (límite: ' ||
           coalesce(v_limite::text, 'sin límite') || ')'
      );
    else
      insert into estado_migraciones (orden, linea) values (
        6, 'OK      0017 KYC: bucket limitado a JPG/PNG y ' ||
           (v_limite / 1048576) || ' MB'
      );
    end if;
  end if;

  -- ------------------------------------------------------------------
  -- 4) 0017 — políticas de Storage
  -- ------------------------------------------------------------------
  select string_agg(p, ', ' order by p) into v_policies
  from unnest(array[
    'kyc_owner_insert', 'kyc_owner_select', 'kyc_owner_update',
    'kyc_superadmin_select'
  ]) p
  where not exists (
    select 1 from pg_policies
    where schemaname = 'storage' and tablename = 'objects'
      and policyname::text = p
  );

  if v_policies is null then
    insert into estado_migraciones (orden, linea) values (
      7, 'OK      0017 KYC: políticas de Storage completas (insert/select/update + superadmin)'
    );
  else
    insert into estado_migraciones (orden, linea) values (
      7, 'CRÍTICO 0017 KYC: faltan políticas de Storage: ' || v_policies ||
         ' (el organizador no podría subir o el superadmin no podría leer)'
    );
  end if;

  -- ------------------------------------------------------------------
  -- 5) 0063 — cancelaciones y devoluciones
  -- ------------------------------------------------------------------
  if to_regclass('public.refunds') is null then
    insert into estado_migraciones (orden, linea) values (
      8, 'FALTA   0063: no existe la tabla refunds'
    );
  else
    select
      (select c.relrowsecurity from pg_class c where c.oid = to_regclass('public.refunds'))
      and exists (
        select 1 from pg_indexes
        where schemaname = 'public' and tablename = 'refunds'
          and indexdef ilike '%unique%' and indexdef ilike '%(raffle_id, user_id)%'
      )
      and exists (
        select 1 from information_schema.columns
        where table_schema = 'public' and table_name = 'raffles'
          and column_name = 'cancelled_at'
      )
      and exists (
        select 1 from information_schema.columns
        where table_schema = 'public' and table_name = 'raffles'
          and column_name = 'cancellation_reason'
      )
      and exists (
        select 1 from pg_constraint
        where conrelid = 'public.raffles'::regclass
          and conname = 'raffles_status_check'
          and pg_get_constraintdef(oid) ilike '%cancelled%'
      )
      into v_refunds_ok;

    if v_refunds_ok then
      insert into estado_migraciones (orden, linea) values (
        8, 'OK      0063: refunds con RLS/único, raffles.cancelled_at y estado cancelled'
      );
    else
      insert into estado_migraciones (orden, linea) values (
        8, 'FALTA   0063: refunds existe pero falta RLS, UNIQUE (raffle_id, user_id), ' ||
           'columnas de cancelación o el estado cancelled'
      );
    end if;
  end if;

  -- ------------------------------------------------------------------
  -- 6) 0064 — tráfico, reportes y auditoría
  -- ------------------------------------------------------------------
  if to_regclass('public.page_views') is null then
    insert into estado_migraciones (orden, linea) values (
      9, 'FALTA   0064: no existe la tabla page_views'
    );
  else
    select
      (select c.relrowsecurity from pg_class c where c.oid = to_regclass('public.page_views'))
      and not exists (
        select 1 from pg_policies
        where schemaname = 'public' and tablename = 'page_views' and cmd = 'INSERT'
      )
      and to_regprocedure('public.superadmin_daily_metrics(integer)') is not null
      into v_page_views_ok;

    if v_page_views_ok then
      insert into estado_migraciones (orden, linea) values (
        9, 'OK      0064: page_views con RLS, sin INSERT público y RPC de métricas diarias'
      );
    else
      insert into estado_migraciones (orden, linea) values (
        9, 'FALTA   0064: page_views existe pero falta RLS, tiene INSERT público o ' ||
           'falta superadmin_daily_metrics(integer)'
      );
    end if;
  end if;

  if to_regclass('public.raffle_reports') is null then
    insert into estado_migraciones (orden, linea) values (
      10, 'FALTA   0064: no existe la tabla raffle_reports'
    );
  else
    select
      (select c.relrowsecurity from pg_class c where c.oid = to_regclass('public.raffle_reports'))
      and exists (
        select 1 from pg_indexes
        where schemaname = 'public' and tablename = 'raffle_reports'
          and indexdef ilike '%unique%' and indexdef ilike '%(raffle_id, reporter_id)%'
      )
      into v_reports_ok;

    if v_reports_ok then
      insert into estado_migraciones (orden, linea) values (
        10, 'OK      0064: raffle_reports con RLS y una denuncia por usuario/sorteo'
      );
    else
      insert into estado_migraciones (orden, linea) values (
        10, 'FALTA   0064: raffle_reports sin RLS o sin UNIQUE (raffle_id, reporter_id)'
      );
    end if;
  end if;

  if to_regclass('public.audit_logs') is null then
    insert into estado_migraciones (orden, linea) values (
      11, 'FALTA   0064: falta la vista audit_logs (alias de admin_audit_logs)'
    );
  elsif to_regclass('public.admin_audit_logs') is null then
    insert into estado_migraciones (orden, linea) values (
      11, 'CRÍTICO falta admin_audit_logs (0012): no hay auditoría'
    );
  else
    insert into estado_migraciones (orden, linea) values (
      11, 'OK      0064: auditoría admin_audit_logs + vista audit_logs'
    );
  end if;

  -- ------------------------------------------------------------------
  -- 7) 0065 — políticas de escritura del panel
  -- ------------------------------------------------------------------
  -- El síntoma era "new row violates row-level security policy for table
  -- raffles" al crear un sorteo: una migración a medias puede dejar la
  -- política de INSERT ausente o vieja. 0065 la vuelve a dejar como 0041.
  if exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'raffles' and cmd = 'INSERT'
      and with_check ilike '%created_by%'
      and with_check ilike '%is_admin%'
  ) then
    insert into estado_migraciones (orden, linea) values (
      12, 'OK      0065/0041: raffles tiene política de INSERT del dueño admin'
    );
  else
    insert into estado_migraciones (orden, linea) values (
      12, 'CRÍTICO 0065/0041: falta la política de INSERT de raffles (no se puede crear un sorteo)'
    );
  end if;

  -- ------------------------------------------------------------------
  -- 8) Nota final
  -- ------------------------------------------------------------------
  insert into estado_migraciones (orden, linea) values (
    13, 'NOTA    para 0001–0027 (RLS, triggers, RPC de dinero) correr también supabase/tests/verificar_esquema.sql'
  );
end
$bloque$;

select string_agg(linea, E'\n' order by orden) as resultado
from estado_migraciones;
