import { slugify } from "./slug";

describe("slugify", () => {
  it("retire les accents et met en minuscules", () => {
    expect(slugify("Société Générale")).toBe("societe-generale");
  });

  it("remplace les caractères spéciaux par des tirets sans doublons", () => {
    expect(slugify("ACME & Co. (Paris)")).toBe("acme-co-paris");
  });

  it("tronque à 60 caractères sans tiret final", () => {
    const result = slugify(`${"a".repeat(59)}-suite`);
    expect(result.length).toBeLessThanOrEqual(60);
    expect(result.endsWith("-")).toBe(false);
  });

  it("retourne un slug par défaut si le nom ne contient rien d'utilisable", () => {
    expect(slugify("!!!")).toBe("organisation");
  });
});
