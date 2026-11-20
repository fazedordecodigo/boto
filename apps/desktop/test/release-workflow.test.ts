import { expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dir, "../../..");
const read = (path: string) => readFileSync(resolve(root, path), "utf8");
const workflow = read(".github/workflows/release.yml");
const runners = [...workflow.matchAll(/^ {10}- os: (\S+)$/gm)].map((match) => match[1]);

function updaterPlatform(runner: string): string {
  if (runner.startsWith("macos-")) return "darwin-aarch64";
  const os = runner.startsWith("ubuntu-")
    ? "linux"
    : runner.startsWith("windows-")
      ? "windows"
      : "";
  if (!os) throw new Error(`unknown release runner ${runner}`);
  return `${os}-${runner.endsWith("-arm") ? "aarch64" : "x86_64"}`;
}

test("release matrix builds every updater platform latest.json requires", () => {
  const composer = read("scripts/compose-latest.py");
  const block = composer.match(/^PLATFORMS = \{([\s\S]*?)^\}/m)?.[1] ?? "";
  const required = [...block.matchAll(/"([a-z0-9_-]+)":/g)].map((match) => match[1]);
  expect(required.length).toBeGreaterThan(0);
  expect(runners.map(updaterPlatform).sort()).toEqual(required.sort());
});

test("ARM64 Linux release tests get a browser, since Chrome has no Linux ARM64 build", () => {
  expect(runners).toContain("ubuntu-22.04-arm");
  const step = workflow
    .split(/^ {6}- /m)
    .find((s) => s.includes("Install ARM64 Linux test browser"));
  expect(step).toContain("if: runner.os == 'Linux' && runner.arch == 'ARM64'");
  expect(step).toContain("CHROME_PATH=");
  for (const file of readdirSync(import.meta.dir).filter((name) => name.endsWith(".test.ts"))) {
    const source = readFileSync(resolve(import.meta.dir, file), "utf8");
    for (const launch of source.matchAll(/chromium\.launch\(\{([^}]*)\}/g))
      expect(`${file}: ${launch[1]}`).not.toContain('channel: "chrome"');
  }
});
