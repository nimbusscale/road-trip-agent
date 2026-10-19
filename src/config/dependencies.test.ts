import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { type PackageJson, packageJsonSchema } from "./package-json.schema.js";

function packageJsonAt(path: string): PackageJson {
  return packageJsonSchema.parse(JSON.parse(readFileSync(path, "utf8")));
}

// A package's peers are packages it needs, and expects the app to install. The
// production image installs only `dependencies` (docker/app.Dockerfile), so a peer of
// one has to be listed there too. One reached only through the lock file's peer link
// would drop out if that link changed.
describe("package.json", () => {
  it("lists every peer of a production dependency as a production dependency", () => {
    const production = Object.keys(
      packageJsonAt("package.json").dependencies ?? {},
    );
    const missing = production.flatMap((name) => {
      const installed = packageJsonAt(`node_modules/${name}/package.json`);
      return Object.keys(installed.peerDependencies ?? {})
        .filter(
          (peer) => installed.peerDependenciesMeta?.[peer]?.optional !== true,
        )
        .filter((peer) => !production.includes(peer))
        .map((peer) => `${peer}, a peer of ${name}`);
    });
    expect(missing).toEqual([]);
  });
});
