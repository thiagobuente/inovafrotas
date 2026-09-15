import { getRequest } from "@tanstack/react-start/server";

/** IP do chamador, conforme informado pela borda de hospedagem. */
export function clientIp(): string {
  const request = getRequest();
  const forwarded = request?.headers.get("x-forwarded-for") ?? "";
  const ip =
    forwarded.split(",")[0]?.trim() ||
    request?.headers.get("cf-connecting-ip") ||
    request?.headers.get("x-real-ip") ||
    "desconhecido";
  return ip.slice(0, 64);
}

/**
 * Limite de tentativas persistido no banco (funciona mesmo com vários workers).
 * Retorna true quando a ação é permitida.
 */
export async function allowAction(
  scope: string,
  identifier: string,
  limit: number,
  windowSeconds: number,
): Promise<boolean> {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin.rpc("consume_rate_limit", {
      _key: `${scope}:${identifier}`.slice(0, 200),
      _limit: limit,
      _window_seconds: windowSeconds,
    });
    if (error) {
      console.error("[seguranca] falha no controle de tentativas", error.message);
      return true; // não bloquear usuários legítimos por falha de infraestrutura
    }
    return data !== false;
  } catch (error) {
    console.error("[seguranca] erro inesperado no controle de tentativas", error);
    return true;
  }
}

export class RateLimitError extends Error {
  constructor(message = "Muitas tentativas. Aguarde alguns minutos e tente novamente.") {
    super(message);
    this.name = "RateLimitError";
  }
}

/** Lança erro amigável quando o limite é excedido. */
export async function enforceRateLimit(
  scope: string,
  identifier: string,
  limit: number,
  windowSeconds: number,
): Promise<void> {
  const allowed = await allowAction(scope, identifier, limit, windowSeconds);
  if (!allowed) {
    console.warn(`[seguranca] limite excedido em ${scope} por ${identifier}`);
    throw new RateLimitError();
  }
}
