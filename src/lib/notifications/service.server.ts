import { buildInAppBody, buildMessages } from "./templates";
import { resolveProvider } from "./provider.server";
import { loadEmailSettings } from "./settings.server";
import type {
  DeliveryResult,
  EmailSettings,
  NotificationEvent,
  NotificationMessage,
} from "./types";

export class NotificationService {
  /** Dispara todas as mensagens de um evento e devolve o resultado real de cada envio. */
  async notify(event: NotificationEvent): Promise<DeliveryResult[]> {
    const settings = await loadEmailSettings();
    const provider = resolveProvider(settings);
    const messages = buildMessages(event);
    const results: DeliveryResult[] = [];

    console.info(
      `[notificacao] evento=${event.type} protocolo=${event.protocol} provedor=${provider.name} remetente=${settings.fromEmail} destinatarios=${messages.length}`,
    );

    for (const message of messages) {
      const startedAt = Date.now();
      let result: DeliveryResult;
      try {
        result = await provider.send(message);
      } catch (error) {
        const reason = error instanceof Error ? error.stack || error.message : String(error);
        console.error(`[notificacao:excecao] ${message.to} — ${reason}`);
        result = {
          to: message.to,
          audience: message.audience,
          status: "failed",
          provider: provider.name,
          reason: reason.slice(0, 500),
        };
      }
      console.info(
        `[notificacao:resultado] ${event.type} ${event.protocol} -> ${message.to} status=${result.status} provedor=${result.provider} de=${result.from ?? settings.fromEmail} responder=${result.replyTo ?? "-"} messageId=${result.messageId ?? "-"} ${Date.now() - startedAt}ms${result.reason ? ` motivo=${result.reason}` : ""}`,
      );

      results.push(result);
      await this.record(event, message, result);
    }
    return results;
  }

  /** Envio avulso de uma mensagem já montada (ex.: redefinição de senha). */
  async sendCustom(message: NotificationMessage): Promise<DeliveryResult> {
    const config = await loadEmailSettings();
    const provider = resolveProvider(config);
    let result: DeliveryResult;
    try {
      result = await provider.send(message);
    } catch (error) {
      const reason = error instanceof Error ? error.stack || error.message : String(error);
      console.error(`[notificacao:avulso:excecao] ${message.to} — ${reason}`);
      result = {
        to: message.to,
        audience: message.audience,
        status: "failed",
        provider: provider.name,
        reason: reason.slice(0, 500),
      };
    }
    console.info(
      `[notificacao:avulso] ${message.to} status=${result.status} provedor=${result.provider}${result.reason ? ` motivo=${result.reason}` : ""}`,
    );
    await this.log({
      event_type: "password_reset",
      protocol: "SENHA",
      requester_email: message.to,
      recipient: message.to,
      audience: message.audience,
      subject: message.subject,
      status: result.status,
      provider: result.provider,
      reason: result.reason ?? null,
      from_email: result.from ?? `${config.fromName} <${config.fromEmail}>`,
      reply_to: result.replyTo ?? config.replyTo ?? null,
      message_id: result.messageId ?? null,
    });
    return result;
  }

  /** Envio avulso (e-mail de teste da tela de configurações). */
  async sendTest(to: string, settings?: EmailSettings): Promise<DeliveryResult> {
    const config = settings ?? (await loadEmailSettings());
    const provider = resolveProvider(config);
    const message: NotificationMessage = {
      to,
      audience: "manager",
      subject: "[SEIA] E-mail de teste de configuração",
      text: `Este é um e-mail de teste do SEIA.\n\nProvedor: ${provider.name}\nRemetente: ${config.fromName} <${config.fromEmail}>\nEnviado em: ${new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}\n\nSe você recebeu esta mensagem, o envio de notificações está funcionando.`,
      html: `<div style="font-family:Arial,sans-serif;line-height:1.6"><h2>E-mail de teste do SEIA</h2><p>Se você recebeu esta mensagem, o envio de notificações está funcionando.</p><ul><li><strong>Provedor:</strong> ${provider.name}</li><li><strong>Remetente:</strong> ${config.fromName} &lt;${config.fromEmail}&gt;</li><li><strong>Enviado em:</strong> ${new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}</li></ul></div>`,
    };
    let result: DeliveryResult;
    try {
      result = await provider.send(message);
    } catch (error) {
      const reason = error instanceof Error ? error.stack || error.message : String(error);
      console.error(`[notificacao:teste:excecao] ${to} — ${reason}`);
      result = {
        to,
        audience: "manager",
        status: "failed",
        provider: provider.name,
        reason: reason.slice(0, 500),
      };
    }
    console.info(
      `[notificacao:teste] ${to} status=${result.status} provedor=${result.provider}${result.reason ? ` motivo=${result.reason}` : ""}`,
    );
    await this.log({
      event_type: "test_email",
      protocol: "TESTE",
      requester_email: to,
      recipient: to,
      audience: "manager",
      subject: message.subject,
      status: result.status,
      provider: result.provider,
      reason: result.reason ?? null,
      from_email: result.from ?? `${config.fromName} <${config.fromEmail}>`,
      reply_to: result.replyTo ?? config.replyTo ?? null,
      message_id: result.messageId ?? null,
    });

    return result;
  }

  /** Trilha de entregas consultável pelo gestor. Nunca derruba o fluxo principal. */
  private async record(
    event: NotificationEvent,
    message: NotificationMessage,
    result: DeliveryResult,
  ) {
    await this.log({
      event_type: event.type,
      protocol: event.protocol,
      requester_email: event.requesterEmail,
      recipient: message.to,
      audience: message.audience,
      subject: message.subject,
      status: result.status,
      provider: result.provider,
      reason: result.reason ?? null,
      from_email: result.from ?? null,
      reply_to: result.replyTo ?? null,
      message_id: result.messageId ?? null,
    });

    try {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      // Aviso dentro do sistema: chega mesmo quando o e-mail é barrado pelo
      // servidor de destino (política DMARC do domínio institucional).
      const { error } = await supabaseAdmin.from("user_notifications").insert({
        recipient_email: message.to,
        audience: message.audience,
        event_type: event.type,
        protocol: event.protocol,
        title: message.subject,
        body: buildInAppBody(event),
      });
      if (error) console.error("[notificacao:mural] falha ao gravar aviso", error.message);
    } catch (error) {
      console.error("[notificacao:mural] erro inesperado", error);
    }
  }

  private async log(row: Record<string, unknown>) {
    try {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { error } = await supabaseAdmin.from("notification_logs").insert(row as never);
      if (error) console.error("[notificacao:log] falha ao registrar entrega", error.message);
    } catch (error) {
      console.error("[notificacao:log] erro inesperado ao registrar entrega", error);
    }
  }
}

export const notificationService = new NotificationService();
