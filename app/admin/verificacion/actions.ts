"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import {
  requireAdminSession,
  requireSuperadminSession,
} from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { addressMatches } from "@/lib/address";

const kycDataSchema = z.object({
  full_name: z
    .string()
    .trim()
    .min(3, "Escribí tu nombre completo")
    .max(80, "El nombre es demasiado largo"),
  phone: z
    .string()
    .trim()
    .refine(
      (value) => value.replace(/\D/g, "").length >= 6,
      "Ingresá un teléfono válido",
    )
    .refine((value) => value.length <= 30, "El teléfono es demasiado largo"),
  location: z
    .string()
    .trim()
    .min(2, "Ingresá tu ciudad o zona")
    .max(80, "La ubicación es demasiado larga"),
  dni_number: z
    .string()
    .trim()
    .refine(
      (value) => /^\d{7,9}$/.test(value.replace(/\./g, "").replace(/\s/g, "")),
      "El DNI debe tener 7 u 8 dígitos",
    ),
  dni_address: z
    .string()
    .trim()
    .min(10, "Escribí la dirección completa que figura en tu DNI")
    .max(240, "La dirección es demasiado larga"),
});

type ProfileKycData = {
  verification_status: string | null;
  full_name: string | null;
  phone: string | null;
  location: string | null;
  dni_number: string | null;
  dni_address: string | null;
  address_line: string | null;
  city: string | null;
  province: string | null;
  postal_code: string | null;
  country: string | null;
  dni_front_url: string | null;
  dni_back_url: string | null;
  face_url: string | null;
};

// El bucket `organizer-kyc` sólo acepta JPG/PNG de hasta 5 MB (migración 0061).
// Se valida en el servidor además del cliente: nunca confiar en el navegador.
const MAX_KYC_BYTES = 5 * 1024 * 1024;
const ALLOWED_KYC_TYPES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
};

const KYC_SLOT_LABELS = {
  dni_front: "el frente del DNI",
  dni_back: "el dorso del DNI",
  selfie: "la selfie",
} as const;
type KycSlot = keyof typeof KYC_SLOT_LABELS;
const KYC_SLOTS: KycSlot[] = ["dni_front", "dni_back", "selfie"];

const KYC_PROFILE_FIELDS =
  "verification_status, full_name, phone, location, dni_number, dni_address, address_line, city, province, postal_code, country, dni_front_url, dni_back_url, face_url";

/** Extrae un archivo de un FormData sin asumir que siempre viene. */
function formFile(formData: FormData, key: string): File | null {
  const value = formData.get(key);
  if (!value || typeof value === "string") return null;
  return value;
}

/** Traduce errores de Storage a algo accionable para el organizador. */
function storageErrorMessage(message: string, label: string): string {
  const m = message.toLowerCase();
  if (m.includes("row-level security") || m.includes("unauthorized")) {
    return `No se pudo guardar ${label}: el bucket privado rechazó la operación. Verificá tu sesión y que la migración 0017_organizer_verification.sql esté aplicada.`;
  }
  if (m.includes("mime") || m.includes("content type")) {
    return `No se pudo guardar ${label}: el formato no está permitido. Subí una imagen JPG o PNG.`;
  }
  if (m.includes("too large") || m.includes("payload") || m.includes("maximum")) {
    return `No se pudo guardar ${label}: la imagen supera el máximo de 5 MB.`;
  }
  if (m.includes("bucket") && m.includes("not found")) {
    return "Falta el bucket privado organizer-kyc. Ejecutá la migración 0017_organizer_verification.sql.";
  }
  return `No se pudo guardar ${label}: ${message}`;
}

/**
 * Errores de perfil en producción casi siempre significan que la base quedó
 * atrás respecto del código. Se explicita la migración que falta.
 */
function profileErrorMessage(message: string): string {
  const m = message.toLowerCase();
  if (m.includes("dni_back_url") || (m.includes("column") && m.includes("does not exist"))) {
    return "La base de datos no está actualizada: ejecutá la migración 0017_organizer_verification.sql (agrega dni_back_url y las políticas del bucket) y volvé a intentar.";
  }
  return message;
}

