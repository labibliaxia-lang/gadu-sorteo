import { redirect } from "next/navigation";

/**
 * El registro ahora es solo con Google: redirigimos a /login,
 * donde GoogleAuthButton crea la cuenta automáticamente si no existe.
 */
export default function RegisterPage() {
  redirect("/login");
}
