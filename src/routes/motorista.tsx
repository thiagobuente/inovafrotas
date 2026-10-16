import { useEffect, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { CarFront, Camera, Flag, Play } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { AppHeader } from "@/components/AppHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { useSeiaAuth, formatDateTime } from "@/lib/seia";
import { emailDriverLog } from "@/lib/triplog.functions";

export const Route = createFileRoute("/motorista")({
  head: () => ({
    meta: [
      { title: "Diário do motorista — SEIA" },
      {
        name: "description",
        content: "Área do motorista: escolha o veículo e registre o diário de bordo de início e fim da viagem.",
      },
      { property: "og:title", content: "Diário do motorista — SEIA" },
      {
        property: "og:description",
        content: "Motoristas da frota Inova registram saída e chegada direto para o gestor.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: MotoristaPage,
});

type Log = {
  id: string;
  vehicle_id: string;
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

async function uploadPhotos(uid: string, logKey: string, kind: "inicio" | "fim", files: File[]) {
  const paths: string[] = [];
  for (const f of files) {
    const ext = f.type.split("/")[1]?.replace("jpeg", "jpg") ?? "jpg";
    const path = `${uid}/motorista/${logKey}/${kind}-${crypto.randomUUID()}.${ext}`;
    const { error } = await supabase.storage
      .from("diario-bordo")
      .upload(path, f, { contentType: f.type, upsert: false });
    if (error) throw new Error(`Falha ao enviar foto: ${error.message}`);
    paths.push(path);
  }
  return paths;
}

function MotoristaPage() {
  const auth = useSeiaAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [vehicleId, setVehicleId] = useState("");
  const [destination, setDestination] = useState("");
  const [km, setKm] = useState("");
  const [incidents, setIncidents] = useState("");
  const [files, setFiles] = useState<File[]>([]);

  useEffect(() => {
    if (auth.loading) return;
    if (!auth.user) navigate({ to: "/entrar", replace: true });
    else if (auth.roleLoaded && !auth.isDriver)
      navigate({ to: auth.isManager ? "/gestao" : "/painel", replace: true });
  }, [auth.loading, auth.user, auth.roleLoaded, auth.isDriver, auth.isManager, navigate]);

  const enabled = !!auth.user && auth.isDriver;

  const vehicles = useQuery({
    queryKey: ["driver-vehicles"],
    enabled,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("vehicles")
        .select("id, plate, brand, model, status")
        .order("plate");
      if (error) throw error;
      return data;
    },
  });

  const logs = useQuery({
    queryKey: ["driver-logs", auth.user?.id],
    enabled,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("driver_trip_logs")
        .select("*, vehicles(plate, brand, model)")
        .eq("driver_id", auth.user!.id)
        .order("created_at", { ascending: false })
        .limit(20);
      if (error) throw error;
      return data as unknown as Log[];
    },
  });

  const open = logs.data?.find((l) => l.status === "open") ?? null;

  function reset() {
    setKm("");
    setIncidents("");
    setFiles([]);
    setDestination("");
  }

  async function start(e: React.FormEvent) {
    e.preventDefault();
    if (!vehicleId) return toast.error("Escolha o veículo.");
    if (!km) return toast.error("Informe o km de saída.");
    setBusy(true);
    try {
      const uid = auth.user!.id;
      const key = crypto.randomUUID();
      const photos = await uploadPhotos(uid, key, "inicio", files);
      const { error } = await supabase.from("driver_trip_logs").insert({
        id: key,
        driver_id: uid,
        driver_email: auth.user!.email ?? "",
        driver_name: (auth.user!.user_metadata?.full_name as string) ?? "",
        vehicle_id: vehicleId,
        destination: destination.trim() || null,
        departure_at: new Date().toISOString(),
        departure_km: Number(km),
        photo_paths: photos,
      });
      if (error) throw error;
      emailDriverLog({ data: { logId: key } }).catch((e) => console.error("[motorista:email]", e));
      toast.success("Início da viagem registrado e enviado ao gestor.");
      reset();
      qc.invalidateQueries({ queryKey: ["driver-logs"] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao salvar.");
    } finally {
      setBusy(false);
    }
  }

  async function finish(e: React.FormEvent) {
    e.preventDefault();
    if (!open) return;
    if (!km) return toast.error("Informe o km de chegada.");
    if (open.departure_km !== null && Number(km) < open.departure_km)
      return toast.error("O km de chegada não pode ser menor que o de saída.");
    setBusy(true);
    try {
      const photos = await uploadPhotos(auth.user!.id, open.id, "fim", files);
      const { error } = await supabase
        .from("driver_trip_logs")
        .update({
          return_at: new Date().toISOString(),
          return_km: Number(km),
          incidents: incidents.trim() || null,
          photo_paths: [...(open.photo_paths ?? []), ...photos],
          status: "closed",
        })
        .eq("id", open.id);
      if (error) throw error;
      const closedId = open.id;
      emailDriverLog({ data: { logId: closedId } }).catch((e) => console.error("[motorista:email]", e));
      toast.success("Diário de bordo concluído e enviado ao gestor.");
      reset();
      qc.invalidateQueries({ queryKey: ["driver-logs"] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao salvar.");
    } finally {
      setBusy(false);
    }
  }

  const photoInput = (label: string) => (
    <div className="space-y-2">
      <Label htmlFor="fotos" className="flex items-center gap-2">
        <Camera className="size-4" /> {label}
      </Label>
      <Input
        key={label}
        id="fotos"
        type="file"
        accept="image/*"
        capture="environment"
        multiple
        onChange={(e) => setFiles(Array.from(e.target.files ?? []))}
      />
      {files.length > 0 && <p className="text-xs text-muted-foreground">{files.length} foto(s) selecionada(s)</p>}
    </div>
  );

  return (
    <div className="min-h-screen pb-24">
      <AppHeader auth={auth} />
      <main className="mx-auto max-w-xl px-4 py-8">
        <h1 className="text-2xl font-semibold">Diário de bordo do motorista</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Escolha o veículo, registre a saída e depois a chegada. Tudo vai direto ao gestor.
        </p>

        <div className="surface-panel mt-6 p-5">
          {logs.isLoading ? (
            <Skeleton className="h-48 w-full" />
          ) : open ? (
            <form onSubmit={finish} className="space-y-4">
              <div className="rounded-md border border-border bg-secondary/50 p-3 text-sm">
                <p className="flex items-center gap-2 font-medium">
                  <CarFront className="size-4" />
                  {open.vehicles ? `${open.vehicles.brand} ${open.vehicles.model} · ${open.vehicles.plate}` : "Veículo"}
                </p>
                <p className="mt-1 text-muted-foreground">
                  Saída: {formatDateTime(open.departure_at)} · {open.departure_km} km
                  {open.destination ? ` · ${open.destination}` : ""}
                </p>
              </div>
              <h2 className="flex items-center gap-2 font-semibold">
                <Flag className="size-4" /> Fim da viagem
              </h2>
              <div className="space-y-2">
                <Label htmlFor="km">Km de chegada</Label>
                <Input id="km" type="number" inputMode="numeric" required value={km} onChange={(e) => setKm(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="inc">Ocorrências (opcional)</Label>
                <Textarea id="inc" value={incidents} onChange={(e) => setIncidents(e.target.value)} />
              </div>
              {photoInput("Fotos do hodômetro (fim)")}
              <Button type="submit" className="w-full" disabled={busy}>
                {busy ? "Enviando…" : "Concluir e enviar ao gestor"}
              </Button>
            </form>
          ) : (
            <form onSubmit={start} className="space-y-4">
              <h2 className="flex items-center gap-2 font-semibold">
                <Play className="size-4" /> Início da viagem
              </h2>
              <div className="space-y-2">
                <Label htmlFor="veh">Veículo que vai dirigir</Label>
                <select
                  id="veh"
                  required
                  value={vehicleId}
                  onChange={(e) => setVehicleId(e.target.value)}
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                >
                  <option value="" disabled>Selecione…</option>
                  {vehicles.data?.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.brand} {v.model} · {v.plate}
                      {v.status === "in_use" ? " (em uso)" : v.status === "maintenance" ? " (manutenção)" : v.status === "inactive" ? " (inativo)" : ""}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="dest">Destino (opcional)</Label>
                <Input id="dest" value={destination} onChange={(e) => setDestination(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="km">Km de saída</Label>
                <Input id="km" type="number" inputMode="numeric" required value={km} onChange={(e) => setKm(e.target.value)} />
              </div>
              {photoInput("Fotos do hodômetro (início)")}
              <Button type="submit" className="w-full" disabled={busy}>
                {busy ? "Enviando…" : "Registrar saída"}
              </Button>
            </form>
          )}
        </div>

        {logs.data && logs.data.filter((l) => l.status === "closed").length > 0 && (
          <section className="mt-8">
            <h2 className="mb-3 font-semibold">Viagens concluídas</h2>
            <ul className="space-y-2">
              {logs.data
                .filter((l) => l.status === "closed")
                .map((l) => (
                  <li key={l.id} className="surface-panel p-3 text-sm">
                    <p className="font-medium">
                      {l.vehicles ? `${l.vehicles.plate} · ${l.vehicles.model}` : "Veículo"}
                    </p>
                    <p className="text-muted-foreground">
                      {formatDateTime(l.departure_at)} → {formatDateTime(l.return_at)} ·{" "}
                      {(l.return_km ?? 0) - (l.departure_km ?? 0)} km rodados
                    </p>
                  </li>
                ))}
            </ul>
          </section>
        )}
      </main>
    </div>
  );
}
