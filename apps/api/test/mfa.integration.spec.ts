import { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { AppModule } from "../src/app.module";
import { configureApp } from "../src/app.setup";
import { PrismaService } from "../src/core/prisma/prisma.service";
import { totpCode } from "../src/modules/auth/domain/totp";

const generateTotp = ({ secret }: { secret: string }): Promise<string> =>
  Promise.resolve(totpCode(secret));

describe("2FA TOTP (intégration)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let accessToken: string;
  let mfaSecret: string;
  let recoveryCodes: string[];

  const EMAIL = "carole@mfa.test";
  const PASSWORD = "SuperSecret123";

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();
    prisma = app.get(PrismaService);

    await prisma.refreshToken.deleteMany();
    await prisma.passwordReset.deleteMany();
    await prisma.auditLog.deleteMany();
    await prisma.invitation.deleteMany();
    await prisma.userRole.deleteMany();
    await prisma.groupMember.deleteMany();
    await prisma.group.deleteMany();
    await prisma.user.deleteMany();
    await prisma.organization.deleteMany();

    const registered = await request(app.getHttpServer())
      .post("/api/v1/auth/register")
      .send({
        organizationName: "MFA Corp",
        firstName: "Carole",
        lastName: "Curieuse",
        email: EMAIL,
        password: PASSWORD,
      })
      .expect(201);
    accessToken = registered.body.accessToken;
  });

  afterAll(async () => {
    await app.close();
  });

  it("setup renvoie un secret et une URI otpauth", async () => {
    const response = await request(app.getHttpServer())
      .post("/api/v1/auth/2fa/setup")
      .set("Authorization", `Bearer ${accessToken}`)
      .expect(201);
    expect(response.body.secret).toBeDefined();
    expect(response.body.otpauthUrl).toContain("otpauth://totp/");
    expect(response.body.otpauthUrl).toContain("OpenPPM");
    mfaSecret = response.body.secret;
  });

  it("refuse l'activation avec un mauvais code (400)", async () => {
    await request(app.getHttpServer())
      .post("/api/v1/auth/2fa/enable")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ code: "000000" })
      .expect(400);
  });

  it("active le 2FA avec un code valide et renvoie 8 codes de récupération", async () => {
    const code = await generateTotp({ secret: mfaSecret });
    const response = await request(app.getHttpServer())
      .post("/api/v1/auth/2fa/enable")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ code })
      .expect(201);
    expect(response.body.recoveryCodes).toHaveLength(8);
    recoveryCodes = response.body.recoveryCodes;

    const me = await request(app.getHttpServer())
      .get("/api/v1/auth/me")
      .set("Authorization", `Bearer ${accessToken}`)
      .expect(200);
    expect(me.body.mfaEnabled).toBe(true);
  });

  it("le login renvoie un défi 2FA sans session", async () => {
    const response = await request(app.getHttpServer())
      .post("/api/v1/auth/login")
      .send({ email: EMAIL, password: PASSWORD })
      .expect(200);
    expect(response.body.mfaRequired).toBe(true);
    expect(response.body.mfaToken).toBeDefined();
    expect(response.body.accessToken).toBeUndefined();
  });

  it("le jeton de défi ne donne accès à aucune ressource (401)", async () => {
    const challenge = await request(app.getHttpServer())
      .post("/api/v1/auth/login")
      .send({ email: EMAIL, password: PASSWORD })
      .expect(200);
    await request(app.getHttpServer())
      .get("/api/v1/auth/me")
      .set("Authorization", `Bearer ${challenge.body.mfaToken}`)
      .expect(401);
  });

  it("verify rejette un mauvais code (401) puis accepte un code TOTP valide", async () => {
    const challenge = await request(app.getHttpServer())
      .post("/api/v1/auth/login")
      .send({ email: EMAIL, password: PASSWORD })
      .expect(200);

    await request(app.getHttpServer())
      .post("/api/v1/auth/2fa/verify")
      .send({ mfaToken: challenge.body.mfaToken, code: "000000" })
      .expect(401);

    const code = await generateTotp({ secret: mfaSecret });
    const session = await request(app.getHttpServer())
      .post("/api/v1/auth/2fa/verify")
      .send({ mfaToken: challenge.body.mfaToken, code })
      .expect(200);
    expect(session.body.accessToken).toBeDefined();

    await request(app.getHttpServer())
      .get("/api/v1/auth/me")
      .set("Authorization", `Bearer ${session.body.accessToken}`)
      .expect(200);
  });

  it("un code de récupération fonctionne une seule fois", async () => {
    const recoveryCode = recoveryCodes[0]!;

    const first = await request(app.getHttpServer())
      .post("/api/v1/auth/login")
      .send({ email: EMAIL, password: PASSWORD })
      .expect(200);
    await request(app.getHttpServer())
      .post("/api/v1/auth/2fa/verify")
      .send({ mfaToken: first.body.mfaToken, code: recoveryCode })
      .expect(200);

    const second = await request(app.getHttpServer())
      .post("/api/v1/auth/login")
      .send({ email: EMAIL, password: PASSWORD })
      .expect(200);
    await request(app.getHttpServer())
      .post("/api/v1/auth/2fa/verify")
      .send({ mfaToken: second.body.mfaToken, code: recoveryCode })
      .expect(401);
  });

  it("désactive le 2FA (mot de passe + code) puis le login redevient direct", async () => {
    // Mauvais mot de passe → refus
    const badCode = await generateTotp({ secret: mfaSecret });
    await request(app.getHttpServer())
      .post("/api/v1/auth/2fa/disable")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ password: "MauvaisPass123", code: badCode })
      .expect(401);

    const code = await generateTotp({ secret: mfaSecret });
    await request(app.getHttpServer())
      .post("/api/v1/auth/2fa/disable")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ password: PASSWORD, code })
      .expect(204);

    const login = await request(app.getHttpServer())
      .post("/api/v1/auth/login")
      .send({ email: EMAIL, password: PASSWORD })
      .expect(200);
    expect(login.body.accessToken).toBeDefined();
    expect(login.body.user.mfaEnabled).toBe(false);
  });
});
