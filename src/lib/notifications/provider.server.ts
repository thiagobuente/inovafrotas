import type { DeliveryResult, NotificationMessage, NotificationProvider } from "./types";

/**
 * Provedor de e-mail padrão da plataforma Lovable.
 * Não depende de domínio personalizado nem de registros DNS (TXT/NS/SPF/DKIM/DMARC).
 * Quando a entrega não é possível, a notificação fica PENDENTE no log —
 * nunca é descartada silenciosamente.
 */
class LovableEmailProvider implements NotificationProvider {
  readonly name = "lovable-email";

  isReady() {
    return Boolean(process.env.SEIA_EMAIL_FROM && process.env.LOVABLE_API_KEY);
  }

  async send(message: NotificationMessage): Promise<DeliveryResult> {
    const from = process.env.SEIA_EMAIL_FROM;
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!from || !apiKey) {
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
      await sendLovableEmail(
        {
          from,
          to: message.to,
          subject: message.subject,
          html: message.html,
          text: message.text,
        },
        { apiKey },
      );
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
