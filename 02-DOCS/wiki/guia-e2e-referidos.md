# Guía E2E — “Invitá y Ganá” con diagnóstico en base

Documento operativo para probar el sistema de referidos de punta a punta en el
navegador, con consultas de solo lectura para comprobar cada fase.

- **Organizador**: cuenta con rol `admin` y KYC aprobado.
- **Invitado**: cuenta distinta, idealmente Google nueva.
- **Referente**: el organizador dueño del enlace `?ref=`.
- Usar **incógnito** para el invitado.

---

## Fase 1 — Preparación (Organizador)

### Acciones

1. Crear el **sorteo principal** (activo, 20+ números, prepago manual por transferencia).
2. Crear el **sorteo bonus** (mismo organizador, activo, con números disponibles), si se quiere probar el exclusivo.
3. En el principal → **Editar** → activar **Invitá y Ganá**:
   - Compra mínima del invitado: **2**
   - Mínimo del referente: **0**
   - Tope de premios por referente: **3**
   - Sorteo bonus: el del paso 2 (opcional)
4. Anotar los IDs de principal y bonus.

### Diagnóstico

```sql
-- 1a. Configuración del principal
select id, title, status,
       referral_enabled,
       referral_min_numbers,
       referral_require_buyer_min,
       referral_max_per_user,
       bonus_raffle_id
  from public.raffles
 where referral_enabled = true
 order by created_at desc
 limit 5;
```

```sql
-- 1b. El bonus es del mismo organizador y está activo/cerrado
select r.id, r.title, r.status, r.created_by
  from public.raffles r
 where r.id = (select bonus_raffle_id
                 from public.raffles
                where referral_enabled = true
                order by created_at desc limit 1);
```

Si el bonus es de otro organizador, `reward_referral` devuelve NULL y no premia.

```sql
-- 1c. Números disponibles en el principal
select status, count(*)
  from public.raffle_numbers
 where raffle_id = 'PEGAR_ID_PRINCIPAL'
 group by status;
```

---

## Fase 2 — El enlace (Referente)

1. Panel → sorteo principal → tarjeta **Tu enlace de referidos** → **Copiar enlace**.
2. Forma: `https://TU_DOMINIO/sorteos/SLUG?ref=ID_DEL_REFERENTE`.

```sql
-- 2a. El referente existe
select p.id, p.role, p.plan, p.verification_status
  from public.profiles p
 where p.id = 'PEGAR_ID_REFERENTE';
```

```sql
-- 2b. Referidos actuales (para el tope)
select count(*) filter (where rewarded) as premiados,
       count(*) as total
  from public.referrals
 where referrer_id = 'PEGAR_ID_REFERENTE';
```

---

## Fase 3 — La compra (Invitado, incógnito)

1. Abrir el enlace en **incógnito**.
2. Registrarse con Google **desde ese enlace** (no abrir la home antes).
3. Elegir al menos 2 números → **Reservar y enviar comprobante**.
4. Aceptar T&C y enviar el comprobante por WhatsApp.

> El `?ref=` se guarda en `localStorage` y se inserta en `referrals` cuando el
> invitado inicia sesión (`ReferralCapture`).

```sql
-- 3a. Vínculo de referido
select r.id,
       left(r.referrer_id::text, 8) as referente,
       left(r.referred_id::text, 8) as invitado,
       r.rewarded, r.created_at
  from public.referrals r
 where r.referred_id = 'PEGAR_ID_INVITADO'
 order by r.created_at desc;
```

Esperado: 1 fila, `rewarded = false`, referente = organizador.

```sql
-- 3b. Números del invitado
select number, status, sold_to, reserved_by, reserved_until
  from public.raffle_numbers
 where raffle_id = 'PEGAR_ID_PRINCIPAL'
   and (sold_to = 'PEGAR_ID_INVITADO'
        or reserved_by = 'PEGAR_ID_INVITADO')
 order by number;
```

```sql
-- 3c. Pago pendiente
select id, user_id, raffle_id, status, amount, created_at
  from public.payments
 where user_id = 'PEGAR_ID_INVITADO'
 order by created_at desc
 limit 5;
```

---

## Fase 4 — La aprobación (Organizador)

1. `/admin/notificaciones` → **Reservas pendientes** → **Aprobar**.
2. Alternativa: panel del sorteo → **Ventas** → registrar pago manual.

```sql
-- 4a. Números vendidos
select number, status, sold_to, sold_at
  from public.raffle_numbers
 where raffle_id = 'PEGAR_ID_PRINCIPAL'
   and sold_to = 'PEGAR_ID_INVITADO'
 order by number;
```

```sql
-- 4b. Notificación resuelta
select id, type, status, payload
  from public.notifications
 where raffle_id = 'PEGAR_ID_PRINCIPAL'
   and subject_user_id = 'PEGAR_ID_INVITADO'
 order by created_at desc
 limit 5;
```

---

## Fase 5 — Verificación del premio

