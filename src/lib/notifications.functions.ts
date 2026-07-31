import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { NotificationEvent } from "@/lib/notifications/types";

function validate(input: NotificationEvent): NotificationEvent {
  if (!input?.type || !input.protocol || !input.requesterEmail) {
    throw new Error("Evento de notificação inválido.");
  }
  return input;
}

/** Ponto de entrada único usado por todo o sistema para notificar mudanças. */
export const sendNotification = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(validate)
  .handler(async ({ data }) => {
    const { notificationService } = await import("@/lib/notifications/service.server");
    const results = await notificationService.notify(data);
    return { results };
  });
