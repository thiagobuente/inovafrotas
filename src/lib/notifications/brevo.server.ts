const BREVO_GATEWAY = "https://connector-gateway.lovable.dev/brevo";

export type BrevoSenderOption = { email: string; name: string; active: boolean };
export type BrevoDomainOption = { domain: string; authenticated: boolean; verified: boolean };

export type BrevoSenderCatalog = {
  available: boolean;
  reason?: string;
  senders: BrevoSenderOption[];
  domains: BrevoDomainOption[];
};

async function brevoGet(path: string) {
  const lovableKey = process.env.LOVABLE_API_KEY;
  const brevoKey = process.env.BREVO_API_KEY;
  if (!lovableKey || !brevoKey) throw new Error("Conexão Brevo indisponível no servidor.");
  const response = await fetch(`${BREVO_GATEWAY}${path}`, {
    headers: {
      Authorization: `Bearer ${lovableKey}`,
      "X-Connection-Api-Key": brevoKey,
      Accept: "application/json",
    },
  });
  const body = await response.text();
  if (!response.ok) throw new Error(`Brevo HTTP ${response.status}: ${body.slice(0, 300)}`);
  return JSON.parse(body || "{}");
}

/** Remetentes e domínios realmente aceitos pela conta Brevo (fonte da verdade do campo "De"). */
export async function loadBrevoSenderCatalog(): Promise<BrevoSenderCatalog> {
  try {
    const [sendersRaw, domainsRaw] = await Promise.all([
      brevoGet("/senders"),
      brevoGet("/senders/domains"),
    ]);
    const senders: BrevoSenderOption[] = (sendersRaw?.senders ?? []).map((s: any) => ({
      email: String(s.email ?? "").toLowerCase(),
      name: String(s.name ?? "").trim(),
      active: Boolean(s.active),
    }));
    const domains: BrevoDomainOption[] = (domainsRaw?.domains ?? []).map((d: any) => ({
      domain: String(d.domain_name ?? "").toLowerCase(),
      authenticated: Boolean(d.authenticated),
      verified: Boolean(d.verified),
    }));
    return { available: true, senders, domains };
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    console.error("[notificacao:brevo:catalogo] falha ao consultar remetentes", reason);
    return { available: false, reason, senders: [], domains: [] };
  }
}

/**
 * Regra do campo "De": só passa endereço cujo domínio esteja AUTENTICADO (DKIM/DMARC)
 * na Brevo. Um remetente apenas "verificado" em domínio não autenticado é recusado
 * pelo servidor de destino — foi exatamente o caso de @inova.pr.gov.br.
 * Assim que o DKIM for publicado no DNS, o domínio passa a autenticado e volta a ser aceito.
 */
export function validateBrevoFrom(fromEmail: string, catalog: BrevoSenderCatalog): string | null {
  if (!catalog.available) return null; // não bloqueia se a Brevo estiver fora do ar
  const email = fromEmail.trim().toLowerCase();
  const domain = email.split("@")[1] ?? "";
  const domainEntry = catalog.domains.find((d) => d.domain === domain);
  if (domainEntry?.authenticated) return null;

  const known = catalog.domains.map((d) => `${d.domain}${d.authenticated ? "" : " (não autenticado)"}`);
  if (domainEntry) {
    return `O domínio "${domain}" está cadastrado na Brevo, mas ainda NÃO está autenticado (DKIM/DMARC). Enquanto isso, ele não pode ser usado como remetente: as mensagens são recusadas pelo servidor de destino. Use um endereço de domínio autenticado no campo "De" e mantenha ${email} em "Responder para".`;
  }
  return `O domínio "${domain}" não está cadastrado na Brevo. Cadastre e autentique o domínio na conta Brevo antes de usá-lo como remetente. Domínios conhecidos hoje: ${known.length ? known.join(", ") : "nenhum"}.`;
}
