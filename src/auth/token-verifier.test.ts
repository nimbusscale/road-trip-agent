import { generateKeyPair, SignJWT } from "jose";
import { beforeAll, describe, expect, it } from "vitest";

import {
  changeToken,
  createTestSigner,
  TEST_ISSUER,
  TEST_USER_ID,
  type TestSigner,
} from "./test-tokens.js";
import { createTokenVerifier, type VerifyToken } from "./token-verifier.js";

describe("createTokenVerifier", () => {
  let signer: TestSigner;
  let verifyToken: VerifyToken;

  beforeAll(async () => {
    signer = await createTestSigner();
    verifyToken = createTokenVerifier(signer.verifierOptions);
  });

  it("returns the user's ID from a valid token", async () => {
    expect(await verifyToken(await signer.sign())).toEqual({
      userId: TEST_USER_ID,
    });
  });

  it("refuses a changed token", async () => {
    expect(await verifyToken(changeToken(await signer.sign()))).toBeNull();
  });

  it("refuses a token that isn't a token", async () => {
    expect(await verifyToken("not-a-token")).toBeNull();
  });

  it("refuses an expired token", async () => {
    const lastHour = Math.floor(Date.now() / 1000) - 3600;
    const token = await signer.sign({ exp: lastHour });
    expect(await verifyToken(token)).toBeNull();
  });

  it("refuses a token from another issuer", async () => {
    const token = await signer.sign({
      iss: "https://other.supabase.co/auth/v1",
    });
    expect(await verifyToken(token)).toBeNull();
  });

  it("refuses a token for another audience", async () => {
    expect(await verifyToken(await signer.sign({ aud: "anon" }))).toBeNull();
  });

  it("refuses a token whose user ID isn't a UUID", async () => {
    expect(await verifyToken(await signer.sign({ sub: "joe" }))).toBeNull();
  });

  it("refuses a token signed with another key", async () => {
    const { privateKey } = await generateKeyPair("ES256");
    const token = await new SignJWT({ sub: TEST_USER_ID, aud: "authenticated" })
      .setProtectedHeader({ alg: "ES256", kid: "test-key" })
      .setIssuer(TEST_ISSUER)
      .setExpirationTime("1h")
      .sign(privateKey);
    expect(await verifyToken(token)).toBeNull();
  });
});
