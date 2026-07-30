import { useEffect, useState } from "react";
import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { AppHeader } from "@/components/AppHeader";
import { useSeiaAuth, isInstitutionalEmail, EMAIL_DOMAIN } from "@/lib/seia";

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

  useEffect(() => {
    if (!auth.loading && !auth.user) navigate({ to: "/entrar", replace: true });
  }, [auth.loading, auth.user, navigate]);

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
    const form = new FormData(e.currentTarget);
    const pickup = String(form.get("pickup_at"));
    const ret = String(form.get("return_at"));
    if (new Date(ret) <= new Date(pickup)) {
      toast.error("O retorno deve ser posterior à saída.");
      return;
    }

    setBusy(true);
    const { error } = await supabase.from("vehicle_requests").insert({
      requester_id: user.id,
      requester_email: user.email.toLowerCase(),
      agenda: String(form.get("agenda")).trim(),
      destination: String(form.get("destination")).trim(),
      pickup_at: new Date(pickup).toISOString(),
      return_at: new Date(ret).toISOString(),
      passengers_count: Number(form.get("passengers_count") || 1),
      needs_driver: needsDriver,
      notes: String(form.get("notes") || "").trim() || null,
    });
    setBusy(false);

    if (error) {
      toast.error("Não foi possível registrar: " + error.message);
      return;
    }
    toast.success("Solicitação enviada para autorização do gestor.");
    navigate({ to: "/painel" });
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
            </div>
            <div className="space-y-2">
              <Label htmlFor="return_at">Retorno previsto</Label>
              <Input id="return_at" name="return_at" type="datetime-local" required />
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

          <div className="space-y-2">
            <Label htmlFor="notes">Observações</Label>
            <Textarea id="notes" name="notes" rows={2} maxLength={1000} />
          </div>

          <div className="flex flex-wrap gap-3 pt-2">
            <Button type="submit" disabled={busy}>
              Enviar solicitação
            </Button>
            <Button asChild type="button" variant="outline">
              <Link to="/painel">Cancelar</Link>
            </Button>
          </div>
        </form>
      </main>
    </div>
  );
}
