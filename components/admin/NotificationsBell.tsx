"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Bell } from "lucide-react";

import { Link as LocaleLink } from "@/src/i18n/navigation";

import { buttonVariants } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";

/**
 * Campana del panel: cuenta las decisiones pendientes (pending o leídas sin
 * resolver) y se actualiza por Realtime. RLS ya limita la cuenta a las del
 * organizador logueado.
 */
export function NotificationsBell() {
  const t = useTranslations("AdminNotifications");
  const supabase = createClient();
  const [count, setCount] = useState(0);

  useEffect(() => {
    let vivo = true;

    async function contar() {
      const { count: total } = await supabase
        .from("notifications")
        .select("id", { count: "exact", head: true })
        .in("status", ["pending", "read"]);

      if (vivo) setCount(total ?? 0);
    }

    void contar();

    const canal = supabase
      .channel("notifications-bell")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "notifications" },
        () => void contar(),
      )
      .subscribe();

    return () => {
      vivo = false;
      void supabase.removeChannel(canal);
    };
  }, [supabase]);

  return (
    <LocaleLink
      href="/admin/notificaciones"
      className={buttonVariants({ variant: "outline", size: "sm" })}
      aria-label={count > 0 ? t("ariaCount", { count }) : t("label")}
    >
      <Bell className="mr-1.5 h-4 w-4" aria-hidden="true" />
      {t("label")}
      {count > 0 && (
        <span className="ml-1.5 rounded-full bg-destructive px-1.5 py-0.5 text-[10px] font-semibold text-destructive-foreground">
          {count}
        </span>
      )}
    </LocaleLink>
  );
}
