import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { CarFront, ShieldCheck, ClipboardList, BellRing } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AppHeader } from "@/components/AppHeader";
import { supabase } from "@/integrations/supabase/client";
import heroFleet from "@/assets/frota-hero.png";
import { useSeiaAuth } from "@/lib/seia";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "SEIA — Solicitação de Veículos Institucionais" },
      {
        name: "description",
        content:
          "Solicite veículos da frota institucional com e-mail @inova.pr.gov.br e acompanhe a autorização do gestor de frota.",
      },
      { property: "og:title", content: "SEIA — Solicitação de Veículos Institucionais" },
      {
        property: "og:description",
        content:
          "Plataforma para solicitar veículos da frota e obter autorização do gestor responsável.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});


const VEHICLE_STATUS_LABELS: Record<string, string> = {
  available: "Disponível",
  in_use: "Em uso",
  maintenance: "Em manutenção",
  inactive: "Inativo",
};

function Index() {
  const auth = useSeiaAuth();

  const { data: vehicles } = useQuery({
    queryKey: ["hero-vehicles", auth.user?.id],
    enabled: Boolean(auth.user),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("vehicles")
        .select("id, plate, brand, model, capacity, status")
        .order("plate")
        .limit(5);
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: pendingCount } = useQuery({
    queryKey: ["pending-count", auth.user?.id],
    enabled: Boolean(auth.user) && !auth.isManager,
    queryFn: async () => {
      const { count, error } = await supabase
        .from("vehicle_requests")
        .select("id", { count: "exact", head: true })
        .eq("requester_id", auth.user!.id)
        .eq("status", "pending");
      if (error) throw error;
      return count ?? 0;
    },
  });


  return (
    <div className="min-h-screen">
      <AppHeader auth={auth} />

      <main>
        <section className="bg-gradient-brand text-primary-foreground">
          <div className="mx-auto grid max-w-6xl items-center gap-10 px-4 py-20 lg:grid-cols-[minmax(0,1fr)_minmax(0,0.9fr)]">
            <div className="min-w-0">
              <p className="text-sm font-medium uppercase tracking-[0.2em] opacity-80">
                Sistema de Agendamento de Veículos
              </p>
              <h1 className="mt-4 text-4xl font-semibold leading-tight md:text-5xl">
                Agendamento de Veículos SEIA
              </h1>

              {auth.user && typeof pendingCount === "number" && (
                <Link
                  to="/painel"
                  search={{ status: pendingCount > 0 ? "pending" : "all" }}
                  className="mt-7 inline-flex items-center gap-2 rounded-full border border-primary-foreground/30 bg-primary-foreground/10 px-4 py-2 text-sm font-medium underline-offset-4 transition-colors hover:bg-primary-foreground/25 hover:underline"
                >
                  <BellRing className="size-4 shrink-0" />
                  {pendingCount > 0
                    ? `Você tem ${pendingCount} ${pendingCount > 1 ? "solicitações" : "solicitação"} aguardando autorização`
                    : "Nenhuma solicitação pendente no momento"}
                </Link>
              )}

              <div className="mt-8 flex flex-wrap gap-3">
                {auth.isManager ? (
                  <Button asChild size="lg" variant="secondary">
                    <Link to="/gestao" search={{ status: "pending" }}>
                      <ShieldCheck className="size-5" />
                      Painel de autorizações
                    </Link>
                  </Button>
                ) : (
                  <>
                    <Button asChild size="lg" variant="secondary">
                      <Link to={auth.user ? "/solicitar" : "/entrar"}>
                        <CarFront className="size-5" />
                        {auth.user ? "Nova solicitação" : "Entrar com e-mail institucional"}
                      </Link>
                    </Button>
                    {auth.user && (
                      <Button
                        asChild
                        size="lg"
                        variant="outline"
                        className="border-2 border-primary-foreground/70 bg-primary-foreground/10 text-primary-foreground hover:bg-primary-foreground/25 hover:text-primary-foreground"
                      >
                        <Link to="/painel" search={{ status: "all" }}>
                          <ClipboardList className="size-5" />
                          Acompanhar solicitações
                        </Link>
                      </Button>
                    )}
                  </>
                )}
              </div>

              {!auth.isManager && (
                <p className="mt-5 text-sm opacity-80">
                  <Link
                    to="/entrar"
                    className="inline-flex items-center gap-2 underline underline-offset-4 hover:opacity-100"
                  >
                    <ShieldCheck className="size-4" />
                    Acesso do Gestor · Painel de Aprovações
                  </Link>
                </p>
              )}
            </div>

            <div className="hidden lg:block">
              {vehicles && vehicles.length > 0 ? (
                <div className="rounded-2xl border border-primary-foreground/25 bg-primary-foreground/10 p-5 backdrop-blur">
                  <p className="text-sm font-medium uppercase tracking-[0.15em] opacity-80">
                    Frota cadastrada
                  </p>
                  <ul className="mt-4 space-y-3">
                    {vehicles.map((v) => (
                      <li
                        key={v.id}
                        className="flex items-center gap-3 rounded-xl border border-primary-foreground/20 bg-primary-foreground/10 px-4 py-3"
                      >
                        <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary-foreground/20">
                          <CarFront className="size-5" />
                        </span>
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold">
                            {v.brand} {v.model}
                          </p>
                          <p className="text-xs opacity-80">
                            Placa {v.plate} · {v.capacity} lugares ·{" "}
                            {VEHICLE_STATUS_LABELS[v.status] ?? v.status}
                          </p>
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : (
                <img
                  src={heroFleet}
                  alt="Ilustração da frota institucional de veículos do SEIA"
                  width={1024}
                  height={768}
                  className="w-full drop-shadow-2xl"
                />
              )}
            </div>

          </div>
        </section>


      </main>

      <footer className="border-t border-border py-8 text-center text-sm text-muted-foreground">
        SEIA — Gestão de frota
      </footer>
    </div>
  );
}
