import { Link, useRouterState, useNavigate } from "@tanstack/react-router";
import {
  CarFront,
  LogOut,
  Menu,
  ClipboardList,
  PlusCircle,
  CalendarDays,
  BookOpen,
  Bell,
  Settings,
  Users,
  FileText,
  Home,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger, SheetTitle } from "@/components/ui/sheet";
import { NotificationBell } from "@/components/NotificationBell";
import { PwaInstallButton } from "@/components/PwaInstallButton";
import { ThemeToggle } from "@/components/ThemeToggle";
import { cn } from "@/lib/utils";
import type { SeiaAuth } from "@/lib/seia";

const managerLinks = [
  { to: "/gestao", label: "Autorizações", icon: ClipboardList },
  { to: "/agenda", label: "Agenda", icon: CalendarDays },
  { to: "/frota", label: "Frota", icon: CarFront },
  { to: "/diarios", label: "Diários de bordo", icon: BookOpen },
  { to: "/notificacoes", label: "Notificações", icon: Bell },
  { to: "/configuracoes-email", label: "E-mail", icon: Settings },
  { to: "/usuarios", label: "Senhas", icon: Users },
  { to: "/auditoria", label: "Auditoria", icon: FileText },
];

const requesterLinks = [
  { to: "/painel", label: "Minhas solicitações", icon: ClipboardList },
  { to: "/solicitar", label: "Nova solicitação", icon: PlusCircle },
];

export function AppHeader({ auth }: { auth: SeiaAuth }) {
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  const links = auth.isManager ? managerLinks : requesterLinks;

  async function signOut() {
    await supabase.auth.signOut();
    navigate({ to: "/", replace: true });
  }

  return (
    <header className="border-b border-border bg-card">
      <div className="mx-auto flex h-16 max-w-6xl items-center gap-3 px-4">
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
                <Button
                  variant="outline"
                  size="icon"
                  className="md:hidden"
                  aria-label="Abrir menu"
                >
                  <Menu className="size-5" />
                </Button>
              </SheetTrigger>
              <SheetContent side="left" className="w-72">
                <SheetTitle className="sr-only">Menu de navegação</SheetTitle>
                <div className="mt-6 flex flex-col gap-1">
                  <Link
                    to="/"
                    className={cn(
                      "flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium transition-colors hover:bg-secondary",
                      pathname === "/"
                        ? "bg-secondary text-foreground"
                        : "text-muted-foreground",
                    )}
                  >
                    <Home className="size-4" />
                    Início
                  </Link>
                  <div className="my-2 h-px bg-border" />
                  {links.map((l) => {
                    const Icon = l.icon;
                    return (
                      <Link
                        key={l.to}
                        to={l.to}
                        className={cn(
                          "flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium transition-colors hover:bg-secondary",
                          pathname === l.to
                            ? "bg-secondary text-foreground"
                            : "text-muted-foreground",
                        )}
                      >
                        <Icon className="size-4" />
                        {l.label}
                      </Link>
                    );
                  })}
                  <div className="my-2 h-px bg-border" />
                  <button
                    type="button"
                    onClick={signOut}
                    className="flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-left text-sm font-medium text-destructive transition-colors hover:bg-destructive/10"
                  >
                    <LogOut className="size-4" />
                    Sair da conta
                  </button>
                </div>
              </SheetContent>
            </Sheet>
          </>
        )}

        <div className="ml-auto flex items-center gap-2 sm:gap-3">
          <ThemeToggle />
          <PwaInstallButton className="hidden sm:inline-flex" />
          {auth.user ? (
            <>
              <NotificationBell email={auth.user.email ?? ""} isManager={auth.isManager} />
              <div className="hidden text-right md:block">
                <p className="max-w-[180px] truncate text-sm font-medium leading-tight">
                  {auth.user.email}
                </p>
                <p className="text-xs text-muted-foreground">
                  {auth.isManager ? "Gestor de frota" : "Solicitante"}
                </p>
              </div>
              <Button
                variant="outline"
                size="icon"
                className="md:hidden"
                onClick={signOut}
                aria-label="Sair"
              >
                <LogOut className="size-4" />
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={signOut}
                className="hidden md:inline-flex"
              >
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
