import { beforeAll, describe, expect, it } from "vitest";

import {
  changeToken,
  createTestSigner,
  TEST_USER_ID,
} from "../auth/test-tokens.js";
import { createTokenVerifier } from "../auth/token-verifier.js";
import { healthResponseSchema } from "../shared/health.schema.js";
import { meResponseSchema } from "../shared/me.schema.js";
import { createApi } from "./api.js";
import { chatSetUp } from "./chat.fake.js";

const NO_ONE_SIGNED_IN = () => Promise.resolve(null);
const CHAT = chatSetUp(new Date("2026-10-15T09:00:00Z")).chat;

describe("GET /api/health", () => {
  it("reports a reachable database", async () => {
    const api = createApi({
      isDatabaseReachable: () => Promise.resolve(true),
      verifyToken: NO_ONE_SIGNED_IN,
      chat: CHAT,
    });
    const response = await api.request("/api/health");
    expect(response.status).toBe(200);
    expect(healthResponseSchema.parse(await response.json())).toEqual({
      database: "reachable",
    });
  });

  it("reports a database it can't reach", async () => {
    const api = createApi({
      isDatabaseReachable: () => Promise.resolve(false),
      verifyToken: NO_ONE_SIGNED_IN,
      chat: CHAT,
    });
    const response = await api.request("/api/health");
    expect(response.status).toBe(503);
    expect(healthResponseSchema.parse(await response.json())).toEqual({
      database: "unreachable",
    });
  });
});

describe("GET /api/me", () => {
  let api: ReturnType<typeof createApi>;
  let token: string;

  beforeAll(async () => {
    const signer = await createTestSigner();
    api = createApi({
      isDatabaseReachable: () => Promise.resolve(true),
      verifyToken: createTokenVerifier(signer.verifierOptions),
      chat: CHAT,
    });
    token = await signer.sign();
  });

  function requestMe(authorization?: string): Promise<Response> {
    const headers: [string, string][] =
      authorization === undefined ? [] : [["Authorization", authorization]];
    return Promise.resolve(api.request("/api/me", { headers }));
  }

  it("returns the signed-in user's ID", async () => {
    const response = await requestMe(`Bearer ${token}`);
    expect(response.status).toBe(200);
    expect(meResponseSchema.parse(await response.json())).toEqual({
      userId: TEST_USER_ID,
    });
  });

  it("refuses a request with no token", async () => {
    const response = await requestMe();
    expect(response.status).toBe(401);
    expect(response.headers.get("WWW-Authenticate")).toBe("Bearer");
  });

  it("refuses a changed token", async () => {
    const response = await requestMe(`Bearer ${changeToken(token)}`);
    expect(response.status).toBe(401);
  });

  it("refuses a token that isn't sent as a bearer token", async () => {
    const response = await requestMe(token);
    expect(response.status).toBe(401);
  });
});
