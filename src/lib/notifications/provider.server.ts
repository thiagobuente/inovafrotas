import type { DeliveryResult, NotificationMessage, NotificationProvider } from "./types";

const BREVO_GATEWAY = "https://connector-gateway.lovable.dev/brevo";

/**
 * Provedor Brevo via gateway de conectores da Lovable.
 * Não exige alteração de DNS: basta que o endereço remetente esteja verificado
 * na conta Brevo (confirmação por link enviado à própria caixa).
 * Remetente configurável em SEIA_EMAIL_FROM (ex.: "frotas.01@inova.pr.gov.br").
 */
class BrevoEmailProvider implements NotificationProvider {
  readonly name = "brevo";

  isReady() {
    return Boolean(process.env.LOVABLE_API_KEY && process.env.BREVO_API_KEY);
  }

  private sender() {
    // Remetente precisa estar verificado na conta Brevo.
    const raw = process.env.SEIA_EMAIL_FROM?.trim() || "";
    const match = raw.match(/^(.*)<(.+)>$/);
    const email = (match ? match[2] : raw).trim().toLowerCase();
    const verified = email.endsWith("@inova.pr.gov.br") && !email.includes("notify.");
    return {
      name: match?.[1]?.trim() || "SEIA — Frota Inova",
      email: verified ? email : "frotas.01@inova.pr.gov.br",
    };
  }


  async send(message: NotificationMessage): Promise<DeliveryResult> {
    const lovableKey = process.env.LOVABLE_API_KEY;
    const brevoKey = process.env.BREVO_API_KEY;
    if (!lovableKey || !brevoKey) {
      return {
        to: message.to,
        audience: message.audience,
        status: "pending",
        provider: this.name,
        reason: "Conexão Brevo ainda não vinculada ao projeto.",
      };
    }
    try {
      const response = await fetch(`${BREVO_GATEWAY}/smtp/email`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${lovableKey}`,
          "X-Connection-Api-Key": brevoKey,
        },
        body: JSON.stringify({
          sender: this.sender(),
          to: [{ email: message.to }],
          subject: message.subject,
          htmlContent: message.html,
          textContent: message.text,
        }),
      });
      if (!response.ok) {
        const body = await response.text();
        console.error(`[notificacao:brevo] falha [${response.status}]: ${body}`);
        return {
          to: message.to,
          audience: message.audience,
          status: "failed",
          provider: this.name,
          reason: `Brevo respondeu ${response.status}: ${body.slice(0, 300)}`,
        };
      }
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
 * Ponto único de troca de provedor. Em outro ambiente (VPS, SMTP próprio,
 * Manus...) basta implementar NotificationProvider e retorná-lo aqui.
 */
export function resolveProvider(): NotificationProvider {
  return new BrevoEmailProvider();
}
