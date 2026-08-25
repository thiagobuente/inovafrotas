import { useEffect, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { AppHeader } from "@/components/AppHeader";
import { useSeiaAuth, formatDateTime } from "@/lib/seia";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";
import { runRemindersNow } from "@/lib/notifications.functions";

const STATUS_LABELS: Record<string, string> = {
  sent: "Enviada",
  pending: "Pendente",
  failed: "Com erro",
  skipped: "Ignorada",
};

const STATUS_STYLES: Record<string, string> = {
  sent: "bg-primary/10 text-primary",
  pending: "bg-amber-500/10 text-amber-600",
  failed: "bg-destructive/10 text-destructive",
  skipped: "bg-muted text-muted-foreground",
};

const EVENT_LABELS: Record<string, string> = {
  request_created: "Nova solicitação",
  request_approved: "Solicitação autorizada",
  request_rejected: "Solicitação recusada",
  request_cancelled: "Solicitação cancelada",
  request_completed: "Viagem concluída",
  request_status_changed: "Mudança de situação",
  trip_reminder: "Lembrete de viagem",
  triplog_pending: "Diário de bordo pendente",
};

const FILTERS = ["all", "pending", "sent", "failed"] as const;

export const Route = createFileRoute("/notificacoes")({
  head: () => ({
    meta: [
      { title: "Notificações da frota — SEIA" },
      {
        name: "description",
        content:
          "Painel do gestor com notificações pendentes, enviadas e com erro, filtradas por usuário e período.",
      },
      { property: "og:title", content: "Notificações da frota — SEIA" },
      {
        property: "og:description",
        content: "Acompanhe o envio de e-mails de cada solicitação de veículo.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: NotificacoesPage,
});

function NotificacoesPage() {
  const auth = useSeiaAuth();
  const navigate = useNavigate();

  const [status, setStatus] = useState<(typeof FILTERS)[number]>("all");
  const [user, setUser] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [running, setRunning] = useState(false);
  const runReminders = useServerFn(runRemindersNow);

  async function triggerReminders() {
    setRunning(true);
    try {
      const result = await runReminders();
      const total = result.sent.length;
      toast.success(
        total > 0
          ? `${total} lembrete(s) enviado(s).`
          : "Nenhum lembrete pendente no momento.",
      );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Falha ao executar os lembretes.");
    } finally {
      setRunning(false);
    }
  }



  useEffect(() => {
    if (!auth.loading && !auth.user) navigate({ to: "/entrar", replace: true });
  }, [auth.loading, auth.user, navigate]);

  const { data: logs, isLoading } = useQuery({
    queryKey: ["notification-logs", status, user, from, to],
    enabled: Boolean(auth.user) && auth.isManager,
    queryFn: async () => {
      let query = supabase
        .from("notification_logs")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(300);

      if (status !== "all") query = query.eq("status", status);
      if (user.trim()) {
        const term = `%${user.trim()}%`;
        query = query.or(`recipient.ilike.${term},requester_email.ilike.${term}`);
      }
      if (from) query = query.gte("created_at", new Date(`${from}T00:00:00`).toISOString());
      if (to) query = query.lte("created_at", new Date(`${to}T23:59:59`).toISOString());

      const { data, error } = await query;
      if (error) throw error;
      return data;
    },
  });

  const counts = {
    pending: logs?.filter((l) => l.status === "pending").length ?? 0,
    sent: logs?.filter((l) => l.status === "sent").length ?? 0,
    failed: logs?.filter((l) => l.status === "failed").length ?? 0,
  };

  if (!auth.loading && auth.user && !auth.isManager) {
    return (
      <div className="min-h-screen">
        <AppHeader auth={auth} />
        <main className="mx-auto max-w-xl px-4 py-24 text-center">
          <h1 className="text-2xl font-semibold">Acesso restrito</h1>
          <p className="mt-3 text-sm text-muted-foreground">
            O painel de notificações é exclusivo do gestor de frota.
          </p>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <AppHeader auth={auth} />
      <main className="mx-auto max-w-5xl px-4 py-12">
        <h1 className="text-2xl font-semibold">Notificações</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Entregas de e-mail geradas a cada mudança de situação das solicitações.
        </p>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <Button type="button" size="sm" variant="outline" disabled={running} onClick={triggerReminders}>
            {running ? "Verificando…" : "Executar lembretes agora"}
          </Button>
          <span className="text-xs text-muted-foreground">
            A verificação automática roda de hora em hora: aviso 24h antes da viagem e cobrança do
            diário de bordo após o retorno.
          </span>
        </div>

        <div className="mt-6 grid gap-3 sm:grid-cols-3">
          <SummaryCard label="Pendentes" value={counts.pending} />
          <SummaryCard label="Enviadas" value={counts.sent} />
          <SummaryCard label="Com erro" value={counts.failed} />
        </div>

        <div className="surface-panel mt-6 grid gap-4 p-5 sm:grid-cols-2 lg:grid-cols-4">
          <div className="space-y-1.5 lg:col-span-2">
            <Label htmlFor="usuario">Usuário (destinatário ou solicitante)</Label>
            <Input
              id="usuario"
              placeholder="nome@inova.pr.gov.br"
              value={user}
              onChange={(e) => setUser(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="de">De</Label>
            <Input id="de" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ate">Até</Label>
            <Input id="ate" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
          <div className="flex flex-wrap items-center gap-2 sm:col-span-2 lg:col-span-4">
            {FILTERS.map((f) => (
              <Button
                key={f}
                type="button"
                size="sm"
                variant={status === f ? "default" : "outline"}
                onClick={() => setStatus(f)}
              >
                {f === "all" ? "Todas" : STATUS_LABELS[f]}
              </Button>
            ))}
            {(user || from || to || status !== "all") && (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => {
                  setUser("");
                  setFrom("");
                  setTo("");
                  setStatus("all");
                }}
              >
                Limpar filtros
              </Button>
            )}
          </div>
        </div>

        <div className="mt-8 space-y-3">
          {isLoading && <p className="text-sm text-muted-foreground">Carregando…</p>}
          {!isLoading && logs?.length === 0 && (
            <div className="surface-panel p-10 text-center text-sm text-muted-foreground">
              Nenhuma notificação encontrada para os filtros selecionados.
            </div>
          )}
          {logs?.map((l) => (
            <article key={l.id} className="surface-panel p-5">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="text-sm font-medium">
                  {EVENT_LABELS[l.event_type] ?? l.event_type} · {l.protocol}
                </p>
                <div className="flex items-center gap-3">
                  <span
                    className={cn(
                      "rounded-full px-2.5 py-0.5 text-xs font-medium",
                      STATUS_STYLES[l.status] ?? "bg-muted text-muted-foreground",
                    )}
                  >
                    {STATUS_LABELS[l.status] ?? l.status}
                  </span>
                  <p className="text-xs text-muted-foreground">{formatDateTime(l.created_at)}</p>
                </div>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                Para {l.recipient} ({l.audience === "manager" ? "gestor" : "solicitante"}) · provedor{" "}
                {l.provider}
              </p>
              <p className="mt-2 text-sm">{l.subject}</p>
              {l.reason && (
                <p className="mt-2 rounded-md bg-secondary p-3 text-xs text-muted-foreground">
                  {l.reason}
                </p>
              )}
            </article>
          ))}
        </div>
      </main>
    </div>
  );
}

function SummaryCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="surface-panel p-5">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-semibold">{value}</p>
    </div>
  );
}
