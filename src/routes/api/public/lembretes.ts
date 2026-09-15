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

function safeEquals(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function run(request: Request) {
  const token = request.headers.get("x-seia-cron") ?? "";
  const ip = (request.headers.get("x-forwarded-for") ?? "").split(",")[0]?.trim() || "desconhecido";

  const { allowAction } = await import("@/lib/security/rate-limit.server");
  if (!(await allowAction("lembretes:ip", ip, 30, 3600))) {
    return new Response("Muitas chamadas", { status: 429 });
  }

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: config } = await supabaseAdmin
    .from("automation_settings")
    .select("cron_token")
    .maybeSingle();

  if (!config?.cron_token || !safeEquals(token, config.cron_token)) {
    console.warn(`[lembretes] tentativa não autorizada de ${ip}`);
    return new Response("Não autorizado", { status: 401 });
  }

  const { runReminders } = await import("@/lib/notifications/reminders.server");
  const summary = await runReminders();
  console.info("[lembretes]", JSON.stringify(summary));
  return Response.json(summary);
}
