import { expect, test } from "@playwright/test";

test("educators can open the protected starter environments in the library", async ({ page }) => {
  await page.goto("/");

  await page.getByRole("button", { name: "Environments" }).click();

  await expect(page.getByRole("heading", { name: "Your environments" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Park" })).toBeVisible();
  await expect(page.getByText("Ready to play", { exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Kitchen" })).toBeVisible();
  await expect(page.getByText("Coming soon", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Play Kitchen" })).toBeDisabled();
  await expect(page.getByText("Starter environment", { exact: true })).toHaveCount(2);
});

test("educators can create, name, and reopen a saved draft", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Environments" }).click();
  await page.getByRole("button", { name: "Create environment" }).click();

  const name = page.getByLabel("Environment name");
  await expect(name).toBeFocused();
  await expect(name).toHaveValue("Untitled environment");
  await name.fill("Forest sounds");
  await name.press("Tab");
  await expect(page.getByRole("status")).toHaveText("Saved on this device");

  await page.getByRole("button", { name: "Done" }).click();
  await expect(page.getByRole("heading", { name: "Forest sounds" })).toBeVisible();
  await page.reload();
  await page.getByRole("button", { name: "Environments" }).click();
  await expect(page.getByRole("heading", { name: "Forest sounds" })).toBeVisible();
  await page.getByRole("button", { name: "Edit" }).click();
  await expect(page.getByLabel("Environment name")).toHaveValue("Forest sounds");
});

test("shows recovery guidance for a corrupt saved environment", async ({ page }) => {
  await page.goto("/");
  await page.evaluate(async () => {
    const database = await new Promise((resolve, reject) => {
      const request = indexedDB.open("sound-explorer", 1);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    await new Promise((resolve, reject) => {
      const transaction = database.transaction("environments", "readwrite");
      transaction.objectStore("environments").put({ id: 42, name: null });
      transaction.oncomplete = resolve;
      transaction.onerror = () => reject(transaction.error);
    });
    database.close();
  });

  await page.reload();
  await page.getByRole("button", { name: "Environments" }).click();

  await expect(page.getByRole("alert")).toHaveText(/saved environment could not be read/i);
  await expect(page.getByRole("heading", { name: "Park" })).toBeVisible();
});

test("shows recovery guidance when browser storage is unavailable", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, "indexedDB", { value: undefined });
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Environments" }).click();

  await expect(page.getByRole("status")).toHaveText("Could not save on this device");
  await expect(page.getByRole("alert")).toHaveText(/could not open saved environments/i);
});

test("shows saving until the browser finishes storing a new environment", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Environments" }).click();
  await page.evaluate(() => {
    const descriptor = Object.getOwnPropertyDescriptor(IDBTransaction.prototype, "oncomplete");
    Object.defineProperty(IDBTransaction.prototype, "oncomplete", {
      get: descriptor.get,
      set(handler) {
        descriptor.set.call(this, (event) => setTimeout(() => handler.call(this, event), 250));
      },
    });
  });
  await page.getByRole("button", { name: "Create environment" }).click();

  await expect(page.getByRole("status")).toHaveText("Saving on this device…");
  await expect(page.getByRole("status")).toHaveText("Saved on this device");
});

test("shows failed guidance when storage becomes unavailable before saving", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Environments" }).click();
  await page.evaluate(() => Object.defineProperty(window, "indexedDB", { value: undefined }));
  await page.getByRole("button", { name: "Create environment" }).click();

  await expect(page.getByRole("status")).toHaveText("Could not save on this device");
  await expect(page.getByRole("alert")).toHaveText(/could not be saved on this device/i);
});
