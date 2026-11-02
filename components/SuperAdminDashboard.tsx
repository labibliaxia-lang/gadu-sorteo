"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Ban,
  ChevronLeft,
  ChevronRight,
  Loader2,
  Plus,
  Search,
  Trash2,
  UserMinus,
  X,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  ASSIGNABLE_ROLES,
  ROLE_OPTIONS,
  roleLabel,
  type AssignableRole,
} from "@/lib/superadmin";
import {
  blockUsers,
  checkEmailRegistered,
  createOrganizer,
  deleteUsers,
  demoteOrganizers,
  listUsers,
  setUserRole,
  type SuperAdminUserRow,
} from "@/app/admin/super/actions";

type RoleFilter = AssignableRole | "all";

interface Props {
  initialUsers: SuperAdminUserRow[];
  initialTotal: number;
  initialPage: number;
  pageSize: number;
  initialQuery: string;
  initialRole: RoleFilter;
  counts: { user: number; admin: number; superadmin: number };
}

const ROLE_FILTERS: { value: RoleFilter; label: string; countKey?: keyof Props["counts"] }[] = [
  { value: "all", label: "Todos" },
  { value: "user", label: "Usuarios", countKey: "user" },
  { value: "admin", label: "Organizadores", countKey: "admin" },
  { value: "superadmin", label: "Superadmins", countKey: "superadmin" },
];

