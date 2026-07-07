/**
 * TOTP / HOTP — implémentation RFC 4226 et RFC 6238, compatible
 * Google Authenticator (SHA-1, 6 chiffres, pas de 30 s).
 * Validée par les vecteurs de test officiels des RFC (totp.spec.ts).
 */
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

export const TOTP_STEP_SECONDS = 30;
export const TOTP_DIGITS = 6;
/** Tolérance d'horloge : accepte le pas courant ± 1. */
export const TOTP_WINDOW = 1;

export function base32Encode(bytes: Buffer): string {
  let bits = 0;
  let value = 0;
  let output = "";
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) {
    output += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  }
  return output;
}

export function base32Decode(input: string): Buffer {
  const cleaned = input.toUpperCase().replace(/=+$/, "").replace(/\s+/g, "");
  let bits = 0;
  let value = 0;
  const output: number[] = [];
  for (const char of cleaned) {
    const index = BASE32_ALPHABET.indexOf(char);
    if (index === -1) {
      throw new Error(`Caractère base32 invalide : ${char}`);
    }
    value = (value << 5) | index;
    bits += 5;
    if (bits >= 8) {
      output.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(output);
}

/** Secret TOTP : 20 octets aléatoires (taille recommandée RFC 4226 pour SHA-1). */
export function generateTotpSecret(): string {
  return base32Encode(randomBytes(20));
}

/** RFC 4226 — code HOTP pour un compteur donné. */
export function hotp(secret: Buffer, counter: number, digits = TOTP_DIGITS): string {
  const counterBuffer = Buffer.alloc(8);
  counterBuffer.writeBigUInt64BE(BigInt(counter));
  const digest = createHmac("sha1", secret).update(counterBuffer).digest();
  const offset = digest[digest.length - 1]! & 0x0f;
  const binaryCode =
    ((digest[offset]! & 0x7f) << 24) |
    (digest[offset + 1]! << 16) |
    (digest[offset + 2]! << 8) |
    digest[offset + 3]!;
  return (binaryCode % 10 ** digits).toString().padStart(digits, "0");
}

/** RFC 6238 — code TOTP à un instant donné. */
export function totpCode(
  base32Secret: string,
  epochMs: number = Date.now(),
  digits = TOTP_DIGITS,
  stepSeconds = TOTP_STEP_SECONDS,
): string {
  const counter = Math.floor(epochMs / 1000 / stepSeconds);
  return hotp(base32Decode(base32Secret), counter, digits);
}

/** Vérifie un code TOTP avec tolérance d'horloge (comparaison à temps constant). */
export function verifyTotp(
  base32Secret: string,
  token: string,
  epochMs: number = Date.now(),
  window = TOTP_WINDOW,
): boolean {
  if (!/^\d+$/.test(token) || token.length !== TOTP_DIGITS) {
    return false;
  }
  const tokenBuffer = Buffer.from(token);
  for (let delta = -window; delta <= window; delta += 1) {
    const candidate = totpCode(base32Secret, epochMs + delta * TOTP_STEP_SECONDS * 1000);
    if (timingSafeEqual(tokenBuffer, Buffer.from(candidate))) {
      return true;
    }
  }
  return false;
}

/** URI otpauth:// à encoder en QR code pour les applications d'authentification. */
export function buildOtpauthUri(
  label: string,
  issuer: string,
  base32Secret: string,
): string {
  const encodedIssuer = encodeURIComponent(issuer);
  return (
    `otpauth://totp/${encodedIssuer}:${encodeURIComponent(label)}` +
    `?secret=${base32Secret}&issuer=${encodedIssuer}` +
    `&algorithm=SHA1&digits=${TOTP_DIGITS}&period=${TOTP_STEP_SECONDS}`
  );
}
