/**
 * Regra de senha forte do SEIA: mínimo 8 caracteres, com letra maiúscula,
 * letra minúscula, número e símbolo. Compartilhada entre telas e servidor.
 */
export const PASSWORD_RULE_MESSAGE =
  "A senha deve ter pelo menos 8 caracteres, com letra maiúscula, minúscula, número e símbolo (ex.: !@#$%).";

export function passwordStrengthError(password: string): string | null {
  if (typeof password !== "string" || password.length < 8) {
    return "A senha deve ter pelo menos 8 caracteres.";
  }
  if (password.length > 72) {
    return "A senha é longa demais (máximo 72 caracteres).";
  }
  if (!/[a-z]/.test(password)) return "A senha precisa de pelo menos uma letra minúscula.";
  if (!/[A-Z]/.test(password)) return "A senha precisa de pelo menos uma letra maiúscula.";
  if (!/[0-9]/.test(password)) return "A senha precisa de pelo menos um número.";
  if (!/[^A-Za-z0-9]/.test(password)) {
    return "A senha precisa de pelo menos um símbolo (ex.: !@#$%).";
  }
  return null;
}
