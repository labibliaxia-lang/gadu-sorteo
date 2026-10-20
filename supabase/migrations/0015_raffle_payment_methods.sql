-- =====================================================================
-- 0015 — Métodos de pago por sorteo (idempotente)
-- =====================================================================
-- payment_type: 'mercadopago' (pasarela automática) o 'transferencia' (manual).
-- En transferencia, el usuario ve alias/CBU/banco y contacta al organizador
-- por WhatsApp. La lectura pública de sorteos NO se modifica.
-- =====================================================================

alter table public.raffles
  add column if not exists payment_type text not null default 'mercadopago'
  check (payment_type in ('mercadopago', 'transferencia'));

alter table public.raffles
  add column if not exists transfer_alias text;

alter table public.raffles
  add column if not exists transfer_cbu text;

alter table public.raffles
  add column if not exists transfer_bank text;

alter table public.raffles
  add column if not exists whatsapp_contact text;
