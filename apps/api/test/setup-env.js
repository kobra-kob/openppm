// Chargé dans chaque worker Jest AVANT les imports de modules :
// fige l'environnement de test (base dédiée, secrets factices).
process.env.NODE_ENV = "test";
process.env.DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? "mysql://root:root@localhost:3307/openppm_test";
process.env.JWT_SECRET =
  process.env.JWT_SECRET ?? "test-secret-0123456789abcdef0123456789abcdef";
process.env.JWT_ACCESS_TTL = "900s";
process.env.REFRESH_TTL_DAYS = "30";
delete process.env.SMTP_URL;
process.env.FILES_DIR =
  process.env.FILES_DIR ??
  require("node:path").join(require("node:os").tmpdir(), "openppm-test-storage");
