import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

type Form = {
  departure_at: string;
  departure_km: string;
  return_at: string;
  return_km: string;
  fuel_liters: string;
  incidents: string;
};

const EMPTY: Form = {
  departure_at: "",
  departure_km: "",
  return_at: "",
  return_km: "",
  fuel_liters: "",
  incidents: "",
};

function toLocalInput(value: string | null) {
  if (!value) return "";
  const d = new Date(value);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function TripLogPanel({ requestId }: { requestId: string }) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<Form | null>(null);

  const { data: log, isLoading } = useQuery({
    queryKey: ["trip-log", requestId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("trip_logs")
        .select("*")
        .eq("request_id", requestId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const current =
    form ??
    (log
      ? {
          departure_at: toLocalInput(log.departure_at),
          departure_km: log.departure_km?.toString() ?? "",
          return_at: toLocalInput(log.return_at),
          return_km: log.return_km?.toString() ?? "",
          fuel_liters: log.fuel_liters?.toString() ?? "",
          incidents: log.incidents ?? "",
        }
      : EMPTY);

  const save = useMutation({
    mutationFn: async () => {
      const payload = {
        request_id: requestId,
        departure_at: current.departure_at ? new Date(current.departure_at).toISOString() : null,
        departure_km: current.departure_km ? Number(current.departure_km) : null,
        return_at: current.return_at ? new Date(current.return_at).toISOString() : null,
        return_km: current.return_km ? Number(current.return_km) : null,
        fuel_liters: current.fuel_liters ? Number(current.fuel_liters) : null,
        incidents: current.incidents.trim() || null,
      };
      if (
        payload.departure_km !== null &&
        payload.return_km !== null &&
        payload.return_km < payload.departure_km
      ) {
        throw new Error("A quilometragem de retorno não pode ser menor que a de saída.");
      }
      const { error } = log
        ? await supabase.from("trip_logs").update(payload).eq("id", log.id)
        : await supabase.from("trip_logs").insert(payload);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Diário de bordo registrado.");
      setForm(null);
      queryClient.invalidateQueries({ queryKey: ["trip-log", requestId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

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
                  }`
                : "Ainda não preenchido."}
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => setOpen((v) => !v)}>
          {open ? "Fechar" : log ? "Editar registro" : "Preencher"}
        </Button>
      </div>

      {open && (
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label>Saída</Label>
            <Input
              type="datetime-local"
              value={current.departure_at}
              onChange={(e) => setForm({ ...current, departure_at: e.target.value })}
            />
          </div>
          <div className="space-y-2">
            <Label>KM na saída</Label>
            <Input
              type="number"
              min={0}
              value={current.departure_km}
              onChange={(e) => setForm({ ...current, departure_km: e.target.value })}
            />
          </div>
          <div className="space-y-2">
            <Label>Retorno</Label>
            <Input
              type="datetime-local"
              value={current.return_at}
              onChange={(e) => setForm({ ...current, return_at: e.target.value })}
            />
          </div>
          <div className="space-y-2">
            <Label>KM no retorno</Label>
            <Input
              type="number"
              min={0}
              value={current.return_km}
              onChange={(e) => setForm({ ...current, return_km: e.target.value })}
            />
          </div>
          <div className="space-y-2">
            <Label>Litros abastecidos</Label>
            <Input
              type="number"
              step="0.01"
              min={0}
              value={current.fuel_liters}
              onChange={(e) => setForm({ ...current, fuel_liters: e.target.value })}
            />
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label>Ocorrências</Label>
            <Textarea
              rows={2}
              maxLength={800}
              value={current.incidents}
              onChange={(e) => setForm({ ...current, incidents: e.target.value })}
              placeholder="Avarias, atrasos, multas ou observações da viagem"
            />
          </div>
          <div>
            <Button size="sm" disabled={save.isPending} onClick={() => save.mutate()}>
              {save.isPending ? "Salvando…" : "Salvar diário"}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
