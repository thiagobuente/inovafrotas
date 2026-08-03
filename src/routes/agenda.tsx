import { useEffect, useMemo, useState } from "react";
import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AppHeader } from "@/components/AppHeader";
import { useSeiaAuth, formatDateTime } from "@/lib/seia";
import { cn } from "@/lib/utils";

const START_HOUR = 7;
const END_HOUR = 22;
const HOURS = Array.from({ length: END_HOUR - START_HOUR + 1 }, (_, i) => START_HOUR + i);

export const Route = createFileRoute("/agenda")({
  head: () => ({
    meta: [
      { title: "Agenda da frota — SEIA" },
      {
        name: "description",
        content:
          "Visualize a ocupação de cada veículo por dia e por mês para saber se está livre no período solicitado.",
      },
      { property: "og:title", content: "Agenda da frota — SEIA" },
      {
        property: "og:description",
        content: "Ocupação dos veículos por período, para o gestor de frota do SEIA.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: AgendaPage,
});

function toISODate(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function AgendaPage() {
  const auth = useSeiaAuth();
  const navigate = useNavigate();
  const [mode, setMode] = useState<"day" | "month">("day");
  const [day, setDay] = useState(() => toISODate(new Date()));

  useEffect(() => {
    if (!auth.loading && !auth.user) navigate({ to: "/entrar", replace: true });
  }, [auth.loading, auth.user, navigate]);

  const enabled = Boolean(auth.user) && auth.isManager;

  const range = useMemo(() => {
    const base = new Date(`${day}T00:00:00`);
    if (mode === "day") {
      const end = new Date(base);
      end.setDate(end.getDate() + 1);
      return { from: base, to: end };
    }
    const from = new Date(base.getFullYear(), base.getMonth(), 1);
    const to = new Date(base.getFullYear(), base.getMonth() + 1, 1);
    return { from, to };
  }, [day, mode]);

  const { data: vehicles } = useQuery({
    queryKey: ["agenda-vehicles"],
    enabled,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("vehicles")
        .select("id, plate, brand, model, status")
        .order("model");
      if (error) throw error;
      return data;
    },
  });

  const { data: bookings } = useQuery({
    queryKey: ["agenda-bookings", range.from.toISOString(), range.to.toISOString()],
    enabled,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("vehicle_requests")
        .select(
          "id, protocol, agenda, destination, pickup_at, return_at, status, assigned_vehicle_id, requester_email, drivers(full_name)",
        )
        .eq("status", "approved")
        .lt("pickup_at", range.to.toISOString())
        .gt("return_at", range.from.toISOString());
      if (error) throw error;
      return data;
    },
  });

  function shift(delta: number) {
    const base = new Date(`${day}T00:00:00`);
    if (mode === "day") base.setDate(base.getDate() + delta);
    else base.setMonth(base.getMonth() + delta);
    setDay(toISODate(base));
  }

  if (!auth.loading && auth.user && !auth.isManager) {
    return (
      <div className="min-h-screen">
        <AppHeader auth={auth} />
        <main className="mx-auto max-w-xl px-4 py-24 text-center">
          <h1 className="text-2xl font-semibold">Acesso restrito</h1>
          <p className="mt-3 text-sm text-muted-foreground">
            A agenda da frota é exclusiva do gestor.
          </p>
        </main>
      </div>
    );
  }

  const monthDays =
    mode === "month"
      ? Array.from(
          { length: new Date(range.to.getTime() - 1).getDate() },
          (_, i) => i + 1,
        )
      : [];

  return (
    <div className="min-h-screen">
      <AppHeader auth={auth} />
      <main className="mx-auto max-w-6xl px-4 py-10">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="font-display text-2xl font-semibold">Agenda da frota</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Ocupação dos veículos nas viagens autorizadas.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2 rounded-lg bg-gradient-brand px-2 py-1.5 text-primary-foreground">
              <Button
                variant="ghost"
                size="icon"
                className="size-8 text-primary-foreground hover:bg-white/15"
                onClick={() => shift(-1)}
                aria-label="Período anterior"
              >
                <ChevronLeft className="size-4" />
              </Button>
              <Input
                type="date"
                value={day}
                onChange={(e) => e.target.value && setDay(e.target.value)}
                className="h-8 w-40 border-white/30 bg-white/10 text-primary-foreground"
              />
              <Button
                variant="ghost"
                size="icon"
                className="size-8 text-primary-foreground hover:bg-white/15"
                onClick={() => shift(1)}
                aria-label="Próximo período"
              >
                <ChevronRight className="size-4" />
              </Button>
            </div>

            <div className="flex rounded-lg border border-border p-1">
              {(["day", "month"] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setMode(m)}
                  className={cn(
                    "rounded-md px-3 py-1.5 text-sm font-medium text-muted-foreground transition-colors",
                    mode === m && "bg-primary text-primary-foreground",
                  )}
                >
                  {m === "day" ? "Diário" : "Mensal"}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="surface-panel mt-6 overflow-x-auto">
          <div className="min-w-[900px]">
            <div className="flex border-b border-border text-[11px] uppercase tracking-wide text-muted-foreground">
              <div className="w-44 shrink-0 px-4 py-3">Veículo</div>
              <div className="flex flex-1">
                {(mode === "day" ? HOURS : monthDays).map((h) => (
                  <div key={h} className="flex-1 border-l border-border/60 px-1 py-3 text-center">
                    {mode === "day" ? `${h}:00` : h}
                  </div>
                ))}
              </div>
            </div>

            {vehicles?.map((v) => {
              const items = (bookings ?? []).filter((b) => b.assigned_vehicle_id === v.id);
              return (
                <div key={v.id} className="flex border-b border-border/60 last:border-0">
                  <div className="w-44 shrink-0 px-4 py-4">
                    <p className="text-sm font-semibold uppercase">{v.model}</p>
                    <p className="font-mono text-xs text-primary">{v.plate}</p>
                  </div>
                  <div className="relative flex-1">
                    <div className="absolute inset-0 flex">
                      {(mode === "day" ? HOURS : monthDays).map((h) => (
                        <div key={h} className="flex-1 border-l border-border/40" />
                      ))}
                    </div>
                    <div className="relative h-16">
                      {items.map((b) => {
                        const start = new Date(b.pickup_at);
                        const end = new Date(b.return_at);
                        let left = 0;
                        let width = 0;
                        if (mode === "day") {
                          const dayStart = new Date(`${day}T00:00:00`);
                          const toH = (d: Date) =>
                            (d.getTime() - dayStart.getTime()) / 3600000;
                          const s = Math.max(toH(start), START_HOUR);
                          const e = Math.min(toH(end), END_HOUR + 1);
                          if (e <= s) return null;
                          const total = END_HOUR + 1 - START_HOUR;
                          left = ((s - START_HOUR) / total) * 100;
                          width = ((e - s) / total) * 100;
                        } else {
                          const total = monthDays.length;
                          const toD = (d: Date) =>
                            (d.getTime() - range.from.getTime()) / 86400000;
                          const s = Math.max(toD(start), 0);
                          const e = Math.min(toD(end), total);
                          if (e <= s) return null;
                          left = (s / total) * 100;
                          width = ((e - s) / total) * 100;
                        }
                        return (
                          <Link
                            key={b.id}
                            to="/gestao"
                            search={{ status: "approved" }}
                            title={`${b.protocol} · ${b.destination} · ${formatDateTime(b.pickup_at)} → ${formatDateTime(b.return_at)}`}
                            className="absolute top-3 flex h-10 items-center overflow-hidden rounded-md bg-gradient-brand px-2 text-xs font-medium text-primary-foreground shadow-sm"
                            style={{ left: `${left}%`, width: `max(2%, ${width}%)` }}
                          >
                            <span className="truncate">{b.destination}</span>
                          </Link>
                        );
                      })}
                      {items.length === 0 && (
                        <span className="sr-only">Sem reservas neste período</span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}

            {vehicles?.length === 0 && (
              <p className="p-6 text-sm text-muted-foreground">Nenhum veículo cadastrado.</p>
            )}
          </div>
        </div>

        <div className="mt-6 space-y-2">
          <h2 className="text-sm font-semibold">Reservas do período</h2>
          {(bookings ?? []).length === 0 && (
            <p className="text-sm text-muted-foreground">
              Nenhum veículo ocupado neste período.
            </p>
          )}
          {(bookings ?? []).map((b) => (
            <div
              key={b.id}
              className="surface-panel flex flex-wrap items-center justify-between gap-2 p-4 text-sm"
            >
              <div>
                <p className="font-medium">
                  {b.destination} · {b.agenda}
                </p>
                <p className="text-xs text-muted-foreground">
                  {formatDateTime(b.pickup_at)} → {formatDateTime(b.return_at)} ·{" "}
                  {b.requester_email}
                </p>
              </div>
              <span className="font-mono text-xs text-primary">{b.protocol}</span>
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}
