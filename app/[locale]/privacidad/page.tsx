import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("LegalPrivacy");
  return {
    title: t("metaTitle"),
    description: t("metaDescription"),
  };
}

/**
 * Texto provisto por el titular (2 de noviembre de 2026), ajustado a lo que el
 * sistema realmente hace: el acceso es con Google o con una llave de acceso
 * (no hay contraseña propia), los comprobantes viajan por WhatsApp y no se
 * almacenan, y los registros técnicos quedan en el proveedor de alojamiento.
 * Identificación del responsable: jacinto.cards.
 */
export default async function PrivacidadPage() {
  const t = await getTranslations("LegalPrivacy");

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
        <ul className="space-y-2 text-sm text-muted-foreground">
          {["s1Item1", "s1Item2", "s1Item3", "s1Item4", "s1Item5"].map(
            (item) => (
              <li key={item}>
                ·{" "}
                {t.rich(item, {
                  strong: (chunks) => <strong>{chunks}</strong>,
                })}
              </li>
            ),
          )}
        </ul>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold">{t("s2Title")}</h2>
        <p className="text-sm text-muted-foreground">{t("s2Intro")}</p>
        <ul className="space-y-2 text-sm text-muted-foreground">
          {["s2Item1", "s2Item2", "s2Item3", "s2Item4"].map((item) => (
            <li key={item}>· {t(item)}</li>
          ))}
        </ul>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold">{t("s3Title")}</h2>
        <p className="text-sm text-muted-foreground">{t("s3Body")}</p>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold">{t("s4Title")}</h2>
        <p className="text-sm text-muted-foreground">{t("s4Intro")}</p>
        <ul className="space-y-2 text-sm text-muted-foreground">
          {["s4Item1", "s4Item2", "s4Item3", "s4Item4"].map((item) => (
            <li key={item}>· {t(item)}</li>
          ))}
        </ul>
        <p className="text-sm text-muted-foreground">{t("s4After1")}</p>
        <p className="text-sm text-muted-foreground">{t("s4After2")}</p>
        <p className="text-sm text-muted-foreground">
          {t.rich("s4After3", {
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

      <section className="space-y-3">
        <h2 className="text-xl font-semibold">{t("s5Title")}</h2>
        <p className="text-sm text-muted-foreground">{t("s5Body")}</p>
      </section>
    </article>
  );
}
