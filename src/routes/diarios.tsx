import { useEffect, useMemo, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Download, FileText, ImageIcon, Search, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { AppHeader } from "@/components/AppHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useSeiaAuth, formatDateTime } from "@/lib/seia";
import { downloadDiarioPdf, downloadDiariosPdf, type DiarioRecord } from "@/lib/diarioPdf";
import { toast } from "sonner";

export const Route = createFileRoute("/diarios")({
  head: () => ({
    meta: [
      { title: "Diários de bordo da frota — SEIA" },
      {
        name: "description",
        content:
          "Central de diários de bordo do SEIA: filtre por protocolo, solicitante, veículo ou período e baixe cada registro em PDF.",
      },
      { property: "og:title", content: "Diários de bordo da frota — SEIA" },
      {
        property: "og:description",
        content: "Consulte, filtre e exporte em PDF todos os diários de bordo da frota Inova.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: DiariosPage,
});

type Filters = {
  q: string;
  from: string;
  to: string;
  onlyPhotos: boolean;
  onlyIncidents: boolean;
};

function DiariosPage() {
  const auth = useSeiaAuth();
  const navigate = useNavigate();
  const [filters, setFilters] = useState<Filters>({
    q: "",
    from: "",
    to: "",
    onlyPhotos: false,
    onlyIncidents: false,
  });
  const [openId, setOpenId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!auth.loading && !auth.user) navigate({ to: "/entrar", replace: true });
    if (!auth.loading && auth.user && auth.roleLoaded && !auth.isManager)
      navigate({ to: "/painel", replace: true });
  }, [auth.loading, auth.user, auth.roleLoaded, auth.isManager, navigate]);

  const enabled = Boolean(auth.user) && auth.isManager;

  const { data: logs, isLoading } = useQuery({
    queryKey: ["all-trip-logs"],
    enabled,
    queryFn: async (): Promise<DiarioRecord[]> => {
      const { data, error } = await supabase
        .from("trip_logs")
        .select(
          "id, request_id, departure_at, departure_km, return_at, return_km, incidents, photo_paths, created_at, vehicle_requests(protocol, requester_email, agenda, destination, pickup_at, return_at, external_driver_name, vehicles(plate, brand, model), drivers(full_name))",
        )
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []).map((row) => {
        const req = row.vehicle_requests as unknown as {
          protocol: string;
          requester_email: string;
          agenda: string;
          destination: string;
          pickup_at: string;
          return_at: string;
          external_driver_name: string | null;
          vehicles: { plate: string; brand: string; model: string } | null;
          drivers: { full_name: string } | null;
        } | null;
        return {
          id: row.id,
          request_id: row.request_id,
          departure_at: row.departure_at,
          departure_km: row.departure_km,
          return_at: row.return_at,
          return_km: row.return_km,
          incidents: row.incidents,
          photo_paths: row.photo_paths ?? [],
          created_at: row.created_at,
          protocol: req?.protocol ?? "—",
          requester_email: req?.requester_email ?? "—",
          agenda: req?.agenda ?? "—",
          destination: req?.destination ?? "—",
          pickup_at: req?.pickup_at ?? row.created_at,
          return_planned_at: req?.return_at ?? row.created_at,
          vehicle: req?.vehicles
            ? `${req.vehicles.brand} ${req.vehicles.model} · ${req.vehicles.plate}`
            : null,
          driver: req?.drivers?.full_name ?? req?.external_driver_name ?? null,
        };
      });
    },
  });

  const filtered = useMemo(() => {
    const term = filters.q.trim().toLowerCase();
    const fromTs = filters.from ? new Date(`${filters.from}T00:00:00`).getTime() : null;
    const toTs = filters.to ? new Date(`${filters.to}T23:59:59`).getTime() : null;
    return (logs ?? []).filter((r) => {
      if (term) {
        const haystack = [r.protocol, r.requester_email, r.destination, r.agenda, r.vehicle, r.driver]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        if (!haystack.includes(term)) return false;
      }
      const ref = new Date(r.departure_at ?? r.pickup_at ?? r.created_at).getTime();
      if (fromTs != null && ref < fromTs) return false;
      if (toTs != null && ref > toTs) return false;
      if (filters.onlyPhotos && r.photo_paths.length === 0) return false;
      if (filters.onlyIncidents && !r.incidents?.trim()) return false;
      return true;
    });
  }, [logs, filters]);

  async function exportOne(record: DiarioRecord) {
    setBusy(true);
    try {
      await downloadDiarioPdf(record, true);
    } catch {
      toast.error("Não foi possível gerar o PDF deste diário.");
    } finally {
      setBusy(false);
    }
  }

  async function exportAll() {
    if (!filtered.length) return;
    setBusy(true);
    try {
      await downloadDiariosPdf(filtered, false);
      toast.success(`PDF gerado com ${filtered.length} diário(s).`);
    } catch {
      toast.error("Não foi possível gerar o PDF consolidado.");
    } finally {
      setBusy(false);
    }
  }

  const hasFilters =
    filters.q || filters.from || filters.to || filters.onlyPhotos || filters.onlyIncidents;

  return (
    <div className="min-h-screen bg-background">
      <AppHeader auth={auth} />
      <main className="mx-auto max-w-6xl px-4 py-10">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="font-display text-2xl font-semibold">Diários de bordo</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Todos os diários enviados pelos solicitantes, com filtros de busca e exportação em PDF.
            </p>
          </div>
          <Button onClick={exportAll} disabled={busy || !filtered.length}>
            <Download className="size-4" />
            Baixar {filtered.length} em PDF
          </Button>
        </div>

        <section className="mt-6 rounded-lg border border-border bg-card p-4">
          <div className="grid gap-4 md:grid-cols-4">
            <div className="md:col-span-2">
              <Label htmlFor="q">Buscar</Label>
              <div className="relative mt-1">
                <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="q"
                  value={filters.q}
                  onChange={(e) => setFilters((f) => ({ ...f, q: e.target.value }))}
                  placeholder="Protocolo, solicitante, destino, veículo ou condutor"
                  className="pl-9"
                />
              </div>
            </div>
            <div>
              <Label htmlFor="from">De</Label>
              <Input
                id="from"
                type="date"
                className="mt-1"
                value={filters.from}
                onChange={(e) => setFilters((f) => ({ ...f, from: e.target.value }))}
              />
            </div>
            <div>
              <Label htmlFor="to">Até</Label>
              <Input
                id="to"
                type="date"
                className="mt-1"
                value={filters.to}
                onChange={(e) => setFilters((f) => ({ ...f, to: e.target.value }))}
              />
            </div>
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant={filters.onlyPhotos ? "default" : "outline"}
              size="sm"
              onClick={() => setFilters((f) => ({ ...f, onlyPhotos: !f.onlyPhotos }))}
            >
              <ImageIcon className="size-4" />
              Com fotos
            </Button>
            <Button
              type="button"
              variant={filters.onlyIncidents ? "default" : "outline"}
              size="sm"
              onClick={() => setFilters((f) => ({ ...f, onlyIncidents: !f.onlyIncidents }))}
            >
              <FileText className="size-4" />
              Com ocorrência
            </Button>
            {hasFilters && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() =>
                  setFilters({ q: "", from: "", to: "", onlyPhotos: false, onlyIncidents: false })
                }
              >
                <X className="size-4" />
                Limpar filtros
              </Button>
            )}
          </div>
        </section>

        <div className="mt-6 space-y-4">
          {isLoading &&
            [0, 1, 2].map((i) => <Skeleton key={i} className="h-28 w-full rounded-lg" />)}

          {!isLoading && filtered.length === 0 && (
            <p className="rounded-lg border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
              Nenhum diário de bordo encontrado com esses filtros.
            </p>
          )}

          {filtered.map((r) => (
            <DiarioCard
              key={r.id}
              record={r}
              open={openId === r.id}
              onToggle={() => setOpenId((v) => (v === r.id ? null : r.id))}
              onExport={() => exportOne(r)}
              busy={busy}
            />
          ))}
        </div>
      </main>
    </div>
  );
}

