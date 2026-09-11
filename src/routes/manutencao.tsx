import { useEffect, useMemo, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { AlertTriangle, Pencil, Plus, Trash2, Wrench } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { AppHeader } from "@/components/AppHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useSeiaAuth } from "@/lib/seia";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/manutencao")({
  head: () => ({
    meta: [
      { title: "Manutenção da frota — SEIA Gestor" },
      {
        name: "description",
        content:
          "Controle de revisões, troca de óleo e pneus dos veículos da frota SEIA, com alertas de manutenção vencida.",
      },
      { property: "og:title", content: "Manutenção da frota — SEIA Gestor" },
      {
        property: "og:description",
        content: "Registre serviços, defina o próximo vencimento e acompanhe alertas automáticos.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ManutencaoPage,
});

const TYPES = [
  { value: "revisao", label: "Revisão" },
  { value: "oleo", label: "Troca de óleo" },
  { value: "pneus", label: "Pneus" },
  { value: "freios", label: "Freios" },
  { value: "eletrica", label: "Elétrica" },
  { value: "funilaria", label: "Funilaria" },
  { value: "outro", label: "Outro" },
];

const typeLabel = (value: string) => TYPES.find((t) => t.value === value)?.label ?? value;

function formatDate(value: string | null) {
  if (!value) return "—";
  return new Date(`${value}T12:00:00-03:00`).toLocaleDateString("pt-BR", {
    timeZone: "America/Sao_Paulo",
  });
}

const emptyForm = {
  id: "",
  vehicle_id: "",
  maintenance_type: "revisao",
  description: "",
  workshop: "",
  performed_at: new Date().toISOString().slice(0, 10),
  performed_km: "",
  next_due_at: "",
  next_due_km: "",
  cost: "",
  notes: "",
};

function ManutencaoPage() {
  const auth = useSeiaAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [form, setForm] = useState(emptyForm);
  const [showForm, setShowForm] = useState(false);
  const [filterVehicle, setFilterVehicle] = useState("all");

  useEffect(() => {
    if (!auth.loading && !auth.user) navigate({ to: "/entrar", replace: true });
  }, [auth.loading, auth.user, navigate]);

  const enabled = Boolean(auth.user) && auth.isManager;

  const { data: vehicles } = useQuery({
    queryKey: ["vehicles-maintenance"],
    enabled,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("vehicles")
        .select("id, plate, brand, model")
        .order("plate");
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: records, isLoading } = useQuery({
    queryKey: ["maintenance-records"],
    enabled,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("maintenance_records")
        .select("*, vehicles:vehicle_id (plate, brand, model)")
        .order("performed_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const filtered = useMemo(
    () =>
      (records ?? []).filter((r) => filterVehicle === "all" || r.vehicle_id === filterVehicle),
    [records, filterVehicle],
  );

  const alerts = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    const soon = new Date();
    soon.setDate(soon.getDate() + 30);
    const soonIso = soon.toISOString().slice(0, 10);
    return (records ?? [])
      .filter((r) => r.next_due_at && r.next_due_at <= soonIso)
      .map((r) => ({ ...r, overdue: (r.next_due_at as string) < today }))
      .sort((a, b) => String(a.next_due_at).localeCompare(String(b.next_due_at)));
  }, [records]);

  const save = useMutation({
    mutationFn: async () => {
      if (!form.vehicle_id) throw new Error("Selecione o veículo.");
      if (!form.performed_at) throw new Error("Informe a data do serviço.");
      const payload = {
        vehicle_id: form.vehicle_id,
        maintenance_type: form.maintenance_type,
        description: form.description.trim() || null,
        workshop: form.workshop.trim() || null,
        performed_at: form.performed_at,
        performed_km: form.performed_km ? Number(form.performed_km) : null,
        next_due_at: form.next_due_at || null,
        next_due_km: form.next_due_km ? Number(form.next_due_km) : null,
        cost: form.cost ? Number(form.cost) : null,
        notes: form.notes.trim() || null,
      };
      if (form.id) {
        const { error } = await supabase
          .from("maintenance_records")
          .update(payload)
          .eq("id", form.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("maintenance_records")
          .insert({ ...payload, created_by: auth.user?.id ?? undefined });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success(form.id ? "Manutenção atualizada." : "Manutenção registrada.");
      setForm(emptyForm);
      setShowForm(false);
      queryClient.invalidateQueries({ queryKey: ["maintenance-records"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("maintenance_records").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Registro excluído.");
      queryClient.invalidateQueries({ queryKey: ["maintenance-records"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  function edit(record: any) {
    setForm({
      id: record.id,
      vehicle_id: record.vehicle_id,
      maintenance_type: record.maintenance_type,
      description: record.description ?? "",
      workshop: record.workshop ?? "",
      performed_at: record.performed_at,
      performed_km: record.performed_km != null ? String(record.performed_km) : "",
      next_due_at: record.next_due_at ?? "",
      next_due_km: record.next_due_km != null ? String(record.next_due_km) : "",
      cost: record.cost != null ? String(record.cost) : "",
      notes: record.notes ?? "",
    });
    setShowForm(true);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  if (!auth.loading && auth.user && !auth.isManager) {
    return (
      <div className="min-h-screen">
        <AppHeader auth={auth} />
        <main className="mx-auto max-w-xl px-4 py-24 text-center">
          <h1 className="text-2xl font-semibold">Acesso restrito</h1>
          <p className="mt-3 text-sm text-muted-foreground">
            Somente o gestor de frota pode registrar manutenções.
          </p>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <AppHeader auth={auth} />
      <main className="mx-auto max-w-5xl px-4 py-12 pb-nav">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold">Manutenção da frota</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Revisões, óleo, pneus e alertas de manutenção vencida.
            </p>
          </div>
          <Button
            onClick={() => {
              setForm(emptyForm);
              setShowForm((v) => !v);
            }}
          >
            <Plus className="mr-2 h-4 w-4" />
            {showForm ? "Fechar" : "Nova manutenção"}
          </Button>
        </div>

        {alerts.length > 0 && (
          <section className="surface-panel mt-6 border-warning/40 p-5">
            <h2 className="flex items-center gap-2 text-base font-semibold">
              <AlertTriangle className="size-4 text-warning" />
              Manutenções a vencer ou vencidas
            </h2>
            <ul className="mt-3 space-y-2 text-sm">
              {alerts.map((a: any) => (
                <li
                  key={a.id}
                  className={cn(
                    "rounded-md border px-3 py-2",
                    a.overdue
                      ? "border-destructive/40 bg-destructive/10 text-destructive"
                      : "border-warning/40 bg-warning/10",
                  )}
                >
                  <strong>
                    {a.vehicles
                      ? `${a.vehicles.brand} ${a.vehicles.model} · ${a.vehicles.plate}`
                      : "Veículo"}
                  </strong>{" "}
                  — {typeLabel(a.maintenance_type)} {a.overdue ? "vencida em" : "vence em"}{" "}
                  {formatDate(a.next_due_at)}
                  {a.next_due_km ? ` ou aos ${a.next_due_km} km` : ""}
                </li>
              ))}
            </ul>
          </section>
        )}

        {showForm && (
          <section className="surface-panel mt-6 p-5">
            <h2 className="text-base font-semibold">
              {form.id ? "Editar manutenção" : "Registrar manutenção"}
            </h2>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <div>
                <Label>Veículo</Label>
                <Select
                  value={form.vehicle_id}
                  onValueChange={(v) => setForm({ ...form, vehicle_id: v })}
                >
                  <SelectTrigger className="mt-1">
                    <SelectValue placeholder="Selecione o veículo" />
                  </SelectTrigger>
                  <SelectContent>
                    {(vehicles ?? []).map((v) => (
                      <SelectItem key={v.id} value={v.id}>
                        {v.brand} {v.model} · {v.plate}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Tipo de serviço</Label>
                <Select
                  value={form.maintenance_type}
                  onValueChange={(v) => setForm({ ...form, maintenance_type: v })}
                >
                  <SelectTrigger className="mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TYPES.map((t) => (
                      <SelectItem key={t.value} value={t.value}>
                        {t.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="performed_at">Data do serviço</Label>
                <Input
                  id="performed_at"
                  type="date"
                  className="mt-1"
                  value={form.performed_at}
                  onChange={(e) => setForm({ ...form, performed_at: e.target.value })}
                />
              </div>
              <div>
                <Label htmlFor="performed_km">KM no serviço</Label>
                <Input
                  id="performed_km"
                  type="number"
                  inputMode="numeric"
                  className="mt-1"
                  value={form.performed_km}
                  onChange={(e) => setForm({ ...form, performed_km: e.target.value })}
                />
              </div>
              <div>
                <Label htmlFor="next_due_at">Próxima manutenção (data)</Label>
                <Input
                  id="next_due_at"
                  type="date"
                  className="mt-1"
                  value={form.next_due_at}
                  onChange={(e) => setForm({ ...form, next_due_at: e.target.value })}
                />
              </div>
              <div>
                <Label htmlFor="next_due_km">Próxima manutenção (km)</Label>
                <Input
                  id="next_due_km"
                  type="number"
                  inputMode="numeric"
                  className="mt-1"
                  value={form.next_due_km}
                  onChange={(e) => setForm({ ...form, next_due_km: e.target.value })}
                />
              </div>
              <div>
                <Label htmlFor="workshop">Oficina</Label>
                <Input
                  id="workshop"
                  className="mt-1"
                  value={form.workshop}
                  onChange={(e) => setForm({ ...form, workshop: e.target.value })}
                />
              </div>
              <div>
                <Label htmlFor="cost">Custo (R$)</Label>
                <Input
                  id="cost"
                  type="number"
                  step="0.01"
                  inputMode="decimal"
                  className="mt-1"
                  value={form.cost}
                  onChange={(e) => setForm({ ...form, cost: e.target.value })}
                />
              </div>
              <div className="sm:col-span-2">
                <Label htmlFor="description">Descrição do serviço</Label>
                <Textarea
                  id="description"
                  className="mt-1"
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                />
              </div>
              <div className="sm:col-span-2">
                <Label htmlFor="notes">Observações</Label>
                <Textarea
                  id="notes"
                  className="mt-1"
                  value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                />
              </div>
            </div>
            <div className="mt-4 flex gap-2">
              <Button onClick={() => save.mutate()} disabled={save.isPending}>
                {save.isPending ? "Salvando..." : "Salvar"}
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  setForm(emptyForm);
                  setShowForm(false);
                }}
              >
                Cancelar
              </Button>
            </div>
          </section>
        )}

        <div className="mt-8 flex items-center gap-3">
          <Label className="text-sm">Filtrar por veículo</Label>
          <Select value={filterVehicle} onValueChange={setFilterVehicle}>
            <SelectTrigger className="w-64">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os veículos</SelectItem>
              {(vehicles ?? []).map((v) => (
                <SelectItem key={v.id} value={v.id}>
                  {v.brand} {v.model} · {v.plate}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="mt-4 space-y-3">
          {isLoading && <Skeleton className="h-32 w-full" />}
          {!isLoading && filtered.length === 0 && (
            <div className="surface-panel flex flex-col items-center p-10 text-center">
              <Wrench className="size-8 text-muted-foreground" />
              <p className="mt-3 text-sm text-muted-foreground">
                Nenhuma manutenção registrada para este filtro.
              </p>
            </div>
          )}
          {filtered.map((r: any) => (
            <article key={r.id} className="surface-panel p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h3 className="font-semibold">
                    {r.vehicles
                      ? `${r.vehicles.brand} ${r.vehicles.model} · ${r.vehicles.plate}`
                      : "Veículo removido"}
                  </h3>
                  <p className="text-sm text-muted-foreground">
                    {typeLabel(r.maintenance_type)} · {formatDate(r.performed_at)}
                    {r.performed_km != null ? ` · ${r.performed_km} km` : ""}
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={() => edit(r)}>
                    <Pencil className="mr-1 h-3.5 w-3.5" /> Editar
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-destructive"
                    onClick={() => {
                      if (confirm("Excluir este registro de manutenção?")) remove.mutate(r.id);
                    }}
                  >
                    <Trash2 className="mr-1 h-3.5 w-3.5" /> Excluir
                  </Button>
                </div>
              </div>
              <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
                {r.description && (
                  <div className="sm:col-span-2">
                    <dt className="text-muted-foreground">Serviço</dt>
                    <dd>{r.description}</dd>
                  </div>
                )}
                {r.workshop && (
                  <div>
                    <dt className="text-muted-foreground">Oficina</dt>
                    <dd>{r.workshop}</dd>
                  </div>
                )}
                {r.cost != null && (
                  <div>
                    <dt className="text-muted-foreground">Custo</dt>
                    <dd>
                      {Number(r.cost).toLocaleString("pt-BR", {
                        style: "currency",
                        currency: "BRL",
                      })}
                    </dd>
                  </div>
                )}
                {(r.next_due_at || r.next_due_km) && (
                  <div>
                    <dt className="text-muted-foreground">Próxima manutenção</dt>
                    <dd>
                      {formatDate(r.next_due_at)}
                      {r.next_due_km ? ` · ${r.next_due_km} km` : ""}
                    </dd>
                  </div>
                )}
                {r.notes && (
                  <div className="sm:col-span-2">
                    <dt className="text-muted-foreground">Observações</dt>
                    <dd>{r.notes}</dd>
                  </div>
                )}
              </dl>
            </article>
          ))}
        </div>
      </main>
    </div>
  );
}
