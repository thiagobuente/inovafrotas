import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { EmailSettings } from "@/lib/notifications/types";

type SaveInput = Omit<EmailSettings, "smtpPort"> & { smtpPort: number | null };

function assertEmail(value: string, field: string) {
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
    throw new Error(`${field} inválido: informe um endereço de e-mail válido.`);
  }
}

async function requireManager(context: { supabase: any; userId: string }) {
  const { data, error } = await context.supabase.rpc("has_role", {
    _user_id: context.userId,
    _role: "manager",
  });
  if (error) throw new Error(`Não foi possível validar o perfil: ${error.message}`);
  if (!data) throw new Error("Apenas o gestor de frota pode acessar as configurações de e-mail.");
}

async function loadGmailAccountEmail(): Promise<string | null> {
  const lovableKey = process.env.LOVABLE_API_KEY;
  const gmailKey = process.env.GOOGLE_MAIL_API_KEY;
  if (!lovableKey || !gmailKey) return null;
  try {
    const response = await fetch(
      "https://connector-gateway.lovable.dev/google_mail/gmail/v1/users/me/profile",
      {
        headers: {
          Authorization: `Bearer ${lovableKey}`,
          "X-Connection-Api-Key": gmailKey,
          Accept: "application/json",
        },
      },
    );
    if (!response.ok) return null;
    const profile = (await response.json()) as { emailAddress?: string };
    return profile.emailAddress?.trim().toLowerCase() ?? null;
  } catch (error) {
    console.warn(
      `[config-email] falha ao consultar perfil do Gmail: ${error instanceof Error ? error.message : String(error)}`,
    );
    return null;
  }
}

export const getEmailSettings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requireManager(context as never);
    const { loadEmailSettings } = await import("@/lib/notifications/settings.server");
    const { loadBrevoSenderCatalog } = await import("@/lib/notifications/brevo.server");
    const [settings, brevo, gmailAccount] = await Promise.all([
      loadEmailSettings(),
      loadBrevoSenderCatalog(),
      loadGmailAccountEmail(),
    ]);
    return {
      settings,
      brevo,
      gmailAccount,
      environment: {
        brevoConnected: Boolean(process.env.BREVO_API_KEY && process.env.LOVABLE_API_KEY),
        resendConfigured: Boolean(process.env.RESEND_API_KEY),
        gmailConnected: Boolean(process.env.GOOGLE_MAIL_API_KEY && process.env.LOVABLE_API_KEY),
      },
    };
  });

export const saveEmailSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: SaveInput) => {
    if (!input?.fromEmail || !input.fromName?.trim()) {
      throw new Error("Informe o nome e o e-mail do remetente.");
    }
    assertEmail(input.fromEmail.trim().toLowerCase(), "Remetente");
    if (input.replyTo) assertEmail(input.replyTo.trim().toLowerCase(), "Responder para");
    if (!["brevo", "resend", "smtp"].includes(input.provider)) {
      throw new Error("Provedor inválido.");
    }
    if (input.provider === "smtp" && !input.smtpHost?.trim()) {
      throw new Error("Informe o host SMTP.");
    }
    if (input.smtpPort !== null && (input.smtpPort < 1 || input.smtpPort > 65535)) {
      throw new Error("Porta SMTP inválida.");
    }
    return input;
  })
  .handler(async ({ data, context }) => {
    await requireManager(context as never);

    // O campo "De" precisa pertencer a um domínio autenticado na Brevo. Quando o
    // DKIM de inova.pr.gov.br for publicado, o próprio catálogo passa a aceitá-lo.
    if (data.provider === "brevo" && data.enabled) {
      const { loadBrevoSenderCatalog, validateBrevoFrom } = await import(
        "@/lib/notifications/brevo.server"
      );
      const catalog = await loadBrevoSenderCatalog();
      const problem = validateBrevoFrom(data.fromEmail, catalog);
      if (problem) throw new Error(problem);
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("email_settings").upsert(
      {
        id: true,
        provider: data.provider,
        from_name: data.fromName.trim(),
        from_email: data.fromEmail.trim().toLowerCase(),
        reply_to: data.replyTo?.trim().toLowerCase() || null,
        smtp_host: data.smtpHost?.trim() || null,
        smtp_port: data.smtpPort,
        smtp_user: data.smtpUser?.trim() || null,
        smtp_encryption: data.smtpEncryption,
        enabled: data.enabled,
        updated_by: context.userId,
      },
      { onConflict: "id" },
    );
    if (error) {
      console.error("[config-email] falha ao salvar", error.message);
      throw new Error(`Não foi possível salvar: ${error.message}`);
    }
    return { ok: true };
  });


export const sendTestEmail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { to: string }) => {
    const to = input?.to?.trim().toLowerCase() ?? "";
    assertEmail(to, "Destinatário do teste");
    return { to };
  })
  .handler(async ({ data, context }) => {
    await requireManager(context as never);
    const { notificationService } = await import("@/lib/notifications/service.server");
    const result = await notificationService.sendTest(data.to);
    return result;
  });
