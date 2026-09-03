import { expect, test } from "@playwright/test";

const validImage = (name = "background.png", mimeType = "image/png") => ({
  name,
  mimeType,
  buffer: Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADElEQVR42mNk+M/wHwAF/gL+V3FuswAAAABJRU5ErkJggg==",
    "base64",
  ),
});

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

test("educators can set a background with a file picker and find it after reopening", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Environments" }).click();
  await page.getByRole("button", { name: "Create environment" }).click();

  await expect(page.getByText(/This draft needs a background/i)).toBeVisible();
  await page.getByRole("button", { name: "Set background" }).click();
  await expect(page.getByRole("dialog", { name: "Set background" })).toBeVisible();
  await page.getByLabel("Choose background image").setInputFiles(validImage("forest.png"));

  await expect(page.getByText(/Background added/i)).toBeVisible();
  await expect(page.getByRole("status")).toHaveText("Saved on this device");
  await page.getByRole("button", { name: "Close" }).click();
  await page.getByRole("button", { name: "Done" }).click();
  const card = page.locator("article", { has: page.getByRole("heading", { name: "Untitled environment" }) });
  await expect(card.getByRole("img", { name: "Background for Untitled environment" })).toBeVisible();
  await expect(card).toContainText(/at least one sprite with a sound/i);

  await page.reload();
  await page.getByRole("button", { name: "Environments" }).click();
  const reopenedCard = page.locator("article", { has: page.getByRole("heading", { name: "Untitled environment" }) });
  await expect(reopenedCard.getByRole("img", { name: "Background for Untitled environment" })).toBeVisible();
  await page.getByRole("button", { name: "Edit" }).click();
  await expect(page.getByRole("img", { name: "Environment background" })).toBeVisible();
});

test("background modal validates images, supports dropping, and confirms replacement or removal", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Environments" }).click();
  await page.getByRole("button", { name: "Create environment" }).click();
  await page.getByRole("button", { name: "Set background" }).click();

  const picker = page.getByLabel("Choose background image");
  await picker.setInputFiles({ name: "notes.txt", mimeType: "text/plain", buffer: Buffer.from("not an image") });
  await expect(page.getByRole("alert")).toHaveText("Choose a PNG, JPEG, or WebP image.");
  await picker.setInputFiles({ name: "large.png", mimeType: "image/png", buffer: Buffer.alloc(10 * 1024 * 1024 + 1) });
  await expect(page.getByRole("alert")).toHaveText("Choose an image smaller than 10 MB.");

  await page.locator(".background-drop-zone").evaluate((dropZone) => {
    const dataTransfer = new DataTransfer();
    dataTransfer.items.add(new File([
      Uint8Array.from(atob("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADElEQVR42mNk+M/wHwAF/gL+V3FuswAAAABJRU5ErkJggg=="), (character) => character.charCodeAt(0)),
    ], "dropped.webp", { type: "image/webp" }));
    dropZone.dispatchEvent(new DragEvent("drop", { bubbles: true, dataTransfer }));
  });
  await expect(page.getByText("Background added.")).toBeVisible();

  await page.getByRole("button", { name: "Close" }).click();
  await page.getByRole("button", { name: "Change background" }).click();
  await picker.setInputFiles(validImage("replacement.jpg", "image/jpeg"));
  await expect(page.getByRole("heading", { name: "Replace this background?" })).toBeVisible();
  await page.getByRole("button", { name: "Cancel" }).click();
  await expect(page.getByRole("heading", { name: "Replace this background?" })).toHaveCount(0);

  await picker.setInputFiles(validImage("replacement.jpg", "image/jpeg"));
  await page.getByRole("button", { name: "Replace background" }).click();
  await expect(page.getByText("Background replaced.")).toBeVisible();
  await page.getByRole("button", { name: "Remove background" }).click();
  await expect(page.getByRole("heading", { name: "Remove this background?" })).toBeVisible();
  await page.getByRole("button", { name: "Remove background" }).last().click();
  await expect(page.getByText("Background removed.")).toBeVisible();
  await expect(page.getByRole("img", { name: "Environment background" })).toHaveCount(0);
});

test("background modal rejects corrupt files labeled as supported images", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Environments" }).click();
  await page.getByRole("button", { name: "Create environment" }).click();
  await page.getByRole("button", { name: "Set background" }).click();

  await page.getByLabel("Choose background image").setInputFiles({
    name: "broken.png",
    mimeType: "image/png",
    buffer: Buffer.from("these bytes are not an image"),
  });

  await expect(page.getByRole("alert")).toHaveText(/image could not be opened/i);
  await page.getByRole("button", { name: "Close" }).click();
  await expect(page.getByText(/This draft needs a background/i)).toBeVisible();
});

test("an image dropped on the activity area does not replace its background", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Environments" }).click();
  await page.getByRole("button", { name: "Create environment" }).click();
  await page.locator(".activity-canvas").evaluate((canvas) => {
    const dataTransfer = new DataTransfer();
    dataTransfer.items.add(new File(["not used"], "scene.png", { type: "image/png" }));
    canvas.dispatchEvent(new DragEvent("drop", { bubbles: true, dataTransfer }));
  });

  await expect(page.getByRole("alert")).toHaveText(/not backgrounds/i);
  await expect(page.getByText(/This draft needs a background/i)).toBeVisible();
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
