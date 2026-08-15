import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const EMAIL_DOMAIN = "@inova.pr.gov.br";

function normalizeEmail(value: unknown): string {
  const email = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error("Informe um e-mail válido.");
  }
  if (!email.endsWith(EMAIL_DOMAIN)) {
    throw new Error(`Use um e-mail institucional terminado em ${EMAIL_DOMAIN}.`);
  }
  return email;
}

function assertStrongPassword(value: unknown): string {
  const password = typeof value === "string" ? value : "";
  if (password.length < 8) throw new Error("A nova senha deve ter pelo menos 8 caracteres.");
  if (password.length > 72) throw new Error("A nova senha é longa demais (máximo 72 caracteres).");
  return password;
}

function siteOrigin(): string {
  const request = getRequest();
  const origin =
    request?.headers.get("origin") ??
    (request?.headers.get("host") ? `https://${request.headers.get("host")}` : null);
  return origin ?? "https://inovafrotas.lovable.app";
}

async function requireManager(context: { supabase: any; userId: string }) {
  const { data, error } = await context.supabase.rpc("has_role", {
    _user_id: context.userId,
    _role: "manager",
  });
  if (error) throw new Error(`Não foi possível validar o perfil: ${error.message}`);
  if (!data) throw new Error("Apenas o gestor de frota pode redefinir senhas de usuários.");
}

/**
 * Envia o link de redefinição pelo provedor configurado (Gmail conectado),
 * em vez do e-mail padrão de autenticação, que não chega ao domínio institucional.
 * Resposta sempre genérica: não revela se a conta existe.
 */
export const requestPasswordReset = createServerFn({ method: "POST" })
  .inputValidator((input: { email: string }) => ({ email: normalizeEmail(input?.email) }))
  .handler(async ({ data }) => {
    const redirectTo = `${siteOrigin()}/redefinir-senha`;
    try {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { data: link, error } = await supabaseAdmin.auth.admin.generateLink({
        type: "recovery",
        email: data.email,
        options: { redirectTo },
      });
      if (error || !link?.properties?.action_link) {
        console.warn(`[senha] não foi possível gerar link para ${data.email}: ${error?.message}`);
        return { ok: true };
      }

      const url = link.properties.action_link;
      const { notificationService } = await import("@/lib/notifications/service.server");
      const result = await notificationService.sendCustom({
        to: data.email,
        audience: "requester",
        subject: "[SEIA] Redefinição de senha",
        text: `Você solicitou a redefinição da sua senha no SEIA.\n\nAbra o link abaixo para criar uma nova senha (válido por 1 hora):\n${url}\n\nSe você não fez esta solicitação, ignore este e-mail.`,
        html: `<div style="font-family:Arial,sans-serif;line-height:1.6"><h2>Redefinição de senha — SEIA</h2><p>Você solicitou a redefinição da sua senha.</p><p><a href="${url}" style="display:inline-block;padding:10px 18px;background:#1d4ed8;color:#fff;border-radius:6px;text-decoration:none">Criar nova senha</a></p><p style="font-size:12px;color:#555">O link é válido por 1 hora. Se você não fez esta solicitação, ignore este e-mail.</p></div>`,
      });
      return { ok: true, status: result.status, reason: result.reason ?? null };
    } catch (error) {
      console.error("[senha] falha inesperada ao enviar redefinição", error);
      return { ok: true };
    }
  });

/** Lista de contas institucionais para o gestor escolher quem terá a senha redefinida. */
export const listAccounts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requireManager(context as never);
    const { data, error } = await context.supabase
      .from("profiles")
      .select("id, email, full_name, department")
      .order("email");
    if (error) throw new Error(`Não foi possível listar as contas: ${error.message}`);
    return { accounts: data ?? [] };
  });

/** O gestor define diretamente uma nova senha para um usuário (sem depender de e-mail). */
export const managerResetPassword = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { email: string; password: string }) => ({
    email: normalizeEmail(input?.email),
    password: assertStrongPassword(input?.password),
  }))
  .handler(async ({ data, context }) => {
    await requireManager(context as never);

    // O alvo precisa existir como perfil institucional visível ao gestor (RLS).
    const { data: profile, error: profileError } = await context.supabase
      .from("profiles")
      .select("id, email")
      .eq("email", data.email)
      .maybeSingle();
    if (profileError) throw new Error(`Não foi possível localizar a conta: ${profileError.message}`);
    if (!profile) throw new Error("Conta não encontrada com este e-mail institucional.");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.auth.admin.updateUserById(profile.id, {
      password: data.password,
    });
    if (error) throw new Error(`Não foi possível redefinir a senha: ${error.message}`);

    console.info(`[senha] gestor ${context.userId} redefiniu a senha de ${data.email}`);
    return { ok: true, email: profile.email };
  });
