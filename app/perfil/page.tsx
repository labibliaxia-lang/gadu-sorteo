"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { CreditCard, Mail, ShieldCheck, Ticket } from "lucide-react";

import { createClient } from "@/lib/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { setEmailPreference } from "@/app/perfil/actions";
import { acceptTerms } from "@/app/actions/terms";
import { ProfileEditor } from "@/components/ProfileEditor";
import { TERMS_VERSION } from "@/lib/terms";
import { formatDateTime } from "@/lib/utils";

interface ProfileData {
  full_name: string | null;
  role: string;
  role_requested: boolean;
  avatar_url: string | null;
  address_line: string | null;
  city: string | null;
  province: string | null;
  postal_code: string | null;
  country: string | null;
  email: string | null;
  phone: string | null;
  location: string | null;
  instagram_url: string | null;
  bio: string | null;
  website_url: string | null;
  plan: string;
  slug: string | null;
  verification_status: string;
  email_opt_in: boolean;
  terms_accepted_at: string | null;
  terms_version: string | null;
}

export default function PerfilPage() {
  const supabase = createClient();
  const [user, setUser] = useState<{
    id: string;
    email?: string;
  } | null>(null);
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [loading, setLoading] = useState(true);
  const [savingEmail, setSavingEmail] = useState(false);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [savingTerms, setSavingTerms] = useState(false);
  const [termsError, setTermsError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (user) {
        setUser(user);
        const { data } = await supabase
          .from("profiles")
          .select(
            "full_name, role, role_requested, avatar_url, address_line, city, province, postal_code, country, email, phone, location, instagram_url, bio, website_url, plan, slug, verification_status, email_opt_in, terms_accepted_at, terms_version",
          )
          .eq("id", user.id)
          .maybeSingle();
        setProfile((data as ProfileData | null) ?? null);
      }
      setLoading(false);
    }
    load();
  }, [supabase]);

  async function toggleEmailPreference() {
    if (!profile || savingEmail) return;

    setSavingEmail(true);
    setEmailError(null);

    const next = !profile.email_opt_in;
    const result = await setEmailPreference(next);

    if (!result.ok) {
      setEmailError(result.error);
    } else {
      setProfile((current) =>
        current
          ? {
              ...current,
              email_opt_in: next,
              terms_accepted_at:
                current.terms_accepted_at ?? new Date().toISOString(),
              terms_version:
                current.terms_version ?? TERMS_VERSION,
            }
          : current,
      );
    }

    setSavingEmail(false);
  }

  async function acceptCurrentTerms() {
    if (!profile || savingTerms) return;

    setSavingTerms(true);
    setTermsError(null);

    const result = await acceptTerms(TERMS_VERSION);
    if (!result.ok) {
      setTermsError(result.error);
    } else {
      setProfile((current) =>
        current
          ? {
              ...current,
              terms_accepted_at: new Date().toISOString(),
              terms_version: TERMS_VERSION,
            }
          : current,
      );
    }

    setSavingTerms(false);
  }

  if (loading) {
    return <p className="text-muted-foreground">Cargando…</p>;
  }

  if (!user) {
    return (
      <div className="space-y-4 text-center">
        <p className="text-muted-foreground">No estás autenticado.</p>
        <Link href="/login" className={buttonVariants()}>
          Ingresar
        </Link>
      </div>
    );
  }

  const isAdmin =
    profile?.role === "admin" || profile?.role === "superadmin";

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <h1 className="text-3xl font-bold tracking-tight">Mi perfil</h1>
        <p className="text-muted-foreground">Tu información de cuenta.</p>
      </header>

      <ProfileEditor
        profile={{
          id: user.id,
          full_name: profile?.full_name ?? null,
          phone: profile?.phone ?? null,
          location: profile?.location ?? null,
          instagram_url: profile?.instagram_url ?? null,
          bio: profile?.bio ?? null,
          website_url: profile?.website_url ?? null,
          avatar_url: profile?.avatar_url ?? null,
          address_line: profile?.address_line ?? null,
          city: profile?.city ?? null,
          province: profile?.province ?? null,
          postal_code: profile?.postal_code ?? null,
          country: profile?.country ?? null,
          role: profile?.role ?? "user",
          plan: profile?.plan ?? "organizador",
          slug: profile?.slug ?? null,
          verification_status: profile?.verification_status ?? "pending",
        }}
        email={user?.email ?? null}
        onSaved={(patch) =>
          setProfile((current) =>
            current ? { ...current, ...patch } : current,
          )
        }
      />

      {isAdmin && (
        <Card>
          <CardContent className="flex flex-wrap items-center justify-between gap-3 p-5">
            <div className="min-w-0">
              <p className="font-semibold">Verificación de identidad (KYC)</p>
              <p className="text-xs text-muted-foreground">
                Es obligatoria para publicar sorteos. Cargá nombre, teléfono,
                ubicación y DNI, y esperá la aprobación de identidad.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Badge
                variant={
                  profile?.verification_status === "approved"
                    ? "success"
                    : profile?.verification_status === "rejected"
                      ? "destructive"
                      : "warning"
                }
              >
                {profile?.verification_status === "approved"
                  ? "Aprobada"
                  : profile?.verification_status === "rejected"
                    ? "Rechazada"
                    : "Pendiente"}
              </Badge>
              <Link
                href="/admin/verificacion"
                className={buttonVariants({ variant: "outline", size: "sm" })}
              >
                Gestionar
              </Link>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="space-y-4 p-6">
          <div className="flex items-start gap-2">
            <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-amber-500" />
            <div className="min-w-0 flex-1 space-y-2">
              <p className="font-semibold">¿Querés organizar sorteos?</p>
              <p className="text-sm text-muted-foreground">
                Mirá los planes mensuales y elegí el que te sirva. El pago es
                por transferencia y te enviamos tu código de activación.
              </p>
              {isAdmin ? (
                <p className="text-sm text-emerald-700 dark:text-emerald-400">
                  ✓ Ya sos organizador.
                </p>
              ) : (
                <Link
                  href="/planes"
                  className={buttonVariants({ variant: "outline", size: "sm" })}
                >
                  Ver planes y precios
                </Link>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-4 p-6">
          <div className="flex items-start gap-2">
            <Mail className="mt-0.5 h-5 w-5 shrink-0 text-amber-500" />
            <div className="min-w-0 flex-1 space-y-2">
              <p className="font-semibold">Avisos por email</p>
              <p className="text-sm text-muted-foreground">
                Te avisamos cuando reservás números, cuando el organizador
                confirma tu pago y si ganás un sorteo. No los usamos para otra
                cosa. Al activarlos aceptás los{" "}
                <Link href="/terminos" className="underline underline-offset-4">
                  Términos
                </Link>{" "}
                y la{" "}
                <Link
                  href="/privacidad"
                  className="underline underline-offset-4"
                >
                  Política de Privacidad
                </Link>
                .
              </p>
              <p
                className={
                  profile?.email_opt_in
                    ? "text-xs font-medium text-emerald-700 dark:text-emerald-400"
                    : "text-xs font-medium text-muted-foreground"
                }
              >
                {profile?.email_opt_in ? "Activados" : "Desactivados"}
              </p>

              <div className="rounded-lg border bg-muted/30 p-3">
                <p className="flex flex-wrap items-center gap-1.5 text-xs font-semibold">
                  <ShieldCheck className="h-4 w-4 text-amber-700 dark:text-amber-300" />
                  Términos aceptados
                  {profile?.terms_accepted_at &&
                    profile.terms_version === TERMS_VERSION && (
                      <span className="font-medium text-emerald-700 dark:text-emerald-400">
                        · Al día
                      </span>
                    )}
                </p>
                {profile?.terms_accepted_at ? (
                  <p className="mt-1 text-xs text-muted-foreground">
                    Versión{" "}
                    <strong className="text-foreground">
                      {profile.terms_version ?? "1.0"}
                    </strong>{" "}
                    · {formatDateTime(profile.terms_accepted_at)}
                  </p>
                ) : (
                  <p className="mt-1 text-xs text-amber-800 dark:text-amber-300">
                    Todavía no registramos tu aceptación.
                  </p>
                )}

                {(!profile?.terms_accepted_at ||
                  profile.terms_version !== TERMS_VERSION) && (
                  <div className="mt-2 rounded-md border border-amber-500/50 bg-amber-500/10 p-2">
                    <p className="text-xs text-amber-900 dark:text-amber-200">
                      {profile?.terms_accepted_at
                        ? `Actualizamos los Términos a la versión ${TERMS_VERSION}. Volvé a aceptarlos para seguir al día.`
                        : "Falta registrar tu aceptación para continuar al día."}
                    </p>
                    <Button
                      size="sm"
                      className="mt-2"
                      onClick={() => void acceptCurrentTerms()}
                      disabled={savingTerms}
                    >
                      {savingTerms
                        ? "Guardando…"
                        : `Aceptar versión ${TERMS_VERSION}`}
                    </Button>
                    {termsError && (
                      <p className="mt-1 text-xs text-destructive">
                        {termsError}
                      </p>
                    )}
                  </div>
                )}

                <p className="mt-1 text-xs text-muted-foreground">
                  Versión vigente: {TERMS_VERSION}.{" "}
                  <Link
                    href="/terminos"
                    className="underline underline-offset-4"
                  >
                    Ver Términos
                  </Link>{" "}
                  ·{" "}
                  <Link
                    href="/privacidad"
                    className="underline underline-offset-4"
                  >
                    Privacidad
                  </Link>
                </p>
              </div>
              {emailError && (
                <p className="text-xs text-destructive">{emailError}</p>
              )}
              <Button
                size="sm"
                variant="outline"
                onClick={toggleEmailPreference}
                disabled={savingEmail}
              >
                {savingEmail
                  ? "Guardando…"
                  : profile?.email_opt_in
                    ? "Desactivar avisos"
                    : "Activar avisos"}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="flex flex-wrap gap-3">
        <Link href="/mis-pagos" className={buttonVariants({ variant: "outline" })}>
          <CreditCard className="mr-1.5 h-4 w-4" />
          Mis pagos
        </Link>
        <Link
          href="/mis-numeros"
          className={buttonVariants({ variant: "outline" })}
        >
          <Ticket className="mr-1.5 h-4 w-4" />
          Mis números
        </Link>
        <Link
          href="/seguridad"
          className={buttonVariants({ variant: "outline" })}
        >
          <ShieldCheck className="mr-1.5 h-4 w-4" />
          Seguridad
        </Link>
        {isAdmin && (
          <Link href="/admin" className={buttonVariants()}>
            Panel admin
          </Link>
        )}
      </div>
    </div>
  );
}