function DiarioCard({
  record,
  open,
  onToggle,
  onExport,
  busy,
}: {
  record: DiarioRecord;
  open: boolean;
  onToggle: () => void;
  onExport: () => void;
  busy: boolean;
}) {
  const { data: photos = [] } = useQuery({
    queryKey: ["diario-photos", record.id, record.photo_paths],
    enabled: open && record.photo_paths.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase.storage
        .from("diario-bordo")
        .createSignedUrls(record.photo_paths, 3600);
      if (error) throw error;
      return (data ?? [])
        .map((d, i) => ({ path: record.photo_paths[i], url: d.signedUrl }))
        .filter((p): p is { path: string; url: string } => Boolean(p.url));
    },
  });

  const total =
    record.return_km != null && record.departure_km != null
      ? record.return_km - record.departure_km
      : null;

  return (
    <article className="rounded-lg border border-border bg-card p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-medium">{record.protocol}</p>
            {record.photo_paths.length > 0 && (
              <Badge variant="secondary">{record.photo_paths.length} foto(s)</Badge>
            )}
            {record.incidents?.trim() && <Badge variant="destructive">Ocorrência</Badge>}
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            {record.requester_email} · {record.destination}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {record.vehicle ?? "Veículo não designado"} ·{" "}
            {record.departure_at ? formatDateTime(record.departure_at) : formatDateTime(record.pickup_at)}
            {total != null ? ` · ${total} km rodados` : ""}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={onToggle}>
            {open ? "Ocultar" : "Ver diário"}
          </Button>
          <Button variant="outline" size="sm" onClick={onExport} disabled={busy}>
            <Download className="size-4" />
            PDF
          </Button>
        </div>
      </div>

      {open && (
        <div className="mt-4 space-y-3 rounded-md bg-muted/50 p-4 text-sm">
          <dl className="grid gap-3 sm:grid-cols-2">
            <div>
              <dt className="text-xs text-muted-foreground">Pauta</dt>
              <dd>{record.agenda}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Condutor</dt>
              <dd>{record.driver ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Saída / retorno registrados</dt>
              <dd>
                {record.departure_at ? formatDateTime(record.departure_at) : "—"} —{" "}
                {record.return_at ? formatDateTime(record.return_at) : "—"}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">KM saída / retorno</dt>
              <dd>
                {record.departure_km ?? "—"} / {record.return_km ?? "—"}
              </dd>
            </div>
          </dl>
          <div>
            <p className="text-xs text-muted-foreground">Ocorrências</p>
            <p className="whitespace-pre-line">
              {record.incidents?.trim() || "Sem ocorrências registradas."}
            </p>
          </div>
          {photos.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {photos.map((p) => (
                <a key={p.path} href={p.url} target="_blank" rel="noreferrer">
                  <img
                    src={p.url}
                    alt={`Foto do diário de bordo do protocolo ${record.protocol}`}
                    className="h-24 w-24 rounded-md border border-border object-cover transition-opacity hover:opacity-80"
                  />
                </a>
              ))}
            </div>
          )}
        </div>
      )}
    </article>
  );
}