export function SuperAdminDashboard({
  initialUsers,
  initialTotal,
  initialPage,
  pageSize,
  initialQuery,
  initialRole,
  counts,
}: Props) {
  const router = useRouter();

  const [users, setUsers] = useState<SuperAdminUserRow[]>(initialUsers);
  const [total, setTotal] = useState(initialTotal);
  const [page, setPage] = useState(initialPage);
  const [query, setQuery] = useState(initialQuery);
  const [role, setRole] = useState<RoleFilter>(initialRole);

  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [rowBusy, setRowBusy] = useState<string | null>(null);

  const [modalOpen, setModalOpen] = useState(false);
  const [newOrgInput, setNewOrgInput] = useState("");
  const [emailRegistered, setEmailRegistered] = useState<boolean | null>(null);

  const isFirstRender = useRef(true);

  const load = useCallback(
    async (opts: { q: string; nextPage: number; nextRole: RoleFilter }) => {
      setLoading(true);
      setError(null);
      const res = await listUsers({
        q: opts.q,
        page: opts.nextPage,
        role: opts.nextRole === "all" ? undefined : opts.nextRole,
      });
      if (!res.ok) {
        setError(res.error ?? "No se pudo cargar la lista de usuarios");
      } else {
        setUsers(res.users);
        setTotal(res.total);
        setPage(res.page);
        setSelected(new Set());
      }
      setLoading(false);
    },
    [],
  );

  // Búsqueda con retardo; la primera carga ya vino del servidor.
  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    const timer = setTimeout(() => {
      void load({ q: query, nextPage: 1, nextRole: role });
    }, 350);
    return () => clearTimeout(timer);
  }, [query, load]); // eslint-disable-line react-hooks/exhaustive-deps

  // Chequeo en vivo: ¿el email ingresado ya está registrado?
  useEffect(() => {
    if (!modalOpen) return;
    const email = newOrgInput.trim();
    if (!email.includes("@")) {
      setEmailRegistered(null);
      return;
    }
    let cancelled = false;
    const timer = setTimeout(async () => {
      const res = await checkEmailRegistered(email);
      if (!cancelled) setEmailRegistered(res.registered);
    }, 400);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [newOrgInput, modalOpen]);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const selectableIds = users
    .filter((u) => u.role !== "superadmin")
    .map((u) => u.id);

  const allSelected =
    selectableIds.length > 0 && selectableIds.every((id) => selected.has(id));

  function toggleAll() {
    setSelected((prev) => {
      if (allSelected) return new Set();
      const next = new Set(prev);
      selectableIds.forEach((id) => next.add(id));
      return next;
    });
  }

  function closeModal() {
    setModalOpen(false);
    setNewOrgInput("");
    setEmailRegistered(null);
    setError(null);
  }

  async function refreshAll() {
    await load({ q: query, nextPage: page, nextRole: role });
    router.refresh();
  }

  async function changeRole(user: SuperAdminUserRow, next: AssignableRole) {
    if (next === user.role) return;
    const label = roleLabel(next);
    if (
      !window.confirm(
        `¿Cambiar el rol de ${user.full_name || user.email || "este usuario"} a "${label}"?`,
      )
    ) {
      return;
    }
    setRowBusy(user.id);
    setError(null);
    setNotice(null);
    const res = await setUserRole(user.id, next);
    if (!res.ok) setError(res.error);
    else setNotice(res.message ?? `Rol actualizado a ${label}.`);
    setRowBusy(null);
    await refreshAll();
  }

  async function runBatch(
    action: (ids: string[]) => Promise<{ ok: boolean; error?: string; count?: number }>,
    confirmText: string,
    okText: (count: number) => string,
  ) {
    if (selected.size === 0) return;
    if (!window.confirm(confirmText)) return;

    setBusy(true);
    setError(null);
    setNotice(null);
    const res = await action(Array.from(selected));
    if (!res.ok) setError(res.error ?? "La operación falló");
    else {
      setNotice(okText(res.count ?? 0));
      setSelected(new Set());
    }
    setBusy(false);
    await refreshAll();
  }

  async function handleCreate() {
    if (!newOrgInput.trim()) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    const res = await createOrganizer(newOrgInput);
    if (!res.ok) {
      setError(res.error ?? "Error al asignar organizador");
      setBusy(false);
      return;
    }

    setNotice(
      res.mode === "assigned"
        ? "Organizador asignado correctamente."
        : res.message ??
            "Invitación creada. Se asignará el rol al primer inicio de sesión.",
    );
    closeModal();
    setBusy(false);
    await refreshAll();
  }

  const trimmed = newOrgInput.trim();
  const inviteMode = trimmed.includes("@") && emailRegistered === false;
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);

  return (
    <div className="space-y-3">
      {/* Mensajes: un solo punto, fuera del modal y de la tabla */}
      {error && (
        <p className="rounded-md bg-destructive/10 p-2 text-sm text-destructive">
          {error}
        </p>
      )}
      {notice && (
        <p className="rounded-md bg-emerald-500/10 p-2 text-sm text-emerald-700 dark:text-emerald-300">
          {notice}
        </p>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="relative w-full sm:w-72">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder="Buscar en todos los usuarios…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          {loading && (
            <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground" />
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex rounded-lg border p-0.5">
            {ROLE_FILTERS.map((f) => (
              <button
                key={f.value}
                type="button"
                onClick={() => {
                  setRole(f.value);
                  void load({ q: query, nextPage: 1, nextRole: f.value });
                }}
                className={
                  role === f.value
                    ? "rounded-md bg-amber-500 px-2.5 py-1 text-xs font-medium text-white"
                    : "rounded-md px-2.5 py-1 text-xs font-medium text-muted-foreground transition hover:bg-accent hover:text-foreground"
                }
              >
                {f.label}
                {f.countKey ? ` (${counts[f.countKey]})` : ""}
              </button>
            ))}
          </div>

          <Button onClick={() => setModalOpen(true)} disabled={busy}>
            <Plus className="mr-1.5 h-4 w-4" />
            Nuevo Organizador
          </Button>
        </div>
      </div>

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
              <th className="p-3">Rol actual</th>
              <th className="p-3">Cambiar rol</th>
            </tr>
          </thead>
          <tbody>
            {users.length === 0 ? (
              <tr>
                <td
                  colSpan={5}
                  className="p-6 text-center text-muted-foreground"
                >
                  {loading ? "Buscando…" : "Sin resultados."}
                </td>
              </tr>
            ) : (
              users.map((u) => {
                const isSuper = u.role === "superadmin";
                return (
                  <tr key={u.id} className="border-t align-top">
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
                    <td className="p-3">
                      <p className="font-medium">{u.full_name || "—"}</p>
                      {u.admin_request_status === "pending" && (
                        <Badge variant="warning" className="mt-1">
                          Solicitud pendiente
                        </Badge>
                      )}
                    </td>
                    <td className="break-all p-3 text-muted-foreground">
                      {u.email || "—"}
                    </td>
                    <td className="p-3">
                      <Badge
                        variant={
                          u.role === "superadmin"
                            ? "default"
                            : u.role === "admin"
                              ? "success"
                              : "secondary"
                        }
                      >
                        {roleLabel(u.role)}
                      </Badge>
                    </td>
                    <td className="p-3">
                      {isSuper ? (
                        // Antes decía "Protegido" y no había salida: un
                        // superadmin sólo se podía degradar por SQL. Ahora se
                        // puede degradar, nunca ascender desde aquí, y el
                        // servidor rechaza degradar al último.
                        <select
                          aria-label={`Degradar el rol de ${u.email ?? u.id}`}
                          title="Un superadmin sólo se puede degradar; el último no se puede tocar"
                          className="rounded-md border bg-background px-2 py-1 text-xs disabled:opacity-60"
                          value="superadmin"
                          disabled={rowBusy === u.id || busy}
                          onChange={(e) => {
                            const next = e.target.value as AssignableRole;
                            if (next !== "superadmin") void changeRole(u, next);
                          }}
                        >
                          <option value="superadmin">Superadmin (actual)</option>
                          {ROLE_OPTIONS.filter(
                            (option) => option.value !== "superadmin",
                          ).map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <select
                          aria-label={`Rol de ${u.email ?? u.id}`}
                          className="rounded-md border bg-background px-2 py-1 text-xs disabled:opacity-60"
                          value={
                            ASSIGNABLE_ROLES.includes(u.role as AssignableRole)
                              ? u.role
                              : "user"
                          }
                          disabled={rowBusy === u.id || busy}
                          onChange={(e) =>
                            void changeRole(u, e.target.value as AssignableRole)
                          }
                        >
                          {ROLE_OPTIONS.map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Paginación */}
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-muted-foreground">
        <span>
          Mostrando {from}–{to} de {total} usuarios
        </span>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            disabled={loading || page <= 1}
            onClick={() => void load({ q: query, nextPage: page - 1, nextRole: role })}
          >
            <ChevronLeft className="mr-1 h-4 w-4" />
            Anterior
          </Button>
          <span className="text-xs">
            Página {page} / {totalPages}
          </span>
          <Button
            size="sm"
            variant="outline"
            disabled={loading || page >= totalPages}
            onClick={() => void load({ q: query, nextPage: page + 1, nextRole: role })}
          >
            Siguiente
            <ChevronRight className="ml-1 h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Barra flotante de acciones múltiples */}
      {selected.size > 0 && (
        <div className="fixed bottom-6 left-1/2 z-50 flex max-w-[95vw] -translate-x-1/2 flex-wrap items-center justify-center gap-2 rounded-2xl border bg-background px-4 py-2 shadow-2xl">
          <span className="text-sm font-medium">
            {selected.size} seleccionado{selected.size === 1 ? "" : "s"}
          </span>
          <Button
            size="sm"
            variant="outline"
            onClick={() =>
              void runBatch(
                demoteOrganizers,
                `¿Quitar el rol de organizador a ${selected.size} usuario(s)? Pasarán a ser usuarios comunes.`,
                (count) => `Rol de organizador revocado a ${count}.`,
              )
            }
            disabled={busy}
          >
            <UserMinus className="mr-1.5 h-4 w-4" />
            Quitar rol
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() =>
              void runBatch(
                blockUsers,
                `¿Bloquear permanentemente a ${selected.size} usuario(s)? No podrán volver a iniciar sesión.`,
                (count) => `Bloqueados: ${count}.`,
              )
            }
            disabled={busy}
          >
            <Ban className="mr-1.5 h-4 w-4" />
            Bloquear
          </Button>
          <Button
            size="sm"
            variant="destructive"
            onClick={() =>
              void runBatch(
                deleteUsers,
                `¿Eliminar ${selected.size} usuario(s)? Esta acción es irreversible.`,
                (count) => `Eliminados: ${count}.`,
              )
            }
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
          onClick={closeModal}
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
                  enviará una invitación que se activa en su primer inicio de
                  sesión.
                </p>
              </div>
              <button
                type="button"
                onClick={closeModal}
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
                  if (e.key === "Enter") void handleCreate();
                }}
              />

              {inviteMode && (
                <p className="rounded-lg bg-amber-500/10 p-2 text-xs text-amber-700 dark:text-amber-300">
                  Ese email no tiene cuenta: se enviará una invitación para ser
                  organizador.
                </p>
              )}

              <Button
                className="w-full"
                onClick={() => void handleCreate()}
                disabled={busy || !trimmed}
              >
                {busy
                  ? "Procesando…"
                  : inviteMode
                    ? "Enviar invitación por email"
                    : "Asignar rol de organizador"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
