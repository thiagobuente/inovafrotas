import { Link, useRouterState } from "@tanstack/react-router";
import {
  ClipboardList,
  PlusCircle,
  CarFront,
  CalendarDays,
  BookOpen,
  Bell,
  Settings,
  Users,
  FileText,
  BarChart3,
  Wrench,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { SeiaAuth } from "@/lib/seia";

export function MobileBottomNav({ auth }: { auth: SeiaAuth }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  if (!auth.user) return null;

  const requesterLinks = [
    { to: "/painel", label: "Minhas", icon: ClipboardList },
    { to: "/solicitar", label: "Nova", icon: PlusCircle },
    { to: "/notificacoes", label: "Avisos", icon: Bell },
  ];

  const driverLinks = [
    { to: "/motorista", label: "Diário", icon: BookOpen },
    { to: "/notificacoes", label: "Avisos", icon: Bell },
  ];

  const managerLinks = [
    { to: "/gestao", label: "Autorizar", icon: ClipboardList },
    { to: "/agenda", label: "Agenda", icon: CalendarDays },
    { to: "/frota", label: "Frota", icon: CarFront },
    { to: "/relatorios", label: "Relatórios", icon: BarChart3 },
    { to: "/manutencao", label: "Manutenção", icon: Wrench },
    { to: "/notificacoes", label: "Avisos", icon: Bell },
  ];

  const links = auth.isManager ? managerLinks : auth.isDriver ? driverLinks : requesterLinks;

  return (
    <nav
      className="mobile-bottom-nav fixed bottom-0 left-0 right-0 z-40 border-t border-border bg-card/95 backdrop-blur md:hidden"
      style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
      aria-label="Navegação principal"
    >
      <ul className="flex items-center justify-around px-1 py-2">
        {links.map((l) => {
          const active = pathname === l.to || pathname.startsWith(`${l.to}/`);
          const Icon = l.icon;
          return (
            <li key={l.to} className="flex-1">
              <Link
                to={l.to}
                className={cn(
                  "flex flex-col items-center justify-center gap-0.5 rounded-lg py-1.5 text-[11px] font-medium transition-colors",
                  active
                    ? "text-primary"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                <Icon className="size-5" strokeWidth={active ? 2.5 : 2} />
                <span>{l.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
