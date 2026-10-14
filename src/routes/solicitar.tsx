import { useEffect, useState } from "react";
import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { AppHeader } from "@/components/AppHeader";
import { useSeiaAuth, isInstitutionalEmail, EMAIL_DOMAIN } from "@/lib/seia";
import { sendNotification } from "@/lib/notifications.functions";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { CheckCircle2 } from "lucide-react";
import { formatDateTime, brasiliaInputToISO } from "@/lib/seia";

export const Route = createFileRoute("/solicitar")({
  head: () => ({
    meta: [
      { title: "Nova solicitação de veículo — SEIA" },
      {
        name: "description",
        content:
          "Registre uma solicitação de veículo da frota informando pauta, destino, período e passageiros.",
      },
      { property: "og:title", content: "Nova solicitação de veículo — SEIA" },
      {
        property: "og:description",
        content: "Formulário de solicitação de veículo para servidores da Inova Paraná.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: SolicitarPage,
});

function SolicitarPage() {
  const auth = useSeiaAuth();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [needsDriver, setNeedsDriver] = useState(false);
  const [externalDriver, setExternalDriver] = useState("");
  const [confirmation, setConfirmation] = useState<{
    protocol: string;
    destination: string;
    pickupAt: string;
    returnAt: string;
  } | null>(null);
  const notify = useServerFn(sendNotification);

  useEffect(() => {
    if (auth.loading) return;
    if (!auth.user) navigate({ to: "/entrar", replace: true });
    else if (auth.isManager) navigate({ to: "/gestao", search: { status: "pending" }, replace: true });
    else if (auth.isDriver) navigate({ to: "/motorista", replace: true });
  }, [auth.loading, auth.user, auth.isManager, auth.isDriver, navigate]);

  const { data: vehicles } = useQuery({
    queryKey: ["vehicles-available"],
    enabled: Boolean(auth.user),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("vehicles")
        .select("id, plate, brand, model, capacity, status")
        .eq("status", "available")
        .order("plate");
      if (error) throw error;
      return data;
    },
  });

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const user = auth.user;
    if (!user?.email || !isInstitutionalEmail(user.email)) {
      toast.error(`Apenas contas ${EMAIL_DOMAIN} podem solicitar veículos.`);
      return;
    }
    const formEl = e.currentTarget;
    const form = new FormData(formEl);
    const pickup = String(form.get("pickup_at"));
    const ret = String(form.get("return_at"));
    if (new Date(ret) <= new Date(pickup)) {
      toast.error("O retorno deve ser posterior à saída.");
      return;
    }

    setBusy(true);
    const externalDriverName = needsDriver ? null : String(form.get("external_driver_name") || "").trim() || null;
    const { data: created, error } = await supabase
      .from("vehicle_requests")
      .insert({
      requester_id: user.id,
      requester_email: user.email.toLowerCase(),
      agenda: String(form.get("agenda")).trim(),
      destination: String(form.get("destination")).trim(),
      pickup_at: brasiliaInputToISO(pickup),
      return_at: brasiliaInputToISO(ret),
      passengers_count: Number(form.get("passengers_count") || 1),
      needs_driver: needsDriver,
      external_driver_name: externalDriverName,
        notes: String(form.get("notes") || "").trim() || null,
      })
      .select("protocol, requester_email, destination, agenda, pickup_at, return_at")
      .single();
    setBusy(false);

    if (error) {
      toast.error("Não foi possível registrar: " + error.message);
      return;
    }
    if (!created) return;

    // Mostra a confirmação na hora; o e-mail ao gestor segue em segundo plano.
    setConfirmation({
      protocol: created.protocol,
      destination: created.destination,
      pickupAt: created.pickup_at,
      returnAt: created.return_at,
    });
    formEl.reset();
    setNeedsDriver(false);
    setExternalDriver("");

    void notify({
      data: {
        type: "request_created",
        protocol: created.protocol,
        requesterEmail: created.requester_email,
        destination: created.destination,
        agenda: created.agenda,
        pickupAt: created.pickup_at,
        returnAt: created.return_at,
        status: "pending",
      },
    })
      .then(({ results }) => {
        const manager = results.find((r) => r.audience === "manager");
        if (manager && manager.status !== "sent") {
          toast.warning(
            "O e-mail ao gestor não foi entregue, mas ele já recebeu o aviso no mural do sistema.",
          );
        }
      })
      .catch(() => {
        toast.warning("Não foi possível notificar o gestor por e-mail agora; o aviso ficou no mural.");
      });
  }

  return (
    <div className="min-h-screen">
      <AppHeader auth={auth} />
      <main className="mx-auto max-w-3xl px-4 py-12">
        <h1 className="text-2xl font-semibold">Nova solicitação de veículo</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Sua solicitação segue para análise do gestor de frota.
          {vehicles ? ` ${vehicles.length} veículo(s) disponíveis hoje.` : ""}
        </p>

        <form onSubmit={handleSubmit} className="surface-panel mt-8 space-y-5 p-6">
          <div className="space-y-2">
            <Label htmlFor="agenda">Pauta / finalidade</Label>
            <Textarea id="agenda" name="agenda" required rows={3} maxLength={1000} />
          </div>

          <div className="space-y-2">
            <Label htmlFor="destination">Destino</Label>
            <Input id="destination" name="destination" required maxLength={255} />
          </div>

          <div className="grid gap-5 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="pickup_at">Saída</Label>
              <Input id="pickup_at" name="pickup_at" type="datetime-local" required />
              <p className="text-xs text-muted-foreground">Informe data e hora de saída prevista.</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="return_at">Retorno previsto</Label>
              <Input id="return_at" name="return_at" type="datetime-local" required />
              <p className="text-xs text-muted-foreground">Deve ser posterior à data de saída.</p>
            </div>
          </div>

          <div className="grid gap-5 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="passengers_count">Passageiros</Label>
              <Input
                id="passengers_count"
                name="passengers_count"
                type="number"
                min={1}
                max={60}
                defaultValue={1}
                required
              />
            </div>
            <div className="flex items-center justify-between rounded-lg border border-border px-4 py-3">
              <div>
                <Label htmlFor="needs_driver">Precisa de motorista</Label>
                <p className="text-xs text-muted-foreground">Condutor oficial designado</p>
              </div>
              <Switch id="needs_driver" checked={needsDriver} onCheckedChange={setNeedsDriver} />
            </div>
          </div>

          {!needsDriver && (
            <div className="space-y-2">
              <Label htmlFor="external_driver_name">Nome do condutor</Label>
              <Input
                id="external_driver_name"
                name="external_driver_name"
                placeholder="Informe quem irá conduzir o veículo"
                maxLength={255}
                value={externalDriver}
                onChange={(e) => setExternalDriver(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Obrigatório informar o nome do responsável pela condução quando não solicitar motorista oficial.
              </p>
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="notes">Observações</Label>
            <Textarea id="notes" name="notes" rows={2} maxLength={1000} />
          </div>

          <div className="flex flex-wrap gap-3 pt-2">
            <Button type="submit" disabled={busy}>
              Enviar solicitação
            </Button>
            <Button asChild type="button" variant="outline">
              <Link to="/painel">Voltar ao painel</Link>
            </Button>
          </div>
        </form>
      </main>

      <Dialog open={Boolean(confirmation)} onOpenChange={(open) => !open && setConfirmation(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <div className="mx-auto flex size-14 items-center justify-center rounded-full bg-primary/10 text-primary">
              <CheckCircle2 className="size-8" />
            </div>
            <DialogTitle className="mt-3 text-center text-xl">Solicitação enviada!</DialogTitle>
            <DialogDescription className="text-center text-base">
              Registramos seu pedido e o gestor de frota já foi avisado. Você receberá a resposta por
              e-mail e no mural de avisos.
            </DialogDescription>
          </DialogHeader>

          {confirmation && (
            <dl className="mt-2 space-y-2 rounded-lg border border-border bg-muted/40 p-4 text-sm">
              <div className="flex justify-between gap-4">
                <dt className="text-muted-foreground">Protocolo</dt>
                <dd className="font-semibold">{confirmation.protocol}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-muted-foreground">Destino</dt>
                <dd className="text-right font-medium">{confirmation.destination}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-muted-foreground">Saída</dt>
                <dd className="font-medium">{formatDateTime(confirmation.pickupAt)}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-muted-foreground">Retorno</dt>
                <dd className="font-medium">{formatDateTime(confirmation.returnAt)}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-muted-foreground">Situação</dt>
                <dd className="font-medium text-amber-600">Aguardando autorização</dd>
              </div>
            </dl>
          )}

          <DialogFooter className="mt-2 sm:justify-center">
            <Button
              onClick={() => {
                setConfirmation(null);
                navigate({ to: "/painel" });
              }}
            >
              Ver minhas solicitações
            </Button>
            <Button variant="outline" onClick={() => setConfirmation(null)}>
              Nova solicitação
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
