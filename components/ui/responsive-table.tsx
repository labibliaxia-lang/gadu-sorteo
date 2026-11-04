import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

export interface ResponsiveColumn<T> {
  key: string;
  header: string;
  render: (row: T) => ReactNode;
  align?: "left" | "right";
}

/**
 * Patrón de datos: tabla en desktop, tarjetas legibles en móvil.
 * Evita el scroll horizontal en pantallas chicas y mantiene las mismas columnas.
 */
export function ResponsiveTable<T>({
  rows,
  columns,
  getRowKey,
  empty,
  className,
}: {
  rows: T[];
  columns: ResponsiveColumn<T>[];
  getRowKey: (row: T) => string;
  empty?: ReactNode;
  className?: string;
}) {
  if (rows.length === 0) {
    return <>{empty ?? null}</>;
  }

  return (
    <div className={className}>
      {/* Desktop */}
      <div className="hidden overflow-x-auto rounded-lg border border-hairline md:block">
        <table className="w-full text-[13px]">
          <thead className="border-b border-hairline bg-panel-2/60 text-left">
            <tr>
              {columns.map((column) => (
                <th
                  key={column.key}
                  scope="col"
                  className={cn(
                    "p-3 font-mono text-[11px] font-medium uppercase tracking-[0.08em] text-fg-subtle",
                    column.align === "right" && "text-right",
                  )}
                >
                  {column.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={getRowKey(row)}
                className="border-t border-hairline transition-colors hover:bg-panel-2/50"
              >
                {columns.map((column) => (
                  <td
                    key={column.key}
                    className={cn(
                      "p-3",
                      column.align === "right" && "text-right",
                    )}
                  >
                    {column.render(row)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Móvil: una tarjeta por fila */}
      <ul className="space-y-2 md:hidden">
        {rows.map((row) => (
          <li
            key={getRowKey(row)}
            className="rounded-lg border border-hairline bg-panel-1 p-4"
          >
            <dl className="space-y-1.5">
              {columns.map((column) => (
                <div
                  key={column.key}
                  className="flex items-start justify-between gap-3"
                >
                  <dt className="font-mono text-[11px] uppercase tracking-[0.06em] text-fg-subtle">
                    {column.header}
                  </dt>
                  <dd
                    className={cn(
                      "min-w-0 text-right text-[13px]",
                      column.align !== "right" && "text-left",
                    )}
                  >
                    {column.render(row)}
                  </dd>
                </div>
              ))}
            </dl>
          </li>
        ))}
      </ul>
    </div>
  );
}