/** Devuelve la lista de datos personales que faltan cargar. */
function missingPersonalData(profile: ProfileKycData): string[] {
  const missing: string[] = [];
  if (!profile.full_name?.trim()) missing.push("nombre completo");
  if (!profile.phone?.trim()) missing.push("teléfono");
  if (!profile.location?.trim()) missing.push("ubicación");
  if (!profile.dni_number?.trim()) missing.push("número de DNI");
  if (!profile.dni_address?.trim()) missing.push("dirección del DNI");
  if (!profile.address_line?.trim()) missing.push("dirección de entrega");
  if (!profile.city?.trim()) missing.push("ciudad");
  if (!profile.province?.trim()) missing.push("provincia");
  if (!profile.postal_code?.trim()) missing.push("código postal");
  return missing;
}

/** Devuelve las imágenes del KYC que faltan según el perfil. */
function missingKycDocuments(profile: ProfileKycData): string[] {
  const missing: string[] = [];
  if (!profile.dni_front_url) missing.push("el frente del DNI");
  if (!profile.dni_back_url) missing.push("el dorso del DNI");
  if (!profile.face_url) missing.push("la selfie");
  return missing;
}

async function loadKycProfile(userId: string): Promise<{
  ok: boolean;
  profile: ProfileKycData | null;
  error?: string;
}> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("profiles")
    .select(KYC_PROFILE_FIELDS)
    .eq("id", userId)
    .maybeSingle();

  if (error) {
    return { ok: false, profile: null, error: profileErrorMessage(error.message) };
  }

  return { ok: true, profile: (data as ProfileKycData | null) ?? null };
}

/** Datos personales que el superadmin revisa junto con DNI y selfie. */
export async function saveKycData(input: unknown) {
  const actor = await requireAdminSession();
  if (!actor) return { ok: false, error: "No autorizado" };

  const parsed = kycDataSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Datos inválidos",
    };
  }

  const supabase = createClient();
  const { error } = await supabase
    .from("profiles")
    .update({
      full_name: parsed.data.full_name,
      phone: parsed.data.phone,
      location: parsed.data.location,
      dni_number: parsed.data.dni_number.replace(/\./g, "").replace(/\s/g, ""),
      dni_address: parsed.data.dni_address,
    })
    .eq("id", actor.id);

  if (error) return { ok: false, error: error.message };

  revalidatePath("/admin/verificacion");
  revalidatePath("/perfil");
  return { ok: true };
}

// Sube un archivo al bucket privado organizer-kyc/<userId>/<slot>.<ext>.
// Devuelve la RUTA (no una URL pública) para guardarla en el perfil.
async function uploadKycFile(
  userId: string,
  file: File,
  slot: KycSlot,
): Promise<{ ok: true; path: string } | { ok: false; error: string }> {
  const label = KYC_SLOT_LABELS[slot];
  const ext = ALLOWED_KYC_TYPES[file.type];
  if (!ext) {
    return {
      ok: false,
      error: `La imagen de ${label} tiene que ser JPG o PNG.`,
    };
  }
  if (file.size <= 0) {
    return { ok: false, error: `El archivo de ${label} está vacío.` };
  }
  if (file.size > MAX_KYC_BYTES) {
    return {
      ok: false,
      error: `La imagen de ${label} supera el máximo de 5 MB.`,
    };
  }

  const path = `${userId}/${slot}.${ext}`;
  const supabase = createClient();

  let arrayBuffer: ArrayBuffer;
  try {
    arrayBuffer = await file.arrayBuffer();
  } catch {
    return {
      ok: false,
      error: `No se pudo leer el archivo de ${label}. Volvé a seleccionarlo.`,
    };
  }

  const { error } = await supabase.storage
    .from("organizer-kyc")
    .upload(path, arrayBuffer, {
      contentType: file.type,
      upsert: true,
      cacheControl: "3600",
    });

  if (error) {
    return { ok: false, error: storageErrorMessage(error.message, label) };
  }

  return { ok: true, path };
}

/**
 * Envía el KYC completo: frente del DNI, dorso del DNI y selfie.
 * Las tres imágenes son obligatorias y se guardan en el bucket privado.
 * Sólo después de subir las tres se marca el perfil como `pending`.
 */
