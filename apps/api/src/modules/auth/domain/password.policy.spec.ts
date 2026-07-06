import { passwordPolicyErrors } from "./password.policy";

describe("password.policy", () => {
  it("accepte un mot de passe conforme", () => {
    expect(passwordPolicyErrors("SuperSecret123")).toEqual([]);
  });

  it("refuse un mot de passe trop court", () => {
    expect(passwordPolicyErrors("Abc1")).toContain("password.too_short");
  });

  it("exige minuscule, majuscule et chiffre", () => {
    expect(passwordPolicyErrors("SANSMINUSCULE123")).toContain(
      "password.missing_lowercase",
    );
    expect(passwordPolicyErrors("sansmajuscule123")).toContain(
      "password.missing_uppercase",
    );
    expect(passwordPolicyErrors("SansChiffreIci!")).toContain(
      "password.missing_digit",
    );
  });

  it("refuse un mot de passe trop long", () => {
    expect(passwordPolicyErrors(`Aa1${"x".repeat(130)}`)).toContain(
      "password.too_long",
    );
  });
});
