import { auth, defineMcp } from "@lovable.dev/mcp-js";
import listVehiclesTool from "./tools/list-vehicles";
import listRequestsTool from "./tools/list-requests";
import createRequestTool from "./tools/create-request";
import cancelRequestTool from "./tools/cancel-request";

const projectRef = import.meta.env['VITE_SUPABASE_PROJECT_ID'] ?? "project-ref-unset";

export default defineMcp({
  name: "gestor-de-veiculos-inova",
  title: "Gestor de Veículos Inova",
  version: "0.1.0",
  instructions:
    "Ferramentas do SEIA — gestão da frota institucional Inova. Permite consultar veículos, listar solicitações de viagem, criar novas solicitações e cancelar solicitações existentes. O acesso respeita o perfil do usuário conectado (solicitante ou gestor).",
  auth: auth.oauth.issuer({
    issuer: `https://${projectRef}.supabase.co/auth/v1`,
    acceptedAudiences: "authenticated",
  }),
  tools: [listVehiclesTool, listRequestsTool, createRequestTool, cancelRequestTool],
});
