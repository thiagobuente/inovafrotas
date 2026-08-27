import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { MessageSquarePlus, X } from "lucide-react";
import { brasiliaInputToISO } from "@/lib/seia";
import { useServerFn } from "@tanstack/react-start";
import { emailTripLog } from "@/lib/triplog.functions";

type Form = {
  departure_at: string;
  departure_km: string;
  return_at: string;
  return_km: string;
  incidents: string;
};

const EMPTY: Form = {
  departure_at: "",
  departure_km: "",
  return_at: "",
  return_km: "",
  incidents: "",
};

function toLocalInput(value: string | null) {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  // Sempre exibe/edita em horário de Brasília, independente do fuso do aparelho.
  const parts = new Intl.DateTimeFormat("sv-SE", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
  return parts.replace(" ", "T").slice(0, 16);
}

export function TripLogPanel({ requestId }: { requestId: string }) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<Form | null>(null);
  const [photos, setPhotos] = useState<string[] | null>(null);
  const [uploading, setUploading] = useState(false);
  const [showIncidents, setShowIncidents] = useState(false);
  const sendTripLogEmail = useServerFn(emailTripLog);

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
          incidents: log.incidents ?? "",
        }
      : EMPTY);

  useEffect(() => {
    if (log?.incidents) setShowIncidents(true);
  }, [log?.incidents]);


  const currentPhotos = photos ?? (log?.photo_paths ?? []);

  const { data: photoUrls = [] } = useQuery({
    queryKey: ["trip-log-photos", requestId, currentPhotos],
    enabled: currentPhotos.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase.storage
        .from("diario-bordo")
        .createSignedUrls(currentPhotos, 3600);
      if (error) throw error;
      return (data ?? [])
        .filter((d) => !!d.signedUrl)
        .map((d, i) => ({ path: currentPhotos[i], url: d.signedUrl as string }));
    },
  });

  function kindOf(path: string): "inicio" | "fim" | "outras" {
    const name = path.split("/").pop() ?? "";
    if (name.startsWith("inicio-")) return "inicio";
    if (name.startsWith("fim-")) return "fim";
    return "outras";
  }

  async function handleUpload(files: FileList | null, kind: "inicio" | "fim") {
    if (!files?.length) return;
    setUploading(true);
    try {
      const { data: auth } = await supabase.auth.getUser();
      const uid = auth.user?.id;
      if (!uid) throw new Error("Sessão expirada. Entre novamente.");
      const uploaded: string[] = [];
      for (const file of Array.from(files)) {
        if (!file.type.startsWith("image/")) throw new Error("Envie apenas imagens.");
        if (file.size > 5 * 1024 * 1024) throw new Error("Cada foto deve ter até 5 MB.");
        const ext = file.name.split(".").pop()?.toLowerCase() ?? "jpg";
        const path = `${uid}/${requestId}/${kind}-${crypto.randomUUID()}.${ext}`;
        const { error } = await supabase.storage.from("diario-bordo").upload(path, file);
        if (error) throw error;
        uploaded.push(path);
      }
      setPhotos([...currentPhotos, ...uploaded]);
      toast.success("Foto(s) anexada(s). Salve o diário para confirmar.");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setUploading(false);
    }
  }

  function removePhoto(path: string) {
    setPhotos(currentPhotos.filter((p) => p !== path));
  }

  function PhotoField({
    kind,
    label,
    hint,
  }: {
    kind: "inicio" | "fim";
    label: string;
    hint: string;
  }) {
    const items = photoUrls.filter((p) => kindOf(p.path) === kind);
    return (
      <div className="space-y-2">
        <Label>{label}</Label>
        <Input
          type="file"
          accept="image/*"
          multiple
          capture="environment"
          disabled={uploading}
          onChange={(e) => {
            void handleUpload(e.target.files, kind);
            e.target.value = "";
          }}
        />
        <p className="text-xs text-muted-foreground">{uploading ? "Enviando…" : hint}</p>
        {items.length > 0 && (
          <div className="flex flex-wrap gap-2 pt-1">
            {items.map((p) => (
              <div key={p.path} className="relative">
                <a href={p.url} target="_blank" rel="noreferrer">
                  <img
                    src={p.url}
                    alt={`Foto do diário de bordo (${label})`}
                    className="h-20 w-20 rounded-md border border-border object-cover"
                  />
                </a>
                <button
                  type="button"
                  aria-label="Remover foto"
                  onClick={() => removePhoto(p.path)}
                  className="absolute -right-2 -top-2 rounded-full bg-destructive p-1 text-destructive-foreground"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }


  const save = useMutation({
    mutationFn: async () => {
      const payload = {
        request_id: requestId,
        departure_at: current.departure_at ? brasiliaInputToISO(current.departure_at) : null,
        departure_km: current.departure_km ? Number(current.departure_km) : null,
        return_at: current.return_at ? brasiliaInputToISO(current.return_at) : null,
        return_km: current.return_km ? Number(current.return_km) : null,
        incidents: current.incidents.trim() || null,
        photo_paths: currentPhotos,
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
      toast.success("Diário de bordo registrado. Enviando cópia por e-mail ao gestor…");
      setForm(null);
      setPhotos(null);
      queryClient.invalidateQueries({ queryKey: ["trip-log", requestId] });
      void sendTripLogEmail({ data: { requestId } })
        .then((r) => {
          const sent = r.results.some((x) => x.status === "sent");
          if (sent) {
            toast.success(
              `Cópia enviada ao gestor com ${r.attached} foto(s) em anexo.`,
            );
          } else {
            toast.warning(
              "Diário salvo, mas o e-mail não pôde ser enviado. O gestor foi avisado dentro do sistema.",
            );
          }
        })
        .catch((e: Error) => toast.warning(`Diário salvo. E-mail não enviado: ${e.message}`));
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
            {log && (log.photo_paths?.length ?? 0) > 0
              ? ` · ${log.photo_paths.length} foto(s)`
              : ""}
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
          <div className="space-y-2 sm:col-span-2">
            <Label>Ocorrências</Label>
            {showIncidents ? (
              <>
                <Textarea
                  rows={3}
                  maxLength={800}
                  value={current.incidents}
                  onChange={(e) => setForm({ ...current, incidents: e.target.value })}
                  placeholder="Avarias, atrasos, multas ou observações da viagem"
                />
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowIncidents(false)}
                  >
                    Cancelar
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setForm({ ...current, incidents: "" });
                      setShowIncidents(false);
                    }}
                  >
                    Sem ocorrências
                  </Button>
                </div>
              </>
            ) : (
              <div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setShowIncidents(true)}
                >
                  <MessageSquarePlus className="size-4" />
                  Registrar ocorrência
                </Button>
                <p className="mt-1 text-xs text-muted-foreground">
                  Clique apenas se houve alguma ocorrência na viagem.
                </p>
              </div>
            )}
          </div>
          <div className="sm:col-span-2">
            <p className="text-sm font-medium">Fotos do hodômetro</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Você pode digitar os KM acima, enviar as fotos ou fazer os dois.
            </p>
          </div>
          <PhotoField
            kind="inicio"
            label="Foto do KM de início"
            hint="Foto do painel antes de sair. Até 5 MB por imagem."
          />
          <PhotoField
            kind="fim"
            label="Foto do KM final"
            hint="Foto do painel na chegada. Até 5 MB por imagem."
          />
          {photoUrls.some((p) => kindOf(p.path) === "outras") && (
            <div className="space-y-2 sm:col-span-2">
              <Label>Outras fotos</Label>
              <div className="flex flex-wrap gap-2">
                {photoUrls
                  .filter((p) => kindOf(p.path) === "outras")
                  .map((p) => (
                    <div key={p.path} className="relative">
                      <a href={p.url} target="_blank" rel="noreferrer">
                        <img
                          src={p.url}
                          alt="Foto do diário de bordo"
                          className="h-20 w-20 rounded-md border border-border object-cover"
                        />
                      </a>
                      <button
                        type="button"
                        aria-label="Remover foto"
                        onClick={() => removePhoto(p.path)}
                        className="absolute -right-2 -top-2 rounded-full bg-destructive p-1 text-destructive-foreground"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  ))}
              </div>
            </div>
          )}
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
