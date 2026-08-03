import { useEffect, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AppHeader } from "@/components/AppHeader";
import { useSeiaAuth } from "@/lib/seia";

const DRIVER_STATUS: Record<string, string> = {
  available: "Disponível",
  unavailable: "Indisponível",
  vacation: "Férias/licença",
};

const VEHICLE_STATUS: Record<string, string> = {
  available: "Disponível",
  in_use: "Em uso",
  maintenance: "Manutenção",
  inactive: "Inativo",
};

type DriverForm = {
  full_name: string;
  license_number: string;
  license_category: string;
  phone: string;
};

type VehicleForm = {
  plate: string;
  brand: string;
  model: string;
  capacity: string;
  vehicle_type: string;
};

export const Route = createFileRoute("/frota")({
  head: () => ({
    meta: [
      { title: "Cadastro de frota e motoristas — SEIA" },
      {
        name: "description",
        content:
          "Cadastro institucional de veículos e motoristas disponíveis para as solicitações de viagem.",
      },
      { property: "og:title", content: "Cadastro de frota e motoristas — SEIA" },
      {
        property: "og:description",
        content: "Gerencie veículos, motoristas e a disponibilidade da frota.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: FrotaPage,
});

function FrotaPage() {
  const auth = useSeiaAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!auth.loading && !auth.user) navigate({ to: "/entrar", replace: true });
  }, [auth.loading, auth.user, navigate]);

  const enabled = Boolean(auth.user) && auth.isManager;

  const { data: drivers } = useQuery({
    queryKey: ["drivers"],
    enabled,
    queryFn: async () => {
      const { data, error } = await supabase.from("drivers").select("*").order("full_name");
      if (error) throw error;
      return data;
    },
  });

  const { data: vehicles } = useQuery({
    queryKey: ["vehicles-manage"],
    enabled,
    queryFn: async () => {
      const { data, error } = await supabase.from("vehicles").select("*").order("plate");
      if (error) throw error;
      return data;
    },
  });

  const [driver, setDriver] = useState({
    full_name: "",
    license_number: "",
    license_category: "B",
    phone: "",
  });
  const [vehicle, setVehicle] = useState({
    plate: "",
    brand: "",
    model: "",
    capacity: "5",
    vehicle_type: "car",
  });

  const addDriver = useMutation({
    mutationFn: async () => {
      if (!driver.full_name.trim() || !driver.license_number.trim())
        throw new Error("Informe nome e número da CNH.");
      const { error } = await supabase.from("drivers").insert({
        full_name: driver.full_name.trim(),
        license_number: driver.license_number.trim(),
        license_category: driver.license_category,
        phone: driver.phone.trim() || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Motorista cadastrado.");
      setDriver({ full_name: "", license_number: "", license_category: "B", phone: "" });
      queryClient.invalidateQueries({ queryKey: ["drivers"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const addVehicle = useMutation({
    mutationFn: async () => {
      if (!vehicle.plate.trim() || !vehicle.brand.trim() || !vehicle.model.trim())
        throw new Error("Informe placa, marca e modelo.");
      const { error } = await supabase.from("vehicles").insert({
        plate: vehicle.plate.trim().toUpperCase(),
        brand: vehicle.brand.trim(),
        model: vehicle.model.trim(),
        capacity: Number(vehicle.capacity) || 5,
        vehicle_type: vehicle.vehicle_type,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Veículo cadastrado.");
      setVehicle({ plate: "", brand: "", model: "", capacity: "5", vehicle_type: "car" });
      queryClient.invalidateQueries({ queryKey: ["vehicles-manage"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  async function updateDriverStatus(id: string, status: string) {
    const { error } = await supabase.from("drivers").update({ status }).eq("id", id);
    if (error) return toast.error(error.message);
    queryClient.invalidateQueries({ queryKey: ["drivers"] });
  }

  async function updateVehicleStatus(id: string, status: string) {
    const { error } = await supabase
      .from("vehicles")
      .update({ status: status as "available" | "in_use" | "maintenance" | "inactive" })
      .eq("id", id);
    if (error) return toast.error(error.message);
    queryClient.invalidateQueries({ queryKey: ["vehicles-manage"] });
  }

  async function saveDriver(id: string, values: DriverForm) {
    if (!values.full_name.trim() || !values.license_number.trim()) {
      toast.error("Informe nome e número da CNH.");
      return false;
    }
    const { error } = await supabase
      .from("drivers")
      .update({
        full_name: values.full_name.trim(),
        license_number: values.license_number.trim(),
        license_category: values.license_category,
        phone: values.phone.trim() || null,
      })
      .eq("id", id);
    if (error) {
      toast.error(error.message);
      return false;
    }
    toast.success("Motorista atualizado.");
    queryClient.invalidateQueries({ queryKey: ["drivers"] });
    return true;
  }

  async function removeDriver(id: string) {
    if (!window.confirm("Excluir este motorista definitivamente?")) return;
    const { error } = await supabase.from("drivers").delete().eq("id", id);
    if (error)
      return toast.error(
        "Não foi possível excluir: o motorista está vinculado a solicitações. Marque como indisponível.",
      );
    toast.success("Motorista excluído.");
    queryClient.invalidateQueries({ queryKey: ["drivers"] });
  }

  async function saveVehicle(id: string, values: VehicleForm) {
    if (!values.plate.trim() || !values.brand.trim() || !values.model.trim()) {
      toast.error("Informe placa, marca e modelo.");
      return false;
    }
    const { error } = await supabase
      .from("vehicles")
      .update({
        plate: values.plate.trim().toUpperCase(),
        brand: values.brand.trim(),
        model: values.model.trim(),
        capacity: Number(values.capacity) || 5,
      })
      .eq("id", id);
    if (error) {
      toast.error(error.message);
      return false;
    }
    toast.success("Veículo atualizado.");
    queryClient.invalidateQueries({ queryKey: ["vehicles-manage"] });
    return true;
  }

  async function removeVehicle(id: string) {
    if (!window.confirm("Excluir este veículo definitivamente?")) return;
    const { error } = await supabase.from("vehicles").delete().eq("id", id);
    if (error)
      return toast.error(
        "Não foi possível excluir: o veículo está vinculado a solicitações. Marque como inativo.",
      );
    toast.success("Veículo excluído.");
    queryClient.invalidateQueries({ queryKey: ["vehicles-manage"] });
  }

  if (!auth.loading && auth.user && !auth.isManager) {
    return (
      <div className="min-h-screen">
        <AppHeader auth={auth} />
        <main className="mx-auto max-w-xl px-4 py-24 text-center">
          <h1 className="text-2xl font-semibold">Acesso restrito</h1>
          <p className="mt-3 text-sm text-muted-foreground">
            O cadastro de frota e motoristas é exclusivo do gestor.
          </p>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <AppHeader auth={auth} />
      <main className="mx-auto max-w-5xl px-4 py-12">
        <h1 className="text-2xl font-semibold">Frota e motoristas</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Cadastro usado na designação de veículos e na escala de motoristas.
        </p>

        <Tabs defaultValue="drivers" className="mt-8">
          <TabsList>
            <TabsTrigger value="drivers">Motoristas</TabsTrigger>
            <TabsTrigger value="vehicles">Veículos</TabsTrigger>
          </TabsList>

          <TabsContent value="drivers" className="mt-6 space-y-6">
            <div className="surface-panel grid gap-4 p-6 sm:grid-cols-4">
              <div className="space-y-2 sm:col-span-2">
                <Label>Nome completo</Label>
                <Input
                  value={driver.full_name}
                  onChange={(e) => setDriver({ ...driver, full_name: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>CNH</Label>
                <Input
                  value={driver.license_number}
                  onChange={(e) => setDriver({ ...driver, license_number: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>Categoria</Label>
                <Select
                  value={driver.license_category}
                  onValueChange={(v) => setDriver({ ...driver, license_category: v })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {["A", "B", "C", "D", "E"].map((c) => (
                      <SelectItem key={c} value={c}>
                        {c}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label>Telefone</Label>
                <Input
                  value={driver.phone}
                  onChange={(e) => setDriver({ ...driver, phone: e.target.value })}
                  placeholder="(41) 99999-0000"
                />
              </div>
              <div className="flex items-end sm:col-span-2">
                <Button disabled={addDriver.isPending} onClick={() => addDriver.mutate()}>
                  Cadastrar motorista
                </Button>
              </div>
            </div>

            <div className="space-y-3">
              {drivers?.map((d) => (
                <DriverRow
                  key={d.id}
                  driver={d}
                  onStatus={(v) => updateDriverStatus(d.id, v)}
                  onSave={(values) => saveDriver(d.id, values)}
                  onDelete={() => removeDriver(d.id)}
                />
              ))}

              {drivers?.length === 0 && (
                <p className="text-sm text-muted-foreground">Nenhum motorista cadastrado.</p>
              )}
            </div>
          </TabsContent>

          <TabsContent value="vehicles" className="mt-6 space-y-6">
            <div className="surface-panel grid gap-4 p-6 sm:grid-cols-4">
              <div className="space-y-2">
                <Label>Placa</Label>
                <Input
                  value={vehicle.plate}
                  onChange={(e) => setVehicle({ ...vehicle, plate: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>Marca</Label>
                <Input
                  value={vehicle.brand}
                  onChange={(e) => setVehicle({ ...vehicle, brand: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>Modelo</Label>
                <Input
                  value={vehicle.model}
                  onChange={(e) => setVehicle({ ...vehicle, model: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>Lugares</Label>
                <Input
                  type="number"
                  min={1}
                  value={vehicle.capacity}
                  onChange={(e) => setVehicle({ ...vehicle, capacity: e.target.value })}
                />
              </div>
              <div className="flex items-end sm:col-span-2">
                <Button disabled={addVehicle.isPending} onClick={() => addVehicle.mutate()}>
                  Cadastrar veículo
                </Button>
              </div>
            </div>

            <div className="space-y-3">
              {vehicles?.map((v) => (
                <VehicleRow
                  key={v.id}
                  vehicle={v}
                  onStatus={(s) => updateVehicleStatus(v.id, s)}
                  onSave={(values) => saveVehicle(v.id, values)}
                  onDelete={() => removeVehicle(v.id)}
                />
              ))}

              {vehicles?.length === 0 && (
                <p className="text-sm text-muted-foreground">Nenhum veículo cadastrado.</p>
              )}
            </div>
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}
