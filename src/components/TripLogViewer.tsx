import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Download, ImageIcon } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { formatDateTime } from "@/lib/seia";

type RequestInfo = {
  id: string;
  protocol: string;
  requester_email: string;
  destination: string;
  agenda: string;
  pickup_at: string;
  return_at: string;
};

export function TripLogViewer({ request }: { request: RequestInfo }) {
  const [open, setOpen] = useState(false);

  const { data: log, isLoading } = useQuery({
    queryKey: ["trip-log", request.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("trip_logs")
        .select("*")
        .eq("request_id", request.id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const paths = log?.photo_paths ?? [];

  const { data: photos = [] } = useQuery({
    queryKey: ["trip-log-photos", request.id, paths],
    enabled: open && paths.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase.storage
        .from("diario-bordo")
        .createSignedUrls(paths, 3600);
      if (error) throw error;
      return (data ?? [])
        .filter((d) => !!d.signedUrl)
        .map((d, i) => ({ path: paths[i], url: d.signedUrl as string }));
    },
  });

  function download() {
    if (!log) return;
    const totalKm =
      log.return_km != null && log.departure_km != null ? log.return_km - log.departure_km : null;
    const lines = [
      "DIÁRIO DE BORDO — SEIA",
      `Protocolo: ${request.protocol}`,
      `Solicitante: ${request.requester_email}`,
      `Destino: ${request.destination}`,
      `Pauta: ${request.agenda}`,
      `Período previsto: ${formatDateTime(request.pickup_at)} até ${formatDateTime(request.return_at)}`,
      "",
      `Saída registrada: ${log.departure_at ? formatDateTime(log.departure_at) : "—"}`,
      `KM na saída: ${log.departure_km ?? "—"}`,
      `Retorno registrado: ${log.return_at ? formatDateTime(log.return_at) : "—"}`,
      `KM no retorno: ${log.return_km ?? "—"}`,
      `Total percorrido: ${totalKm != null ? `${totalKm} km` : "—"}`,
      "",
      `Ocorrências: ${log.incidents?.trim() || "Sem ocorrências registradas."}`,
      `Fotos anexadas: ${paths.length}`,
      "",
      `Gerado em ${formatDateTime(new Date().toISOString())}`,
    ];
    const blob = new Blob([lines.join("\n")], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `diario-bordo-${request.protocol}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const totalKm =
    log?.return_km != null && log?.departure_km != null ? log.return_km - log.departure_km : null;

  return (
    <div className="mt-5 border-t border-border pt-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-medium">Diário de bordo</p>
          <p className="text-xs text-muted-foreground">
            {isLoading
              ? "Carregando…"
              : log
                ? `Saída ${log.departure_km ?? "—"} km · Retorno ${log.return_km ?? "—"} km${
                    totalKm != null ? ` · ${totalKm} km rodados` : ""
                  } · ${paths.length} foto(s)`
                : "O solicitante ainda não preencheu."}
          </p>
        </div>
        {log && (
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={() => setOpen((v) => !v)}>
              <ImageIcon className="size-4" />
              {open ? "Ocultar" : "Ver diário"}
            </Button>
            <Button variant="outline" size="sm" onClick={download}>
              <Download className="size-4" />
              Baixar
            </Button>
          </div>
        )}
      </div>

      {open && log && (
        <div className="mt-4 space-y-3 rounded-md bg-muted/50 p-4 text-sm">
          <dl className="grid gap-3 sm:grid-cols-2">
            <div>
              <dt className="text-xs text-muted-foreground">Saída registrada</dt>
              <dd>{log.departure_at ? formatDateTime(log.departure_at) : "—"}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Retorno registrado</dt>
              <dd>{log.return_at ? formatDateTime(log.return_at) : "—"}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">KM saída / retorno</dt>
              <dd>
                {log.departure_km ?? "—"} / {log.return_km ?? "—"}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Total percorrido</dt>
              <dd>{totalKm != null ? `${totalKm} km` : "—"}</dd>
            </div>
          </dl>
          <div>
            <p className="text-xs text-muted-foreground">Ocorrências</p>
            <p className="whitespace-pre-line">
              {log.incidents?.trim() || "Sem ocorrências registradas."}
            </p>
          </div>
          {photos.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {photos.map((p) => (
                <a key={p.path} href={p.url} target="_blank" rel="noreferrer" download>
                  <img
                    src={p.url}
                    alt={`Foto do diário de bordo do protocolo ${request.protocol}`}
                    className="h-24 w-24 rounded-md border border-border object-cover transition-opacity hover:opacity-80"
                  />
                </a>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
