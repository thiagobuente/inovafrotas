import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser } from "../supabase";

export default defineTool({
  name: "list_vehicles",
  title: "Listar veículos",
  description: "Lista os veículos cadastrados na frota, com placa, modelo, capacidade e situação.",
  inputSchema: {
    status: z.string().optional().describe("Filtrar por situação do veículo (ex.: available)."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ status }, ctx) => {
    if (!ctx.isAuthenticated()) {
      return { content: [{ type: "text", text: "Não autenticado" }], isError: true };
    }
    const supabase = supabaseForUser(ctx);
    let query = supabase
      .from("vehicles")
      .select("id, plate, brand, model, vehicle_type, capacity, status")
      .order("plate");
    if (status) query = query.eq("status", status as never);
    const { data, error } = await query;
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    return {
      content: [{ type: "text", text: JSON.stringify(data) }],
      structuredContent: { vehicles: data ?? [] },
    };
  },
});
