import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Términos y Condiciones | Gadu Sorteos",
  description:
    "Términos y Condiciones de uso de Gadu Sorteos para organizadores y participantes.",
};

/**
 * Texto provisto por el titular (2 de noviembre de 2026), con una corrección de
 * exactitud en el punto 5: el motor actual no genera hash público, así que no
 * se puede afirmar que el resultado sea verificable por hash. El resto se
 * mantiene. Identificación del titular: jacinto.cards.
 */
export default function TerminosPage() {
  return (
    <article className="mx-auto max-w-3xl space-y-8 py-4">
      <header className="space-y-2">
        <h1 className="text-3xl font-bold tracking-tight">
          Términos y Condiciones de Uso
        </h1>
        <p className="text-sm text-muted-foreground">
          Última actualización: 2 de noviembre de 2026.
        </p>
        <p className="text-sm text-muted-foreground">
          Titular de la Plataforma: jacinto.cards.
        </p>
      </header>

      <p className="text-sm text-muted-foreground">
        Bienvenido a Gadu Sorteos (en adelante, «La Plataforma»). Al acceder,
        registrarte o utilizar nuestros servicios, aceptas cumplir con los
        siguientes Términos y Condiciones. Si no estás de acuerdo, por favor no
        utilices la Plataforma.
      </p>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold">1. Naturaleza del Servicio</h2>
        <p className="text-sm text-muted-foreground">
          Gadu Sorteos es una plataforma tecnológica (SaaS) que permite a
          organizadores («Organizadores») crear y gestionar sorteos de productos
          o servicios, y a los usuarios («Participantes») adquirir números para
          participar. Gadu Sorteos no es el vendedor del producto sorteado ni el
          organizador del sorteo, sino el proveedor de la herramienta
          tecnológica.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold">2. Requisitos de Participación</h2>
        <p className="text-sm text-muted-foreground">
          Para participar, el usuario debe ser mayor de 18 años y tener capacidad
          legal para contratar. Queda prohibida la participación a menores de
          edad. Al registrarte, garantizas que la información proporcionada es
          veraz y actualizada.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold">
          3. Mecánica de Pago y Validación
        </h2>
        <ul className="space-y-2 text-sm text-muted-foreground">
          <li>
            · <strong>Reserva:</strong> al seleccionar un número, este queda en
            estado «reservado» por un plazo máximo de 48 horas.
          </li>
          <li>
            · <strong>Pago:</strong> el Participante debe realizar la
            transferencia y enviar el comprobante al Organizador vía WhatsApp.
          </li>
          <li>
            · <strong>Confirmación:</strong> el número se considerará
            efectivamente «vendido» únicamente cuando el Organizador valide el
            comprobante y marque el número como pagado en el sistema. Gadu
            Sorteos no se responsabiliza por comprobantes falsificados.
          </li>
        </ul>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold">4. Política de Reembolsos</h2>
        <p className="text-sm text-muted-foreground">
          Dado que los números son bienes digitales intangibles, no se realizan
          reembolsos una vez que el pago ha sido validado y el número ha sido
          marcado como «vendido». En caso de que el sorteo sea cancelado por el
          Organizador, este deberá reembolsar el 100% del valor abonado a los
          Participantes.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold">
          5. Motor de Sorteo Transparente
        </h2>
        <p className="text-sm text-muted-foreground">
          La Plataforma utiliza un motor de sorteo que selecciona al azar un
          número entre los efectivamente vendidos. Al participar, el usuario
          acepta que el resultado del sorteo es definitivo, vinculante e
          inapelable. Una vez ejecutado el sorteo, el resultado queda registrado
          en la Plataforma y no puede alterarse: ni Gadu Sorteos ni el
          Organizador tienen la capacidad de modificarlo. La verificación
          pública del resultado mediante hash está en desarrollo y se informará
          en la Plataforma cuando esté disponible.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold">6. Entrega de Premios</h2>
        <p className="text-sm text-muted-foreground">
          La responsabilidad de la entrega del premio recae exclusivamente sobre
          el Organizador. Gadu Sorteos no interviene en la logística de envío ni
          en la calidad del producto sorteado.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold">7. Modificaciones</h2>
        <p className="text-sm text-muted-foreground">
          Gadu Sorteos se reserva el derecho de modificar estos términos en
          cualquier momento. Las modificaciones entrarán en vigor al ser
          publicadas en la Plataforma.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold">8. Contacto</h2>
        <p className="text-sm text-muted-foreground">
          Para consultas, reclamos o soporte, puedes contactarnos en:{" "}
          <a
            href="mailto:francofsm84@gmail.com"
            className="underline underline-offset-4"
          >
            francofsm84@gmail.com
          </a>
          .
        </p>
      </section>
    </article>
  );
}
