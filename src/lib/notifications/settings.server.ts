import type { EmailProviderId, EmailSettings } from "./types";

export const DEFAULT_EMAIL_SETTINGS: EmailSettings = {
  provider: "brevo",
  fromName: "SEIA — Frota Inova",
  fromEmail: "frotas.01@inova.pr.gov.br",
  replyTo: "frotas.01@inova.pr.gov.br",
  smtpHost: null,
  smtpPort: null,
  smtpUser: null,
  smtpEncryption: "tls",
  enabled: true,
};

/**
 * Configuração de envio administrada pelo gestor em /configuracoes-email.
 * Cai no padrão (e nas variáveis de ambiente) se a tabela ainda não tiver linha.
 */
export async function loadEmailSettings(): Promise<EmailSettings> {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin
      .from("email_settings")
      .select("*")
      .limit(1)
      .maybeSingle();
    if (error) {
      console.error("[notificacao:config] falha ao ler email_settings", error.message);
      return fromEnv();
    }
    if (!data) return fromEnv();
    return {
      provider: (data.provider as EmailProviderId) ?? "brevo",
      fromName: data.from_name || DEFAULT_EMAIL_SETTINGS.fromName,
      fromEmail: (data.from_email || DEFAULT_EMAIL_SETTINGS.fromEmail).trim().toLowerCase(),
      replyTo: data.reply_to?.trim().toLowerCase() || null,
      smtpHost: data.smtp_host,
      smtpPort: data.smtp_port,
      smtpUser: data.smtp_user,
      smtpEncryption: (data.smtp_encryption as EmailSettings["smtpEncryption"]) ?? "tls",
      enabled: data.enabled,
    };
  } catch (error) {
    console.error("[notificacao:config] erro inesperado ao carregar configuração", error);
    return fromEnv();
  }
}

/** Compatibilidade com a configuração antiga por variável de ambiente. */
function fromEnv(): EmailSettings {
  const raw = process.env.SEIA_EMAIL_FROM?.trim() || "";
  const match = raw.match(/^(.*)<(.+)>$/);
  const email = (match ? match[2] : raw).trim().toLowerCase();
  if (!email) return DEFAULT_EMAIL_SETTINGS;
  return {
    ...DEFAULT_EMAIL_SETTINGS,
    fromName: match?.[1]?.trim() || DEFAULT_EMAIL_SETTINGS.fromName,
    fromEmail: email,
  };
}
