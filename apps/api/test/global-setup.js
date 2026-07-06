// Prépare la base de test : migrations + seed (idempotents).
// Ne s'exécute qu'une fois avant toute la suite.
const { execSync } = require("node:child_process");
const path = require("node:path");

module.exports = async () => {
  const databaseUrl =
    process.env.TEST_DATABASE_URL ?? "mysql://root:root@localhost:3307/openppm_test";
  const dbPackageDir = path.resolve(__dirname, "../../../packages/db");
  const env = { ...process.env, DATABASE_URL: databaseUrl };
  execSync("pnpm exec prisma migrate deploy", { cwd: dbPackageDir, env, stdio: "inherit" });
  execSync("pnpm exec tsx prisma/seed.ts", { cwd: dbPackageDir, env, stdio: "inherit" });
};
