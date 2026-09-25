import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import test from "node:test";

const root = resolve(import.meta.dirname, "..");
const privateMarkers = ["http://100.100.10.20:43181", "100.100.10.20", ":43181"];

function filesBelow(directory: string): string[] {
  if (!existsSync(directory)) return [];
  return readdirSync(directory).flatMap((entry) => {
    const path = join(directory, entry);
    return statSync(path).isDirectory() ? filesBelow(path) : [path];
  });
}

test("browser build artifacts contain no private endpoint", () => {
  const nextDirectory = join(root, ".next");
  assert.ok(existsSync(nextDirectory), "run the web build before boundary tests");

  const browserFiles = filesBelow(join(nextDirectory, "static"));
  const renderedArtifacts = filesBelow(join(nextDirectory, "server/app"))
    .filter((path) => /\.(?:html|json|map|rsc|txt)$/.test(path));
  const sourceMaps = filesBelow(nextDirectory).filter((path) => path.endsWith(".map"));
  const candidates = [...new Set([...browserFiles, ...renderedArtifacts, ...sourceMaps])];

  assert.ok(candidates.length > 0, "expected browser build artifacts");
  for (const path of candidates) {
    const contents = readFileSync(path, "utf8");
    for (const marker of privateMarkers) {
      assert.equal(contents.includes(marker), false, `${relative(root, path)} leaked ${marker}`);
    }
  }
});
