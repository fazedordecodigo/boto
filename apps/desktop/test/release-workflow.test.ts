import { expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dir, "../../..");
const read = (path: string) => readFileSync(resolve(root, path), "utf8");
const workflow = read(".github/workflows/release.yml");
const matrix = [...workflow.matchAll(/^ {10}- os: (\S+)\n {12}bundles: (\S+)$/gm)].map((match) => ({
  os: match[1],
  bundles: match[2].split(","),
}));
const runners = matrix.map((entry) => entry.os);
const composer = read("scripts/compose-latest.py");
const platforms = Object.fromEntries(
  [
    ...(composer.match(/^PLATFORMS = \{([\s\S]*?)^\}/m)?.[1] ?? "").matchAll(
      /"([a-z0-9_-]+)": "([^"]+)"/g,
    ),
  ].map((match) => [match[1], match[2]]),
);

function updaterBundle(suffix: string): string {
  if (suffix.endsWith(".app.tar.gz")) return "app";
  if (suffix.endsWith(".AppImage")) return "appimage";
  if (suffix.endsWith("-setup.exe")) return "nsis";
  throw new Error(`unknown updater asset ${suffix}`);
}

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
  const required = Object.keys(platforms);
  expect(required.length).toBeGreaterThan(0);
  expect(runners.length).toBe(workflow.match(/^ {10}- os: /gm)?.length ?? 0);
  expect(runners.map(updaterPlatform).sort()).toEqual(required.sort());
});

test("each release job bundles the signed updater asset its platform publishes", () => {
  for (const { os, bundles } of matrix) {
    const platform = updaterPlatform(os);
    expect(`${os}: ${bundles.join(",")}`).toContain(updaterBundle(platforms[platform]));
  }
  expect(workflow).toMatch(
    /args: --bundles \$\{\{ matrix\.bundles \}\} --config src-tauri\/tauri\.updater\.conf\.json/,
  );
  const updater = JSON.parse(read("apps/desktop/src-tauri/tauri.updater.conf.json"));
  expect(updater.bundle.createUpdaterArtifacts).toBe(true);
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
