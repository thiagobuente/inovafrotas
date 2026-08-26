import { Link, useRouterState, useNavigate } from "@tanstack/react-router";
import { CarFront, LogOut, Menu } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger, SheetTitle } from "@/components/ui/sheet";
import { NotificationBell } from "@/components/NotificationBell";
import { PwaInstallButton } from "@/components/PwaInstallButton";
import { ThemeToggle } from "@/components/ThemeToggle";
import { cn } from "@/lib/utils";
import type { SeiaAuth } from "@/lib/seia";

export function AppHeader({ auth }: { auth: SeiaAuth }) {
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  const links = [
    ...(auth.isManager
      ? []
      : [
          { to: "/painel", label: "Minhas solicitações" },
          { to: "/solicitar", label: "Nova solicitação" },
        ]),
    ...(auth.isManager
      ? [
          { to: "/gestao", label: "Autorizações" },
          { to: "/agenda", label: "Agenda" },
          { to: "/frota", label: "Frota" },
          { to: "/diarios", label: "Diários de bordo" },
          { to: "/notificacoes", label: "Notificações" },
          { to: "/configuracoes-email", label: "E-mail" },
          { to: "/usuarios", label: "Senhas" },
          { to: "/auditoria", label: "Auditoria" },
        ]
      : []),
  ];



  async function signOut() {
    await supabase.auth.signOut();
    navigate({ to: "/", replace: true });
  }

  return (
    <header className="border-b border-border bg-card">
      <div className="mx-auto flex h-16 max-w-6xl items-center gap-6 px-4">
        <Link to="/" className="flex items-center gap-2">
          <span className="flex size-9 items-center justify-center rounded-lg bg-gradient-brand text-primary-foreground">
            <CarFront className="size-5" />
          </span>
          <span className="font-display text-lg font-semibold">SEIA</span>
        </Link>

        {auth.user && (
          <>
            <nav className="hidden items-center gap-1 md:flex">
              {links.map((l) => (
                <Link
                  key={l.to}
                  to={l.to}
                  className={cn(
                    "rounded-md px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground",
                    pathname === l.to && "bg-secondary text-foreground",
                  )}
                >
                  {l.label}
                </Link>
              ))}
            </nav>

            <Sheet>
              <SheetTrigger asChild>
                <Button variant="outline" size="sm" className="md:hidden" aria-label="Abrir menu">
                  <Menu className="size-4" />
                </Button>
              </SheetTrigger>
              <SheetContent side="left" className="w-64">
                <SheetTitle className="sr-only">Menu de navegação</SheetTitle>
                <nav className="mt-6 flex flex-col gap-2">
                  {links.map((l) => (
                    <Link
                      key={l.to}
                      to={l.to}
                      className={cn(
                        "rounded-md px-3 py-2 text-sm font-medium transition-colors hover:bg-secondary",
                        pathname === l.to
                          ? "bg-secondary text-foreground"
                          : "text-muted-foreground",
                      )}
                    >
                      {l.label}
                    </Link>
                  ))}
                </nav>
              </SheetContent>
            </Sheet>
          </>
        )}

        <div className="ml-auto flex items-center gap-3">
          <ThemeToggle />
          <PwaInstallButton className="hidden sm:inline-flex" />
          {auth.user ? (
            <>
              <NotificationBell email={auth.user.email ?? ""} isManager={auth.isManager} />
              <div className="hidden text-right sm:block">
                <p className="text-sm font-medium leading-tight">{auth.user.email}</p>
                <p className="text-xs text-muted-foreground">
                  {auth.isManager ? "Gestor de frota" : "Solicitante"}
                </p>
              </div>
              <Button variant="outline" size="sm" onClick={signOut}>
                <LogOut className="size-4" />
                Sair
              </Button>
            </>
          ) : (
            <Button asChild size="sm">
              <Link to="/entrar">Acessar</Link>
            </Button>
          )}
        </div>
      </div>
    </header>
  );
}
