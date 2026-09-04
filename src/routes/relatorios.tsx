import { useEffect, useMemo, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import jsPDF from "jspdf";
import { Download, FileText } from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { supabase } from "@/integrations/supabase/client";
import { AppHeader } from "@/components/AppHeader";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useSeiaAuth, STATUS_LABELS } from "@/lib/seia";

export const Route = createFileRoute("/relatorios")({
  head: () => ({
    meta: [
      { title: "Relatórios da frota — SEIA Gestor" },
      {
        name: "description",
        content:
          "Painel de indicadores da frota SEIA: solicitações por período, quilometragem por veículo e taxa de utilização.",
      },
      { property: "og:title", content: "Relatórios da frota — SEIA Gestor" },
      {
        property: "og:description",
        content: "Gráficos de utilização, quilômetros rodados e exportação de relatórios.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: RelatoriosPage,
});

function isoDaysAgo(days: number) {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}

const STATUS_COLORS: Record<string, string> = {
  pending: "hsl(38 92% 50%)",
  approved: "hsl(142 71% 40%)",
  rejected: "hsl(0 72% 51%)",
  cancelled: "hsl(215 16% 55%)",
  completed: "hsl(221 83% 53%)",
};

function monthLabel(iso: string) {
  return new Date(iso).toLocaleDateString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    month: "short",
    year: "2-digit",
  });
}

function downloadBlob(content: string, filename: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function RelatoriosPage() {
  const auth = useSeiaAuth();
  const navigate = useNavigate();
  const [from, setFrom] = useState(isoDaysAgo(180));
  const [to, setTo] = useState(new Date().toISOString().slice(0, 10));

  useEffect(() => {
    if (!auth.loading && !auth.user) navigate({ to: "/entrar", replace: true });
  }, [auth.loading, auth.user, navigate]);

  const enabled = Boolean(auth.user) && auth.isManager;

  const { data: requests, isLoading } = useQuery({
    queryKey: ["report-requests", from, to],
    enabled,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("vehicle_requests")
        .select(
          "id, protocol, status, created_at, pickup_at, return_at, requester_email, destination, vehicles:assigned_vehicle_id (plate, brand, model), drivers:assigned_driver_id (full_name)",
        )
        .gte("created_at", `${from}T00:00:00-03:00`)
        .lte("created_at", `${to}T23:59:59-03:00`)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: logs } = useQuery({
    queryKey: ["report-logs", from, to],
    enabled,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("trip_logs")
        .select(
          "id, departure_km, return_km, created_at, vehicle_requests!inner(protocol, pickup_at, vehicles(plate, brand, model), drivers(full_name), external_driver_name)",
        )
        .gte("created_at", `${from}T00:00:00-03:00`)
        .lte("created_at", `${to}T23:59:59-03:00`);
      if (error) throw error;
      return data ?? [];
    },
  });

  const byStatus = useMemo(() => {
    const acc: Record<string, number> = {};
    for (const r of requests ?? []) acc[r.status] = (acc[r.status] ?? 0) + 1;
    return Object.entries(acc).map(([status, value]) => ({
      status,
      name: STATUS_LABELS[status] ?? status,
      value,
    }));
  }, [requests]);

  const byMonth = useMemo(() => {
    const acc = new Map<string, { mes: string; total: number; autorizadas: number }>();
    for (const r of requests ?? []) {
      const key = r.created_at.slice(0, 7);
      const entry = acc.get(key) ?? { mes: monthLabel(r.created_at), total: 0, autorizadas: 0 };
      entry.total += 1;
      if (r.status === "approved" || r.status === "completed") entry.autorizadas += 1;
      acc.set(key, entry);
    }
    return [...acc.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([, v]) => v);
  }, [requests]);

  const kmByVehicle = useMemo(() => {
    const acc = new Map<string, number>();
    for (const l of logs ?? []) {
      const req = l.vehicle_requests as any;
      const v = req?.vehicles;
      if (!v || l.departure_km == null || l.return_km == null) continue;
      const km = Number(l.return_km) - Number(l.departure_km);
      if (!Number.isFinite(km) || km <= 0) continue;
      const label = `${v.brand} ${v.model} · ${v.plate}`;
      acc.set(label, (acc.get(label) ?? 0) + km);
    }
    return [...acc.entries()]
      .map(([veiculo, km]) => ({ veiculo, km }))
      .sort((a, b) => b.km - a.km);
  }, [logs]);

  const usageByVehicle = useMemo(() => {
    const acc = new Map<string, { veiculo: string; viagens: number; horas: number }>();
    for (const r of requests ?? []) {
      const v = r.vehicles as any;
      if (!v || (r.status !== "approved" && r.status !== "completed")) continue;
      const label = `${v.brand} ${v.model} · ${v.plate}`;
      const entry = acc.get(label) ?? { veiculo: label, viagens: 0, horas: 0 };
      entry.viagens += 1;
      const hours =
        (new Date(r.return_at).getTime() - new Date(r.pickup_at).getTime()) / 3_600_000;
      if (Number.isFinite(hours) && hours > 0) entry.horas += Math.round(hours);
      acc.set(label, entry);
    }
    return [...acc.values()].sort((a, b) => b.viagens - a.viagens);
  }, [requests]);

  const totals = useMemo(() => {
    const total = requests?.length ?? 0;
    const approved = (requests ?? []).filter(
      (r) => r.status === "approved" || r.status === "completed",
    ).length;
    const km = kmByVehicle.reduce((sum, r) => sum + r.km, 0);
    return {
      total,
      approved,
      km,
      rate: total ? Math.round((approved / total) * 100) : 0,
    };
  }, [requests, kmByVehicle]);

  function exportCsv() {
    const rows = [
      ["Protocolo", "Status", "Criada em", "Saída", "Retorno", "Solicitante", "Destino", "Veículo"],
      ...(requests ?? []).map((r) => {
        const v = r.vehicles as any;
        return [
          r.protocol,
          STATUS_LABELS[r.status] ?? r.status,
          r.created_at,
          r.pickup_at,
          r.return_at,
          r.requester_email,
          r.destination,
          v ? `${v.brand} ${v.model} ${v.plate}` : "—",
        ];
      }),
    ];
    const csv = rows
      .map((row) => row.map((cell) => `"${String(cell ?? "").replace(/"/g, '""')}"`).join(";"))
      .join("\n");
    downloadBlob(`\uFEFF${csv}`, `seia-relatorio-${from}_a_${to}.csv`, "text/csv;charset=utf-8");
  }

  function exportPdf() {
    const doc = new jsPDF();
    let y = 16;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(15);
    doc.text("Relatório da frota — SEIA", 14, y);
    y += 7;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.text(`Período: ${from} a ${to}`, 14, y);
    y += 10;

    const summary: Array<[string, string]> = [
      ["Solicitações no período", String(totals.total)],
      ["Autorizadas", String(totals.approved)],
      ["Taxa de autorização", `${totals.rate}%`],
      ["Quilômetros percorridos", `${totals.km} km`],
    ];
    for (const [k, v] of summary) {
      doc.setFont("helvetica", "bold");
      doc.text(`${k}:`, 14, y);
      doc.setFont("helvetica", "normal");
      doc.text(v, 80, y);
      y += 6;
    }

    y += 6;
    doc.setFont("helvetica", "bold");
    doc.text("Quilometragem por veículo", 14, y);
    y += 6;
    doc.setFont("helvetica", "normal");
    for (const row of kmByVehicle) {
      if (y > 275) {
        doc.addPage();
        y = 16;
      }
      doc.text(`${row.veiculo}`, 14, y);
      doc.text(`${row.km} km`, 170, y, { align: "right" });
      y += 6;
    }

    y += 6;
    if (y > 260) {
      doc.addPage();
      y = 16;
    }
    doc.setFont("helvetica", "bold");
    doc.text("Utilização por veículo", 14, y);
    y += 6;
    doc.setFont("helvetica", "normal");
    for (const row of usageByVehicle) {
      if (y > 275) {
        doc.addPage();
        y = 16;
      }
      doc.text(row.veiculo, 14, y);
      doc.text(`${row.viagens} viagens · ${row.horas} h`, 190, y, { align: "right" });
      y += 6;
    }

    doc.save(`seia-relatorio-${from}_a_${to}.pdf`);
  }

  if (!auth.loading && auth.user && !auth.isManager) {
    return (
      <div className="min-h-screen">
        <AppHeader auth={auth} />
        <main className="mx-auto max-w-xl px-4 py-24 text-center">
          <h1 className="text-2xl font-semibold">Acesso restrito</h1>
          <p className="mt-3 text-sm text-muted-foreground">
            Somente o gestor de frota pode consultar os relatórios.
          </p>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <AppHeader auth={auth} />
      <main className="mx-auto max-w-6xl px-4 py-12 pb-nav">
        <h1 className="text-2xl font-semibold">Relatórios da frota</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Indicadores de utilização, quilometragem e demanda por período.
        </p>

        <div className="surface-panel mt-6 flex flex-col gap-4 p-5 sm:flex-row sm:items-end">
          <div className="flex-1">
            <Label htmlFor="from">De</Label>
            <Input
              id="from"
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              className="mt-1"
            />
          </div>
          <div className="flex-1">
            <Label htmlFor="to">Até</Label>
            <Input
              id="to"
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              className="mt-1"
            />
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={exportCsv}>
              <Download className="mr-2 h-4 w-4" /> CSV
            </Button>
            <Button onClick={exportPdf}>
              <FileText className="mr-2 h-4 w-4" /> PDF
            </Button>
          </div>
        </div>

        {isLoading ? (
          <div className="mt-6 space-y-4">
            <Skeleton className="h-28 w-full" />
            <Skeleton className="h-72 w-full" />
          </div>
        ) : (
          <>
            <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {[
                { label: "Solicitações", value: totals.total },
                { label: "Autorizadas", value: totals.approved },
                { label: "Taxa de autorização", value: `${totals.rate}%` },
                { label: "Km percorridos", value: `${totals.km}` },
              ].map((card) => (
                <div key={card.label} className="surface-panel p-5">
                  <p className="text-sm text-muted-foreground">{card.label}</p>
                  <p className="mt-1 text-3xl font-semibold">{card.value}</p>
                </div>
              ))}
            </div>

            <div className="mt-6 grid gap-6 lg:grid-cols-2">
              <section className="surface-panel p-5">
                <h2 className="text-base font-semibold">Solicitações por mês</h2>
                <div className="mt-4 h-72">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={byMonth}>
                      <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                      <XAxis dataKey="mes" fontSize={12} />
                      <YAxis allowDecimals={false} fontSize={12} />
                      <Tooltip />
                      <Legend />
                      <Line type="monotone" dataKey="total" name="Total" stroke="hsl(221 83% 53%)" />
                      <Line
                        type="monotone"
                        dataKey="autorizadas"
                        name="Autorizadas"
                        stroke="hsl(142 71% 40%)"
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </section>

              <section className="surface-panel p-5">
                <h2 className="text-base font-semibold">Distribuição por status</h2>
                <div className="mt-4 h-72">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={byStatus} dataKey="value" nameKey="name" outerRadius={100} label>
                        {byStatus.map((entry) => (
                          <Cell
                            key={entry.status}
                            fill={STATUS_COLORS[entry.status] ?? "hsl(215 16% 55%)"}
                          />
                        ))}
                      </Pie>
                      <Tooltip />
                      <Legend />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </section>

              <section className="surface-panel p-5">
                <h2 className="text-base font-semibold">Quilômetros por veículo</h2>
                {kmByVehicle.length === 0 ? (
                  <p className="mt-4 text-sm text-muted-foreground">
                    Nenhum diário de bordo com quilometragem no período.
                  </p>
                ) : (
                  <div className="mt-4 h-72">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={kmByVehicle} layout="vertical" margin={{ left: 40 }}>
                        <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                        <XAxis type="number" fontSize={12} />
                        <YAxis type="category" dataKey="veiculo" width={140} fontSize={11} />
                        <Tooltip />
                        <Bar dataKey="km" name="Km" fill="hsl(221 83% 53%)" radius={4} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </section>

              <section className="surface-panel p-5">
                <h2 className="text-base font-semibold">Utilização por veículo</h2>
                {usageByVehicle.length === 0 ? (
                  <p className="mt-4 text-sm text-muted-foreground">
                    Nenhuma reserva autorizada no período.
                  </p>
                ) : (
                  <div className="mt-4 h-72">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={usageByVehicle} layout="vertical" margin={{ left: 40 }}>
                        <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                        <XAxis type="number" allowDecimals={false} fontSize={12} />
                        <YAxis type="category" dataKey="veiculo" width={140} fontSize={11} />
                        <Tooltip />
                        <Legend />
                        <Bar dataKey="viagens" name="Viagens" fill="hsl(142 71% 40%)" radius={4} />
                        <Bar dataKey="horas" name="Horas" fill="hsl(38 92% 50%)" radius={4} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </section>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
