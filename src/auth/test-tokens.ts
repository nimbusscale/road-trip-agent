import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT } from "jose";

import type { TokenVerifierOptions } from "./token-verifier.js";

// Signs tokens the way Supabase does, with a test key, so tests make no outside calls
// (DEVELOPMENT.md section 5).

export const TEST_ISSUER = "https://test.supabase.co/auth/v1";
export const TEST_USER_ID = "2f6c1d3e-8a4b-4c5d-9e6f-7a8b9c0d1e2f";

const KEY_ID = "test-key";

export interface TestSigner {
  verifierOptions: TokenVerifierOptions;
  sign: (claims?: Record<string, unknown>) => Promise<string>;
}

export async function createTestSigner(): Promise<TestSigner> {
  const { privateKey, publicKey } = await generateKeyPair("ES256");
  const publicJwk = {
    ...(await exportJWK(publicKey)),
    kid: KEY_ID,
    alg: "ES256",
  };
  return {
    verifierOptions: {
      keys: createLocalJWKSet({ keys: [publicJwk] }),
      issuer: TEST_ISSUER,
    },
    // A test's claims replace the defaults, so it can make a token expired or for
    // another issuer.
    sign: (claims = {}) => {
      const now = Math.floor(Date.now() / 1000);
      return new SignJWT({
        sub: TEST_USER_ID,
        aud: "authenticated",
        iss: TEST_ISSUER,
        iat: now,
        exp: now + 3600,
        ...claims,
      })
        .setProtectedHeader({ alg: "ES256", kid: KEY_ID })
        .sign(privateKey);
    },
  };
}

// Changes one character of the token's contents, keeping its signature.
export function changeToken(token: string): string {
  const [header = "", payload = "", signature = ""] = token.split(".");
  const changed = payload.endsWith("A")
    ? `${payload.slice(0, -1)}B`
    : `${payload.slice(0, -1)}A`;
  return [header, changed, signature].join(".");
}
