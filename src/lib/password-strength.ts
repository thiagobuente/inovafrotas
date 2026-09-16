/**
 * Regra de senha do SEIA: mínimo 6 caracteres (números e/ou letras).
 * Compartilhada entre telas e servidor.
 */
export const PASSWORD_RULE_MESSAGE = "A senha deve ter pelo menos 6 caracteres (números ou letras).";

export function passwordStrengthError(password: string): string | null {
  if (typeof password !== "string" || password.length < 6) {
    return "A senha deve ter pelo menos 6 caracteres.";
  }
  if (password.length > 72) {
    return "A senha é longa demais (máximo 72 caracteres).";
  }
  return null;
}

export const REGIONAIS = [
  "Curitiba",
  "Ponta Grossa",
  "Londrina",
  "Maringá",
  "Jacarezinho",
] as const;

export type Regional = (typeof REGIONAIS)[number];
