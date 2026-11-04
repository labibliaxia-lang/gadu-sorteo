"use client";

import { useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Camera, Loader2, Save } from "lucide-react";

import { updateProfile } from "@/app/perfil/actions";
import { createClient } from "@/lib/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

export interface ProfileEditorProfile {
  id: string;
  full_name: string | null;
  phone: string | null;
  location: string | null;
  instagram_url: string | null;
  bio: string | null;
  website_url: string | null;
  avatar_url: string | null;
  address_line: string | null;
  city: string | null;
  province: string | null;
  postal_code: string | null;
  country: string | null;
  role: string;
  plan: string;
  slug: string | null;
  verification_status: string;
}

/**
 * Edición del perfil propio:
 * - Usuario: nombre, foto y teléfono privado.
 * - Organizador: agrega ubicación, Instagram, bio y sitio web públicos.
 * - Premium: mismos campos con la insignia de plan.
 */
export function ProfileEditor({
  profile,
  email,
  onSaved,
}: {
  profile: ProfileEditorProfile;
  email: string | null;
  onSaved: (patch: Record<string, string | null>) => void;
}) {
  const router = useRouter();
  const supabase = createClient();
  const inputRef = useRef<HTMLInputElement>(null);

  const [fullName, setFullName] = useState(profile.full_name ?? "");
  const [phone, setPhone] = useState(profile.phone ?? "");
  const [location, setLocation] = useState(profile.location ?? "");
  const [instagram, setInstagram] = useState(profile.instagram_url ?? "");
  const [bio, setBio] = useState(profile.bio ?? "");
  const [website, setWebsite] = useState(profile.website_url ?? "");
  const [avatarUrl, setAvatarUrl] = useState(profile.avatar_url ?? "");
  const [addressLine, setAddressLine] = useState(profile.address_line ?? "");
  const [city, setCity] = useState(profile.city ?? "");
  const [province, setProvince] = useState(profile.province ?? "");
  const [postalCode, setPostalCode] = useState(profile.postal_code ?? "");
  const [country, setCountry] = useState(profile.country ?? "AR");
  const [preview, setPreview] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const isOrganizer =
    profile.role === "admin" || profile.role === "superadmin";
  const isPremium = profile.plan === "premium";

  async function uploadAvatar(file: File | undefined) {
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      setError("La foto debe ser una imagen.");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setError("La foto no puede superar los 5 MB.");
      return;
    }

    setUploading(true);
    setError(null);
    setPreview(URL.createObjectURL(file));

    const ext = file.name.split(".").pop() ?? "jpg";
    const path = `${profile.id}/${Date.now()}.${ext}`;

    const { error: uploadError } = await supabase.storage
      .from("avatars")
      .upload(path, file, { upsert: true });

    if (uploadError) {
      setError(uploadError.message);
      setUploading(false);
      return;
    }

    const { data } = supabase.storage.from("avatars").getPublicUrl(path);
    setAvatarUrl(data.publicUrl);
    setUploading(false);
  }

  async function save() {
    setSaving(true);
    setError(null);
    setMessage(null);

    const result = await updateProfile({
      full_name: fullName,
      phone,
      location: isOrganizer ? location : "",
      instagram_url: isOrganizer ? instagram : "",
      bio: isOrganizer ? bio : "",
      website_url: isOrganizer ? website : "",
      avatar_url: avatarUrl,
      address_line: addressLine,
      city,
      province,
      postal_code: postalCode,
      country,
    });

    setSaving(false);

    if (!result.ok) {
      setError(result.error);
      return;
    }

    setMessage("Perfil actualizado.");
    onSaved({
      full_name: fullName,
      phone: phone || null,
      location: isOrganizer ? location || null : null,
      instagram_url: isOrganizer ? instagram || null : null,
      bio: isOrganizer ? bio || null : null,
      website_url: isOrganizer ? website || null : null,
      avatar_url: avatarUrl || null,
      address_line: addressLine || null,
      city: city || null,
      province: province || null,
      postal_code: postalCode || null,
      country: country || "AR",
    });
    router.refresh();
  }

  const initial = (fullName || email || "U").charAt(0).toUpperCase();

  return (
    <Card>
      <CardContent className="space-y-5 p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
          <div className="relative h-20 w-20 shrink-0">
            {preview || avatarUrl ? (
              <Image
                src={preview ?? avatarUrl}
                alt={fullName || "Foto de perfil"}
                fill
                sizes="80px"
                className="rounded-full object-cover"
              />
            ) : (
              <div className="flex h-20 w-20 items-center justify-center rounded-full bg-brand-500 text-2xl font-bold text-ink">
                {initial}
              </div>
            )}
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              aria-label="Cambiar foto de perfil"
              className="absolute -bottom-1 -right-1 flex h-8 w-8 items-center justify-center rounded-full border bg-background shadow-soft transition hover:bg-accent"
            >
              {uploading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Camera className="h-4 w-4" />
              )}
            </button>
            <input
              ref={inputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(event) => void uploadAvatar(event.target.files?.[0])}
            />
          </div>

          <div className="min-w-0 flex-1 space-y-1">
            <p className="flex flex-wrap items-center gap-2 font-display text-xl font-semibold">
              {fullName || "Usuario"}
              <Badge variant={isOrganizer ? "success" : "secondary"}>
                {profile.role === "superadmin"
                  ? "Superadmin"
                  : isOrganizer
                    ? isPremium
                      ? "Organizador Premium"
                      : "Organizador"
                    : "Usuario"}
              </Badge>
            </p>
            {email && (
              <p className="truncate text-sm text-muted-foreground">{email}</p>
            )}
            {isOrganizer && profile.slug && (
              <Link
                href={`/organizador/${profile.slug}`}
                className="text-xs text-brand-800 underline-offset-4 hover:underline dark:text-brand-300"
              >
                Ver perfil público
              </Link>
            )}
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <label htmlFor="profile-name" className="text-sm font-medium">
              Nombre visible
            </label>
            <Input
              id="profile-name"
              value={fullName}
              maxLength={80}
              onChange={(event) => setFullName(event.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <label htmlFor="profile-phone" className="text-sm font-medium">
              Teléfono
            </label>
            <Input
              id="profile-phone"
              value={phone}
              maxLength={30}
              placeholder="Ej: 11 2345 6789"
              onChange={(event) => setPhone(event.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Privado: sólo se usa para coordinar entregas.
            </p>
          </div>
        </div>

        <div className="space-y-3 rounded-xl border bg-muted/20 p-4">
          <div>
            <p className="text-sm font-semibold">Dirección de recepción</p>
            <p className="text-xs text-muted-foreground">
              Obligatoria para todos. Es privada: sólo la ve el organizador si
              ganás un premio. Si sos organizador, debe coincidir con la
              dirección de tu DNI.
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5 sm:col-span-2">
              <label htmlFor="profile-address" className="text-sm font-medium">
                Dirección y número
              </label>
              <Input
                id="profile-address"
                value={addressLine}
                maxLength={160}
                placeholder="Calle, número, piso/depto"
                onChange={(event) => setAddressLine(event.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <label htmlFor="profile-city" className="text-sm font-medium">
                Ciudad
              </label>
              <Input
                id="profile-city"
                value={city}
                maxLength={80}
                onChange={(event) => setCity(event.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <label htmlFor="profile-province" className="text-sm font-medium">
                Provincia
              </label>
              <Input
                id="profile-province"
                value={province}
                maxLength={80}
                onChange={(event) => setProvince(event.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <label htmlFor="profile-postal" className="text-sm font-medium">
                Código postal
              </label>
              <Input
                id="profile-postal"
                value={postalCode}
                maxLength={12}
                onChange={(event) => setPostalCode(event.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <label htmlFor="profile-country" className="text-sm font-medium">
                País
              </label>
              <Input
                id="profile-country"
                value={country}
                maxLength={80}
                onChange={(event) => setCountry(event.target.value)}
              />
            </div>
          </div>
        </div>

        {isOrganizer && (
          <>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <label
                  htmlFor="profile-location"
                  className="text-sm font-medium"
                >
                  Ubicación
                </label>
                <Input
                  id="profile-location"
                  value={location}
                  maxLength={80}
                  placeholder="Ciudad / zona"
                  onChange={(event) => setLocation(event.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <label
                  htmlFor="profile-instagram"
                  className="text-sm font-medium"
                >
                  Instagram
                </label>
                <Input
                  id="profile-instagram"
                  value={instagram}
                  maxLength={120}
                  placeholder="@tuusuario"
                  onChange={(event) => setInstagram(event.target.value)}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label htmlFor="profile-bio" className="text-sm font-medium">
                Bio pública
              </label>
              <Textarea
                id="profile-bio"
                value={bio}
                maxLength={400}
                rows={3}
                placeholder="Contá quién sos y qué sorteás."
                onChange={(event) => setBio(event.target.value)}
              />
              <p className="text-right text-xs text-muted-foreground">
                {bio.trim().length}/400
              </p>
            </div>

            <div className="space-y-1.5">
              <label htmlFor="profile-website" className="text-sm font-medium">
                Sitio web
              </label>
              <Input
                id="profile-website"
                value={website}
                maxLength={200}
                placeholder="https://tu-sitio.com"
                onChange={(event) => setWebsite(event.target.value)}
              />
            </div>

            <p className="rounded-lg border bg-muted/30 p-3 text-xs text-muted-foreground">
              La bio, ubicación, Instagram y sitio web se muestran en tu perfil
              público. El teléfono y el email no.
            </p>
          </>
        )}

        {error && (
          <p className="rounded-md bg-destructive/10 p-2 text-xs text-destructive">
            {error}
          </p>
        )}
        {message && (
          <p className="rounded-md bg-emerald-500/10 p-2 text-xs text-emerald-700 dark:text-emerald-300">
            {message}
          </p>
        )}

        <div className="flex justify-end">
          <Button onClick={() => void save()} disabled={saving || uploading}>
            {saving ? (
              <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
            ) : (
              <Save className="mr-1.5 h-4 w-4" />
            )}
            {saving ? "Guardando…" : "Guardar perfil"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
