import {
  createRemoteJWKSet,
  errors,
  jwtVerify,
  type JWTVerifyGetKey,
} from "jose";

import {
  signedInUserSchema,
  type SignedInUser,
} from "./signed-in-user.schema.js";

// Returns the signed-in user, or null when the token isn't valid.
export type VerifyToken = (token: string) => Promise<SignedInUser | null>;

export interface TokenVerifierOptions {
  keys: JWTVerifyGetKey;
  issuer: string;
}

// The project signs tokens with an ECC (P-256) key. Naming the one algorithm stops a
// token from choosing a weaker one.
const ALGORITHMS = ["ES256"];
// Supabase gives a signed-in user's token this audience.
const AUDIENCE = "authenticated";

export function createTokenVerifier(
  options: TokenVerifierOptions,
): VerifyToken {
  return async (token) => {
    let payload: unknown;
    try {
      ({ payload } = await jwtVerify(token, options.keys, {
        issuer: options.issuer,
        audience: AUDIENCE,
        algorithms: ALGORITHMS,
      }));
    } catch (error) {
      if (error instanceof errors.JOSEError) {
        return null;
      }
      throw error;
    }
    const result = signedInUserSchema.safeParse(payload);
    return result.success ? result.data : null;
  };
}

// Checks tokens with the Supabase project's public signing keys (systems design
// section 3). The keys are kept in memory. They're downloaded again only when a token
// names a key that isn't there, such as after a key rotation, and at most once every
// 30 seconds, jose's default.
export function createSupabaseTokenVerifier(supabaseUrl: string): VerifyToken {
  const issuer = `${supabaseUrl}/auth/v1`;
  const keys = createRemoteJWKSet(new URL(`${issuer}/.well-known/jwks.json`), {
    cacheMaxAge: Infinity,
  });
  return createTokenVerifier({ keys, issuer });
}
