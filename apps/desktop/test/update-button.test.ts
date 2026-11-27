import { afterAll, beforeAll, expect, test } from "bun:test";
import { type Browser, chromium, type Page } from "playwright-core";
import { chrome } from "./chrome";
import { base, startVite } from "./vite";

let vite: Awaited<ReturnType<typeof startVite>>;
let browser: Browser;
beforeAll(async () => {
  vite = await startVite();
  browser = await chromium.launch({ ...chrome, headless: true });
}, 60_000);
afterAll(async () => {
  await browser?.close();
  await vite?.stop();
});

type Calls = { checks: number; installs: number; closed: string[] };

async function open(query: string, run: (page: Page) => Promise<void>) {
  const page = await browser.newPage();
  try {
    await page.goto(`${base}/test/fixtures/update-button.html?${query}`);
    await page.locator("#unmount").waitFor();
    await run(page);
  } finally {
    await page.close();
  }
}

const calls = (page: Page) =>
  page.evaluate(() => (window as unknown as { updaterCalls: Calls }).updaterCalls);
const button = (page: Page) => page.locator("#st-update");
const icon = (page: Page, id: string) => page.locator(`#${id} svg.od-icon`).count();

for (const bundle of ["deb", "rpm"]) {
  test(`${bundle} installs get package-manager guidance and never check for updates`, async () => {
    await open(`bundle=${bundle}&check=available`, async (page) => {
      await page.locator("#st-update-unsupported").waitFor();
      expect(await page.locator("#st-update-unsupported").innerText()).toContain(
        `pacote .${bundle}. Atualize o Boto pelo gerenciador de pacotes`,
      );
      expect(await icon(page, "st-update-unsupported")).toBe(1);
      expect(await button(page).count()).toBe(0);
      expect((await calls(page)).checks).toBe(0);
    });
  }, 30_000);
}

test("unbundled builds explain they do not update themselves", async () => {
  await open("bundle=none&check=available", async (page) => {
    await page.locator("#st-update-unsupported").waitFor();
    expect(await page.locator("#st-update-unsupported").innerText()).toContain("não foi instalada");
    expect(await button(page).count()).toBe(0);
  });
}, 30_000);

for (const bundle of ["app", "appimage", "nsis", "msi"]) {
  test(`${bundle} installs check and keep a verb on the re-check button`, async () => {
    await open(`bundle=${bundle}&check=none`, async (page) => {
      expect(await button(page).innerText()).toBe("Verificar atualizações");
      await button(page).click();
      await page.locator("#st-update-status").waitFor();
      expect(await page.locator("#st-update-status").innerText()).toBe("Tudo atualizado.");
      expect(await icon(page, "st-update-status")).toBe(1);
      expect(await button(page).innerText()).toBe("Verificar novamente");
      expect((await calls(page)).checks).toBe(1);
    });
  }, 30_000);
}

test("installing closes the update and asks for a restart", async () => {
  await open("bundle=appimage&check=available", async (page) => {
    await button(page).click();
    await page.getByRole("button", { name: "Instalar 0.5.1" }).waitFor();
    expect(await page.locator("#st-update-status").innerText()).toContain("0.5.1 está disponível");
    await button(page).click();
    await page.getByText("Reinicie o Boto para concluir").waitFor();
    expect(await button(page).count()).toBe(0);
    expect(await calls(page)).toEqual({ checks: 1, installs: 1, closed: ["update-1"] });
  });
}, 30_000);

test("a failed install re-checks, closes the replaced update and the last one on unmount", async () => {
  await open("bundle=nsis&check=available&install=fail", async (page) => {
    await button(page).click();
    await page.getByRole("button", { name: "Instalar 0.5.1" }).click();
    await page.locator("#st-update-error").waitFor();
    expect(await page.locator("#st-update-error").innerText()).toContain(
      "Não foi possível instalar a atualização.",
    );
    expect(await button(page).innerText()).toBe("Verificar novamente");
    expect((await calls(page)).closed).toEqual([]);
    await button(page).click();
    await page.getByRole("button", { name: "Instalar 0.5.1" }).waitFor();
    expect((await calls(page)).closed).toEqual(["update-1"]);
    await page.locator("#unmount").click();
    await page.waitForFunction(
      () => (window as unknown as { updaterCalls: Calls }).updaterCalls.closed.length === 2,
    );
    expect(await calls(page)).toEqual({ checks: 2, installs: 1, closed: ["update-1", "update-2"] });
  });
}, 30_000);

test("a failed check keeps a re-check action", async () => {
  await open("bundle=app&check=fail", async (page) => {
    await button(page).click();
    await page.locator("#st-update-error").waitFor();
    expect(await page.locator("#st-update-error").innerText()).toContain(
      "Não foi possível verificar atualizações. endpoint offline",
    );
    expect(await icon(page, "st-update-error")).toBe(1);
    expect(await button(page).innerText()).toBe("Verificar novamente");
  });
}, 30_000);
