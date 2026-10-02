/** Mascara e-mails para registros de diagnóstico (ex.: jo***@inova.pr.gov.br). */
export function maskEmail(value: string | null | undefined): string {
  const email = String(value ?? "");
  const at = email.indexOf("@");
  if (at < 1) return "***";
  return `${email.slice(0, Math.min(2, at))}***${email.slice(at)}`;
}
