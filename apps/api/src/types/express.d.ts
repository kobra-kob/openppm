import type { JwtPayload } from "../modules/auth/application/jwt-payload";

declare global {
  namespace Express {
    interface Request {
      user?: JwtPayload;
    }
  }
}

export {};
