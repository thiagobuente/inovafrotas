import { useEffect, useState } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

export const EMAIL_DOMAIN = "@inova.pr.gov.br";

export function isInstitutionalEmail(email: string) {
  return email.trim().toLowerCase().endsWith(EMAIL_DOMAIN);
}

export type SeiaAuth = {
  session: Session | null;
  user: User | null;
  isManager: boolean;
  isDriver: boolean;
  roleLoaded: boolean;
  loading: boolean;
};

export function useSeiaAuth(): SeiaAuth {
  const [session, setSession] = useState<Session | null>(null);
  const [isManager, setIsManager] = useState(false);
  const [isDriver, setIsDriver] = useState(false);
  const [roleLoaded, setRoleLoaded] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next);
      setLoading(false);
    });

    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });

    return () => sub.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    const userId = session?.user?.id;
    if (!userId) {
      setIsManager(false);
      setIsDriver(false);
      setRoleLoaded(false);
      return;
    }
    setRoleLoaded(false);
    let active = true;
    supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userId)
      .then(({ data }) => {
        if (active) {
          const roles = (data ?? []).map((r) => r.role as string);
          setIsManager(roles.includes("manager"));
          setIsDriver(!roles.includes("manager") && roles.includes("driver"));
          setRoleLoaded(true);
        }
      });
    return () => {
      active = false;
    };
  }, [session?.user?.id]);

  return { session, user: session?.user ?? null, isManager, isDriver, roleLoaded, loading };
}

export const STATUS_LABELS: Record<string, string> = {
  pending: "Aguardando autorização",
  approved: "Autorizada",
  rejected: "Recusada",
  cancelled: "Cancelada",
  completed: "Concluída",
};

export const STATUS_TONE: Record<string, string> = {
  pending: "bg-warning/15 text-warning-foreground border-warning/40",
  approved: "bg-success/15 text-success border-success/40",
  rejected: "bg-destructive/10 text-destructive border-destructive/40",
  cancelled: "bg-muted text-muted-foreground border-border",
  completed: "bg-primary/10 text-primary border-primary/30",
};

export function formatDateTime(value: string | null | undefined) {
  if (!value) return "—";
  return new Date(value).toLocaleString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * Converte um valor de <input type="datetime-local"> ("2026-08-26T10:00")
 * em ISO, interpretando-o SEMPRE como horário de Brasília (UTC-3),
 * independente do fuso do dispositivo/navegador.
 */
export function brasiliaInputToISO(value: string) {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(value.trim());
  if (!m) return new Date(value).toISOString();
  return new Date(`${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:00-03:00`).toISOString();
}
