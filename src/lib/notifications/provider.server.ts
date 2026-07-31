import type { DeliveryResult, NotificationMessage, NotificationProvider } from "./types";

/**
 * Provedor da plataforma Lovable.
 * Só entrega quando um domínio remetente estiver configurado (SPF/DKIM/DMARC
 * verificados) e a variável SEIA_EMAIL_FROM apontar para o remetente
 * institucional, ex.: "SEIA <nao-responda@notificacoes.inova.pr.gov.br>".
 * Sem domínio, a notificação fica PENDENTE — nunca é descartada silenciosamente.
 */
class LovableEmailProvider implements NotificationProvider {
  readonly name = "lovable-email";

  isReady() {
    return Boolean(process.env.SEIA_EMAIL_FROM);
  }

  async send(message: NotificationMessage): Promise<DeliveryResult> {
    const from = process.env.SEIA_EMAIL_FROM;
    if (!from) {
      return {
        to: message.to,
        audience: message.audience,
        status: "pending",
        provider: this.name,
        reason: "Domínio remetente ainda não configurado.",
      };
    }
    try {
      const { sendLovableEmail } = await import("@lovable.dev/email-js");
      await sendLovableEmail({
        from,
        to: message.to,
        subject: message.subject,
        html: message.html,
        text: message.text,
      } as never);
      return { to: message.to, audience: message.audience, status: "sent", provider: this.name };
    } catch (error) {
      return {
        to: message.to,
        audience: message.audience,
        status: "failed",
        provider: this.name,
        reason: error instanceof Error ? error.message : String(error),
      };
    }
  }
}

/**
 * Ponto único de troca de provedor. Em outro ambiente (Hostinger, VPS, Manus,
 * SMTP Gmail) basta implementar NotificationProvider e retorná-lo aqui.
 */
export function resolveProvider(): NotificationProvider {
  return new LovableEmailProvider();
}
