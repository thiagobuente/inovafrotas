import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser } from "../supabase";

export default defineTool({
  name: "cancel_request",
  title: "Cancelar solicitação",
  description: "Cancela uma solicitação de veículo pelo protocolo, informando o motivo.",
  inputSchema: {
    protocol: z.string().describe("Protocolo da solicitação (ex.: SEIA-2026-0001)."),
    reason: z.string().describe("Motivo do cancelamento."),
  },
  annotations: { readOnlyHint: false, destructiveHint: true, openWorldHint: false },
  handler: async ({ protocol, reason }, ctx) => {
    if (!ctx.isAuthenticated()) {
      return { content: [{ type: "text", text: "Não autenticado" }], isError: true };
    }
    const supabase = supabaseForUser(ctx);
    const { data, error } = await supabase
      .from("vehicle_requests")
      .update({
        status: "cancelled",
        decision_note: reason,
        assigned_vehicle_id: null,
        assigned_driver_id: null,
      })
      .eq("protocol", protocol)
      .select("id, protocol, status, decision_note")
      .maybeSingle();
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    if (!data) {
      return {
        content: [{ type: "text", text: `Solicitação ${protocol} não encontrada ou sem permissão.` }],
        isError: true,
      };
    }
    return {
      content: [{ type: "text", text: JSON.stringify(data) }],
      structuredContent: { request: data },
    };
  },
});
