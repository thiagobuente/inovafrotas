import { useEffect, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ImageIcon } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { AppHeader } from "@/components/AppHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useSeiaAuth, formatDateTime } from "@/lib/seia";

export const Route = createFileRoute("/diarios-motoristas")({
  head: () => ({
    meta: [
      { title: "Diários dos motoristas — SEIA" },
      { name: "description", content: "Gestor acompanha os diários de bordo enviados pelos motoristas da frota." },
      { property: "og:title", content: "Diários dos motoristas — SEIA" },
      { property: "og:description", content: "Saídas e chegadas registradas pelos motoristas da frota Inova." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Page,
});

type Row = {
  id: string;
  driver_name: string;
  driver_email: string;
  destination: string | null;
  departure_at: string | null;
  departure_km: number | null;
  return_at: string | null;
  return_km: number | null;
  incidents: string | null;
  photo_paths: string[];
  status: string;
  vehicles: { plate: string; brand: string; model: string } | null;
};

function Page() {
  const auth = useSeiaAuth();
  const navigate = useNavigate();
  const [q, setQ] = useState("");

  useEffect(() => {
    if (auth.loading) return;
    if (!auth.user) navigate({ to: "/entrar", replace: true });
    else if (auth.roleLoaded && !auth.isManager) navigate({ to: "/", replace: true });
  }, [auth.loading, auth.user, auth.roleLoaded, auth.isManager, navigate]);

  const { data, isLoading } = useQuery({
    queryKey: ["manager-driver-logs"],
    enabled: auth.isManager,
    refetchInterval: 30_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("driver_trip_logs")
        .select("*, vehicles(plate, brand, model)")
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return data as unknown as Row[];
    },
  });

  async function openPhotos(paths: string[]) {
    const { data, error } = await supabase.storage.from("diario-bordo").createSignedUrls(paths, 600);
    if (error) return toast.error("Não foi possível abrir as fotos.");
    data.forEach((d) => d.signedUrl && window.open(d.signedUrl, "_blank", "noopener"));
  }

  const term = q.trim().toLowerCase();
  const rows = (data ?? []).filter(
    (r) =>
      !term ||
      [r.driver_name, r.driver_email, r.destination, r.vehicles?.plate, r.vehicles?.model]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(term)),
  );

  return (
    <div className="min-h-screen pb-24">
      <AppHeader auth={auth} />
      <main className="mx-auto max-w-6xl px-4 py-8">
        <h1 className="text-2xl font-semibold">Diários dos motoristas</h1>
        <p className="mt-1 text-sm text-muted-foreground">Registros de saída e chegada enviados pelos motoristas.</p>
        <Input className="mt-5 max-w-sm" placeholder="Buscar motorista, placa ou destino" value={q} onChange={(e) => setQ(e.target.value)} />
        <div className="mt-5 space-y-3">
          {isLoading ? (
            <Skeleton className="h-32 w-full" />
          ) : rows.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhum diário de motorista ainda.</p>
          ) : (
            rows.map((r) => (
              <div key={r.id} className="surface-panel p-4 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-medium">
                    {r.driver_name || r.driver_email} ·{" "}
                    {r.vehicles ? `${r.vehicles.brand} ${r.vehicles.model} · ${r.vehicles.plate}` : "—"}
                  </p>
                  <Badge variant={r.status === "open" ? "secondary" : "default"}>
                    {r.status === "open" ? "Em viagem" : "Concluído"}
                  </Badge>
                </div>
                <p className="mt-1 text-muted-foreground">
                  Saída: {formatDateTime(r.departure_at)} · {r.departure_km ?? "—"} km
                  {r.return_at && ` · Chegada: ${formatDateTime(r.return_at)} · ${r.return_km} km`}
                  {r.return_km != null && r.departure_km != null && ` · ${r.return_km - r.departure_km} km rodados`}
                </p>
                {r.destination && <p className="text-muted-foreground">Destino: {r.destination}</p>}
                {r.incidents && <p className="mt-1">Ocorrências: {r.incidents}</p>}
                {r.photo_paths.length > 0 && (
                  <Button variant="outline" size="sm" className="mt-2" onClick={() => openPhotos(r.photo_paths)}>
                    <ImageIcon className="size-4" /> Ver {r.photo_paths.length} foto(s)
                  </Button>
                )}
              </div>
            ))
          )}
        </div>
      </main>
    </div>
  );
}
