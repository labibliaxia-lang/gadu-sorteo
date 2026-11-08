import type { Metadata } from "next";
import type { ReactNode } from "react";
import { getTranslations } from "next-intl/server";
import {
  BadgeCheck,
  Eye,
  Hash,
  Play,
  ShieldCheck,
  Ticket,
  Trophy,
} from "lucide-react";

import { Link as LocaleLink } from "@/src/i18n/navigation";
import { buttonVariants } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { DemoExperience } from "@/components/SandboxDraw";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("ComoFunciona");
  return {
    title: t("metaTitle"),
    description: t("metaDescription"),
  };
}

/** Resalta un concepto clave dentro de una lista. */
function Key({ children }: { children: ReactNode }) {
  return <strong className="font-semibold text-fg">{children}</strong>;
}

const STEPS = [
  {
    n: "01",
    icon: Ticket,
    title: "step1Title",
    points: ["step1Point1", "step1Point2", "step1Point3"],
  },
  {
    n: "02",
    icon: ShieldCheck,
    title: "step2Title",
    points: ["step2Point1", "step2Point2", "step2Point3"],
  },
  {
    n: "03",
    icon: Trophy,
    title: "step3Title",
    points: ["step3Point1", "step3Point2", "step3Point3"],
  },
  {
    n: "04",
    icon: Eye,
    title: "step4Title",
    points: ["step4Point1", "step4Point2", "step4Point3"],
  },
] as const;

const FORMULA =
  "sha256( gadu:v1 | raffle:<id> | seed:<semilla> | numbers:n1,n2,...,nN )";

const CHECK_ITEMS = [
  "demoCheck1",
  "demoCheck2",
  "demoCheck3",
  "demoCheck4",
] as const;

const DEMO_STEPS = [
  {
    n: "1",
    title: "demoStep1Title",
    text: "demoStep1Text",
  },
  {
    n: "2",
    title: "demoStep2Title",
    text: "demoStep2Text",
  },
  {
    n: "3",
    title: "demoStep3Title",
    text: "demoStep3Text",
  },
] as const;

