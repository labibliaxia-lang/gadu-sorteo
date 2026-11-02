import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Política de Privacidad | Gadu Sorteos",
  description:
    "Qué datos recolecta Gadu Sorteos, para qué los usa y cómo ejercer tus derechos (Ley 25.326).",
};

/**
 * Texto provisto por el titular (2 de noviembre de 2026), ajustado a lo que el
 * sistema realmente hace: el acceso es con Google (no hay contraseña propia),
 * los comprobantes viajan por WhatsApp y no se almacenan, y los registros
 * técnicos quedan en el proveedor de alojamiento. Identificación del
 * responsable: jacinto.cards.
 */
export default function PrivacidadPage() {
  return (
    <article className="mx-auto max-w-3xl space-y-8 py-4">
      <header className="space-y-2">
        <h1 className="text-3xl font-bold tracking-tight">
          Política de Privacidad
        </h1>
        <p className="text-sm text-muted-foreground">
          Última actualización: 2 de noviembre de 2026.
        </p>
        <p className="text-sm text-muted-foreground">
          Responsable del tratamiento: jacinto.cards.
        </p>
      </header>

      <p className="text-sm text-muted-foreground">
        En Gadu Sorteos, respetamos tu privacidad y protegemos tus datos
        personales de acuerdo con la Ley 25.326 de Protección de Datos
        Personales de la República Argentina.
      </p>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold">1. Datos que Recopilamos</h2>
        <ul className="space-y-2 text-sm text-muted-foreground">
          <li>
            · <strong>Datos de Registro:</strong> nombre completo y correo
            electrónico. El acceso es con tu cuenta de Google; la Plataforma no
            almacena ni gestiona contraseñas propias.
          </li>
          <li>
            · <strong>Datos de Contacto:</strong> número de teléfono, utilizado
            exclusivamente para el flujo de validación de pagos por WhatsApp.
          </li>
          <li>
            · <strong>Datos de Transacción:</strong> historial de números
            reservados o comprados, montos y estado de pago. Los comprobantes se
            intercambian por WhatsApp y no se almacenan en la Plataforma.
          </li>
          <li>
            · <strong>Datos Técnicos:</strong> registros del servidor y del
            proveedor de alojamiento (por ejemplo, dirección IP) para seguridad y
            diagnóstico, y cookies para mantener tu sesión y recordar tus
            preferencias.
          </li>
          <li>
            · <strong>Verificación de identidad:</strong> si la verificación está
            habilitada y la realizás, se guardan tu DNI y una selfie en un
            espacio privado, accesible solo para la administración.
          </li>
        </ul>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold">2. Uso de la Información</h2>
        <p className="text-sm text-muted-foreground">
          Utilizamos tus datos para:
        </p>
        <ul className="space-y-2 text-sm text-muted-foreground">
          <li>· Gestionar tu cuenta y permitir tu participación en los sorteos.</li>
          <li>
            · Facilitar la comunicación entre el Participante y el Organizador
            para la validación de pagos.
          </li>
          <li>
            · Enviar notificaciones relacionadas con el sorteo (por ejemplo, si
            ganaste un premio).
          </li>
          <li>· Cumplir con obligaciones legales y prevenir fraudes.</li>
        </ul>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold">3. Almacenamiento y Seguridad</h2>
        <p className="text-sm text-muted-foreground">
          Tus datos son almacenados en servidores seguros (utilizando tecnología
          Supabase/PostgreSQL y alojamiento en Vercel) con cifrado en tránsito y
          cifrado en reposo provisto por la infraestructura. No vendemos,
          alquilamos ni compartimos tus datos personales con terceros no
          relacionados con la operación del sorteo.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold">
          4. Derechos del Usuario (Derechos ARCO)
        </h2>
        <p className="text-sm text-muted-foreground">
          Como titular de los datos, tienes derecho a:
        </p>
        <ul className="space-y-2 text-sm text-muted-foreground">
          <li>· Acceder a los datos que tenemos sobre ti.</li>
          <li>
            · Rectificar tus datos si están desactualizados o son incorrectos.
          </li>
          <li>
            · Cancelar (eliminar) tu cuenta y tus datos personales, siempre que no
            haya transacciones pendientes.
          </li>
          <li>
            · Oponerse al tratamiento de tus datos para fines de marketing.
          </li>
        </ul>
        <p className="text-sm text-muted-foreground">
          Para ejercer estos derechos, envía un correo a:{" "}
          <a
            href="mailto:francofsm84@gmail.com"
            className="underline underline-offset-4"
          >
            francofsm84@gmail.com
          </a>
          .
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold">5. Cookies</h2>
        <p className="text-sm text-muted-foreground">
          Utilizamos cookies para mantener tu sesión activa y recordar tus
          preferencias. Puedes desactivar las cookies desde la configuración de
          tu navegador, aunque esto podría afectar el funcionamiento de la
          Plataforma.
        </p>
      </section>
    </article>
  );
}
