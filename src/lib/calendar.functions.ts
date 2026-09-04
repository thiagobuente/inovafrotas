import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type SyncInput = { requestId: string };

function validate(input: SyncInput): SyncInput {
  if (!input?.requestId) throw new Error("Solicitação inválida.");
  return input;
}

/**
 * Sincroniza uma reserva com o Google Agenda da frota.
 *
 * Segurança: somente o gestor de frota pode sincronizar, e todos os dados do
 * evento são relidos do banco com o cliente do próprio usuário (RLS) — nada
 * vindo do cliente é usado como verdade.
 */
export const syncRequestToCalendar = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(validate)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const { data: isManager, error: roleError } = await supabase.rpc("has_role", {
      _user_id: userId,
      _role: "manager",
    });
    if (roleError || !isManager) {
      throw new Error("Apenas o gestor de frota pode sincronizar a agenda.");
    }

    const { data: request, error } = await supabase
      .from("vehicle_requests")
      .select(
        "id, protocol, status, agenda, destination, pickup_at, return_at, requester_email, passengers_count, decision_note, calendar_event_id, external_driver_name, vehicles:assigned_vehicle_id (plate, brand, model), drivers:assigned_driver_id (full_name)",
      )
      .eq("id", data.requestId)
      .maybeSingle();

    if (error) throw new Error(`Não foi possível ler a solicitação: ${error.message}`);
    if (!request) throw new Error("Solicitação não encontrada.");

    const calendar = await import("@/lib/calendar.server");
    if (!calendar.calendarConfigured()) {
      return { synced: false, reason: "Google Agenda não conectado." as const };
    }

    if (request.status !== "approved") {
      if (request.calendar_event_id) {
        await calendar.deleteCalendarEvent(request.calendar_event_id);
        await supabase
          .from("vehicle_requests")
          .update({ calendar_event_id: null })
          .eq("id", request.id);
      }
      return { synced: true, removed: true } as const;
    }

    const vehicle = request.vehicles as { plate: string; brand: string; model: string } | null;
    const driver = request.drivers as { full_name: string } | null;

    const { eventId, htmlLink } = await calendar.upsertCalendarEvent(
      {
        protocol: request.protocol,
        agenda: request.agenda,
        destination: request.destination,
        pickupAt: request.pickup_at,
        returnAt: request.return_at,
        requesterEmail: request.requester_email,
        vehicleLabel: vehicle ? `${vehicle.brand} ${vehicle.model} · ${vehicle.plate}` : null,
        driverLabel: driver?.full_name ?? request.external_driver_name ?? null,
        passengers: request.passengers_count,
        note: request.decision_note,
      },
      request.calendar_event_id,
    );

    await supabase
      .from("vehicle_requests")
      .update({ calendar_event_id: eventId })
      .eq("id", request.id);

    return { synced: true, removed: false, eventId, htmlLink } as const;
  });

/** Informa à interface se o Google Agenda está conectado ao projeto. */
export const calendarStatus = createServerFn({ method: "GET" }).handler(async () => {
  const { calendarConfigured } = await import("@/lib/calendar.server");
  return { connected: calendarConfigured() };
});
