import { useEffect } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { AppHeader } from "@/components/AppHeader";
import { useSeiaAuth, formatDateTime } from "@/lib/seia";

const ENTITY_LABELS: Record<string, string> = {
  vehicle_requests: "Solicitação",
  vehicles: "Veículo",
  drivers: "Motorista",
  trip_logs: "Diário de bordo",
};

const ACTION_LABELS: Record<string, string> = {
  INSERT: "Criação",
  UPDATE: "Alteração",
};

export const Route = createFileRoute("/auditoria")({
  head: () => ({
    meta: [
      { title: "Auditoria da frota — SEIA" },
      {
        name: "description",
        content:
          "Registro de auditoria com usuário, IP, data, hora e alterações realizadas nas solicitações e na frota.",
      },
      { property: "og:title", content: "Auditoria da frota — SEIA" },
      {
        property: "og:description",
        content: "Trilha completa de ações realizadas no sistema de frotas.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: AuditoriaPage,
});

function AuditoriaPage() {
  const auth = useSeiaAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!auth.loading && !auth.user) navigate({ to: "/entrar", replace: true });
  }, [auth.loading, auth.user, navigate]);

  const { data: logs, isLoading } = useQuery({
    queryKey: ["audit-logs"],
    enabled: Boolean(auth.user) && auth.isManager,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("audit_logs")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return data;
    },
  });

  if (!auth.loading && auth.user && !auth.isManager) {
    return (
      <div className="min-h-screen">
        <AppHeader auth={auth} />
        <main className="mx-auto max-w-xl px-4 py-24 text-center">
          <h1 className="text-2xl font-semibold">Acesso restrito</h1>
          <p className="mt-3 text-sm text-muted-foreground">
            A trilha de auditoria é exclusiva do gestor de frota.
          </p>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <AppHeader auth={auth} />
      <main className="mx-auto max-w-5xl px-4 py-12">
        <h1 className="text-2xl font-semibold">Auditoria</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Últimos 200 eventos com usuário, IP, data/hora e alterações registradas.
        </p>

        <div className="mt-8 space-y-3">
          {isLoading && <p className="text-sm text-muted-foreground">Carregando…</p>}
          {!isLoading && logs?.length === 0 && (
            <div className="surface-panel p-10 text-center text-sm text-muted-foreground">
              Nenhum evento registrado até o momento.
            </div>
          )}
          {logs?.map((l) => (
            <article key={l.id} className="surface-panel p-5">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="text-sm font-medium">
                  {ACTION_LABELS[l.action] ?? l.action} · {ENTITY_LABELS[l.entity] ?? l.entity}
                </p>
                <p className="text-xs text-muted-foreground">{formatDateTime(l.created_at)}</p>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                {l.user_email ?? "sistema"} · IP {l.ip_address ?? "—"}
              </p>
              <pre className="mt-3 max-h-56 overflow-auto rounded-md bg-secondary p-3 text-xs">
                {JSON.stringify(l.changes, null, 2)}
              </pre>
            </article>
          ))}
        </div>
      </main>
    </div>
  );
}
