import type { Metadata } from "next";

import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
import { ReferralCapture } from "@/components/ReferralCapture";
import { ThemeProvider } from "@/components/ThemeProvider";
import { createClient } from "@/lib/supabase/server";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_URL?.trim() || "http://localhost:3000",
  ),
  title: "Gadu Sorteos",
  description:
    "Participa en sorteos con premios de todo tipo, elige tus números y paga por transferencia con comprobante por WhatsApp.",
  openGraph: {
    title: "Gadu Sorteos",
    description:
      "Sorteos transparentes con premios de todo tipo. Elegí tus números, participá y ganá.",
    images: [
      {
        url: "/og-image.png",
        width: 1200,
        height: 630,
        alt: "Gadu Sorteos",
      },
    ],
    type: "website",
    locale: "es_AR",
  },
  twitter: {
    card: "summary_large_image",
    title: "Gadu Sorteos",
    description:
      "Sorteos transparentes con premios de todo tipo. Elegí tus números, participá y ganá.",
    images: ["/og-image.png"],
  },
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Lee la sesión en el servidor para sembrar el Navbar con el estado correcto
  // y evitar el "flash" de botones de invitado en el primer render.
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Auto-reparación: si el usuario autenticado aún no tiene perfil en
  // public.profiles, lo creamos al vuelo (RLS: auth.uid() = id).
  if (user) {
    const { data: existingProfile } = await supabase
      .from("profiles")
      .select("id")
      .eq("id", user.id)
      .maybeSingle();

    if (!existingProfile) {
      const meta = user.user_metadata as {
        full_name?: string;
        name?: string;
      };
      await supabase.from("profiles").upsert(
        {
          id: user.id,
          full_name:
            meta.full_name ||
            meta.name ||
            user.email?.split("@")[0] ||
            "Usuario",
          email: user.email ?? null,
          role: "user",
        },
        { onConflict: "id", ignoreDuplicates: true },
      );
    }
  }

  const initialUser = user
    ? {
        id: user.id,
        email: user.email ?? null,
        avatarUrl:
          (user.user_metadata as { avatar_url?: string } | undefined)
            ?.avatar_url ?? null,
      }
    : null;

  return (
    <html lang="es" suppressHydrationWarning>
      <body className="flex min-h-screen flex-col">
        <ThemeProvider>
          <ReferralCapture />
          <Navbar initialUser={initialUser} />
          <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8">
            {children}
          </main>
          <Footer />
        </ThemeProvider>
      </body>
    </html>
  );
}
