import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { NotificationEvent } from "@/lib/notifications/types";

function validate(input: NotificationEvent): NotificationEvent {
  if (!input?.type || !input.protocol || !input.requesterEmail) {
    throw new Error("Evento de notificação inválido.");
  }
  return input;
}

/**
 * Ponto de entrada único usado por todo o sistema para notificar mudanças.
 *
 * Segurança: o endpoint é chamável diretamente (RPC), então nada vindo do
 * cliente é usado como verdade. O protocolo é relido com o cliente do próprio
 * usuário (RLS), de modo que apenas o solicitante dono da reserva ou o gestor
 * conseguem disparar/visualizar dados daquela solicitação.
 */
export const sendNotification = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(validate)
  .handler(async ({ data, context }) => {
    const { supabase } = context;

    const { data: request, error } = await supabase
      .from("vehicle_requests")
      .select(
        "protocol, requester_email, destination, agenda, pickup_at, return_at, status, decision_note",
      )
      .eq("protocol", data.protocol)
      .maybeSingle();

    if (error) {
      throw new Error(`Não foi possível validar a solicitação: ${error.message}`);
    }
    if (!request) {
      // RLS não devolveu a linha: inexistente ou fora do escopo do usuário.
      throw new Error("Solicitação não encontrada ou sem permissão para notificar.");
    }

    // Campos sensíveis vêm sempre do banco, nunca do cliente.
    const event: NotificationEvent = {
      ...data,
      protocol: request.protocol,
      requesterEmail: request.requester_email,
      destination: request.destination,
      agenda: request.agenda,
      pickupAt: request.pickup_at,
      returnAt: request.return_at,
      status: request.status,
      note: data.note ?? request.decision_note ?? null,
    };

    const { notificationService } = await import("@/lib/notifications/service.server");
    const results = await notificationService.notify(event);
    return { results };
  });

/** Executa a rotina de lembretes sob demanda (somente gestor). */
export const runRemindersNow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: isManager, error } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "manager",
    });
    if (error || !isManager) {
      throw new Error("Apenas o gestor de frota pode executar os lembretes.");
    }
    const { runReminders } = await import("@/lib/notifications/reminders.server");
    return runReminders();
  });
