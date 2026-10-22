// Makes a token for the reviewer's or the fixer's GitHub App, for runs on Joe's machine
// (code review design 4.6). It prints shell lines that set GH_TOKEN and the commit
// author, so the commands after it post and push as the app. The token lasts an hour.
//
// eval "$(npx tsx --env-file=.env src/code-review/app-token.ts fixer)"
import { readFileSync } from "node:fs";

import { exportLines, makeAppToken } from "./github-app.js";
import { appAgentSchema, appEnvSchema } from "./github-app.schema.js";

const ENV_PREFIX = { reviewer: "REVIEWER", fixer: "FIXER" } as const;

const agent = appAgentSchema.parse(process.argv[2]);
const prefix = ENV_PREFIX[agent];
const env = appEnvSchema.parse({
  appId: process.env[`${prefix}_APP_ID`],
  privateKeyPath: process.env[`${prefix}_APP_PRIVATE_KEY_PATH`],
});

const appToken = await makeAppToken(
  env.appId,
  readFileSync(env.privateKeyPath, "utf8"),
  fetch,
);
console.log(exportLines(appToken));
console.error(`Token for ${appToken.botName}, until ${appToken.expiresAt}.`);
