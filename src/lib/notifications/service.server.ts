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
    }
    return results;
  }
}

export const notificationService = new NotificationService();
