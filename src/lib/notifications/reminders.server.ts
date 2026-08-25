import type { NotificationEvent } from "./types";

type ReminderKind = "trip_upcoming" | "triplog_pending";

type ReminderSummary = {
  checkedAt: string;
  upcoming: number;
  pendingLogs: number;
  sent: { protocol: string; kind: ReminderKind }[];
  errors: string[];
};

const HOURS = 60 * 60 * 1000;

/**
 * Rotina de lembretes automáticos do SEIA.
 *
 * 1. Viagem próxima: avisa solicitante e gestor 24h antes da saída.
 * 2. Diário pendente: cobra o preenchimento do diário de bordo após o retorno.
 *
 * Cada lembrete é registrado em reminder_dispatches, então nunca é repetido.
 */
export async function runReminders(): Promise<ReminderSummary> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { notificationService } = await import("./service.server");

  const now = new Date();
  const summary: ReminderSummary = {
    checkedAt: now.toISOString(),
    upcoming: 0,
    pendingLogs: 0,
    sent: [],
    errors: [],
  };

  const { data: requests, error } = await supabaseAdmin
    .from("vehicle_requests")
    .select(
      "id, protocol, requester_email, destination, agenda, pickup_at, return_at, status, external_driver_name, vehicles:assigned_vehicle_id(plate, brand, model), drivers:assigned_driver_id(full_name)",
    )
    .eq("status", "approved")
    .gte("return_at", new Date(now.getTime() - 7 * 24 * HOURS).toISOString())
    .lte("pickup_at", new Date(now.getTime() + 48 * HOURS).toISOString());

  if (error) {
    summary.errors.push(`leitura de solicitações: ${error.message}`);
    return summary;
  }
  if (!requests?.length) return summary;

  const ids = requests.map((r) => r.id);

  const { data: dispatched } = await supabaseAdmin
    .from("reminder_dispatches")
    .select("request_id, kind")
    .in("request_id", ids);
  const already = new Set((dispatched ?? []).map((d) => `${d.request_id}:${d.kind}`));

  const { data: logs } = await supabaseAdmin
    .from("trip_logs")
    .select("request_id, return_km, departure_km")
    .in("request_id", ids);
  const logged = new Set(
    (logs ?? []).filter((l) => l.return_km != null || l.departure_km != null).map((l) => l.request_id),
  );

  for (const request of requests) {
    const pickup = new Date(request.pickup_at).getTime();
    const back = new Date(request.return_at).getTime();

    const vehicle = request.vehicles as { plate: string; brand: string; model: string } | null;
    const driver = request.drivers as { full_name: string } | null;

    const base: NotificationEvent = {
      type: "trip_reminder",
      protocol: request.protocol,
      requesterEmail: request.requester_email,
      destination: request.destination,
      agenda: request.agenda,
      pickupAt: request.pickup_at,
      returnAt: request.return_at,
      vehicleLabel: vehicle ? `${vehicle.brand} ${vehicle.model} · ${vehicle.plate}` : null,
      driverLabel: driver?.full_name ?? request.external_driver_name ?? null,
      status: request.status,
    };

    // 1) Saída nas próximas 24h
    const upcomingDue = pickup > now.getTime() && pickup - now.getTime() <= 24 * HOURS;
    if (upcomingDue && !already.has(`${request.id}:trip_upcoming`)) {
      summary.upcoming += 1;
      await dispatch(request.id, request.protocol, "trip_upcoming", {
        ...base,
        type: "trip_reminder",
        note: "Confira o veículo, o condutor e o horário de saída antes da viagem.",
      });
    }

    // 2) Retorno já ocorreu há mais de 2h e o diário continua vazio
    const logDue = back < now.getTime() - 2 * HOURS && !logged.has(request.id);
    if (logDue && !already.has(`${request.id}:triplog_pending`)) {
      summary.pendingLogs += 1;
      await dispatch(request.id, request.protocol, "triplog_pending", {
        ...base,
        type: "triplog_pending",
        note: "Registre KM de saída/retorno, fotos e ocorrências no diário de bordo.",
      });
    }
  }

  return summary;

  async function dispatch(
    requestId: string,
    protocol: string,
    kind: ReminderKind,
    event: NotificationEvent,
  ) {
    // Marca antes de enviar: evita duplicidade caso a rotina rode em paralelo.
    const { error: markError } = await supabaseAdmin
      .from("reminder_dispatches")
      .insert({ request_id: requestId, protocol, kind });
    if (markError) {
      if (!markError.message.includes("duplicate")) {
        summary.errors.push(`${protocol}/${kind}: ${markError.message}`);
      }
      return;
    }
    try {
      await notificationService.notify(event);
      summary.sent.push({ protocol, kind });
    } catch (err) {
      summary.errors.push(`${protocol}/${kind}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
}
