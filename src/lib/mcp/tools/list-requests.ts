import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser } from "../supabase";

export default defineTool({
  name: "list_requests",
  title: "Listar solicitações",
  description:
    "Lista as solicitações de veículo visíveis para o usuário conectado (as próprias, ou todas se for gestor).",
  inputSchema: {
    status: z
      .string()
      .optional()
      .describe("Filtrar por status: pending, approved, rejected, cancelled ou completed."),
    limit: z.number().int().optional().describe("Quantidade máxima de registros (padrão 20)."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ status, limit }, ctx) => {
    if (!ctx.isAuthenticated()) {
      return { content: [{ type: "text", text: "Não autenticado" }], isError: true };
    }
    const max = Math.min(Math.max(limit ?? 20, 1), 100);
    const supabase = supabaseForUser(ctx);
    let query = supabase
      .from("vehicle_requests")
      .select(
        "id, protocol, status, requester_email, destination, agenda, pickup_at, return_at, passengers_count, needs_driver, decision_note, created_at",
      )
      .order("created_at", { ascending: false })
      .limit(max);
    if (status) query = query.eq("status", status as never);
    const { data, error } = await query;
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    return {
      content: [{ type: "text", text: JSON.stringify(data) }],
      structuredContent: { requests: data ?? [] },
    };
  },
});
