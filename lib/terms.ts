import { z } from "zod";

/** Versión vigente de los Términos y la Política de Privacidad. */
export const TERMS_VERSION = "1.0";

export const TERMS_PATH = "/terminos";
export const PRIVACY_PATH = "/privacidad";

/** Cookie de un solo uso: el usuario tildó el checkbox antes del OAuth. */
export const TERMS_COOKIE = "gadu_terms_accepted";

export const termsVersionSchema = z.literal(TERMS_VERSION);
