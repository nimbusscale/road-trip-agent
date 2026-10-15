import { createMiddleware } from "hono/factory";

import type { SignedInUser } from "../auth/signed-in-user.schema.js";
import type { VerifyToken } from "../auth/token-verifier.js";

// Lets a route read the user with context.get("user"), typed.
declare module "hono" {
  interface ContextVariableMap {
    user: SignedInUser;
  }
}

const BEARER_PREFIX = "Bearer ";

// Refuses a request with no valid sign-in token (systems design section 3).
export function requireSignIn(verifyToken: VerifyToken) {
  return createMiddleware(async (context, next) => {
    const header = context.req.header("Authorization") ?? "";
    const user = header.startsWith(BEARER_PREFIX)
      ? await verifyToken(header.slice(BEARER_PREFIX.length))
      : null;
    if (user === null) {
      context.header("WWW-Authenticate", "Bearer");
      return context.json({ error: "Sign in first." }, 401);
    }
    context.set("user", user);
    await next();
    return undefined;
  });
}
