"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

async function getCurrentUserId(): Promise<string | null> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user?.id ?? null;
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
  const userId = await getCurrentUserId();
  if (!userId) return { ok: false, error: "No autenticado" };

  const file = formData.get("dni") as File | null;
  if (!file || !file.type.startsWith("image/")) {
    return { ok: false, error: "Adjuntá la foto del frente de tu DNI" };
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
  const userId = await getCurrentUserId();
  if (!userId) return { ok: false, error: "No autenticado" };

  const file = formData.get("selfie") as File | null;
  if (!file || !file.type.startsWith("image/")) {
    return { ok: false, error: "Capturá tu selfie" };
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

async function isSuperAdmin(): Promise<boolean> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return false;

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  return profile?.role === "superadmin";
}

export async function approveVerification(userId: string) {
  if (!(await isSuperAdmin())) return { ok: false, error: "No autorizado" };

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
  if (!(await isSuperAdmin())) return { ok: false, error: "No autorizado" };

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
