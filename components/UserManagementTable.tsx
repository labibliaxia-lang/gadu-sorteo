"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { setUserRole } from "@/app/admin/super/actions";

interface UserRow {
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

export function UserManagementTable({ users }: { users: UserRow[] }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const filtered = users.filter((u) =>
    `${u.full_name ?? ""} ${u.email ?? ""}`
      .toLowerCase()
      .includes(query.toLowerCase()),
  );

  async function toggleRole(u: UserRow) {
    if (u.role === "superadmin") return; // el superadmin no se gestiona desde aquí
    const next = u.role === "admin" ? "user" : "admin";
    const nextLabel = next === "admin" ? "organizador" : "usuario";
    if (!window.confirm(`¿Cambiar el rol de ${u.full_name ?? u.email} a "${nextLabel}"?`)) {
      return;
    }
    setBusy(u.id);
    setError(null);
    const res = await setUserRole(u.id, next);
    if (!res.ok) setError(res.error ?? "Error al cambiar el rol");
    setBusy(null);
    router.refresh();
  }

  return (
    <div className="space-y-3">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          className="pl-9"
          placeholder="Buscar por nombre o email…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
            <tr>
              <th className="p-3">Usuario</th>
              <th className="p-3">Email</th>
              <th className="p-3">Rol</th>
              <th className="p-3 text-right">Acción</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((u) => (
              <tr key={u.id} className="border-t">
                <td className="p-3 font-medium">{u.full_name || "—"}</td>
                <td className="p-3 text-muted-foreground">{u.email || "—"}</td>
                <td className="p-3">
                  <Badge
                    variant={
                      u.role === "admin" || u.role === "superadmin"
                        ? "success"
                        : "secondary"
                    }
                  >
                    {roleLabel(u.role)}
                  </Badge>
                </td>
                <td className="p-3 text-right">
                  {u.role === "superadmin" ? (
                    <span className="text-xs text-muted-foreground">
                      Superadmin
                    </span>
                  ) : (
                    <Button
                      size="sm"
                      variant={u.role === "admin" ? "outline" : "default"}
                      onClick={() => toggleRole(u)}
                      disabled={busy === u.id}
                    >
                      {u.role === "admin"
                        ? "Quitar organizador"
                        : "Hacer organizador"}
                    </Button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
