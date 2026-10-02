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
