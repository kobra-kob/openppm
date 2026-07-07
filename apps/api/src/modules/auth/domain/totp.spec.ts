import {
  base32Decode,
  base32Encode,
  buildOtpauthUri,
  generateTotpSecret,
  hotp,
  totpCode,
  verifyTotp,
} from "./totp";

/** Secret des vecteurs de test RFC 4226 / RFC 6238 (ASCII "12345678901234567890"). */
const RFC_SECRET = Buffer.from("12345678901234567890", "ascii");
const RFC_SECRET_BASE32 = base32Encode(RFC_SECRET);

describe("base32", () => {
  it("encode/décode de manière réversible", () => {
    const original = Buffer.from("Hello OpenPPM!", "utf8");
    expect(base32Decode(base32Encode(original))).toEqual(original);
  });

  it("rejette un caractère invalide", () => {
    expect(() => base32Decode("ABC!DEF")).toThrow();
  });
});

describe("hotp — vecteurs officiels RFC 4226 (annexe D)", () => {
  const expected = [
    "755224",
    "287082",
    "359152",
    "969429",
    "338314",
    "254676",
    "287922",
    "162583",
    "399871",
    "520489",
  ];
  it.each(expected.map((code, counter) => [counter, code]))(
    "compteur %i → %s",
    (counter, code) => {
      expect(hotp(RFC_SECRET, counter as number)).toBe(code);
    },
  );
});

describe("totp — vecteurs officiels RFC 6238 (annexe B, SHA-1, 8 chiffres)", () => {
  const vectors: Array<[number, string]> = [
    [59, "94287082"],
    [1111111109, "07081804"],
    [1111111111, "14050471"],
    [1234567890, "89005924"],
    [2000000000, "69279037"],
    [20000000000, "65353130"],
  ];
  it.each(vectors)("epoch %i s → %s", (epochSeconds, code) => {
    expect(totpCode(RFC_SECRET_BASE32, epochSeconds * 1000, 8)).toBe(code);
  });
});

describe("verifyTotp", () => {
  const now = 1_700_000_000_000;

  it("accepte le code du pas courant et du pas précédent (fenêtre 1)", () => {
    const current = totpCode(RFC_SECRET_BASE32, now);
    const previous = totpCode(RFC_SECRET_BASE32, now - 30_000);
    expect(verifyTotp(RFC_SECRET_BASE32, current, now)).toBe(true);
    expect(verifyTotp(RFC_SECRET_BASE32, previous, now)).toBe(true);
  });

  it("rejette un code de deux pas en arrière et un code arbitraire", () => {
    const old = totpCode(RFC_SECRET_BASE32, now - 90_000);
    expect(verifyTotp(RFC_SECRET_BASE32, old, now)).toBe(false);
    expect(verifyTotp(RFC_SECRET_BASE32, "000000", now)).toBe(false);
  });

  it("rejette les formats invalides sans lever d'erreur", () => {
    expect(verifyTotp(RFC_SECRET_BASE32, "abc", now)).toBe(false);
    expect(verifyTotp(RFC_SECRET_BASE32, "12345", now)).toBe(false);
    expect(verifyTotp(RFC_SECRET_BASE32, "1234567", now)).toBe(false);
  });
});

describe("outillage", () => {
  it("génère un secret base32 de 32 caractères (20 octets)", () => {
    const secret = generateTotpSecret();
    expect(secret).toMatch(/^[A-Z2-7]{32}$/);
    expect(base32Decode(secret)).toHaveLength(20);
  });

  it("construit une URI otpauth compatible authenticator", () => {
    const uri = buildOtpauthUri("marie@acme.fr", "OpenPPM", "ABCDEF234567");
    expect(uri).toBe(
      "otpauth://totp/OpenPPM:marie%40acme.fr?secret=ABCDEF234567&issuer=OpenPPM&algorithm=SHA1&digits=6&period=30",
    );
  });
});