export async function submitKyc(formData: FormData) {
  const actor = await requireAdminSession();
  if (!actor) return { ok: false, error: "No autorizado" };
  const userId = actor.id;

  const files: Partial<Record<KycSlot, File>> = {};
  for (const slot of KYC_SLOTS) {
    const file = formFile(formData, slot);
    if (!file) {
      return { ok: false, error: `Adjuntá ${KYC_SLOT_LABELS[slot]}.` };
    }
    files[slot] = file;
  }

  const loaded = await loadKycProfile(userId);
  if (!loaded.ok || !loaded.profile) {
    return {
      ok: false,
      error: loaded.error ?? "No se pudo leer tu perfil. Volvé a iniciar sesión.",
    };
  }
  const profile = loaded.profile;

  if (profile.verification_status === "approved") {
    return {
      ok: false,
      error:
        "Tu identidad ya está verificada. Si necesitás corregir algo, contactá al superadmin.",
    };
  }

  const missingData = missingPersonalData(profile);
  if (missingData.length > 0) {
    return {
      ok: false,
      error: `Antes de enviar el KYC completá tus datos personales: ${missingData.join(", ")}.`,
    };
  }

  if (!addressMatches(profile, profile.dni_address)) {
    return {
      ok: false,
      error:
        "La dirección del DNI no coincide con tu dirección de entrega. Corregila antes de enviar el KYC.",
    };
  }

  const paths: Partial<Record<KycSlot, string>> = {};
  for (const slot of KYC_SLOTS) {
    const file = files[slot];
    if (!file) continue;
    const uploaded = await uploadKycFile(userId, file, slot);
    if (!uploaded.ok) return { ok: false, error: uploaded.error };
    paths[slot] = uploaded.path;
  }

  const supabase = createClient();
  const { error } = await supabase
    .from("profiles")
    .update({
      dni_front_url: paths.dni_front,
      dni_back_url: paths.dni_back,
      face_url: paths.selfie,
      verification_status: "pending",
    })
    .eq("id", userId);

  if (error) return { ok: false, error: profileErrorMessage(error.message) };

  revalidatePath("/admin/verificacion");
  revalidatePath("/admin/super");
  return { ok: true };
}

export async function approveVerification(userId: string) {
  const actor = await requireSuperadminSession();
  if (!actor) return { ok: false, error: "No autorizado" };

  const loaded = await loadKycProfile(userId);
  if (!loaded.ok || !loaded.profile) {
    return {
      ok: false,
      error: loaded.error ?? "No se encontró el perfil del organizador.",
    };
  }
  const profile = loaded.profile;

  const missingData = missingPersonalData(profile);
  if (missingData.length > 0) {
    return {
      ok: false,
      error: `No se puede aprobar: faltan datos personales (${missingData.join(", ")}).`,
    };
  }

  if (!addressMatches(profile, profile.dni_address)) {
    return {
      ok: false,
      error:
        "No se puede aprobar: la dirección del DNI no coincide con la dirección de entrega del perfil.",
    };
  }

  const missingDocs = missingKycDocuments(profile);
  if (missingDocs.length > 0) {
    return {
      ok: false,
      error: `No se puede aprobar: falta ${missingDocs.join(", ")}.`,
    };
  }

  const admin = createAdminClient();
  const { error } = await admin
    .from("profiles")
    .update({
      verification_status: "approved",
      dni_verified: true,
      face_verified: true,
      // Desbloquea la insignia pública y, junto con verification_status,
      // la creación de sorteos (trigger de la migración 0054).
      is_verified: true,
    })
    .eq("id", userId);

  if (error) return { ok: false, error: profileErrorMessage(error.message) };

  revalidatePath("/admin/super");
  revalidatePath("/admin/verificacion");
  revalidatePath("/admin");
  return { ok: true };
}

export async function rejectVerification(userId: string) {
  const actor = await requireSuperadminSession();
  if (!actor) return { ok: false, error: "No autorizado" };

  const admin = createAdminClient();
  const { error } = await admin
    .from("profiles")
    .update({
      verification_status: "rejected",
      dni_verified: false,
      face_verified: false,
      is_verified: false,
    })
    .eq("id", userId);

  if (error) return { ok: false, error: profileErrorMessage(error.message) };

  revalidatePath("/admin/super");
  revalidatePath("/admin/verificacion");
  return { ok: true };
}
