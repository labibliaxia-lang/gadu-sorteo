import { z } from "zod";

/** Versión vigente de los Términos y la Política de Privacidad. */
export const TERMS_VERSION = "1.0";

export const TERMS_PATH = "/terminos";
export const PRIVACY_PATH = "/privacidad";

/** Cookie de un solo uso: el usuario tildó el checkbox antes del OAuth. */
export const TERMS_COOKIE = "gadu_terms_accepted";

/**
 * Un año. El consentimiento se registra una vez en `profiles` con fecha y
 * versión; mientras la versión vigente no cambie, no se vuelve a pedir.
 */
export const TERMS_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 365;

/**
 * ¿La cookie de consentimiento cubre la versión vigente de los Términos?
 * Una versión vieja en la cookie hace que se vuelva a pedir la aceptación.
 */
export function termsCookieAccepted(value: string | null | undefined): boolean {
  return value === TERMS_VERSION;
}

export const termsVersionSchema = z.literal(TERMS_VERSION);
