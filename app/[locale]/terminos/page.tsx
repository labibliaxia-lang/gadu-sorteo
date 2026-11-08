import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("LegalTerms");
  return {
    title: t("metaTitle"),
    description: t("metaDescription"),
  };
}

/**
 * Texto provisto por el titular (2 de noviembre de 2026). El punto 5 describe
 * el sorteo real: azar entre números vendidos, resultado congelado y huellas
 * SHA-256 publicadas (migración 0033). Identificación: jacinto.cards.
 */
export default async function TerminosPage() {
  const t = await getTranslations("LegalTerms");

  return (
    <article className="mx-auto max-w-3xl space-y-8 py-4">
      <header className="space-y-2">
        <h1 className="text-3xl font-bold tracking-tight">{t("title")}</h1>
        <p className="text-sm text-muted-foreground">{t("updated")}</p>
        <p className="text-sm text-muted-foreground">{t("owner")}</p>
      </header>

      <p className="text-sm text-muted-foreground">{t("intro")}</p>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold">{t("s1Title")}</h2>
        <p className="text-sm text-muted-foreground">{t("s1Body")}</p>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold">{t("s2Title")}</h2>
        <p className="text-sm text-muted-foreground">{t("s2Body")}</p>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold">{t("s3Title")}</h2>
        <ul className="space-y-2 text-sm text-muted-foreground">
          <li>
            ·{" "}
            {t.rich("s3Reserve", {
              strong: (chunks) => <strong>{chunks}</strong>,
            })}
          </li>
          <li>
            ·{" "}
            {t.rich("s3Payment", {
              strong: (chunks) => <strong>{chunks}</strong>,
            })}
          </li>
          <li>
            ·{" "}
            {t.rich("s3Confirm", {
              strong: (chunks) => <strong>{chunks}</strong>,
            })}
          </li>
        </ul>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold">{t("s4Title")}</h2>
        <p className="text-sm text-muted-foreground">{t("s4Body")}</p>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold">{t("s5Title")}</h2>
        <p className="text-sm text-muted-foreground">{t("s5Body")}</p>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold">{t("s6Title")}</h2>
        <p className="text-sm text-muted-foreground">{t("s6Body")}</p>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold">{t("s7Title")}</h2>
        <p className="text-sm text-muted-foreground">{t("s7Body")}</p>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold">{t("s8Title")}</h2>
        <p className="text-sm text-muted-foreground">
          {t.rich("s8Body", {
            email: (chunks) => (
              <a
                href="mailto:francofsm84@gmail.com"
                className="underline underline-offset-4"
              >
                {chunks}
              </a>
            ),
          })}
        </p>
      </section>
    </article>
  );
}
