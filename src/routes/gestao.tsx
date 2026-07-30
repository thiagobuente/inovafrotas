import { useEffect, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AppHeader } from "@/components/AppHeader";
import { useSeiaAuth, STATUS_LABELS, STATUS_TONE, formatDateTime } from "@/lib/seia";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/gestao")({
  head: () => ({
    meta: [
      { title: "Autorização de veículos — SEIA Gestor" },
      {
        name: "description",
        content:
          "Painel do gestor de frota para autorizar ou recusar solicitações de veículos e designar a frota.",
      },
      { property: "og:title", content: "Autorização de veículos — SEIA Gestor" },
      {
        property: "og:description",
        content: "Analise, designe veículos e autorize solicitações da equipe.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: GestaoPage,
});

function GestaoPage() {
  const auth = useSeiaAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState("pending");

  useEffect(() => {
    if (!auth.loading && !auth.user) navigate({ to: "/entrar", replace: true });
  }, [auth.loading, auth.user, navigate]);

  const { data: requests, isLoading } = useQuery({
    queryKey: ["all-requests", tab],
    enabled: Boolean(auth.user) && auth.isManager,
    queryFn: async () => {
      let query = supabase
        .from("vehicle_requests")
        .select("*, vehicles:assigned_vehicle_id (plate, brand, model)")
        .order("created_at", { ascending: false });
      if (tab === "pending") query = query.eq("status", "pending");
      const { data, error } = await query;
      if (error) throw error;
      return data;
    },
  });

  const { data: vehicles } = useQuery({
    queryKey: ["vehicles-all"],
    enabled: Boolean(auth.user) && auth.isManager,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("vehicles")
        .select("id, plate, brand, model, capacity, status")
        .order("plate");
      if (error) throw error;
      return data;
    },
  });

  async function decide(
    id: string,
    status: "approved" | "rejected",
    vehicleId: string | null,
    note: string,
  ) {
    if (status === "approved" && !vehicleId) {
      toast.error("Selecione um veículo para autorizar.");
      return;
    }
    if (status === "rejected" && !note.trim()) {
      toast.error("Informe o motivo da recusa.");
      return;
    }
    const { error } = await supabase
      .from("vehicle_requests")
      .update({
        status,
        assigned_vehicle_id: status === "approved" ? vehicleId : null,
        decision_note: note.trim() || null,
        decided_by: auth.user!.id,
        decided_at: new Date().toISOString(),
      })
      .eq("id", id);
    if (error) {
      toast.error("Não foi possível registrar a decisão: " + error.message);
      return;
    }
    toast.success(status === "approved" ? "Solicitação autorizada." : "Solicitação recusada.");
    queryClient.invalidateQueries({ queryKey: ["all-requests"] });
  }

  if (!auth.loading && auth.user && !auth.isManager) {
    return (
      <div className="min-h-screen">
        <AppHeader auth={auth} />
        <main className="mx-auto max-w-xl px-4 py-24 text-center">
          <h1 className="text-2xl font-semibold">Acesso restrito</h1>
          <p className="mt-3 text-sm text-muted-foreground">
            Esta área é exclusiva do perfil de gestor de frota.
          </p>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <AppHeader auth={auth} />
      <main className="mx-auto max-w-5xl px-4 py-12">
        <h1 className="text-2xl font-semibold">Autorização de solicitações</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Analise a demanda, designe o veículo e registre a decisão.
        </p>

        <Tabs value={tab} onValueChange={setTab} className="mt-8">
          <TabsList>
            <TabsTrigger value="pending">Pendentes</TabsTrigger>
            <TabsTrigger value="all">Todas</TabsTrigger>
          </TabsList>

          <TabsContent value={tab} className="mt-6 space-y-4">
            {isLoading && <p className="text-sm text-muted-foreground">Carregando…</p>}
            {!isLoading && requests?.length === 0 && (
              <div className="surface-panel p-10 text-center text-sm text-muted-foreground">
                Nenhuma solicitação nesta lista.
              </div>
            )}
            {requests?.map((r) => (
              <RequestCard
                key={r.id}
                request={r}
                vehicles={vehicles ?? []}
                onDecide={decide}
              />
            ))}
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}

type VehicleRow = {
  id: string;
  plate: string;
  brand: string;
  model: string;
  capacity: number;
  status: string;
};

function RequestCard({
  request,
  vehicles,
  onDecide,
}: {
  request: Record<string, any>;
  vehicles: VehicleRow[];
  onDecide: (
    id: string,
    status: "approved" | "rejected",
    vehicleId: string | null,
    note: string,
  ) => Promise<void>;
}) {
  const [vehicleId, setVehicleId] = useState<string>("");
  const [note, setNote] = useState("");

  return (
    <article className="surface-panel p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-mono text-xs uppercase text-muted-foreground">{request.protocol}</p>
          <h2 className="mt-1 text-lg font-semibold">{request.destination}</h2>
          <p className="text-sm text-muted-foreground">{request.requester_email}</p>
        </div>
        <span
          className={cn("rounded-full border px-3 py-1 text-xs font-medium", STATUS_TONE[request.status])}
        >
          {STATUS_LABELS[request.status]}
        </span>
      </div>

      <p className="mt-3 text-sm text-muted-foreground">{request.agenda}</p>

      <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-3">
        <div>
          <dt className="text-xs text-muted-foreground">Saída</dt>
          <dd>{formatDateTime(request.pickup_at)}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Retorno</dt>
          <dd>{formatDateTime(request.return_at)}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Passageiros</dt>
          <dd>
            {request.passengers_count} ·{" "}
            {request.needs_driver ? "com motorista" : "sem motorista"}
          </dd>
        </div>
      </dl>

      {request.notes && (
        <p className="mt-3 text-sm text-muted-foreground">Observações: {request.notes}</p>
      )}

      {request.vehicles && (
        <p className="mt-4 rounded-md bg-success/10 px-3 py-2 text-sm text-success">
          Veículo designado: {request.vehicles.brand} {request.vehicles.model} ·{" "}
          {request.vehicles.plate}
        </p>
      )}
      {request.status === "rejected" && request.decision_note && (
        <p className="mt-4 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
          Motivo: {request.decision_note}
        </p>
      )}

      {request.status === "pending" && (
        <div className="mt-6 space-y-4 border-t border-border pt-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Designar veículo</Label>
              <Select value={vehicleId} onValueChange={setVehicleId}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione o veículo" />
                </SelectTrigger>
                <SelectContent>
                  {vehicles
                    .filter((v) => v.status === "available")
                    .map((v) => (
                      <SelectItem key={v.id} value={v.id}>
                        {v.plate} — {v.brand} {v.model} ({v.capacity} lug.)
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Observação / motivo</Label>
              <Textarea
                rows={2}
                value={note}
                maxLength={500}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Obrigatório em caso de recusa"
              />
            </div>
          </div>

          <div className="flex flex-wrap gap-3">
            <Button onClick={() => onDecide(request.id, "approved", vehicleId || null, note)}>
              Autorizar
            </Button>
            <Button
              variant="destructive"
              onClick={() => onDecide(request.id, "rejected", null, note)}
            >
              Recusar
            </Button>
          </div>
        </div>
      )}
    </article>
  );
}
