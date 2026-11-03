"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import {
  requireAdminSession,
  requireSuperadminSession,
} from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

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
});

type ProfileKycData = {
  verification_status: string | null;
  full_name: string | null;
  phone: string | null;
  location: string | null;
  dni_number: string | null;
};

async function kycDataComplete(userId: string): Promise<{
  ok: boolean;
  data: ProfileKycData | null;
}> {
  const supabase = createClient();
  const { data } = await supabase
    .from("profiles")
    .select("verification_status, full_name, phone, location, dni_number")
    .eq("id", userId)
    .maybeSingle();

  const profile = data as ProfileKycData | null;

  return {
    ok: Boolean(
      profile &&
        profile.full_name?.trim() &&
        profile.phone?.trim() &&
        profile.location?.trim() &&
        profile.dni_number?.trim(),
    ),
    data: profile,
  };
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
    })
    .eq("id", actor.id);

  if (error) return { ok: false, error: error.message };

  revalidatePath("/admin/verificacion");
  revalidatePath("/perfil");
  return { ok: true };
}

// Sube un archivo al bucket privado organizador-kyc/<userId>/<filename>.<ext>.
// Devuelve la RUTA (no una URL pública) para guardarla en el perfil.
async function uploadKycFile(
  userId: string,
  file: File,
  filename: string,
): Promise<string | null> {
  const supabase = createClient();
  const ext = file.name.split(".").pop() || "jpg";
  const path = `${userId}/${filename}.${ext}`;
  const arrayBuffer = await file.arrayBuffer();

  const { error } = await supabase.storage
    .from("organizer-kyc")
    .upload(path, arrayBuffer, { contentType: file.type, upsert: true });

  if (error) return null;
  return path;
}

export async function submitDni(formData: FormData) {
  const actor = await requireAdminSession();
  if (!actor) return { ok: false, error: "No autorizado" };
  const userId = actor.id;

  const file = formData.get("dni") as File | null;
  if (!file || !file.type.startsWith("image/")) {
    return { ok: false, error: "Adjuntá la foto del frente de tu DNI" };
  }

  const dataCheck = await kycDataComplete(userId);
  if (!dataCheck.ok) {
    return {
      ok: false,
      error:
        "Antes de subir el DNI completá tus datos personales: nombre, teléfono, ubicación y número de DNI.",
    };
  }

  const path = await uploadKycFile(userId, file, "dni_front");
  if (!path) return { ok: false, error: "No se pudo subir el DNI" };

  const supabase = createClient();
  const { error } = await supabase
    .from("profiles")
    .update({ dni_front_url: path, verification_status: "pending" })
    .eq("id", userId);

  if (error) return { ok: false, error: error.message };

  revalidatePath("/admin/verificacion");
  return { ok: true };
}

export async function submitSelfie(formData: FormData) {
  const actor = await requireAdminSession();
  if (!actor) return { ok: false, error: "No autorizado" };
  const userId = actor.id;

  const file = formData.get("selfie") as File | null;
  if (!file || !file.type.startsWith("image/")) {
    return { ok: false, error: "Capturá tu selfie" };
  }

  const dataCheck = await kycDataComplete(userId);
  if (!dataCheck.ok) {
    return {
      ok: false,
      error:
        "Antes del selfie completá tus datos personales: nombre, teléfono, ubicación y número de DNI.",
    };
  }

  const path = await uploadKycFile(userId, file, "face");
  if (!path) return { ok: false, error: "No se pudo subir el selfie" };

  const supabase = createClient();
  const { error } = await supabase
    .from("profiles")
    .update({ face_url: path, verification_status: "pending" })
    .eq("id", userId);

  if (error) return { ok: false, error: error.message };

  revalidatePath("/admin/verificacion");
  return { ok: true };
}

export async function approveVerification(userId: string) {
  const actor = await requireSuperadminSession();
  if (!actor) return { ok: false, error: "No autorizado" };

  const dataCheck = await kycDataComplete(userId);
  if (!dataCheck.ok) {
    return {
      ok: false,
      error:
        "No se puede aprobar: el organizador todavía no cargó nombre, teléfono, ubicación y DNI.",
    };
  }

  const admin = createAdminClient();
  const { error } = await admin
    .from("profiles")
    .update({
      verification_status: "approved",
      dni_verified: true,
      face_verified: true,
    })
    .eq("id", userId);

  if (error) return { ok: false, error: error.message };

  revalidatePath("/admin/super");
  revalidatePath("/admin/verificacion");
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
    })
    .eq("id", userId);

  if (error) return { ok: false, error: error.message };

  revalidatePath("/admin/super");
  revalidatePath("/admin/verificacion");
  return { ok: true };
}
