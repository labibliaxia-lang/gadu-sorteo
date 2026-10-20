"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { CreditCard, Mail, ShieldCheck, Ticket } from "lucide-react";

import { createClient } from "@/lib/supabase/client";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { RequestAdminButton } from "@/components/RequestAdminButton";

interface ProfileData {
  full_name: string | null;
  role: string;
  role_requested: boolean;
  avatar_url: string | null;
  email: string | null;
  phone: string | null;
  location: string | null;
  instagram_url: string | null;
}

export default function PerfilPage() {
  const supabase = createClient();
  const [user, setUser] = useState<{ email?: string } | null>(null);
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [loading, setLoading] = useState(true);

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
            "full_name, role, role_requested, avatar_url, email, phone, location, instagram_url",
          )
          .eq("id", user.id)
          .maybeSingle();
        setProfile((data as ProfileData | null) ?? null);
      }
      setLoading(false);
    }
    load();
  }, [supabase]);

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

  const initial = (profile?.full_name || user.email || "U")
    .charAt(0)
    .toUpperCase();
  const isAdmin =
    profile?.role === "admin" || profile?.role === "superadmin";
  const roleLabel =
    profile?.role === "admin"
      ? "Organizador"
      : profile?.role === "superadmin"
        ? "Superadmin"
        : "Usuario";

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <h1 className="text-3xl font-bold tracking-tight">Mi perfil</h1>
        <p className="text-muted-foreground">Tu información de cuenta.</p>
      </header>

      <Card>
        <CardContent className="flex flex-col gap-4 p-6 sm:flex-row sm:items-center">
          <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-amber-500 to-orange-600 text-2xl font-bold text-white">
            {initial}
          </div>
          <div className="min-w-0 space-y-1">
            <p className="flex flex-wrap items-center gap-2 font-semibold">
              {profile?.full_name || "Usuario"}
              <Badge variant={isAdmin ? "success" : "secondary"}>
                {roleLabel}
              </Badge>
            </p>
            {user.email && (
              <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
                <Mail className="h-4 w-4" />
                {user.email}
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-4 p-6">
          <div className="flex items-start gap-2">
            <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-amber-500" />
            <div className="min-w-0 flex-1 space-y-2">
              <p className="font-semibold">¿Querés organizar sorteos?</p>
              <p className="text-sm text-muted-foreground">
                Solicitá permisos de Organizador y el superadmin revisará tu
                pedido.
              </p>
              {isAdmin ? (
                <p className="text-sm text-emerald-600 dark:text-emerald-400">
                  ✓ Ya sos organizador.
                </p>
              ) : (
                <RequestAdminButton />
              )}
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
        {isAdmin && (
          <Link href="/admin" className={buttonVariants()}>
            Panel admin
          </Link>
        )}
      </div>
    </div>
  );
}
