import { notificationService } from "./service.server";
import { MANAGER_EMAIL } from "./types";
import type { EmailAttachment, NotificationMessage } from "./types";

const BRAZIL_TZ = "America/Sao_Paulo";
const MAX_PHOTOS = 12;
const MAX_TOTAL_BYTES = 18 * 1024 * 1024;

function fmt(value?: string | null) {
  if (!value) return "—";
  const d = new Date(value);
  return Number.isNaN(d.getTime())
    ? value
    : d.toLocaleString("pt-BR", {
        timeZone: BRAZIL_TZ,
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

function contentTypeOf(path: string) {
  const ext = path.split(".").pop()?.toLowerCase() ?? "jpg";
  if (ext === "png") return "image/png";
  if (ext === "webp") return "image/webp";
  if (ext === "heic") return "image/heic";
  if (ext === "gif") return "image/gif";
  return "image/jpeg";
}

function photoLabel(path: string, index: number) {
  const name = path.split("/").pop() ?? `foto-${index + 1}`;
  const ext = name.split(".").pop()?.toLowerCase() ?? "jpg";
  if (name.startsWith("inicio-")) return `km-inicio-${index + 1}.${ext}`;
  if (name.startsWith("fim-")) return `km-fim-${index + 1}.${ext}`;
  return `foto-${index + 1}.${ext}`;
}

export type TripLogEmailData = {
  protocol: string;
  requesterEmail: string;
  agenda: string;
  destination: string;
  pickupAt: string;
  returnPlannedAt: string;
  vehicle: string | null;
  driver: string | null;
  departureAt: string | null;
  departureKm: number | null;
  returnAt: string | null;
  returnKm: number | null;
  incidents: string | null;
  photoPaths: string[];
};

/** Baixa as fotos do diário (bucket privado) e converte para anexos base64. */
async function loadPhotos(paths: string[]): Promise<{ files: EmailAttachment[]; skipped: number }> {
  if (!paths.length) return { files: [], skipped: 0 };
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const files: EmailAttachment[] = [];
  let total = 0;
  let skipped = 0;
  const selected = paths.slice(0, MAX_PHOTOS);
  skipped += paths.length - selected.length;

  for (let i = 0; i < selected.length; i++) {
    const path = selected[i];
    try {
      const { data, error } = await supabaseAdmin.storage.from("diario-bordo").download(path);
      if (error || !data) {
        skipped++;
        console.error(`[diario:anexo] falha ao baixar ${path}: ${error?.message ?? "sem conteúdo"}`);
        continue;
      }
      const buffer = Buffer.from(await data.arrayBuffer());
      if (total + buffer.byteLength > MAX_TOTAL_BYTES) {
        skipped++;
        continue;
      }
      total += buffer.byteLength;
      files.push({
        filename: photoLabel(path, i),
        contentType: contentTypeOf(path),
        contentBase64: buffer.toString("base64"),
      });
    } catch (error) {
      skipped++;
      console.error(`[diario:anexo] erro inesperado em ${path}`, error);
    }
  }
  return { files, skipped };
}

/** Envia ao gestor (com cópia ao solicitante) o diário de bordo completo + fotos. */
export async function sendTripLogEmail(data: TripLogEmailData) {
  const { files, skipped } = await loadPhotos(data.photoPaths);
  const totalKm =
    data.returnKm != null && data.departureKm != null ? data.returnKm - data.departureKm : null;

  const rows: [string, string][] = [
    ["Protocolo", data.protocol],
    ["Solicitante", data.requesterEmail],
    ["Pauta", data.agenda],
    ["Destino", data.destination],
    ["Período previsto", `${fmt(data.pickupAt)} até ${fmt(data.returnPlannedAt)}`],
    ["Veículo", data.vehicle ?? "—"],
    ["Condutor", data.driver ?? "—"],
    ["Saída registrada", fmt(data.departureAt)],
    ["KM na saída", data.departureKm != null ? String(data.departureKm) : "—"],
    ["Retorno registrado", fmt(data.returnAt)],
    ["KM no retorno", data.returnKm != null ? String(data.returnKm) : "—"],
    ["Total percorrido", totalKm != null ? `${totalKm} km` : "—"],
    ["Ocorrências", data.incidents?.trim() || "Sem ocorrências registradas."],
    [
      "Fotos anexadas",
      `${files.length}${skipped > 0 ? ` (${skipped} não anexada(s) por tamanho ou indisponibilidade)` : ""}`,
    ],
  ];

  const subject = `[SEIA] Diário de bordo preenchido · ${data.protocol}`;
  const text = [`Diário de bordo — SEIA`, "", ...rows.map(([k, v]) => `${k}: ${v}`)].join("\n");
  const html = `<div style="font-family:system-ui,-apple-system,Segoe UI,sans-serif;color:#14202e">
  <h2 style="margin:0 0 12px">Diário de bordo preenchido — SEIA</h2>
  <table cellpadding="6" style="border-collapse:collapse;font-size:14px">
    ${rows
      .map(
        ([k, v]) =>
          `<tr><td style="color:#5b6b7c;vertical-align:top">${escapeHtml(k)}</td><td><strong>${escapeHtml(
            String(v),
          )}</strong></td></tr>`,
      )
      .join("")}
  </table>
  <p style="margin-top:16px;font-size:12px;color:#5b6b7c">As fotos do hodômetro seguem em anexo.</p>
</div>`;

  const recipients = [MANAGER_EMAIL];
  if (data.requesterEmail.toLowerCase() !== MANAGER_EMAIL) recipients.push(data.requesterEmail);

  const results = [];
  for (const to of recipients) {
    const message: NotificationMessage = {
      to,
      audience: to === MANAGER_EMAIL ? "manager" : "requester",
      subject,
      text,
      html,
      attachments: files,
    };
    results.push(
      await notificationService.sendCustom(message, {
        eventType: "triplog_filled",
        protocol: data.protocol,
      }),
    );
  }
  return { results, attached: files.length, skipped };
}
