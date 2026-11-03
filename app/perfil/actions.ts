"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { createClient } from "@/lib/supabase/server";
import { addressMatches } from "@/lib/address";
import { TERMS_VERSION } from "@/lib/terms";

export type EmailPreferenceResult =
  | { ok: true; optIn: boolean }
  | { ok: false; error: string };

export type UpdateProfileResult =
  | { ok: true }
  | { ok: false; error: string };

const optionalText = (max: number) =>
  z.string().trim().max(max).optional().default("");

const profileSchema = z.object({
  full_name: z
    .string()
    .trim()
    .min(2, "El nombre debe tener al menos 2 caracteres")
    .max(80, "El nombre no puede superar los 80 caracteres"),
  phone: optionalText(30),
  location: optionalText(80),
  instagram_url: optionalText(120),
  bio: optionalText(400),
  website_url: optionalText(200),
  avatar_url: optionalText(500),
  address_line: z
    .string()
    .trim()
    .min(3, "Ingresá la dirección de entrega")
    .max(160, "La dirección es demasiado larga"),
  city: z.string().trim().min(2, "Ingresá la ciudad").max(80),
  province: z.string().trim().min(2, "Ingresá la provincia").max(80),
  postal_code: z.string().trim().min(3, "Ingresá el código postal").max(12),
  country: z.string().trim().min(2).max(80).default("AR"),
});

function avatarIsAllowed(url: string): boolean {
  const base = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "")
    .trim()
    .replace(/\/+$/, "");
  return (
    !!base &&
    url.startsWith(`${base}/storage/v1/object/public/avatars/`)
  );
}

/**
 * Actualiza solo los campos de presentación del perfil propio.
 * Rol, plan, verificación y estado de cuenta no se pueden tocar desde acá.
 */
export async function updateProfile(
  input: unknown,
): Promise<UpdateProfileResult> {
  const parsed = profileSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Datos inválidos.",
    };
  }

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { ok: false, error: "No autenticado" };

  const { data: current } = await supabase
    .from("profiles")
    .select("avatar_url, slug, role, dni_address")
    .eq("id", user.id)
    .maybeSingle();

  const values = parsed.data;

  if (
    current?.dni_address &&
    (current.role === "admin" || current.role === "superadmin") &&
    !addressMatches(values, current.dni_address)
  ) {
    return {
      ok: false,
      error:
        "La dirección de entrega debe coincidir con la dirección de tu DNI.",
    };
  }

  if (values.avatar_url) {
    const unchanged = values.avatar_url === current?.avatar_url;
    if (!unchanged && !avatarIsAllowed(values.avatar_url)) {
      return {
        ok: false,
        error: "La foto tiene que subirse desde este perfil.",
      };
    }
  }

  let website = values.website_url;
  if (website && !/^https?:\/\//i.test(website)) {
    website = `https://${website}`;
  }

  let instagram = values.instagram_url;
  if (instagram.startsWith("@")) {
    instagram = `https://instagram.com/${instagram.slice(1)}`;
  }

  const { error } = await supabase
    .from("profiles")
    .update({
      full_name: values.full_name,
      phone: values.phone || null,
      location: values.location || null,
      instagram_url: instagram || null,
      bio: values.bio || null,
      website_url: website || null,
      avatar_url: values.avatar_url || null,
      address_line: values.address_line,
      city: values.city,
      province: values.province,
      postal_code: values.postal_code,
      country: values.country || "AR",
    })
    .eq("id", user.id);

  if (error) return { ok: false, error: error.message };

  revalidatePath("/perfil");
  revalidatePath("/organizador/[slug]", "page");
  if (current?.slug) revalidatePath(`/organizador/${current.slug}`);

  return { ok: true };
}

const deliverySchema = z.object({
  phone: z
    .string()
    .trim()
    .max(30, "El teléfono es demasiado largo")
    .refine(
      (value) => value.replace(/\D/g, "").length >= 6,
      "Ingresá un teléfono válido",
    ),
  address_line: z
    .string()
    .trim()
    .min(3, "Ingresá la dirección de entrega")
    .max(160),
  city: z.string().trim().min(2, "Ingresá la ciudad").max(80),
  province: z.string().trim().min(2, "Ingresá la provincia").max(80),
  postal_code: z.string().trim().min(3, "Ingresá el código postal").max(12),
  country: z.string().trim().min(2).max(80).default("AR"),
});

/** Dirección de recepción obligatoria; se usa desde el modal global. */
export async function saveDeliveryAddress(
  input: unknown,
): Promise<UpdateProfileResult> {
  const parsed = deliverySchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Datos inválidos.",
    };
  }

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { ok: false, error: "No autenticado" };

  const { data: current } = await supabase
    .from("profiles")
    .select("role, dni_address")
    .eq("id", user.id)
    .maybeSingle();

  if (
    current?.dni_address &&
    (current.role === "admin" || current.role === "superadmin") &&
    !addressMatches(parsed.data, current.dni_address)
  ) {
    return {
      ok: false,
      error:
        "La dirección de entrega debe coincidir con la dirección de tu DNI.",
    };
  }

  const { error } = await supabase
    .from("profiles")
    .update({
      phone: parsed.data.phone,
      address_line: parsed.data.address_line,
      city: parsed.data.city,
      province: parsed.data.province,
      postal_code: parsed.data.postal_code,
      country: parsed.data.country || "AR",
    })
    .eq("id", user.id);

  if (error) return { ok: false, error: error.message };

  revalidatePath("/", "layout");
  return { ok: true };
}

/**
 * Guarda la preferencia de avisos por email del usuario actual.
 *
 * Al activarlos se completa `terms_accepted_at` si faltaba: activar el toggle
 * implica haber aceptado los Términos (el texto está enlazado en /perfil).
 * Solo toca la fila propia; RLS lo impone.
 */
export async function setEmailPreference(
  optIn: boolean,
): Promise<EmailPreferenceResult> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { ok: false, error: "No autenticado" };

  const update: Record<string, unknown> = { email_opt_in: Boolean(optIn) };
  if (optIn) {
    update.terms_accepted_at = new Date().toISOString();
    update.terms_version = TERMS_VERSION;
  }

  const { error } = await supabase
    .from("profiles")
    .update(update)
    .eq("id", user.id);

  if (error) {
    return { ok: false, error: "No se pudo guardar la preferencia." };
  }

  revalidatePath("/perfil");
  return { ok: true, optIn: Boolean(optIn) };
}
