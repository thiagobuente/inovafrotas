import { buildMessages } from "./templates";
import { resolveProvider } from "./provider.server";
import type { DeliveryResult, NotificationEvent, NotificationProvider } from "./types";

export class NotificationService {
  constructor(private readonly provider: NotificationProvider = resolveProvider()) {}

  async notify(event: NotificationEvent): Promise<DeliveryResult[]> {
    const messages = buildMessages(event);
    const results: DeliveryResult[] = [];
    for (const message of messages) {
      const result = await this.provider.send(message);
      results.push(result);
      if (result.status !== "sent") {
        // Fica registrado no log do servidor até o domínio remetente existir.
        console.info(
          `[notificacao:${result.status}] ${event.type} ${event.protocol} -> ${message.to} (${result.reason ?? this.provider.name})`,
        );
      }
      await this.record(event, message.to, message.audience, message.subject, result);
    }
    return results;
  }

  /** Trilha de entregas consultável pelo gestor. Nunca derruba o fluxo principal. */
  private async record(
    event: NotificationEvent,
    recipient: string,
    audience: string,
    subject: string,
    result: DeliveryResult,
  ) {
    try {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      await supabaseAdmin.from("notification_logs").insert({
        event_type: event.type,
        protocol: event.protocol,
        requester_email: event.requesterEmail,
        recipient,
        audience,
        subject,
        status: result.status,
        provider: result.provider,
        reason: result.reason ?? null,
      });
    } catch (error) {
      console.error("[notificacao:log] falha ao registrar entrega", error);
    }
  }
}

export const notificationService = new NotificationService();
