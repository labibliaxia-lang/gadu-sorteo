import type { Metadata } from "next";
import { IBM_Plex_Mono, Inter, Space_Grotesk } from "next/font/google";

import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
import { ImpersonationBanner } from "@/components/admin/ImpersonationBanner";
import { ProfileCompletionGate } from "@/components/ProfileCompletionGate";
import { ReferralCapture } from "@/components/ReferralCapture";
import { TermsGate } from "@/components/TermsGate";
import { ThemeProvider } from "@/components/ThemeProvider";
import { createClient } from "@/lib/supabase/server";
import { readImpersonationOrigin } from "@/lib/impersonation-server";
import { TERMS_VERSION } from "@/lib/terms";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-space-grotesk",
  display: "swap",
});

const plexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-ibm-plex-mono",
  display: "swap",
});

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
  let termsAccepted = false;
  let hasAcceptedTerms = false;
  let acceptedTermsVersion: string | null = null;
  let deliveryMissing = false;
  let deliveryPhone = "";
  let deliveryAddress = "";
  let deliveryCity = "";
  let deliveryProvince = "";
  let deliveryPostalCode = "";
  let deliveryCountry = "AR";
  if (user) {
    const { data: existingProfile } = await supabase
      .from("profiles")
      .select(
        "id, terms_accepted_at, terms_version, phone, address_line, city, province, postal_code, country",
      )
      .eq("id", user.id)
      .maybeSingle();

    hasAcceptedTerms = Boolean(existingProfile?.terms_accepted_at);
    acceptedTermsVersion =
      (existingProfile?.terms_version as string | null) ?? null;
    termsAccepted =
      hasAcceptedTerms && acceptedTermsVersion === TERMS_VERSION;

    deliveryPhone = (existingProfile?.phone as string | null) ?? "";
    deliveryAddress =
      (existingProfile?.address_line as string | null) ?? "";
    deliveryCity = (existingProfile?.city as string | null) ?? "";
    deliveryProvince = (existingProfile?.province as string | null) ?? "";
    deliveryPostalCode =
      (existingProfile?.postal_code as string | null) ?? "";
    deliveryCountry =
      (existingProfile?.country as string | null) ?? "AR";

    deliveryMissing =
      !deliveryPhone.trim() ||
      !deliveryAddress.trim() ||
      !deliveryCity.trim() ||
      !deliveryProvince.trim() ||
      !deliveryPostalCode.trim();

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

  // Modo Editor: con la sesión del usuario impersonado, /admin/super deja de
  // ser accesible, así que este banner global es la única salida y tiene que
  // aparecer en todas las páginas. Si la lectura falla, la app sigue igual.
  let impersonation: Awaited<
    ReturnType<typeof readImpersonationOrigin>
  > = null;
  try {
    impersonation = await readImpersonationOrigin();
  } catch {
    impersonation = null;
  }

  return (
    <html
      lang="es"
      suppressHydrationWarning
      className={`${inter.variable} ${spaceGrotesk.variable} ${plexMono.variable}`}
    >
      <body className="flex min-h-screen flex-col overflow-x-hidden">
        <a
          href="#contenido"
          className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[60] focus:rounded-lg focus:bg-primary focus:px-4 focus:py-2.5 focus:text-sm focus:font-medium focus:text-primary-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:ring-offset-background"
        >
          Saltar al contenido
        </a>
        <ThemeProvider>
          <ReferralCapture />
          {user &&
            (termsAccepted ? (
              <ProfileCompletionGate
                missing={deliveryMissing}
                initialPhone={deliveryPhone}
                initialAddress={deliveryAddress}
                initialCity={deliveryCity}
                initialProvince={deliveryProvince}
                initialPostalCode={deliveryPostalCode}
                initialCountry={deliveryCountry}
              />
            ) : (
              <TermsGate
                accepted={termsAccepted}
                hasAcceptedTerms={hasAcceptedTerms}
                acceptedVersion={acceptedTermsVersion}
              />
            ))}
          {impersonation && (
            <ImpersonationBanner
              targetName={impersonation.targetName}
              adminEmail={impersonation.adminEmail}
            />
          )}
          <Navbar initialUser={initialUser} />
          <main
            id="contenido"
            className="mx-auto w-full max-w-6xl flex-1 px-4 pb-16 pt-6 sm:px-6 sm:pt-8"
          >
            {children}
          </main>
          <Footer />
        </ThemeProvider>
      </body>
    </html>
  );
}
