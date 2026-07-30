import { useEffect } from "react";
import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { AppHeader } from "@/components/AppHeader";
import { TripLogPanel } from "@/components/TripLogPanel";

import { useSeiaAuth, STATUS_LABELS, STATUS_TONE, formatDateTime } from "@/lib/seia";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/painel")({
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
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!auth.loading && !auth.user) navigate({ to: "/entrar", replace: true });
  }, [auth.loading, auth.user, navigate]);

  const { data: requests, isLoading } = useQuery({
    queryKey: ["my-requests", auth.user?.id],
    enabled: Boolean(auth.user),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("vehicle_requests")
        .select(
          "*, vehicles:assigned_vehicle_id (plate, brand, model), drivers:assigned_driver_id (full_name, phone)",
        )
        .eq("requester_id", auth.user!.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },

  });

  async function cancelRequest(id: string) {
    const { error } = await supabase
      .from("vehicle_requests")
      .update({ status: "cancelled" })
      .eq("id", id);
    if (error) {
      toast.error("Não foi possível cancelar: " + error.message);
      return;
    }
    toast.success("Solicitação cancelada.");
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

        <div className="mt-8 space-y-4">
          {isLoading && <p className="text-sm text-muted-foreground">Carregando…</p>}
          {!isLoading && requests?.length === 0 && (
            <div className="surface-panel p-10 text-center">
              <p className="text-sm text-muted-foreground">
                Você ainda não registrou nenhuma solicitação.
              </p>
            </div>
          )}
          {requests?.map((r) => (
            <article key={r.id} className="surface-panel p-6">
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

              {r.status === "pending" && (
                <div className="mt-5">
                  <Button variant="outline" size="sm" onClick={() => cancelRequest(r.id)}>
                    Cancelar solicitação
                  </Button>
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
