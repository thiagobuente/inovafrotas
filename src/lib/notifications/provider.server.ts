import { maskEmail } from "./mask";
import type {
  DeliveryResult,
  EmailAttachment,
  EmailSettings,
  NotificationMessage,
  NotificationProvider,
} from "./types";

const GOOGLE_MAIL_GATEWAY = "https://connector-gateway.lovable.dev/google_mail";

const BREVO_GATEWAY = "https://connector-gateway.lovable.dev/brevo";
const RESEND_API = "https://api.resend.com/emails";

function fail(
  message: NotificationMessage,
  provider: string,
  reason: string,
  status: DeliveryResult["status"] = "failed",
  extra: Partial<DeliveryResult> = {},
): DeliveryResult {
  console.error(`[notificacao:${provider}:${status}] ${maskEmail(message.to)} — ${reason}`);
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
          ...(message.attachments?.length
            ? {
                attachment: message.attachments.map((a) => ({
                  name: a.filename,
                  content: a.contentBase64,
                })),
              }
            : {}),
        }),
      });
      const body = await response.text();
      const meta = {
        from: `${this.settings.fromName} <${this.settings.fromEmail}>`,
        replyTo: this.settings.replyTo ?? null,
        sentAt: new Date().toISOString(),
      };
      if (!response.ok) {
        return fail(
          message,
          this.name,
          `Brevo respondeu HTTP ${response.status}: ${body.slice(0, 500)}`,
          "failed",
          meta,
        );
      }
      let messageId: string | null = null;
      try {
        messageId = (JSON.parse(body || "{}") as { messageId?: string }).messageId ?? null;
      } catch {
        messageId = null;
      }
      console.info(
        `[notificacao:brevo:sent] destinatario=${maskEmail(message.to)} de=${meta.from} responder=${meta.replyTo ?? "-"} messageId=${messageId ?? "-"} em=${meta.sentAt}`,
      );
      return {
        to: message.to,
        audience: message.audience,
        status: "sent",
        provider: this.name,
        messageId,
        ...meta,
      };

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
          ...(message.attachments?.length
            ? {
                attachments: message.attachments.map((a) => ({
                  filename: a.filename,
                  content: a.contentBase64,
                })),
              }
            : {}),
        }),
      });
      const body = await response.text();
      const meta = {
        from: fromHeader(this.settings),
        replyTo: this.settings.replyTo ?? null,
        sentAt: new Date().toISOString(),
      };
      if (!response.ok) {
        return fail(
          message,
          this.name,
          `Resend respondeu HTTP ${response.status}: ${body.slice(0, 500)}`,
          "failed",
          meta,
        );
      }
      let messageId: string | null = null;
      try {
        messageId = (JSON.parse(body || "{}") as { id?: string }).id ?? null;
      } catch {
        messageId = null;
      }
      console.info(
        `[notificacao:resend:sent] destinatario=${maskEmail(message.to)} de=${meta.from} responder=${meta.replyTo ?? "-"} messageId=${messageId ?? "-"} em=${meta.sentAt}`,
      );
      return {
        to: message.to,
        audience: message.audience,
        status: "sent",
        provider: this.name,
        messageId,
        ...meta,
      };

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

/**
 * Gmail (API HTTPS) através do gateway de conectores da Lovable.
 * Não exige DNS próprio: o Google entrega a mensagem pelos servidores dele.
 * O remetente efetivo é sempre o e-mail da conta Gmail conectada.
 */
class GmailEmailProvider implements NotificationProvider {
  readonly name = "google_mail";
  constructor(private readonly settings: EmailSettings) {}

  isReady() {
    return Boolean(process.env.LOVABLE_API_KEY && process.env.GOOGLE_MAIL_API_KEY);
  }

