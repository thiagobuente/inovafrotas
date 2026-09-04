/**
 * Integração com o Google Agenda (Google Calendar) através do gateway de
 * conectores da plataforma. Usa a agenda da conta institucional conectada
 * pelo gestor — cada reserva autorizada vira um evento na agenda da frota.
 */

const GATEWAY_URL = "https://connector-gateway.lovable.dev/google_calendar/calendar/v3";
const TIME_ZONE = "America/Sao_Paulo";

export type CalendarEventInput = {
  protocol: string;
  agenda: string;
  destination: string;
  pickupAt: string;
  returnAt: string;
  requesterEmail: string;
  vehicleLabel: string | null;
  driverLabel: string | null;
  passengers?: number | null;
  note?: string | null;
};

function credentials() {
  const lovableKey = process.env["LOVABLE_API_KEY"];
  const connectionKey = process.env["GOOGLE_CALENDAR_API_KEY"];
  if (!lovableKey || !connectionKey) return null;
  return { lovableKey, connectionKey };
}

export function calendarConfigured() {
  return credentials() !== null;
}

async function callGateway(path: string, init: { method: string; body?: unknown }) {
  const creds = credentials();
  if (!creds) throw new Error("Google Agenda não está conectado neste projeto.");

  const response = await fetch(`${GATEWAY_URL}${path}`, {
    method: init.method,
    headers: {
      Authorization: `Bearer ${creds.lovableKey}`,
      "X-Connection-Api-Key": creds.connectionKey,
      "Content-Type": "application/json",
    },
    body: init.body ? JSON.stringify(init.body) : undefined,
  });

  if (!response.ok) {
    const errorBody = await response.text();
    console.error(`Google Agenda falhou [${response.status}]: ${errorBody}`);
    throw new Error(`Google Agenda recusou a operação [${response.status}]: ${errorBody}`);
  }

  if (response.status === 204) return null;
  const text = await response.text();
  return text ? JSON.parse(text) : null;
}

function buildEvent(input: CalendarEventInput) {
  const lines = [
    `Protocolo: ${input.protocol}`,
    `Solicitante: ${input.requesterEmail}`,
    `Pauta: ${input.agenda}`,
    `Destino: ${input.destination}`,
    `Veículo: ${input.vehicleLabel ?? "a designar"}`,
    `Condutor: ${input.driverLabel ?? "a definir"}`,
  ];
  if (input.passengers != null) lines.push(`Passageiros: ${input.passengers}`);
  if (input.note) lines.push(`Observação: ${input.note}`);

  return {
    summary: `[SEIA] ${input.destination} — ${input.vehicleLabel ?? "veículo a designar"}`,
    description: lines.join("\n"),
    location: input.destination,
    start: { dateTime: new Date(input.pickupAt).toISOString(), timeZone: TIME_ZONE },
    end: { dateTime: new Date(input.returnAt).toISOString(), timeZone: TIME_ZONE },
  };
}

/** Cria (ou atualiza, quando já existe) o evento da reserva na agenda da frota. */
export async function upsertCalendarEvent(
  input: CalendarEventInput,
  existingEventId: string | null,
): Promise<{ eventId: string; htmlLink: string | null }> {
  const body = buildEvent(input);

  if (existingEventId) {
    try {
      const updated = await callGateway(
        `/calendars/primary/events/${encodeURIComponent(existingEventId)}`,
        { method: "PATCH", body },
      );
      return { eventId: updated.id, htmlLink: updated.htmlLink ?? null };
    } catch {
      // Evento apagado manualmente na agenda: cria um novo.
    }
  }

  const created = await callGateway("/calendars/primary/events", { method: "POST", body });
  return { eventId: created.id, htmlLink: created.htmlLink ?? null };
}

/** Remove o evento da agenda quando a reserva é recusada ou cancelada. */
export async function deleteCalendarEvent(eventId: string) {
  try {
    await callGateway(`/calendars/primary/events/${encodeURIComponent(eventId)}`, {
      method: "DELETE",
    });
    return true;
  } catch {
    return false;
  }
}
