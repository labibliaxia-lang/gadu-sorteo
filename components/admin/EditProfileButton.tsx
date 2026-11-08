"use client";

import { useEffect, useId, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Pencil, X } from "lucide-react";

import { updateUserProfile } from "@/app/[locale]/admin/super/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useFocusTrap } from "@/lib/use-focus-trap";

interface Props {
  userId: string;
  initialFullName?: string | null;
  initialPhone?: string | null;
  /** Mismo texto que el email o el id, para el aria-label del botón. */
  label?: string | null;
  /** Avisa a la lista para que refleje el cambio sin recargar la página. */
  onSaved?: (values: { fullName: string; phone: string }) => void;
}

/**
 * Edición manual de perfil (nombre y teléfono) desde el listado de usuarios.
 *
 * Es la vía de soporte para corregir datos que el usuario no puede editar
 * solo. El servidor valida longitudes, no toca email/rol/plan y audita cada
 * edición con el estado anterior y el nuevo.
 */
export function EditProfileButton({
  userId,
  initialFullName,
  initialPhone,
  label,
  onSaved,
}: Props) {
  const router = useRouter();
  const dialogId = useId();
  const titleId = `${dialogId}-title`;
  const descriptionId = `${dialogId}-description`;

  const [open, setOpen] = useState(false);
  const [fullName, setFullName] = useState(initialFullName ?? "");
  const [phone, setPhone] = useState(initialPhone ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const panelRef = useFocusTrap<HTMLDivElement>(open, () => {
    if (!saving) close();
  });

  // Cada apertura arranca con los datos que hoy tiene la fila.
  useEffect(() => {
    if (!open) return;
    setFullName(initialFullName ?? "");
    setPhone(initialPhone ?? "");
    setError(null);
  }, [open, initialFullName, initialPhone]);

  function close() {
    if (saving) return;
    setOpen(false);
    setError(null);
  }

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;

    const trimmedName = fullName.trim();
    if (trimmedName.length < 2) {
      setError("El nombre tiene que tener al menos 2 caracteres.");
      return;
    }

    setSaving(true);
    setError(null);

    const result = await updateUserProfile({
      userId,
      fullName: trimmedName,
      phone: phone.trim(),
    });

    if (!result.ok) {
      setError(result.error);
      setSaving(false);
      return;
    }

    setSaving(false);
    setOpen(false);
    onSaved?.({ fullName: trimmedName, phone: phone.trim() });
    router.refresh();
  }

  return (
    <>
      <Button
        type="button"
        size="sm"
        variant="ghost"
        onClick={() => setOpen(true)}
        aria-label={`Editar perfil de ${label || "este usuario"}`}
      >
        <Pencil className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
        Editar
      </Button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
          onClick={close}
        >
          <div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            aria-describedby={descriptionId}
            tabIndex={-1}
            className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-2xl border border-hairline bg-panel-1 p-5 shadow-card"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h2
                  id={titleId}
                  className="font-display text-lg font-semibold leading-tight"
                >
                  Editar perfil
                </h2>
                <p
                  id={descriptionId}
                  className="mt-1 text-sm text-fg-subtle"
                >
                  Se actualizan el nombre y el teléfono. La edición queda
                  registrada en la auditoría.
                </p>
              </div>
              <button
                type="button"
                onClick={close}
                aria-label="Cerrar"
                className="rounded-md p-1 text-fg-subtle transition-colors hover:bg-panel-2 hover:text-fg"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>

            <form onSubmit={(event) => void save(event)} className="mt-4 space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor={`${dialogId}-name`}>Nombre completo</Label>
                <Input
                  id={`${dialogId}-name`}
                  name="fullName"
                  value={fullName}
                  onChange={(event) => setFullName(event.target.value)}
                  placeholder="Nombre y apellido"
                  autoComplete="off"
                  maxLength={120}
                  required
                  disabled={saving}
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor={`${dialogId}-phone`}>Teléfono</Label>
                <Input
                  id={`${dialogId}-phone`}
                  name="phone"
                  type="tel"
                  inputMode="tel"
                  value={phone}
                  onChange={(event) => setPhone(event.target.value)}
                  placeholder="+54 9 11 2345-6789"
                  autoComplete="off"
                  maxLength={30}
                  disabled={saving}
                />
                <p className="text-xs text-fg-subtle">
                  Podés dejarlo vacío para quitarlo del perfil.
                </p>
              </div>

              {error && (
                <p
                  role="alert"
                  className="rounded-md border border-destructive/30 bg-destructive/10 p-2.5 text-sm text-destructive"
                >
                  {error}
                </p>
              )}

              <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                <Button
                  type="button"
                  variant="outline"
                  onClick={close}
                  disabled={saving}
                >
                  Cancelar
                </Button>
                <Button type="submit" disabled={saving}>
                  {saving && (
                    <Loader2
                      className="mr-1.5 h-4 w-4 animate-spin"
                      aria-hidden="true"
                    />
                  )}
                  {saving ? "Guardando…" : "Guardar cambios"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