  async send(message: NotificationMessage): Promise<DeliveryResult> {
    const lovableKey = process.env.LOVABLE_API_KEY;
    const gmailKey = process.env.GOOGLE_MAIL_API_KEY;
    if (!lovableKey) {
      return fail(message, this.name, "LOVABLE_API_KEY ausente no servidor.", "pending");
    }
    if (!gmailKey) {
      return fail(
        message,
        this.name,
        "Conexão Gmail não vinculada ao projeto (GOOGLE_MAIL_API_KEY ausente).",
        "pending",
      );
    }

    let accountEmail: string | null = null;
    try {
      const profileRes = await fetch(`${GOOGLE_MAIL_GATEWAY}/gmail/v1/users/me/profile`, {
        headers: {
          Authorization: `Bearer ${lovableKey}`,
          "X-Connection-Api-Key": gmailKey,
          Accept: "application/json",
        },
      });
      console.info(`[notificacao:gmail:profile] status=${profileRes.status}`);
      if (profileRes.ok) {
        const profile = (await profileRes.json()) as { emailAddress?: string };
        accountEmail = profile.emailAddress ?? null;
        console.info(`[notificacao:gmail:profile] email=${accountEmail}`);
      } else {
        const body = await profileRes.text();
        console.warn(`[notificacao:gmail:profile] falha ${profileRes.status}: ${body.slice(0, 300)}`);
      }
    } catch (error) {
      console.warn(
        `[notificacao:gmail] nao foi possivel consultar perfil: ${error instanceof Error ? error.message : String(error)}`,
      );
    }

    if (!accountEmail) {
      return fail(
        message,
        this.name,
        "Não foi possível identificar o e-mail da conta Gmail conectada.",
        "pending",
      );
    }

    const fromHeader = `${this.settings.fromName} <${accountEmail}>`;
    const raw = createRawEmail({
      from: fromHeader,
      to: message.to,
      replyTo: this.settings.replyTo ?? undefined,
      subject: message.subject,
      text: message.text,
      html: message.html,
      attachments: message.attachments,
    });

    try {
      const response = await fetch(`${GOOGLE_MAIL_GATEWAY}/gmail/v1/users/me/messages/send`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${lovableKey}`,
          "X-Connection-Api-Key": gmailKey,
        },
        body: JSON.stringify({ raw }),
      });
      const body = await response.text();
      const meta = {
        from: fromHeader,
        replyTo: this.settings.replyTo ?? null,
        sentAt: new Date().toISOString(),
      };
      if (!response.ok) {
        return fail(
          message,
          this.name,
          `Gmail respondeu HTTP ${response.status}: ${body.slice(0, 500)}`,
          "failed",
          meta,
        );
      }
      let messageId: string | null = null;
      try {
        messageId = (JSON.parse(body || "{}") as { id?: string }).id ?? null;
      } catch {
        messageId = null;
      }
      console.info(
        `[notificacao:gmail:sent] destinatario=${maskEmail(message.to)} de=${meta.from} responder=${meta.replyTo ?? "-"} messageId=${messageId ?? "-"} em=${meta.sentAt}`,
      );
      return {
        to: message.to,
        audience: message.audience,
        status: "sent",
        provider: this.name,
        messageId,
        ...meta,
      };
    } catch (error) {
      return fail(
        message,
        this.name,
        `Falha de rede ao chamar o Gmail: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}

/** Cabeçalhos só aceitam ASCII: acentos precisam do encoded-word (RFC 2047). */
function encodeHeaderText(value: string) {
  if (/^[\x20-\x7E]*$/.test(value)) return value;
  return `=?UTF-8?B?${Buffer.from(value, "utf8").toString("base64")}?=`;
}

/** Codifica "Nome Acentuado <email@dominio>" preservando o endereço. */
function encodeAddressHeader(value: string) {
  const match = value.match(/^\s*(.*?)\s*<([^>]+)>\s*$/);
  if (!match) return encodeHeaderText(value);
  const name = match[1]?.replace(/^"|"$/g, "") ?? "";
  const address = match[2];
  if (!name) return `<${address}>`;
  return `${encodeHeaderText(name)} <${address}>`;
}

function toBase64Body(value: string) {
  return (Buffer.from(value, "utf8").toString("base64").match(/.{1,76}/g) ?? []).join("\r\n");
}

function wrapBase64(value: string) {
  return (value.match(/.{1,76}/g) ?? []).join("\r\n");
}

function createRawEmail(options: {
  from: string;
  to: string;
  replyTo?: string;
  subject: string;
  text: string;
  html: string;
  attachments?: EmailAttachment[];
}) {
  const boundary = `----=_Part_${Math.random().toString(36).slice(2)}_${Date.now()}`;
  const mixed = `----=_Mix_${Math.random().toString(36).slice(2)}_${Date.now()}`;
  const hasFiles = Boolean(options.attachments?.length);
  const lines = [
    `From: ${encodeAddressHeader(options.from)}`,
    `To: ${encodeAddressHeader(options.to)}`,
    `Subject: ${encodeHeaderText(options.subject)}`,
  ];
  if (options.replyTo) lines.push(`Reply-To: ${encodeAddressHeader(options.replyTo)}`);
  lines.push("MIME-Version: 1.0");
  if (hasFiles) {
    lines.push(
      `Content-Type: multipart/mixed; boundary="${mixed}"`,
      "",
      `--${mixed}`,
      `Content-Type: multipart/alternative; boundary="${boundary}"`,
      "",
    );
  } else {
    lines.push(`Content-Type: multipart/alternative; boundary="${boundary}"`, "");
  }
  lines.push(
    `--${boundary}`,
    'Content-Type: text/plain; charset="UTF-8"',
    "Content-Transfer-Encoding: base64",
    "",
    toBase64Body(options.text),
    `--${boundary}`,
    'Content-Type: text/html; charset="UTF-8"',
    "Content-Transfer-Encoding: base64",
    "",
    toBase64Body(options.html),
    `--${boundary}--`,
  );
  if (hasFiles) {
    for (const file of options.attachments ?? []) {
      lines.push(
        `--${mixed}`,
        `Content-Type: ${file.contentType}; name="${file.filename}"`,
        "Content-Transfer-Encoding: base64",
        `Content-Disposition: attachment; filename="${file.filename}"`,
        "",
        wrapBase64(file.contentBase64),
      );
    }
    lines.push(`--${mixed}--`);
  }
  const rfc2822 = lines.join("\r\n");
  // base64url já remove '+' e '/' e o padding '='.
  return Buffer.from(rfc2822, "utf8").toString("base64url");
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
    case "google_mail":
      return new GmailEmailProvider(settings);
    default:
      return new BrevoEmailProvider(settings);
  }
}
