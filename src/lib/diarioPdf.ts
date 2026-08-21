import jsPDF from "jspdf";
import { supabase } from "@/integrations/supabase/client";
import { formatDateTime } from "@/lib/seia";

export type DiarioRecord = {
  id: string;
  request_id: string;
  departure_at: string | null;
  departure_km: number | null;
  return_at: string | null;
  return_km: number | null;
  incidents: string | null;
  photo_paths: string[];
  created_at: string;
  protocol: string;
  requester_email: string;
  agenda: string;
  destination: string;
  pickup_at: string;
  return_planned_at: string;
  vehicle: string | null;
  driver: string | null;
};

async function toDataUrl(url: string) {
  const res = await fetch(url);
  const blob = await res.blob();
  return await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

async function signedPhotos(paths: string[]) {
  if (!paths.length) return [] as string[];
  const { data, error } = await supabase.storage.from("diario-bordo").createSignedUrls(paths, 3600);
  if (error) return [];
  return (data ?? []).map((d) => d.signedUrl).filter((u): u is string => Boolean(u));
}

const MARGIN = 14;

function totalKm(r: DiarioRecord) {
  return r.return_km != null && r.departure_km != null ? r.return_km - r.departure_km : null;
}

async function renderRecord(doc: jsPDF, r: DiarioRecord, withPhotos: boolean) {
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  let y = MARGIN;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(15);
  doc.text("Diário de bordo — SEIA", MARGIN, y);
  y += 7;
  doc.setFontSize(11);
  doc.text(`Protocolo ${r.protocol}`, MARGIN, y);
  y += 8;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);

  const rows: Array<[string, string]> = [
    ["Solicitante", r.requester_email],
    ["Pauta", r.agenda],
    ["Destino", r.destination],
    ["Período previsto", `${formatDateTime(r.pickup_at)} até ${formatDateTime(r.return_planned_at)}`],
    ["Veículo", r.vehicle ?? "—"],
    ["Condutor", r.driver ?? "—"],
    ["Saída registrada", r.departure_at ? formatDateTime(r.departure_at) : "—"],
    ["KM na saída", r.departure_km != null ? String(r.departure_km) : "—"],
    ["Retorno registrado", r.return_at ? formatDateTime(r.return_at) : "—"],
    ["KM no retorno", r.return_km != null ? String(r.return_km) : "—"],
    ["Total percorrido", totalKm(r) != null ? `${totalKm(r)} km` : "—"],
    ["Fotos anexadas", String(r.photo_paths?.length ?? 0)],
  ];

  for (const [label, value] of rows) {
    const lines = doc.splitTextToSize(value || "—", pageWidth - MARGIN * 2 - 42);
    doc.setFont("helvetica", "bold");
    doc.text(`${label}:`, MARGIN, y);
    doc.setFont("helvetica", "normal");
    doc.text(lines, MARGIN + 42, y);
    y += Math.max(6, lines.length * 5.2);
    if (y > pageHeight - MARGIN) {
      doc.addPage();
      y = MARGIN;
    }
  }

  y += 3;
  doc.setFont("helvetica", "bold");
  doc.text("Ocorrências", MARGIN, y);
  y += 6;
  doc.setFont("helvetica", "normal");
  const inc = doc.splitTextToSize(
    r.incidents?.trim() || "Sem ocorrências registradas.",
    pageWidth - MARGIN * 2,
  );
  doc.text(inc, MARGIN, y);
  y += inc.length * 5.2 + 4;

  if (withPhotos && r.photo_paths?.length) {
    const urls = await signedPhotos(r.photo_paths);
    for (const url of urls) {
      try {
        const dataUrl = await toDataUrl(url);
        const img = doc.getImageProperties(dataUrl);
        const maxW = pageWidth - MARGIN * 2;
        const w = Math.min(maxW, 120);
        const h = (img.height / img.width) * w;
        if (y + h > pageHeight - MARGIN) {
          doc.addPage();
          y = MARGIN;
        }
        doc.addImage(dataUrl, MARGIN, y, w, h);
        y += h + 5;
      } catch {
        // ignore unreadable photo
      }
    }
  }

  doc.setFontSize(8);
  doc.setTextColor(120);
  doc.text(
    `Gerado em ${formatDateTime(new Date().toISOString())} — SEIA / Frota Inova`,
    MARGIN,
    pageHeight - 8,
  );
  doc.setTextColor(0);
  doc.setFontSize(10);
}

export async function downloadDiarioPdf(record: DiarioRecord, withPhotos = true) {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  await renderRecord(doc, record, withPhotos);
  doc.save(`diario-bordo-${record.protocol}.pdf`);
}

export async function downloadDiariosPdf(records: DiarioRecord[], withPhotos = false) {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  for (let i = 0; i < records.length; i++) {
    if (i > 0) doc.addPage();
    await renderRecord(doc, records[i], withPhotos);
  }
  doc.save(`diarios-de-bordo-${new Date().toISOString().slice(0, 10)}.pdf`);
}
