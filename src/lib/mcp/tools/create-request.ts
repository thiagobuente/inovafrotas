import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser } from "../supabase";

export default defineTool({
  name: "create_request",
  title: "Criar solicitação de veículo",
  description:
    "Cria uma nova solicitação de veículo para o usuário conectado. Datas em ISO 8601 (ex.: 2026-08-20T09:00).",
  inputSchema: {
    destination: z.string().describe("Destino da viagem."),
    agenda: z.string().describe("Motivo/agenda institucional da viagem."),
    pickup_at: z.string().describe("Data e hora de saída (ISO 8601)."),
    return_at: z.string().describe("Data e hora de retorno (ISO 8601)."),
    passengers_count: z.number().int().optional().describe("Número de passageiros (padrão 1)."),
    needs_driver: z.boolean().optional().describe("Se precisa de motorista (padrão true)."),
    notes: z.string().optional().describe("Observações adicionais."),
  },
  annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
  handler: async (input, ctx) => {
    if (!ctx.isAuthenticated()) {
      return { content: [{ type: "text", text: "Não autenticado" }], isError: true };
    }
    const userId = ctx.getUserId();
    const email = ctx.getUserEmail();
    if (!userId || !email) {
      return { content: [{ type: "text", text: "Token sem identidade do usuário" }], isError: true };
    }
    const supabase = supabaseForUser(ctx);
    const { data, error } = await supabase
      .from("vehicle_requests")
      .insert({
        requester_id: userId,
        requester_email: email.toLowerCase(),
        destination: input.destination,
        agenda: input.agenda,
        pickup_at: new Date(input.pickup_at).toISOString(),
        return_at: new Date(input.return_at).toISOString(),
        passengers_count: input.passengers_count ?? 1,
        needs_driver: input.needs_driver ?? true,
        notes: input.notes ?? null,
      })
      .select("id, protocol, status, pickup_at, return_at, destination")
      .single();
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    return {
      content: [{ type: "text", text: JSON.stringify(data) }],
      structuredContent: { request: data },
    };
  },
});