El premio se otorga en `reward_referral`, llamado al aprobar la reserva o por el
webhook de Mercado Pago.

```sql
-- 5a. Referido premiado
select id, rewarded, rewarded_raffle_id, rewarded_number, rewarded_via_raffle_id
  from public.referrals
 where referred_id = 'PEGAR_ID_INVITADO';
```

Esperado: `rewarded = true`; `rewarded_via_raffle_id` = principal;
`rewarded_raffle_id` = bonus si está configurado.

```sql
-- 5b. Número gratuito del referente
select rn.raffle_id, rn.number, rn.status, rn.origin, rn.sold_to, rn.sold_at
  from public.raffle_numbers rn
  join public.referrals rf
    on rn.raffle_id = rf.rewarded_raffle_id
   and rn.number = rf.rewarded_number
 where rf.referred_id = 'PEGAR_ID_INVITADO';
```

Esperado: `sold`, `sold_to = referente`, **`origin = 'premio'`**.

```sql
-- 5c. Aviso al referente
select id, type, title, message, status
  from public.notifications
 where user_id = 'PEGAR_ID_REFERENTE'
   and type = 'buyer_referral_reward'
 order by created_at desc
 limit 3;
```

```sql
-- 5d. Circuito completo en una consulta
select
  rf.rewarded,
  left(rf.referrer_id::text, 8) as referente,
  left(rf.referred_id::text, 8) as invitado,
  rf.rewarded_number,
  (select count(*) from public.raffle_numbers
    where raffle_id = rf.rewarded_via_raffle_id
      and sold_to = rf.referred_id and status = 'sold') as nums_invitado,
  (select count(*) from public.raffle_numbers
    where raffle_id = rf.rewarded_raffle_id
      and number = rf.rewarded_number
      and sold_to = rf.referrer_id
      and origin = 'premio') as num_premio_ok
from public.referrals rf
where rf.referred_id = 'PEGAR_ID_INVITADO';
```

Si se usó Mercado Pago:

```sql
select id, status, payment_method, updated_at
  from public.payments
 where user_id = 'PEGAR_ID_INVITADO'
 order by created_at desc limit 3;
```

---

## Fase 6 — Casos de error

Usar **un invitado nuevo** por caso.

### 6.1 Compra por debajo del mínimo

`referral_min_numbers = 2`; el invitado compra 1 y se aprueba.
Esperado: `rewarded = false` (la compra sí queda vendida).

### 6.2 Tope alcanzado

`referral_max_per_user = 1`; premiar un primer invitado y luego un segundo.

```sql
select count(*) filter (where rewarded) as premiados
  from public.referrals
 where referrer_id = 'PEGAR_ID_REFERENTE'
   and rewarded_via_raffle_id = 'PEGAR_ID_PRINCIPAL';
```

Esperado: `premiados = 1`.

### 6.3 Referente sin compra propia

`referral_require_buyer_min = 1` y referente sin números vendidos; el invitado
compra y se aprueba. Esperado: `rewarded = false`.

```sql
select count(*) as propios
  from public.raffle_numbers
 where raffle_id = 'PEGAR_ID_PRINCIPAL'
   and sold_to = 'PEGAR_ID_REFERENTE'
   and status = 'sold';
```

### 6.4 Invitá y Ganá desactivado

`referral_enabled = false`; el invitado compra y se aprueba.
Esperado: `rewarded = false` aunque exista vínculo.

### 6.5 Sorteo bonus inválido

Bonus de otro organizador, inactivo o sorteado. Esperado: `rewarded = false`.

```sql
select r.status, r.created_by,
       (select created_by from public.raffles
         where referral_enabled = true order by created_at desc limit 1) as dueno_principal
  from public.raffles r
 where r.id = 'PEGAR_ID_BONUS';
```

### 6.6 Auto-referido

Abrir el propio enlace `?ref=SU_PROPIO_ID`.
Esperado: no se crea fila (`ReferralCapture` descarta el caso).

```sql
select count(*) from public.referrals
 where referrer_id = 'PEGAR_ID' and referred_id = 'PEGAR_ID';
```

### 6.7 Sin números disponibles en el destino

Llenar el bonus; el invitado compra y se aprueba.
Esperado: `rewarded = false`, el vínculo queda pendiente.

```sql
select status, count(*) from public.raffle_numbers
 where raffle_id = 'PEGAR_ID_BONUS' group by status;
```

---

## Resumen de estados

| Fase | Tabla | Estado |
|---|---|---|
| Enlace + registro | `referrals` | 1 fila, `rewarded = false` |
| Compra | `raffle_numbers` | `reserved` + `payments.pending` |
| Aprobación | `raffle_numbers` | `sold`, `payments.approved` |
| Premio | `referrals` | `rewarded = true`, `rewarded_via_raffle_id` = principal |
| Número regalo | `raffle_numbers` | `sold`, `sold_to` = referente, `origin = 'premio'` |
| Aviso | `notifications` | `buyer_referral_reward` |
