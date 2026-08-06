import type { NotificationEvent, NotificationMessage } from "./types";
import { MANAGER_EMAIL } from "./types";

const STATUS_PT: Record<string, string> = {
  pending: "Aguardando autorização",
  approved: "Autorizada",
  rejected: "Recusada",
  cancelled: "Cancelada",
  completed: "Concluída",
};

function fmt(value?: string | null) {
  if (!value) return "—";
  const d = new Date(value);
  return Number.isNaN(d.getTime())
    ? value
    : d.toLocaleString("pt-BR", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function headline(event: NotificationEvent): string {
  switch (event.type) {
    case "request_created":
      return "Nova solicitação de veículo";
    case "request_approved":
      return "Solicitação autorizada";
    case "request_rejected":
      return "Solicitação recusada";
    case "request_cancelled":
      return "Solicitação cancelada";
    case "request_completed":
      return "Viagem concluída";
    default:
      return "Atualização de solicitação";
  }
}

function lines(event: NotificationEvent): [string, string][] {
  const rows: [string, string][] = [
    ["Protocolo", event.protocol],
    ["Solicitante", event.requesterEmail],
    ["Destino", event.destination],
  ];
  if (event.agenda) rows.push(["Pauta", event.agenda]);
  rows.push(["Saída", fmt(event.pickupAt)], ["Retorno", fmt(event.returnAt)]);
  if (event.vehicleLabel) rows.push(["Veículo", event.vehicleLabel]);
  if (event.driverLabel) rows.push(["Motorista", event.driverLabel]);
  if (event.status) rows.push(["Situação", STATUS_PT[event.status] ?? event.status]);
  if (event.note) rows.push(["Observação", event.note]);
  return rows;
}

/** Gera todas as mensagens (solicitante + gestor) de um evento. */
export function buildMessages(event: NotificationEvent): NotificationMessage[] {
  const title = headline(event);
  const rows = lines(event);
  const text = [`${title} — SEIA`, "", ...rows.map(([k, v]) => `${k}: ${v}`)].join("\n");
  const html = `<div style="font-family:system-ui,-apple-system,Segoe UI,sans-serif;color:#14202e">
  <h2 style="margin:0 0 12px">${escapeHtml(title)} — SEIA</h2>
  <table cellpadding="6" style="border-collapse:collapse;font-size:14px">
    ${rows
      .map(
        ([k, v]) =>
          `<tr><td style="color:#5b6b7c">${escapeHtml(k)}</td><td><strong>${escapeHtml(
            String(v),
          )}</strong></td></tr>`,
      )
      .join("")}
  </table>
  <p style="margin-top:16px;font-size:12px;color:#5b6b7c">Sistema Integrado de Agendamento — Inova Paraná</p>
</div>`;

  const subject = `[SEIA] ${title} · ${event.protocol}`;
  const recipients: NotificationMessage[] = [
    { to: event.requesterEmail, audience: "requester", subject, text, html },
  ];
  if (event.requesterEmail.toLowerCase() !== MANAGER_EMAIL) {
    recipients.push({ to: MANAGER_EMAIL, audience: "manager", subject, text, html });
  }
  return recipients;
}

/** Resumo em texto simples usado no mural de avisos dentro do sistema. */
export function buildInAppBody(event: NotificationEvent): string {
  return [headline(event), ...lines(event).map(([k, v]) => `${k}: ${v}`)].join("\n");
}
