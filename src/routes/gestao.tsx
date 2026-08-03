import { useEffect, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
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
import { sendNotification } from "@/lib/notifications.functions";

const MANAGER_TABS = [
  { value: "pending", label: "Pendentes" },
  { value: "approved", label: "Aprovadas" },
  { value: "rejected", label: "Recusadas" },
  { value: "all", label: "Todas" },
] as const;

export const Route = createFileRoute("/gestao")({
  validateSearch: (search: Record<string, unknown>) => ({
    status: typeof search.status === "string" ? search.status : "pending",
  }),
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
  errorComponent: GestaoError,
});

function GestaoError({ error, reset }: { error: Error; reset: () => void }) {
  const router = useRouter();
  return (
    <div className="min-h-screen">
      <main className="mx-auto max-w-xl px-4 py-24 text-center">
        <h1 className="text-2xl font-semibold">Não foi possível carregar o painel</h1>
        <p className="mt-3 text-sm text-muted-foreground">
          {error?.message || "Erro inesperado ao processar a autorização."}
        </p>
        <Button
          className="mt-6"
          onClick={() => {
            router.invalidate();
            reset();
          }}
        >
          Tentar novamente
        </Button>
      </main>
    </div>
  );
}


function GestaoPage() {
  const auth = useSeiaAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { status: tab } = Route.useSearch();
  const notify = useServerFn(sendNotification);

  useEffect(() => {
    if (!auth.loading && !auth.user) navigate({ to: "/entrar", replace: true });
  }, [auth.loading, auth.user, navigate]);

  const setTab = (value: string) =>
    navigate({ to: "/gestao", search: { status: value }, replace: true });

  const { data: requests, isLoading } = useQuery({
    queryKey: ["all-requests", tab],
    enabled: Boolean(auth.user) && auth.isManager,
    queryFn: async () => {
      let query = supabase
        .from("vehicle_requests")
        .select("*, vehicles:assigned_vehicle_id (plate, brand, model), drivers:assigned_driver_id (full_name)")
        .order("created_at", { ascending: false });
      if (tab !== "all") query = query.eq("status", tab as "pending");
      const { data, error } = await query;
      if (error) throw error;
      return data;
    },
  });

  const { data: counts } = useQuery({
    queryKey: ["request-counts"],
    enabled: Boolean(auth.user) && auth.isManager,
    queryFn: async () => {
      const { data, error } = await supabase.from("vehicle_requests").select("status");
      if (error) throw error;
      return (data ?? []).reduce<Record<string, number>>((acc, row) => {
        acc[row.status] = (acc[row.status] ?? 0) + 1;
        return acc;
      }, {});
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

  const { data: drivers } = useQuery({
    queryKey: ["drivers-available"],
    enabled: Boolean(auth.user) && auth.isManager,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("drivers")
        .select("id, full_name, license_category, status")
        .order("full_name");
      if (error) throw error;
      return data;
    },
  });

  async function decide(
    request: Record<string, any>,
    status: "approved" | "rejected",
    vehicleId: string | null,
    driverId: string | null,
    note: string,
  ) {
    try {
      if (status === "approved" && !vehicleId) {
        toast.error("Selecione um veículo para autorizar.");
        return;
      }
      if (status === "rejected" && !note.trim()) {
        toast.error("Informe o motivo da recusa.");
        return;
      }
      const managerId = auth.user?.id;
      if (!managerId) {
        toast.error("Sessão expirada. Entre novamente para registrar a decisão.");
        navigate({ to: "/entrar", replace: true });
        return;
      }
      const { error } = await supabase
        .from("vehicle_requests")
        .update({
          status,
          assigned_vehicle_id: status === "approved" ? vehicleId : null,
          assigned_driver_id: status === "approved" ? driverId : null,
          decision_note: note.trim() || null,
          decided_by: managerId,
          decided_at: new Date().toISOString(),
        })
        .eq("id", request.id);
      if (error) {
        toast.error("Não foi possível registrar a decisão: " + error.message);
        return;
      }
      const vehicle = (vehicles ?? []).find((v) => v.id === vehicleId);
      const driver = (drivers ?? []).find((d) => d.id === driverId);
      void Promise.resolve(
        notify({
          data: {
            type: status === "approved" ? "request_approved" : "request_rejected",
            protocol: request.protocol,
            requesterEmail: request.requester_email,
            destination: request.destination,
            agenda: request.agenda,
            pickupAt: request.pickup_at,
            returnAt: request.return_at,
            vehicleLabel:
              status === "approved" && vehicle
                ? `${vehicle.brand} ${vehicle.model} · ${vehicle.plate}`
                : null,
            driverLabel: status === "approved" && driver ? driver.full_name : null,
            note: note.trim() || null,
            previousStatus: request.status,
            status,
          },
        }),
      ).catch(() => undefined);
      toast.success(status === "approved" ? "Solicitação autorizada." : "Solicitação recusada.");
      queryClient.invalidateQueries({ queryKey: ["all-requests"] });
      queryClient.invalidateQueries({ queryKey: ["request-counts"] });
    } catch (err) {
      toast.error(
        "Não foi possível registrar a decisão: " +
          (err instanceof Error ? err.message : "erro inesperado"),
      );
    }
  }



  if (!auth.loading && auth.user && !auth.isManager) {
    return (
      <div className="min-h-screen">
        <AppHeader auth={auth} />
        <main className="mx-auto max-w-xl px-4 py-24 text-center">
          <h1 className="text-2xl font-semibold">Acesso restrito</h1>
          <p className="mt-3 text-sm text-muted-foreground">
            Somente o gestor de frota (frotas.01@inova.pr.gov.br) pode autorizar solicitações
            de veículos.
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
        <h1 className="text-2xl font-semibold">Painel de aprovações</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Analise a demanda, designe veículo e motorista e registre a decisão.
        </p>

        <div className="mt-6 grid gap-4 sm:grid-cols-3">
          {(["pending", "approved", "rejected"] as const).map((key) => (
            <button
              key={key}
              type="button"
              onClick={() => setTab(key)}
              className={cn(
                "surface-panel p-5 text-left transition-colors",
                tab === key ? "ring-2 ring-primary" : "hover:bg-muted/40",
              )}
            >
              <p className="text-sm text-muted-foreground">
                {key === "pending" ? "Pendentes" : key === "approved" ? "Aprovadas" : "Recusadas"}
              </p>
              <p className="mt-1 text-3xl font-semibold">{counts?.[key] ?? 0}</p>
            </button>
          ))}
        </div>

        <Tabs value={tab} onValueChange={setTab} className="mt-8">
          <TabsList>
            {MANAGER_TABS.map((t) => (
              <TabsTrigger key={t.value} value={t.value}>
                {t.label}
              </TabsTrigger>
            ))}
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
                drivers={drivers ?? []}
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

type DriverRow = {
  id: string;
  full_name: string;
  license_category: string;
  status: string;
};

function RequestCard({
  request,
  vehicles,
  drivers,
  onDecide,
}: {
  request: Record<string, any>;
  vehicles: VehicleRow[];
  drivers: DriverRow[];
  onDecide: (
    request: Record<string, any>,
    status: "approved" | "rejected",
    vehicleId: string | null,
    driverId: string | null,
    note: string,
  ) => Promise<void>;
}) {
  const [vehicleId, setVehicleId] = useState<string>("");
  const [driverId, setDriverId] = useState<string>("");
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
              <Label>
                Designar motorista {request.needs_driver ? "(solicitado)" : "(opcional)"}
              </Label>
              <Select value={driverId} onValueChange={setDriverId}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione o motorista" />
                </SelectTrigger>
                <SelectContent>
                  {drivers
                    .filter((d) => d.status === "available")
                    .map((d) => (
                      <SelectItem key={d.id} value={d.id}>
                        {d.full_name} (cat. {d.license_category})
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2 sm:col-span-2">
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

          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs uppercase tracking-wide text-muted-foreground">
              Ações rápidas
            </span>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                const first = vehicles.find((v) => v.status === "available");
                if (!first) {
                  toast.error("Nenhum veículo disponível na frota.");
                  return;
                }
                setVehicleId(first.id);
                void onDecide(request, "approved", first.id, driverId || null, note);
              }}
            >
              Autorizar com 1º veículo livre
            </Button>
            {["Frota indisponível no período", "Dados insuficientes na solicitação"].map((reason) => (
              <Button
                key={reason}
                variant="outline"
                size="sm"
                onClick={() => {
                  setNote(reason);
                  void onDecide(request, "rejected", null, null, reason);
                }}
              >
                Recusar: {reason}
              </Button>
            ))}
          </div>

          <div className="flex flex-wrap gap-3">
            <Button
              onClick={() =>
                onDecide(request, "approved", vehicleId || null, driverId || null, note)
              }
            >
              Autorizar
            </Button>
            <Button
              variant="destructive"
              onClick={() => onDecide(request, "rejected", null, null, note)}
            >
              Recusar
            </Button>
          </div>

        </div>
      )}
    </article>
  );
}
