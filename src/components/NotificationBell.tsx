import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { Bell, CheckCheck } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";

type Item = {
  id: string;
  title: string;
  body: string;
  protocol: string | null;
  event_type: string;
  read_at: string | null;
  created_at: string;
};

function fmt(value: string) {
  return new Date(value).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function NotificationBell({ email, isManager }: { email: string; isManager?: boolean }) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const { data } = useQuery({
    queryKey: ["user-notifications", email],
    refetchInterval: 30_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("user_notifications")
        .select("id, title, body, protocol, event_type, read_at, created_at")
        .order("created_at", { ascending: false })
        .limit(20);
      if (error) throw error;
      return (data ?? []) as Item[];
    },
  });

  const items = data ?? [];
  const unread = items.filter((i) => !i.read_at);

  async function markAllRead() {
    if (unread.length === 0) return;
    await supabase
      .from("user_notifications")
      .update({ read_at: new Date().toISOString() })
      .in(
        "id",
        unread.map((i) => i.id),
      );
    queryClient.invalidateQueries({ queryKey: ["user-notifications", email] });
  }

  async function openItem(item: Item) {
    if (!item.read_at) {
      await supabase
        .from("user_notifications")
        .update({ read_at: new Date().toISOString() })
        .eq("id", item.id);
      queryClient.invalidateQueries({ queryKey: ["user-notifications", email] });
    }
    if (isManager && item.event_type === "driver_trip_log") {
      navigate({ to: "/diarios-motoristas" });
      return;
    }
    navigate({
      to: isManager ? "/gestao" : "/painel",
      search: { status: "all", protocol: item.protocol ?? undefined },
    });
  }

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="relative" aria-label="Avisos">
          <Bell className="size-4" />
          {unread.length > 0 && (
            <span className="absolute -right-1 -top-1 flex size-5 items-center justify-center rounded-full bg-primary text-[10px] font-semibold text-primary-foreground">
              {unread.length > 9 ? "9+" : unread.length}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-96 p-0">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <p className="text-sm font-semibold">Avisos</p>
          <Button variant="ghost" size="sm" onClick={markAllRead} disabled={unread.length === 0}>
            <CheckCheck className="size-4" />
            Marcar lidos
          </Button>
        </div>
        <ScrollArea className="max-h-96">
          {items.length === 0 ? (
            <p className="px-4 py-6 text-sm text-muted-foreground">Nenhum aviso por enquanto.</p>
          ) : (
            <ul className="divide-y divide-border">
              {items.map((item) => (
                <li
                  key={item.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => openItem(item)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      openItem(item);
                    }
                  }}
                  className={cn(
                    "cursor-pointer px-4 py-3 transition-colors hover:bg-accent",
                    item.read_at ? "bg-background" : "bg-secondary/50",
                  )}
                >
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm font-medium leading-tight">{item.title}</p>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {fmt(item.created_at)}
                    </span>
                  </div>
                  <p className="mt-1 whitespace-pre-line text-xs text-muted-foreground">
                    {item.body}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}
