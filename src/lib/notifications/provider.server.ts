import type {
  DeliveryResult,
  EmailSettings,
  NotificationMessage,
  NotificationProvider,
} from "./types";

const BREVO_GATEWAY = "https://connector-gateway.lovable.dev/brevo";
const RESEND_API = "https://api.resend.com/emails";

function fail(
  message: NotificationMessage,
  provider: string,
  reason: string,
  status: DeliveryResult["status"] = "failed",
  extra: Partial<DeliveryResult> = {},
): DeliveryResult {
  console.error(`[notificacao:${provider}:${status}] ${message.to} — ${reason}`);
  return {
    to: message.to,
    audience: message.audience,
    status,
    provider,
    reason,
    sentAt: new Date().toISOString(),
    ...extra,
  };
}

function fromHeader(settings: EmailSettings) {
  return `${settings.fromName} <${settings.fromEmail}>`;
}


/**
 * Brevo (API HTTP) através do gateway de conectores da Lovable.
 * Não exige DNS próprio: basta o remetente estar verificado na conta Brevo.
 */
class BrevoEmailProvider implements NotificationProvider {
  readonly name = "brevo";
  constructor(private readonly settings: EmailSettings) {}

  isReady() {
    return Boolean(process.env.LOVABLE_API_KEY && process.env.BREVO_API_KEY);
  }

  async send(message: NotificationMessage): Promise<DeliveryResult> {
    const lovableKey = process.env.LOVABLE_API_KEY;
    const brevoKey = process.env.BREVO_API_KEY;
    if (!lovableKey) {
      return fail(message, this.name, "LOVABLE_API_KEY ausente no servidor.", "pending");
    }
    if (!brevoKey) {
      return fail(
        message,
        this.name,
        "Conexão Brevo não vinculada ao projeto (BREVO_API_KEY ausente).",
        "pending",
      );
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
          sender: { name: this.settings.fromName, email: this.settings.fromEmail },
          ...(this.settings.replyTo ? { replyTo: { email: this.settings.replyTo } } : {}),
          to: [{ email: message.to }],
          subject: message.subject,
          htmlContent: message.html,
          textContent: message.text,
        }),
      });
      const body = await response.text();
      if (!response.ok) {
        return fail(
          message,
          this.name,
          `Brevo respondeu HTTP ${response.status}: ${body.slice(0, 500)}`,
        );
      }
      console.info(`[notificacao:brevo:sent] ${message.to} — ${body.slice(0, 200)}`);
      return { to: message.to, audience: message.audience, status: "sent", provider: this.name };
    } catch (error) {
      return fail(
        message,
        this.name,
        `Falha de rede ao chamar a Brevo: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}

/** Resend (API HTTP). Requer o segredo RESEND_API_KEY e domínio verificado na Resend. */
class ResendEmailProvider implements NotificationProvider {
  readonly name = "resend";
  constructor(private readonly settings: EmailSettings) {}

  isReady() {
    return Boolean(process.env.RESEND_API_KEY);
  }

  async send(message: NotificationMessage): Promise<DeliveryResult> {
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
      return fail(
        message,
        this.name,
        "Segredo RESEND_API_KEY não configurado no servidor.",
        "pending",
      );
    }
    try {
      const response = await fetch(RESEND_API, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({
          from: fromHeader(this.settings),
          to: [message.to],
          ...(this.settings.replyTo ? { reply_to: this.settings.replyTo } : {}),
          subject: message.subject,
          html: message.html,
          text: message.text,
        }),
      });
      const body = await response.text();
      if (!response.ok) {
        return fail(
          message,
          this.name,
          `Resend respondeu HTTP ${response.status}: ${body.slice(0, 500)}`,
        );
      }
      console.info(`[notificacao:resend:sent] ${message.to} — ${body.slice(0, 200)}`);
      return { to: message.to, audience: message.audience, status: "sent", provider: this.name };
    } catch (error) {
      return fail(
        message,
        this.name,
        `Falha de rede ao chamar a Resend: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}

/**
 * SMTP direto (host/porta/usuário/senha). A hospedagem do SEIA roda em ambiente
 * serverless, que bloqueia conexões TCP nas portas 25/465/587 — por isso o envio
 * SMTP puro só funciona quando o sistema é publicado em servidor próprio/VPS.
 * Mantido aqui para portabilidade: a configuração fica salva e o erro é explícito.
 */
class SmtpEmailProvider implements NotificationProvider {
  readonly name = "smtp";
  constructor(private readonly settings: EmailSettings) {}

  isReady() {
    return false;
  }

  async send(message: NotificationMessage): Promise<DeliveryResult> {
    const target = `${this.settings.smtpHost ?? "(host não informado)"}:${this.settings.smtpPort ?? "?"}`;
    return fail(
      message,
      this.name,
      `Envio SMTP direto (${target}) não é possível nesta hospedagem: o ambiente serverless bloqueia as portas SMTP. Use o provedor Brevo ou Resend (envio por API HTTPS), ou publique o SEIA em servidor próprio.`,
    );
  }
}

/** Provedor desativado pelo gestor na tela de configurações. */
class DisabledProvider implements NotificationProvider {
  readonly name = "desativado";
  isReady() {
    return false;
  }
  async send(message: NotificationMessage): Promise<DeliveryResult> {
    return fail(
      message,
      this.name,
      "Envio de e-mail desativado nas configurações. O aviso ficou disponível apenas dentro do sistema.",
      "skipped",
    );
  }
}

/** Ponto único de troca de provedor, guiado pela configuração do gestor. */
export function resolveProvider(settings: EmailSettings): NotificationProvider {
  if (!settings.enabled) return new DisabledProvider();
  switch (settings.provider) {
    case "resend":
      return new ResendEmailProvider(settings);
    case "smtp":
      return new SmtpEmailProvider(settings);
    default:
      return new BrevoEmailProvider(settings);
  }
}
