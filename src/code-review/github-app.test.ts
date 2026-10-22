import { execFileSync } from "node:child_process";
import { generateKeyPairSync } from "node:crypto";

import { jwtVerify } from "jose";
import { describe, expect, it } from "vitest";

import { exportLines, makeAppToken } from "./github-app.js";

const { privateKey, publicKey } = generateKeyPairSync("rsa", {
  modulusLength: 2048,
});
// GitHub hands out the app's key in this format.
const PRIVATE_KEY_PEM = privateKey
  .export({ type: "pkcs1", format: "pem" })
  .toString();

interface Sent {
  url: string;
  method: string;
  authorization: string;
  body: string | null;
}

// Answers like GitHub, for an app installed on the repo.
function fakeGitHub(sent: Sent[]): typeof fetch {
  // As JSON text, since GitHub's names are snake_case.
  const replies: Record<string, string> = {
    "/repos/nimbusscale/road-trip-agent/installation": '{"id":42}',
    "/app/installations/42/access_tokens":
      '{"token":"ghs_installation","expires_at":"2026-10-22T14:00:00Z"}',
    "/app": '{"slug":"nimbusscale-fix-pr"}',
    "/users/nimbusscale-fix-pr%5Bbot%5D": '{"id":9001}',
  };
  return (input, init) => {
    const url = new URL(input instanceof Request ? input.url : input);
    const headers = new Headers(init?.headers);
    sent.push({
      url: url.pathname,
      method: init?.method ?? "GET",
      authorization: headers.get("authorization") ?? "",
      body: typeof init?.body === "string" ? init.body : null,
    });
    const reply = replies[url.pathname];
    return Promise.resolve(
      reply === undefined
        ? new Response("Not Found", { status: 404 })
        : new Response(reply),
    );
  };
}

describe("makeAppToken", () => {
  it("signs in as the app, and gets a token for this repo only", async () => {
    const sent: Sent[] = [];
    const appToken = await makeAppToken(
      "5418185",
      PRIVATE_KEY_PEM,
      fakeGitHub(sent),
    );

    expect(appToken).toEqual({
      token: "ghs_installation",
      expiresAt: "2026-10-22T14:00:00Z",
      botName: "nimbusscale-fix-pr[bot]",
      botEmail: "9001+nimbusscale-fix-pr[bot]@users.noreply.github.com",
    });
    const tokenRequest = sent.find((s) => s.url.endsWith("/access_tokens"));
    expect(tokenRequest?.method).toBe("POST");
    expect(tokenRequest?.body).toBe('{"repositories":["road-trip-agent"]}');
    const appJwt = tokenRequest?.authorization.replace("Bearer ", "") ?? "";
    const { payload } = await jwtVerify(appJwt, publicKey);
    expect(payload.iss).toBe("5418185");
    expect((payload.exp ?? 0) - (payload.iat ?? 0)).toBeLessThanOrEqual(600);
  });

  it("stops when the app isn't installed on the repo", async () => {
    const notInstalled: typeof fetch = () =>
      Promise.resolve(new Response("Not Found", { status: 404 }));

    await expect(
      makeAppToken("5418185", PRIVATE_KEY_PEM, notInstalled),
    ).rejects.toThrow(
      "GitHub refused GET /repos/nimbusscale/road-trip-agent/installation with status 404",
    );
  });
});

describe("exportLines", () => {
  it("sets the token and the commit author in a shell, brackets and all", () => {
    const lines = exportLines({
      token: "ghs_installation",
      expiresAt: "2026-10-22T14:00:00Z",
      botName: "nimbusscale-fix-pr[bot]",
      botEmail: "9001+nimbusscale-fix-pr[bot]@users.noreply.github.com",
    });

    const shown = execFileSync(
      "sh",
      [
        "-c",
        `${lines}\necho "$GH_TOKEN|$GIT_AUTHOR_NAME|$GIT_COMMITTER_EMAIL"`,
      ],
      { encoding: "utf8" },
    );
    expect(shown.trim()).toBe(
      "ghs_installation|nimbusscale-fix-pr[bot]|9001+nimbusscale-fix-pr[bot]@users.noreply.github.com",
    );
  });
});
