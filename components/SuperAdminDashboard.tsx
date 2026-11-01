"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Search, Trash2, UserX, X } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  createOrganizer,
  deleteUsers,
  suspendUsers,
} from "@/app/admin/super/actions";

export interface SuperAdminUser {
  id: string;
  full_name: string | null;
  email: string | null;
  role: string;
  created_at: string;
}

function roleLabel(role: string): string {
  if (role === "admin") return "Organizador";
  if (role === "superadmin") return "Superadmin";
  return "Usuario";
}

export function SuperAdminDashboard({
  users,
}: {
  users: SuperAdminUser[];
}) {
  const router = useRouter();

  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [modalOpen, setModalOpen] = useState(false);
  const [newOrgInput, setNewOrgInput] = useState("");

  const filtered = useMemo(
    () =>
      users.filter((u) =>
        `${u.full_name ?? ""} ${u.email ?? ""}`
          .toLowerCase()
          .includes(query.toLowerCase()),
      ),
    [users, query],
  );

  const selectableIds = filtered
    .filter((u) => u.role !== "superadmin")
    .map((u) => u.id);

  const allSelected =
    selectableIds.length > 0 && selectableIds.every((id) => selected.has(id));

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    setSelected((prev) => {
      if (allSelected) return new Set();
      // Conserva las selecciones que ya estaban si no eran "todas".
      const next = new Set(prev);
      selectableIds.forEach((id) => next.add(id));
      return next;
    });
  }

  async function handleCreate() {
    if (!newOrgInput.trim()) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    const res = await createOrganizer(newOrgInput);
    if (!res.ok) {
      setError(res.error ?? "Error al asignar organizador");
    } else {
      const msg =
        res.mode === "assigned"
          ? "Organizador asignado correctamente."
          : res.message ??
            "Invitación creada. Se asignará el rol al primer inicio de sesión.";
      setNotice(msg);
      setModalOpen(false);
      setNewOrgInput("");
      router.refresh();
    }
    setBusy(false);
  }

  async function handleSuspend() {
    if (selected.size === 0) return;
    if (
      !window.confirm(
        `¿Suspender ${selected.size} usuario(s)? Perderán el rol de organizador.`,
      )
    )
      return;
    setBusy(true);
    setError(null);
    setNotice(null);
    const res = await suspendUsers(Array.from(selected));
    if (!res.ok) setError(res.error ?? "Error al suspender");
    else {
      setNotice(`Suspendidos: ${res.count ?? 0}`);
      setSelected(new Set());
      router.refresh();
    }
    setBusy(false);
  }

  async function handleDelete() {
    if (selected.size === 0) return;
    if (
      !window.confirm(
        `¿Eliminar ${selected.size} usuario(s)? Esta acción es irreversible.`,
      )
    )
      return;
    setBusy(true);
    setError(null);
    setNotice(null);
    const res = await deleteUsers(Array.from(selected));
    if (!res.ok) setError(res.error ?? "Error al eliminar");
    else {
      setNotice(`Eliminados: ${res.count ?? 0}`);
      setSelected(new Set());
      router.refresh();
    }
    setBusy(false);
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="relative w-full sm:w-72">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder="Buscar por nombre o email…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <Button onClick={() => setModalOpen(true)} disabled={busy}>
          <Plus className="mr-1.5 h-4 w-4" />
          Nuevo Organizador
        </Button>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}
      {notice && (
        <p className="text-sm text-emerald-600 dark:text-emerald-400">
          {notice}
        </p>
      )}

      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
            <tr>
              <th className="w-10 p-3">
                <input
                  type="checkbox"
                  aria-label="Seleccionar todos"
                  className="h-4 w-4 cursor-pointer accent-amber-500"
                  checked={allSelected}
                  onChange={toggleAll}
                  disabled={selectableIds.length === 0}
                />
              </th>
              <th className="p-3">Usuario</th>
              <th className="p-3">Email</th>
              <th className="p-3">Rol</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td
                  colSpan={4}
                  className="p-6 text-center text-muted-foreground"
                >
                  Sin resultados.
                </td>
              </tr>
            ) : (
              filtered.map((u) => {
                const isSuper = u.role === "superadmin";
                return (
                  <tr key={u.id} className="border-t">
                    <td className="p-3">
                      <input
                        type="checkbox"
                        aria-label={`Seleccionar ${u.email ?? u.id}`}
                        className="h-4 w-4 cursor-pointer accent-amber-500 disabled:cursor-not-allowed"
                        checked={selected.has(u.id)}
                        onChange={() => toggle(u.id)}
                        disabled={isSuper}
                      />
                    </td>
                    <td className="p-3 font-medium">{u.full_name || "—"}</td>
                    <td className="p-3 text-muted-foreground">
                      {u.email || "—"}
                    </td>
                    <td className="p-3">
                      <Badge
                        variant={
                          u.role === "admin" || isSuper ? "success" : "secondary"
                        }
                      >
                        {roleLabel(u.role)}
                      </Badge>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Barra flotante de acciones múltiples */}
      {selected.size > 0 && (
        <div className="fixed bottom-6 left-1/2 z-50 flex -translate-x-1/2 items-center gap-2 rounded-full border bg-background px-4 py-2 shadow-2xl">
          <span className="text-sm font-medium">
            {selected.size} seleccionado{selected.size === 1 ? "" : "s"}
          </span>
          <Button
            size="sm"
            variant="outline"
            onClick={handleSuspend}
            disabled={busy}
          >
            <UserX className="mr-1.5 h-4 w-4" />
            Suspender
          </Button>
          <Button
            size="sm"
            variant="destructive"
            onClick={handleDelete}
            disabled={busy}
          >
            <Trash2 className="mr-1.5 h-4 w-4" />
            Eliminar
          </Button>
          <button
            type="button"
            aria-label="Limpiar selección"
            className="rounded-md p-1 text-muted-foreground transition hover:bg-accent hover:text-foreground"
            onClick={() => setSelected(new Set())}
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Modal: Nuevo Organizador */}
      {modalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
          onClick={() => setModalOpen(false)}
        >
          <div
            className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-2xl border bg-background p-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-2">
              <div>
                <h3 className="text-lg font-semibold">Nuevo Organizador</h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  Asigná el rol por email o ID. Si el email no tiene cuenta, se
                  crea una invitación que se activa en su primer inicio de
                  sesión.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                aria-label="Cerrar"
                className="rounded-md p-1 text-muted-foreground transition hover:bg-accent hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-4 space-y-3">
              <Input
                value={newOrgInput}
                onChange={(e) => setNewOrgInput(e.target.value)}
                placeholder="email@ejemplo.com o UUID"
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleCreate();
                }}
              />
              {error && <p className="text-xs text-destructive">{error}</p>}
              <Button
                className="w-full"
                onClick={handleCreate}
                disabled={busy || !newOrgInput.trim()}
              >
                {busy ? "Asignando…" : "Asignar rol de organizador"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
