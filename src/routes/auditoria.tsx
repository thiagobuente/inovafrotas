import { useEffect } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { AppHeader } from "@/components/AppHeader";
import { useSeiaAuth, formatDateTime, STATUS_LABELS } from "@/lib/seia";

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

const FIELD_LABELS: Record<string, string> = {
  agenda: "Pauta",
  destination: "Destino",
  pickup_at: "Saída",
  return_at: "Retorno",
  passengers_count: "Passageiros",
  needs_driver: "Precisa de motorista",
  notes: "Observações",
  status: "Situação",
  assigned_vehicle_id: "Veículo designado",
  assigned_driver_id: "Motorista designado",
  decision_note: "Justificativa da decisão",
  decided_by: "Decidido por",
  decided_at: "Data da decisão",
  requester_email: "Solicitante",
  requester_id: "Solicitante",
  protocol: "Protocolo",
  created_at: "Criado em",
  updated_at: "Atualizado em",
  plate: "Placa",
  brand: "Marca",
  model: "Modelo",
  vehicle_type: "Tipo de veículo",
  capacity: "Capacidade (lugares)",
  full_name: "Nome",
  license_number: "Nº da CNH",
  license_category: "Categoria da CNH",
  phone: "Telefone",
  departure_at: "Saída registrada",
  departure_km: "KM de saída",
  return_km: "KM de retorno",
  fuel_liters: "Combustível (litros)",
  incidents: "Ocorrências",
  request_id: "Solicitação",
  created_by: "Registrado por",
  id: "Identificador",
};

const VEHICLE_STATUS_LABELS: Record<string, string> = {
  available: "Disponível",
  in_use: "Em uso",
  maintenance: "Em manutenção",
  inactive: "Inativo",
};

const DRIVER_STATUS_LABELS: Record<string, string> = {
  available: "Disponível",
  unavailable: "Indisponível",
  on_trip: "Em viagem",
};

const VEHICLE_TYPE_LABELS: Record<string, string> = {
  car: "Carro",
  van: "Van",
  bus: "Ônibus",
  pickup: "Caminhonete",
};

const HIDDEN_FIELDS = new Set(["id", "updated_at", "created_by"]);

const ISO_DATE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/;

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

  const enabled = Boolean(auth.user) && auth.isManager;

  const { data: logs, isLoading } = useQuery({
    queryKey: ["audit-logs"],
    enabled,
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

  const { data: names } = useQuery({
    queryKey: ["audit-names"],
    enabled,
    queryFn: async () => {
      const [vehicles, drivers, requests] = await Promise.all([
        supabase.from("vehicles").select("id, plate, brand, model"),
        supabase.from("drivers").select("id, full_name"),
        supabase.from("vehicle_requests").select("id, protocol"),
      ]);
      const map: Record<string, string> = {};
      vehicles.data?.forEach((v) => {
        map[v.id] = `${v.brand} ${v.model} (${v.plate})`;
      });
      drivers.data?.forEach((d) => {
        map[d.id] = d.full_name;
      });
      requests.data?.forEach((r) => {
        map[r.id] = `Protocolo ${r.protocol}`;
      });
      return map;
    },
  });

  function describeValue(entity: string, field: string, value: unknown): string {
    if (value === null || value === undefined || value === "") return "vazio";
    if (typeof value === "boolean") return value ? "Sim" : "Não";
    if (typeof value === "string") {
      if (names?.[value]) return names[value];
      if (ISO_DATE.test(value)) return formatDateTime(value);
      if (field === "status") {
        if (entity === "vehicles") return VEHICLE_STATUS_LABELS[value] ?? value;
        if (entity === "drivers") return DRIVER_STATUS_LABELS[value] ?? value;
        return STATUS_LABELS[value] ?? value;
      }
      if (field === "vehicle_type") return VEHICLE_TYPE_LABELS[value] ?? value;
      if (field.endsWith("_id") || field === "decided_by") return "registro removido ou não identificado";
      return value;
    }
    if (typeof value === "number") return String(value);
    return JSON.stringify(value);
  }

  function renderChanges(log: { action: string; entity: string; changes: unknown }) {
    const changes = log.changes;
    if (!changes || typeof changes !== "object") {
      return <p className="text-sm text-muted-foreground">Sem detalhes registrados.</p>;
    }
    const entries = Object.entries(changes as Record<string, unknown>).filter(
      ([k]) => !HIDDEN_FIELDS.has(k),
    );
    if (entries.length === 0) {
      return <p className="text-sm text-muted-foreground">Sem alterações relevantes.</p>;
    }

    if (log.action === "UPDATE") {
      return (
        <ul className="mt-3 space-y-2">
          {entries.map(([field, diff]) => {
            const d = diff as { de?: unknown; para?: unknown };
            return (
              <li key={field} className="rounded-md bg-secondary px-3 py-2 text-sm">
                <span className="font-medium">{FIELD_LABELS[field] ?? field}</span>: de{" "}
                <span className="text-muted-foreground line-through">
                  {describeValue(log.entity, field, d?.de)}
                </span>{" "}
                para <span className="font-medium">{describeValue(log.entity, field, d?.para)}</span>
              </li>
            );
          })}
        </ul>
      );
    }

    return (
      <dl className="mt-3 grid gap-2 sm:grid-cols-2">
        {entries.map(([field, value]) => (
          <div key={field} className="rounded-md bg-secondary px-3 py-2 text-sm">
            <dt className="text-xs text-muted-foreground">{FIELD_LABELS[field] ?? field}</dt>
            <dd className="font-medium">{describeValue(log.entity, field, value)}</dd>
          </div>
        ))}
      </dl>
    );
  }

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
              {renderChanges(l)}
            </article>
          ))}
        </div>
      </main>
    </div>
  );
}
