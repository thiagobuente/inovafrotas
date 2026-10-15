import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Envia ao gestor (com cópia ao solicitante) o diário de bordo completo,
 * incluindo as fotos do hodômetro em anexo.
 *
 * Segurança: os dados são relidos com o cliente do próprio usuário (RLS),
 * então apenas o dono da reserva ou o gestor conseguem disparar o envio.
 */
export const emailTripLog = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { requestId: string }) => {
    if (!input?.requestId) throw new Error("Solicitação inválida.");
    return input;
  })
  .handler(async ({ data, context }) => {
    const { supabase } = context;

    const { data: log, error } = await supabase
      .from("trip_logs")
      .select(
        "departure_at, departure_km, return_at, return_km, incidents, photo_paths, vehicle_requests!inner(requester_id, protocol, requester_email, agenda, destination, pickup_at, return_at, external_driver_name, vehicles(plate, brand, model), drivers(full_name))",
      )
      .eq("request_id", data.requestId)
      .maybeSingle();

    if (error) throw new Error(`Não foi possível ler o diário: ${error.message}`);
    if (!log) throw new Error("Diário de bordo não encontrado ou sem permissão.");

    const request = log.vehicle_requests as unknown as {
      requester_id: string;
      protocol: string;
      requester_email: string;
      agenda: string;
      destination: string;
      pickup_at: string;
      return_at: string;
      external_driver_name: string | null;
      vehicles: { plate: string; brand: string; model: string } | null;
      drivers: { full_name: string } | null;
    };

    const { sendTripLogEmail } = await import("@/lib/notifications/triplog-email.server");
    return sendTripLogEmail({
      protocol: request.protocol,
      requesterEmail: request.requester_email,
      agenda: request.agenda,
      destination: request.destination,
      pickupAt: request.pickup_at,
      returnPlannedAt: request.return_at,
      vehicle: request.vehicles
        ? `${request.vehicles.brand} ${request.vehicles.model} · ${request.vehicles.plate}`
        : null,
      driver: request.drivers?.full_name ?? request.external_driver_name ?? null,
      departureAt: log.departure_at,
      departureKm: log.departure_km,
      returnAt: log.return_at,
      returnKm: log.return_km,
      incidents: log.incidents,
      // Só anexa fotos guardadas na pasta desta solicitação do próprio solicitante.
      photoPaths: (log.photo_paths ?? []).filter(
        (p: string) =>
          typeof p === "string" &&
          !p.includes("..") &&
          p.startsWith(`${request.requester_id}/${data.requestId}/`),
      ),
    });
  });

/** Envia ao gestor o diário do motorista (início ou conclusão) com as fotos. */
export const emailDriverLog = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { logId: string }) => {
    if (!input?.logId) throw new Error("Diário inválido.");
    return input;
  })
  .handler(async ({ data, context }) => {
    const { data: log, error } = await context.supabase
      .from("driver_trip_logs")
      .select("*, vehicles(plate, brand, model)")
      .eq("id", data.logId)
      .maybeSingle();
    if (error) throw new Error(`Não foi possível ler o diário: ${error.message}`);
    if (!log) throw new Error("Diário não encontrado ou sem permissão.");
    const v = log.vehicles as unknown as { plate: string; brand: string; model: string } | null;
    const closed = log.status === "closed";
    const { sendTripLogEmail } = await import("@/lib/notifications/triplog-email.server");
    return sendTripLogEmail({
      protocol: `Motorista ${closed ? "(concluído)" : "(saída)"} · ${v?.plate ?? ""}`,
      requesterEmail: log.driver_email,
      agenda: closed ? "Diário de bordo do motorista concluído" : "Motorista iniciou viagem",
      destination: log.destination ?? "—",
      pickupAt: log.departure_at ?? "",
      returnPlannedAt: log.return_at ?? "",
      vehicle: v ? `${v.brand} ${v.model} · ${v.plate}` : null,
      driver: log.driver_name || log.driver_email,
      departureAt: log.departure_at,
      departureKm: log.departure_km,
      returnAt: log.return_at,
      returnKm: log.return_km,
      incidents: log.incidents,
      photoPaths: (log.photo_paths ?? []).filter(
        (p: string) =>
          typeof p === "string" && !p.includes("..") && p.startsWith(`${log.driver_id}/motorista/${log.id}/`),
      ),
    });
  });
