import { createFileRoute } from "@tanstack/react-router";

/**
 * Rotina automática de lembretes do SEIA (chamada de hora em hora pelo agendador
 * do banco). Protegida por uma chave interna guardada em automation_settings.
 */
export const Route = createFileRoute("/api/public/lembretes")({
  server: {
    handlers: {
      POST: async ({ request }) => run(request),
      GET: async ({ request }) => run(request),
    },
  },
});

async function run(request: Request) {
  const token = request.headers.get("x-seia-cron") ?? "";
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: config } = await supabaseAdmin
    .from("automation_settings")
    .select("cron_token")
    .maybeSingle();

  if (!config?.cron_token || token !== config.cron_token) {
    return new Response("Não autorizado", { status: 401 });
  }

  const { runReminders } = await import("@/lib/notifications/reminders.server");
  const summary = await runReminders();
  console.info("[lembretes]", JSON.stringify(summary));
  return Response.json(summary);
}
