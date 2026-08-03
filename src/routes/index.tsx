import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { CarFront, ShieldCheck, ClipboardList, MailCheck, BellRing } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AppHeader } from "@/components/AppHeader";
import { supabase } from "@/integrations/supabase/client";
import heroFleet from "@/assets/frota-hero.png";
import { useSeiaAuth, EMAIL_DOMAIN } from "@/lib/seia";

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

const steps = [
  {
    icon: MailCheck,
    title: "Acesso institucional",
    text: `Somente contas com e-mail ${EMAIL_DOMAIN} podem entrar no sistema.`,
  },
  {
    icon: ClipboardList,
    title: "Solicitação registrada",
    text: "Informe pauta, destino, período, passageiros e necessidade de motorista.",
  },
  {
    icon: ShieldCheck,
    title: "Autorização do gestor",
    text: "O gestor de frota analisa, designa o veículo e autoriza ou recusa com justificativa.",
  },
];

function Index() {
  const auth = useSeiaAuth();

  return (
    <div className="min-h-screen">
      <AppHeader auth={auth} />

      <main>
        <section className="bg-gradient-brand text-primary-foreground">
          <div className="mx-auto max-w-6xl px-4 py-20">
            <p className="text-sm font-medium uppercase tracking-[0.2em] opacity-80">
              Sistema Integrado de Agendamentos
            </p>
            <h1 className="mt-4 max-w-2xl text-4xl font-semibold leading-tight md:text-5xl">
              Solicite veículos da frota e receba a autorização do gestor
            </h1>
            <p className="mt-5 max-w-xl text-base opacity-90">
              Fluxo simples e rastreável: o servidor registra a demanda com o e-mail
              institucional e o gestor de frota autoriza, designando o veículo disponível.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
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
                  className="border-primary-foreground/40 bg-transparent text-primary-foreground hover:bg-primary-foreground/10"
                >
                  <Link to="/painel">Acompanhar solicitações</Link>
                </Button>
              )}
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-4 py-16">
          <h2 className="text-2xl font-semibold">Como funciona</h2>
          <div className="mt-8 grid gap-5 md:grid-cols-3">
            {steps.map((s) => (
              <article key={s.title} className="surface-panel p-6">
                <span className="flex size-10 items-center justify-center rounded-lg bg-accent/12 text-accent">
                  <s.icon className="size-5" />
                </span>
                <h3 className="mt-4 text-lg font-semibold">{s.title}</h3>
                <p className="mt-2 text-sm text-muted-foreground">{s.text}</p>
              </article>
            ))}
          </div>
        </section>
      </main>

      <footer className="border-t border-border py-8 text-center text-sm text-muted-foreground">
        SEIA — Gestão de frota institucional
      </footer>
    </div>
  );
}
