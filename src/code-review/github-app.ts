import { createPrivateKey } from "node:crypto";

import { SignJWT } from "jose";

import {
  accessTokenSchema,
  appSchema,
  installationSchema,
  userSchema,
} from "./github-app.schema.js";

// Each app is installed on this repo only (code review design 4.6).
const OWNER = "nimbusscale";
const REPO = "road-trip-agent";

// A token for one app, and the name and address its commits are made with.
export interface AppToken {
  readonly token: string;
  readonly expiresAt: string;
  readonly botName: string;
  readonly botEmail: string;
}

// Makes an installation token from the app's ID and private key, the way
// actions/create-github-app-token does in CI. The token lasts an hour.
export async function makeAppToken(
  appId: string,
  privateKeyPem: string,
  fetchFn: typeof fetch,
): Promise<AppToken> {
  const appJwt = await signAppJwt(appId, privateKeyPem);
  const get = (path: string, token: string) =>
    callGitHub(fetchFn, path, token, { method: "GET" });
  const installation = installationSchema.parse(
    await get(`/repos/${OWNER}/${REPO}/installation`, appJwt),
  );
  const access = accessTokenSchema.parse(
    await callGitHub(
      fetchFn,
      `/app/installations/${String(installation.id)}/access_tokens`,
      appJwt,
      { method: "POST", body: JSON.stringify({ repositories: [REPO] }) },
    ),
  );
  const app = appSchema.parse(await get("/app", appJwt));
  // GitHub links a commit to the bot by this noreply address, so the commit shows
  // the bot as its author.
  const botName = `${app.slug}[bot]`;
  const user = userSchema.parse(
    await get(`/users/${encodeURIComponent(botName)}`, access.token),
  );
  return {
    token: access.token,
    expiresAt: access.expiresAt,
    botName,
    botEmail: `${String(user.id)}+${botName}@users.noreply.github.com`,
  };
}

// Shell lines that post and commit as the app: gh reads GH_TOKEN, and git reads the
// author and committer.
export function exportLines(appToken: AppToken): string {
  const values: [string, string][] = [
    ["GH_TOKEN", appToken.token],
    ["GIT_AUTHOR_NAME", appToken.botName],
    ["GIT_AUTHOR_EMAIL", appToken.botEmail],
    ["GIT_COMMITTER_NAME", appToken.botName],
    ["GIT_COMMITTER_EMAIL", appToken.botEmail],
  ];
  return values
    .map(
      ([name, value]) => `export ${name}='${value.replaceAll("'", "'\\''")}'`,
    )
    .join("\n");
}

// GitHub takes a JWT signed with the app's key for 10 minutes at most. It starts a
// minute back, in case this machine's clock is ahead of GitHub's.
function signAppJwt(appId: string, privateKeyPem: string): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  return new SignJWT({})
    .setProtectedHeader({ alg: "RS256" })
    .setIssuer(appId)
    .setIssuedAt(now - 60)
    .setExpirationTime(now + 540)
    .sign(createPrivateKey(privateKeyPem));
}

async function callGitHub(
  fetchFn: typeof fetch,
  path: string,
  token: string,
  init: { method: string; body?: string },
): Promise<unknown> {
  const response = await fetchFn(`https://api.github.com${path}`, {
    ...init,
    headers: {
      accept: "application/vnd.github+json",
      authorization: `Bearer ${token}`,
      "x-github-api-version": "2022-11-28",
    },
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) {
    throw new Error(
      `GitHub refused ${init.method} ${path} with status ${String(response.status)}: ${await response.text()}`,
    );
  }
  return await response.json();
}
