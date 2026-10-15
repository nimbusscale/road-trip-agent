import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";

import { describe, expect, it } from "vitest";

const SOURCE_FOLDER = "src";
const DOMAIN_FOLDER = join(SOURCE_FOLDER, "domain");
const IMPORTS_VIA_SERVICE = /from\s+["'][^"']*\/via-service\.js["']/;

function sourceFilesIn(folder: string): string[] {
  return readdirSync(folder, { recursive: true, encoding: "utf8" })
    .filter((path) => /\.tsx?$/.test(path))
    .map((path) => join(folder, path));
}

// TypeScript has no way to keep a method to one folder, so this test does it: only the
// domain's objects and services reach the {viaService} change methods (domain model
// section 1).
describe("VIA_SERVICE", () => {
  it("is imported only in src/domain/", () => {
    const outside = sourceFilesIn(SOURCE_FOLDER)
      .filter((path) => !path.startsWith(DOMAIN_FOLDER))
      .filter((path) => IMPORTS_VIA_SERVICE.test(readFileSync(path, "utf8")))
      .map((path) => relative(".", path));
    expect(outside).toEqual([]);
  });
});
