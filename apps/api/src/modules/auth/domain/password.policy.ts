/**
 * Politique de mots de passe : longueur ≥ 12, au moins une minuscule,
 * une majuscule et un chiffre. Les codes d'erreur sont des clés i18n
 * traduites côté client.
 */
export const PASSWORD_MIN_LENGTH = 12;
export const PASSWORD_MAX_LENGTH = 128;

export type PasswordPolicyError =
  | "password.too_short"
  | "password.too_long"
  | "password.missing_lowercase"
  | "password.missing_uppercase"
  | "password.missing_digit";

export function passwordPolicyErrors(password: string): PasswordPolicyError[] {
  const errors: PasswordPolicyError[] = [];
  if (password.length < PASSWORD_MIN_LENGTH) {
    errors.push("password.too_short");
  }
  if (password.length > PASSWORD_MAX_LENGTH) {
    errors.push("password.too_long");
  }
  if (!/[a-z]/.test(password)) {
    errors.push("password.missing_lowercase");
  }
  if (!/[A-Z]/.test(password)) {
    errors.push("password.missing_uppercase");
  }
  if (!/\d/.test(password)) {
    errors.push("password.missing_digit");
  }
  return errors;
}
