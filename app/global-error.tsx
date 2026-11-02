"use client";

import * as Sentry from "@sentry/nextjs";
import NextError from "next/error";
import { useEffect } from "react";

/**
 * Captura errores de renderizado de React (App Router).
 * Si Sentry no tiene DSN, `captureException` es un no-op.
 */
export default function GlobalError({
  error,
}: {
  error: Error & { digest?: string };
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html lang="es">
      <body>
        <NextError statusCode={0} />
      </body>
    </html>
  );
}