export default async function ComoFuncionaPage() {
  const t = await getTranslations("ComoFunciona");

  return (
    <div className="mx-auto max-w-4xl space-y-16">
      <header className="space-y-5 border-b border-hairline pb-10">
        <p className="flex items-center gap-2">
          <ShieldCheck
            className="h-3.5 w-3.5 text-brand-accent"
            aria-hidden="true"
          />
          <span className="eyebrow-gold">{t("eyebrow")}</span>
        </p>
        <h1 className="max-w-2xl text-balance font-display text-[2.4rem] font-semibold leading-[1.02] tracking-[-0.03em] sm:text-5xl">
          {t("title")}
        </h1>
        <p className="max-w-2xl text-[15px] leading-relaxed text-fg-muted">
          {t("intro")}
        </p>
        <div className="flex flex-wrap items-center gap-4 pt-2">
          <LocaleLink href="/#sorteos" className={buttonVariants()}>
            {t("seeActiveRaffles")}
          </LocaleLink>
          <LocaleLink
            href="/planes"
            className="inline-flex items-center gap-1.5 text-[13px] font-medium text-fg-muted transition-colors hover:text-fg"
          >
            <BadgeCheck className="h-4 w-4" aria-hidden="true" />
            {t("wantToOrganize")}
          </LocaleLink>
        </div>
      </header>

      <section className="space-y-8" aria-labelledby="pasos">
        <div>
          <p className="eyebrow">{t("journeyEyebrow")}</p>
          <h2
            id="pasos"
            className="mt-2 font-display text-3xl font-semibold tracking-tight"
          >
            {t("journeyTitle")}
          </h2>
        </div>

        <ol className="divide-y divide-hairline border-y border-hairline">
          {STEPS.map((step) => (
            <li
              key={step.n}
              className="grid gap-4 py-8 sm:grid-cols-[4rem_1fr] sm:gap-8"
            >
              <div className="flex items-center gap-3 sm:block">
                <span className="font-mono text-[11px] tracking-[0.18em] text-brand-accent">
                  {step.n}
                </span>
                <step.icon
                  className="h-4 w-4 text-fg-subtle sm:mt-3 sm:block"
                  aria-hidden="true"
                />
              </div>
              <div className="space-y-2">
                <h3 className="font-display text-xl font-semibold tracking-tight">
                  {t(step.title)}
                </h3>
                <ul className="space-y-1.5 text-[13px] leading-relaxed text-fg-subtle">
                  {step.points.map((point) => (
                    <li key={point} className="flex gap-2">
                      <span
                        className="mt-[0.45rem] h-1 w-1 shrink-0 rounded-full bg-brand-500"
                        aria-hidden="true"
                      />
                      <span>
                        {t.rich(point, {
                          key: (chunks) => <Key>{chunks}</Key>,
                        })}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            </li>
          ))}
        </ol>
      </section>

      <section
        className="rounded-xl border border-hairline bg-panel-1 p-6 sm:p-8"
        aria-labelledby="verificacion"
      >
        <div className="flex flex-wrap items-center gap-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-md bg-panel-3 text-brand-accent ring-1 ring-hairline">
            <Hash className="h-4 w-4" aria-hidden="true" />
          </span>
          <h2
            id="verificacion"
            className="font-display text-xl font-semibold tracking-tight"
          >
            {t("verificationTitle")}
          </h2>
          <Badge variant="success" className="ml-auto">
            <ShieldCheck className="h-3 w-3" />
            SHA-256
          </Badge>
        </div>

        <p className="mt-4 text-[13px] leading-relaxed text-fg-subtle">
          {t.rich("verificationIntro", {
            key: (chunks) => <Key>{chunks}</Key>,
          })}
        </p>

        <ul className="mt-4 space-y-2 text-[13px] leading-relaxed text-fg-subtle">
          {[
            "verificationPoint1",
            "verificationPoint2",
            "verificationPoint3",
          ].map((item) => (
            <li key={item} className="flex gap-2">
              <span
                className="mt-[0.45rem] h-1 w-1 shrink-0 rounded-full bg-brand-500"
                aria-hidden="true"
              />
              <span>
                {t.rich(item, { key: (chunks) => <Key>{chunks}</Key> })}
              </span>
            </li>
          ))}
        </ul>

        <details className="group mt-5 rounded-xl border border-hairline bg-panel-2 p-4">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-sm font-semibold text-fg">
            {t("showTechnicalDetails")}
            <span
              className="text-fg-subtle transition-transform group-open:rotate-180"
              aria-hidden="true"
            >
              ▾
            </span>
          </summary>
          <div className="mt-4 space-y-4 text-[13px] leading-relaxed text-fg-subtle">
            <p>{t("technicalIntro")}</p>

            <div className="rounded-lg border border-hairline bg-panel-1 p-4">
              <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-fg-subtle">
                {t("formulaLabel")}
              </p>
              <code className="mt-2 block break-all font-mono text-[12px] leading-relaxed text-fg-muted">
                {FORMULA}
              </code>
              <p className="mt-2 font-mono text-[11px] uppercase tracking-[0.14em] text-fg-subtle">
                {t("formulaHint")}
              </p>
            </div>

            <p>{t("technicalOutro")}</p>
          </div>
        </details>
      </section>

      <section
        className="rounded-xl border border-hairline bg-panel-1/50 p-6 sm:p-8"
        aria-labelledby="no-hacemos"
      >
        <h2
          id="no-hacemos"
          className="font-display text-xl font-semibold tracking-tight"
        >
          {t("whatWeDoNotDo")}
        </h2>
        <ul className="mt-4 divide-y divide-hairline">
          {["notDo1", "notDo2", "notDo3", "notDo4"].map((line) => (
            <li
              key={line}
              className="flex items-start gap-3 py-3 text-[13px] text-fg-muted"
            >
              <span
                className="mt-1.5 h-px w-4 shrink-0 bg-brand-500"
                aria-hidden="true"
              />
              {t(line)}
            </li>
          ))}
        </ul>
      </section>

      <section
        id="demo"
        className="scroll-mt-24 rounded-xl border border-hairline bg-panel-1 p-6 sm:p-8"
        aria-labelledby="demo-title"
      >
        <div className="flex flex-wrap items-center gap-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-md bg-panel-3 text-brand-accent ring-1 ring-hairline">
            <Play className="h-4 w-4" aria-hidden="true" />
          </span>
          <h2
            id="demo-title"
            className="font-display text-xl font-semibold tracking-tight"
          >
            {t("demoTitle")}
          </h2>
        </div>

        <div
          role="note"
          className="mt-4 flex items-start gap-3 rounded-xl border-2 border-dashed border-violet-500/60 bg-violet-500/[0.09] p-3.5 dark:bg-violet-400/10"
        >
          <span aria-hidden="true" className="text-xl leading-none">
            🧪
          </span>
          <div className="min-w-0">
            <p className="font-mono text-[11px] font-bold uppercase tracking-[0.14em] text-violet-700 dark:text-violet-300">
              {t("demoBadge")}
            </p>
            <p className="mt-1 text-[12px] leading-relaxed text-violet-900/80 dark:text-violet-100/80">
              {t("demoNote")}
            </p>
          </div>
        </div>

        <ul className="mt-4 space-y-2 text-[13px] leading-relaxed text-fg-subtle">
          {CHECK_ITEMS.map((item) => (
            <li key={item} className="flex gap-2">
              <span
                className="mt-[0.45rem] h-1 w-1 shrink-0 rounded-full bg-brand-500"
                aria-hidden="true"
              />
              <span>{t(item)}</span>
            </li>
          ))}
        </ul>

        <ol className="mt-5 grid gap-3 sm:grid-cols-3">
          {DEMO_STEPS.map((step) => (
            <li
              key={step.n}
              className="rounded-lg border border-hairline bg-panel-2 p-3"
            >
              <p className="font-mono text-[11px] tracking-[0.18em] text-brand-accent">
                {step.n}
              </p>
              <p className="mt-1 text-[13px] font-semibold text-fg">
                {t(step.title)}
              </p>
              <p className="mt-1 text-[12px] leading-relaxed text-fg-subtle">
                {t(step.text)}
              </p>
            </li>
          ))}
        </ol>

        <div className="mt-6">
          <DemoExperience />
        </div>

        <details className="group mt-5 rounded-xl border border-hairline bg-panel-2 p-4">
          <summary className="cursor-pointer text-sm font-semibold text-fg">
            {t("demoHowTitle")}
          </summary>
          <div className="mt-3 space-y-2 text-[13px] leading-relaxed text-fg-subtle">
            <p>
              {t.rich("demoHow1", {
                strong: (chunks) => (
                  <strong className="text-fg">{chunks}</strong>
                ),
              })}
            </p>
            <p>{t("demoHow2")}</p>
            <p>{t("demoHow3")}</p>
            <LocaleLink
              href="/ganadores"
              className="inline-flex text-sm text-brand-800 underline-offset-4 hover:underline dark:text-brand-300"
            >
              {t("seeVerifiedRaffles")}
            </LocaleLink>
          </div>
        </details>

        <p className="mt-4 font-mono text-[10px] uppercase tracking-[0.08em] text-fg-subtle">
          {t("demoFootnote")}
        </p>
      </section>
    </div>
  );
}
