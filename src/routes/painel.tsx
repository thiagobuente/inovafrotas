import { useEffect, useState } from "react";
import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Inbox } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { AppHeader } from "@/components/AppHeader";
import { TripLogPanel } from "@/components/TripLogPanel";
import { sendNotification } from "@/lib/notifications.functions";


import { useSeiaAuth, STATUS_LABELS, STATUS_TONE, formatDateTime } from "@/lib/seia";
import { cn } from "@/lib/utils";

const STATUS_FILTERS = [
  { value: "all", label: "Todas" },
  { value: "pending", label: "Pendentes" },
  { value: "approved", label: "Autorizadas" },
  { value: "rejected", label: "Recusadas" },
  { value: "cancelled", label: "Canceladas" },
] as const;

export const Route = createFileRoute("/painel")({
  validateSearch: (
    search: Record<string, unknown>,
  ): { status?: string; protocol?: string } => ({
    status: typeof search.status === "string" ? search.status : "all",
    protocol: typeof search.protocol === "string" ? search.protocol : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Minhas solicitações — SEIA" },
      {
        name: "description",
        content:
          "Acompanhe o andamento e a autorização das suas solicitações de veículo da frota institucional.",
      },
      { property: "og:title", content: "Minhas solicitações — SEIA" },
      {
        property: "og:description",
        content: "Painel do solicitante com status de cada pedido de veículo.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: PainelPage,
});

function PainelPage() {
  const auth = useSeiaAuth();
  const navigate = useNavigate();
  const { status, protocol: focusProtocol } = Route.useSearch();
  const queryClient = useQueryClient();
  const notify = useServerFn(sendNotification);
  const [cancelId, setCancelId] = useState<string | null>(null);
  const [cancelReason, setCancelReason] = useState("");
  const [saving, setSaving] = useState(false);


  useEffect(() => {
    if (auth.loading) return;
    if (!auth.user) navigate({ to: "/entrar", replace: true });
    else if (auth.isManager) navigate({ to: "/gestao", search: { status: "pending" }, replace: true });
  }, [auth.loading, auth.user, auth.isManager, navigate]);

  const { data: requests, isLoading } = useQuery({
    queryKey: ["my-requests", auth.user?.id, status],
    enabled: Boolean(auth.user),
    queryFn: async () => {
      let query = supabase
        .from("vehicle_requests")
        .select(
          "*, vehicles:assigned_vehicle_id (plate, brand, model), drivers:assigned_driver_id (full_name, phone)",
        )
        .eq("requester_id", auth.user!.id)
        .order("created_at", { ascending: false });
      if (status !== "all") query = query.eq("status", status as "pending");
      const { data, error } = await query;
      if (error) throw error;
      return data;
    },
  });


  async function cancelRequest(request: Record<string, any>) {
    const reason = cancelReason.trim();
    if (reason.length < 5) {
      toast.error("Informe o motivo do cancelamento (mínimo 5 caracteres).");
      return;
    }
    setSaving(true);
    const previousStatus = request.status as string;
    const { error } = await supabase
      .from("vehicle_requests")
      .update({ status: "cancelled", decision_note: reason })
      .eq("id", request.id);
    setSaving(false);
    if (error) {
      toast.error("Não foi possível cancelar: " + error.message);
      return;
    }
    toast.success("Solicitação cancelada.");
    setCancelId(null);
    setCancelReason("");
    void notify({
      data: {
        type: "request_cancelled",
        protocol: request.protocol,
        requesterEmail: request.requester_email,
        destination: request.destination,
        agenda: request.agenda,
        pickupAt: request.pickup_at,
        returnAt: request.return_at,
        previousStatus,
        status: "cancelled",
        note: reason,
      },
    }).catch(() => undefined);
    queryClient.invalidateQueries({ queryKey: ["my-requests"] });
  }


  return (
    <div className="min-h-screen">
      <AppHeader auth={auth} />
      <main className="mx-auto max-w-5xl px-4 py-12">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold">Minhas solicitações</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Histórico completo dos seus pedidos de veículo.
            </p>
          </div>
          <Button asChild>
            <Link to="/solicitar">Nova solicitação</Link>
          </Button>
        </div>

        <div className="mt-6 flex flex-wrap gap-2">
          {STATUS_FILTERS.map((f) => (
            <Link
              key={f.value}
              to="/painel"
              search={{ status: f.value }}
              className={cn(
                "rounded-full border px-4 py-1.5 text-sm transition-colors",
                status === f.value
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border text-muted-foreground hover:bg-muted",
              )}
            >
              {f.label}
            </Link>
          ))}
        </div>

        <div className="mt-8 space-y-4">
          {isLoading && (
            <div className="space-y-4">
              <Skeleton className="h-40 w-full" />
              <Skeleton className="h-40 w-full" />
            </div>
          )}
          {!isLoading && requests?.length === 0 && (
            <div className="surface-panel flex flex-col items-center p-10 text-center">
              <Inbox className="size-10 text-muted-foreground/60" />
              <p className="mt-4 text-sm font-medium">Nenhuma solicitação encontrada</p>
              <p className="mt-1 text-sm text-muted-foreground">
                {status === "all"
                  ? "Você ainda não registrou nenhuma solicitação."
                  : `Não há solicitações com status "${STATUS_FILTERS.find((f) => f.value === status)?.label}".`}
              </p>
              <Button asChild className="mt-5" variant="outline" size="sm">
                <Link to="/solicitar">Fazer uma solicitação</Link>
              </Button>
            </div>
          )}
          {requests?.map((r) => (
            <article
              key={r.id}
              id={`req-${r.protocol}`}
              className={cn(
                "surface-panel p-6 scroll-mt-24 transition-shadow",
                focusProtocol === r.protocol && "ring-2 ring-primary",
              )}
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-mono uppercase text-muted-foreground">{r.protocol}</p>
                  <h2 className="mt-1 text-lg font-semibold">{r.destination}</h2>
                </div>
                <span
                  className={cn(
                    "rounded-full border px-3 py-1 text-xs font-medium",
                    STATUS_TONE[r.status],
                  )}
                >
                  {STATUS_LABELS[r.status]}
                </span>
              </div>

              <p className="mt-3 text-sm text-muted-foreground">{r.agenda}</p>

              <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-3">
                <div>
                  <dt className="text-xs text-muted-foreground">Saída</dt>
                  <dd>{formatDateTime(r.pickup_at)}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Retorno</dt>
                  <dd>{formatDateTime(r.return_at)}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Passageiros</dt>
                  <dd>
                    {r.passengers_count} · {r.needs_driver ? "com motorista" : "sem motorista"}
                  </dd>
                </div>
              </dl>

              {!r.needs_driver && r.external_driver_name && (
                <p className="mt-4 rounded-md bg-muted px-3 py-2 text-sm text-muted-foreground">
                  Condutor informado: {r.external_driver_name}
                </p>
              )}

              {r.vehicles && (
                <p className="mt-4 rounded-md bg-success/10 px-3 py-2 text-sm text-success">
                  Veículo designado: {r.vehicles.brand} {r.vehicles.model} · {r.vehicles.plate}
                  {r.drivers ? ` · Motorista: ${r.drivers.full_name}` : ""}
                </p>
              )}
              {r.status === "rejected" && r.decision_note && (
                <p className="mt-4 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
                  Motivo da recusa: {r.decision_note}
                </p>
              )}
              {r.status === "cancelled" && r.decision_note && (
                <p className="mt-4 rounded-md bg-muted px-3 py-2 text-sm text-muted-foreground">
                  Motivo do cancelamento: {r.decision_note}
                </p>
              )}

              {(r.status === "pending" || r.status === "approved") && (
                <div className="mt-5 space-y-3">
                  {cancelId === r.id ? (
                    <div className="rounded-md border border-border p-4">
                      <label className="text-sm font-medium" htmlFor={`motivo-${r.id}`}>
                        Motivo do cancelamento
                      </label>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {r.status === "approved"
                          ? "A reserva já autorizada será liberada na agenda e o gestor será notificado."
                          : "O gestor e você receberão a confirmação por e-mail."}
                      </p>
                      <Textarea
                        id={`motivo-${r.id}`}
                        className="mt-2"
                        rows={3}
                        maxLength={500}
                        value={cancelReason}
                        onChange={(e) => setCancelReason(e.target.value)}
                        placeholder="Descreva o motivo do cancelamento"
                      />
                      <div className="mt-3 flex flex-wrap gap-2">
                        <Button
                          size="sm"
                          variant="destructive"
                          disabled={saving}
                          onClick={() => cancelRequest(r)}
                        >
                          {saving ? "Cancelando…" : "Confirmar cancelamento"}
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={saving}
                          onClick={() => {
                            setCancelId(null);
                            setCancelReason("");
                          }}
                        >
                          Voltar
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setCancelId(r.id);
                        setCancelReason("");
                      }}
                    >
                      {r.status === "approved" ? "Cancelar reserva" : "Cancelar solicitação"}
                    </Button>
                  )}
                </div>
              )}


              {r.status === "approved" && <TripLogPanel requestId={r.id} />}
            </article>
          ))}

        </div>
      </main>
    </div>
  );
}
