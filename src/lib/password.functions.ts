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

const REGIONAIS = ["Curitiba", "Ponta Grossa", "Londrina", "Maringá", "Jacarezinho"];

function assertStrongPassword(value: unknown): string {
  const password = typeof value === "string" ? value : "";
  // Mesma regra simples das telas: 6+ caracteres (números ou letras).
  if (password.length < 6) throw new Error("A nova senha deve ter pelo menos 6 caracteres.");
  if (password.length > 72) throw new Error("A nova senha é longa demais (máximo 72 caracteres).");
  return password;
}

function normalizeRegional(value: unknown): string | null {
  const regional = typeof value === "string" ? value.trim() : "";
  if (!regional) return null;
  if (!REGIONAIS.includes(regional)) throw new Error("Selecione uma regional válida.");
  return regional;
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
    const { enforceRateLimit, clientIp } = await import("@/lib/security/rate-limit.server");
    // Freio contra abuso: 5 pedidos por e-mail e 15 por IP a cada 15 minutos.
    await enforceRateLimit("senha:email", data.email, 5, 900);
    await enforceRateLimit("senha:ip", clientIp(), 15, 900);
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
      .select("id, email, full_name, department, regional")
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
    const { enforceRateLimit } = await import("@/lib/security/rate-limit.server");
    await enforceRateLimit("senha:gestor", context.userId, 20, 900);

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

/** O gestor atualiza os dados cadastrais de uma conta institucional. */
export const managerUpdateAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: {
      id: string;
      full_name: string;
      department?: string | null;
      regional?: string | null;
      email?: string;
    }) => {
      const id = typeof input?.id === "string" ? input.id.trim() : "";
      if (!id) throw new Error("Conta inválida.");
      return {
        id,
        full_name: typeof input?.full_name === "string" ? input.full_name.trim() : "",
        department:
          typeof input?.department === "string" && input.department.trim() ? input.department.trim() : null,
        regional: normalizeRegional(input?.regional),
        email: input?.email ? normalizeEmail(input.email) : undefined,
      };
    },
  )
  .handler(async ({ data, context }) => {
    await requireManager(context as never);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    if (data.email) {
      const { error } = await supabaseAdmin.auth.admin.updateUserById(data.id, {
        email: data.email,
        email_confirm: true,
      });
      if (error) throw new Error(`Não foi possível atualizar o e-mail: ${error.message}`);
    }

    const { error: profileError } = await supabaseAdmin
      .from("profiles")
      .update({
        full_name: data.full_name,
        department: data.department,
        regional: data.regional,
        ...(data.email ? { email: data.email } : {}),
      })
      .eq("id", data.id);
    if (profileError) throw new Error(`Não foi possível atualizar o perfil: ${profileError.message}`);

    console.info(`[contas] gestor ${context.userId} atualizou a conta ${data.id}`);
    return { ok: true };
  });

/** O gestor exclui definitivamente uma conta institucional. */
export const managerDeleteAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string }) => {
    const id = typeof input?.id === "string" ? input.id.trim() : "";
    if (!id) throw new Error("Conta inválida.");
    return { id };
  })
  .handler(async ({ data, context }) => {
    await requireManager(context as never);
    if (data.id === context.userId) throw new Error("Você não pode excluir a sua própria conta.");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: hasRequests, error: requestError } = await supabaseAdmin
      .from("vehicle_requests")
      .select("id")
      .eq("requester_id", data.id)
      .limit(1);
    if (requestError) throw new Error(`Não foi possível verificar as solicitações: ${requestError.message}`);
    if (hasRequests && hasRequests.length > 0) {
      throw new Error(
        "Esta conta possui solicitações registradas e não pode ser excluída (histórico de auditoria).",
      );
    }

    const { error } = await supabaseAdmin.auth.admin.deleteUser(data.id);
    if (error) throw new Error(`Não foi possível excluir a conta: ${error.message}`);

    console.info(`[contas] gestor ${context.userId} excluiu a conta ${data.id}`);
    return { ok: true };
  });
