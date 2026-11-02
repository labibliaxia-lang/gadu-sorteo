/**
 * Emails transaccionales (Resend por HTTP, sin SDK).
 *
 * Server-only: este módulo lee `RESEND_API_KEY` y `RESEND_FROM_EMAIL`, así que
 * solo debe importarse desde Server Actions o route handlers. Nunca desde un
 * componente de cliente.
 *
 * Regla de oro: `sendEmail` NUNCA lanza. Si falta configuración o Resend falla,
 * devuelve `false` y deja un log; la operación de negocio sigue igual.
 */

const RESEND_ENDPOINT = "https://api.resend.com/emails";
const TIMEOUT_MS = 5000;

function siteUrl(): string {
  return (process.env.NEXT_PUBLIC_URL ?? "").trim().replace(/\/+$/, "");
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function isEmailConfigured(): boolean {
  return Boolean(
    process.env.RESEND_API_KEY?.trim() &&
      process.env.RESEND_FROM_EMAIL?.trim(),
  );
}

/**
 * Envía un email HTML. Devuelve `true` solo si Resend lo aceptó.
 * No lanza y corta a los 5 segundos para no colgar la acción.
 */
export async function sendEmail(
  to: string | null | undefined,
  subject: string,
  html: string,
): Promise<boolean> {
  const recipient = (to ?? "").trim().toLowerCase();
  if (!recipient || !recipient.includes("@")) return false;

  const apiKey = process.env.RESEND_API_KEY?.trim();
  const from = process.env.RESEND_FROM_EMAIL?.trim();

  if (!apiKey || !from) {
    console.warn(
      "[email] Sin RESEND_API_KEY o RESEND_FROM_EMAIL: no se envía «" +
        subject +
        "» a " +
        recipient,
    );
    return false;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const response = await fetch(RESEND_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: [recipient],
        subject,
        html,
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      console.error(
        `[email] Resend respondió ${response.status} para «${subject}»: ${detail.slice(0, 300)}`,
      );
      return false;
    }

    return true;
  } catch (error) {
    console.error("[email] No se pudo enviar:", error);
    return false;
  } finally {
    clearTimeout(timeout);
  }
}

// ---------------------------------------------------------------------
// Plantillas
// ---------------------------------------------------------------------

function layout(options: {
  title: string;
  body: string;
  footer?: string;
}): string {
  const footer =
    options.footer ??
    "Recibís este correo porque tenés una cuenta en Gadu Sorteos.";

  return `<!doctype html>
<html lang="es">
  <body style="margin:0;padding:0;background:#f4f4f5;font-family:Arial,Helvetica,sans-serif;color:#18181b;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:24px 12px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid #e4e4e7;">
            <tr>
              <td style="background:linear-gradient(135deg,#f59e0b,#ea580c);padding:20px 24px;color:#ffffff;font-size:18px;font-weight:bold;">
                Gadu Sorteos
              </td>
            </tr>
            <tr>
              <td style="padding:24px;">
                <h1 style="margin:0 0 12px;font-size:20px;line-height:1.3;">${options.title}</h1>
                ${options.body}
              </td>
            </tr>
            <tr>
              <td style="padding:16px 24px;border-top:1px solid #e4e4e7;font-size:12px;color:#71717a;">
                ${footer}
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

function paragraph(text: string): string {
  return `<p style="margin:0 0 12px;font-size:14px;line-height:1.6;color:#3f3f46;">${text}</p>`;
}

function button(href: string, label: string): string {
  if (!href) return "";
  return `<p style="margin:20px 0 4px;"><a href="${href}" style="display:inline-block;background:#16a34a;color:#ffffff;text-decoration:none;font-weight:bold;padding:12px 18px;border-radius:10px;font-size:14px;">${label}</a></p>`;
}

function numbersList(numbers: number[]): string {
  const chips = numbers
    .map(
      (number) =>
        `<span style="display:inline-block;margin:2px 4px 2px 0;padding:4px 8px;border-radius:6px;background:#fef3c7;color:#92400e;font-family:monospace;font-size:13px;font-weight:bold;">${number}</span>`,
    )
    .join("");

  return `<p style="margin:0 0 12px;">${chips}</p>`;
}

function raffleUrl(raffleId: string): string {
  const base = siteUrl();
  return base ? `${base}/sorteos/${raffleId}` : "";
}

export async function sendReservationEmail(params: {
  to: string | null | undefined;
  raffleTitle: string;
  raffleId: string;
  numbers: number[];
}): Promise<boolean> {
  const title = escapeHtml(params.raffleTitle);
  const html = layout({
    title: "Tus números están reservados",
    body:
      paragraph(
        `Reservamos tus números para el sorteo <strong>${title}</strong>.`,
      ) +
      numbersList(params.numbers) +
      paragraph(
        "Envía el comprobante por WhatsApp al organizador para confirmar tu participación. Cuando lo valide, tus números van a quedar como pagados.",
      ) +
      button(raffleUrl(params.raffleId), "Ver el sorteo"),
  });

  return sendEmail(
    params.to,
    `Tus números están reservados · ${params.raffleTitle}`,
    html,
  );
}

export async function sendPaymentApprovedEmail(params: {
  to: string | null | undefined;
  raffleTitle: string;
  raffleId: string;
  numbers: number[];
}): Promise<boolean> {
  const title = escapeHtml(params.raffleTitle);
  const list = params.numbers.join(", ");

  const html = layout({
    title: "¡Pago confirmado!",
    body:
      paragraph(
        `Tus números <strong>${escapeHtml(list)}</strong> están listos para participar en <strong>${title}</strong>.`,
      ) +
      numbersList(params.numbers) +
      paragraph(
        "Ya estás participando. El resultado se publica en la página del sorteo cuando el organizador lo ejecute.",
      ) +
      button(raffleUrl(params.raffleId), "Ver el sorteo"),
  });

  return sendEmail(
    params.to,
    `¡Pago confirmado! · ${params.raffleTitle}`,
    html,
  );
}

export async function sendWinnerEmail(params: {
  to: string | null | undefined;
  raffleTitle: string;
  raffleId: string;
  winnerNumber: number;
}): Promise<boolean> {
  const title = escapeHtml(params.raffleTitle);

  const html = layout({
    title: "¡Felicidades, ganaste!",
    body:
      paragraph(
        `Has ganado el sorteo <strong>${title}</strong> con el número <strong>${params.winnerNumber}</strong>.`,
      ) +
      paragraph(
        "Contacta al organizador para coordinar la entrega del premio. Podés encontrar sus datos en la página del sorteo.",
      ) +
      button(raffleUrl(params.raffleId), "Ver el resultado"),
  });

  return sendEmail(
    params.to,
    `¡Felicidades! Ganaste el sorteo de ${params.raffleTitle}`,
    html,
  );
}
