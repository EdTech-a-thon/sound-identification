import { expect, test } from "@playwright/test";

const validImage = (name = "background.png", mimeType = "image/png") => ({
  name,
  mimeType,
  buffer: Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADElEQVR42mNk+M/wHwAF/gL+V3FuswAAAABJRU5ErkJggg==",
    "base64",
  ),
});

async function spriteGeometry(page, name) {
  const canvas = await page.locator(".activity-canvas").boundingBox();
  const sprite = await page.getByRole("button", { name, exact: true }).boundingBox();
  if (!canvas || !sprite) return null;
  return {
    centerX: (sprite.x + sprite.width / 2 - canvas.x) / canvas.width,
    centerY: (sprite.y + sprite.height / 2 - canvas.y) / canvas.height,
    widthRatio: sprite.width / canvas.width,
  };
}

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

test("educators can deselect a sprite by clicking empty canvas space", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Environments" }).click();
  await page.getByRole("button", { name: "Create environment" }).click();
  await page.getByLabel("Add sprite image").setInputFiles(validImage("scene.png"));

  await expect(page.getByRole("button", { name: "Scene", exact: true })).toHaveAttribute("aria-pressed", "true");
  await page.locator(".activity-canvas").click({ position: { x: 10, y: 10 } });
  await expect(page.getByRole("button", { name: "Scene", exact: true })).toHaveAttribute("aria-pressed", "false");
});

test("educators add a named, centered sprite whose relative size adapts to the activity area", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Environments" }).click();
  await page.getByRole("button", { name: "Create environment" }).click();

  await page.getByLabel("Add sprite image").setInputFiles(validImage("forest_fox.png"));

  await expect(page.getByRole("button", { name: "Forest Fox", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Forest Fox", exact: true })).toHaveAttribute("aria-pressed", "true");
  const original = await spriteGeometry(page, "Forest Fox");
  expect(original.centerX).toBeCloseTo(0.5, 2);
  expect(original.centerY).toBeCloseTo(0.5, 2);

  await page.setViewportSize({ width: 500, height: 800 });
  await expect.poll(() => spriteGeometry(page, "Forest Fox")).toMatchObject({
    centerX: expect.closeTo(0.5, 2),
    centerY: expect.closeTo(0.5, 2),
    widthRatio: expect.closeTo(original.widthRatio, 2),
  });
});

test("sprite selection and saving keep the canvas and image preview in place", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Environments" }).click();
  await page.getByRole("button", { name: "Create environment" }).click();
  await page.getByLabel("Add sprite image").setInputFiles(validImage("steady_owl.png"));
  await expect(page.getByRole("status")).toHaveText("Saved on this device");

  await page.evaluate(() => {
    const canvas = document.querySelector(".activity-canvas");
    const image = document.querySelector(".editor-sprite img");
    window.spriteDomBeforeInteraction = { canvas, image, src: image.src };
  });

  const sprite = page.getByRole("button", { name: "Steady Owl", exact: true });
  await sprite.click();
  const box = await sprite.boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 40, box.y + box.height / 2 + 30);
  await page.mouse.up();
  await expect(page.getByRole("status")).toHaveText("Saved on this device");

  await expect.poll(() => page.evaluate(() => {
    const before = window.spriteDomBeforeInteraction;
    const canvas = document.querySelector(".activity-canvas");
    const image = document.querySelector(".editor-sprite img");
    return canvas === before.canvas && image === before.image && canvas.isConnected && image.isConnected && image.src === before.src;
  })).toBe(true);
});

test("educators can only drop one sprite image at a time", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Environments" }).click();
  await page.getByRole("button", { name: "Create environment" }).click();

  await page.locator(".activity-canvas").evaluate((canvas) => {
    const dataTransfer = new DataTransfer();
    dataTransfer.items.add(new File(["first"], "first.png", { type: "image/png" }));
    dataTransfer.items.add(new File(["second"], "second.png", { type: "image/png" }));
    canvas.dispatchEvent(new DragEvent("drop", { bubbles: true, dataTransfer }));
  });

  await expect(page.getByRole("alert")).toHaveText("Drop one image at a time.");
  await expect(page.locator(".editor-sprite")).toHaveCount(0);
});

test("educators receive clear guidance for unsupported, oversized, and damaged sprite images", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Environments" }).click();
  await page.getByRole("button", { name: "Create environment" }).click();

  const picker = page.getByLabel("Add sprite image");
  await picker.setInputFiles({ name: "notes.txt", mimeType: "text/plain", buffer: Buffer.from("not an image") });
  await expect(page.getByRole("alert")).toHaveText("Choose a PNG, JPEG, or WebP image.");

  await picker.setInputFiles({ name: "large.png", mimeType: "image/png", buffer: Buffer.alloc(10 * 1024 * 1024 + 1) });
  await expect(page.getByRole("alert")).toHaveText("Choose an image smaller than 10 MB.");

  await picker.setInputFiles({ name: "broken.png", mimeType: "image/png", buffer: Buffer.from("not an image") });
  await expect(page.getByRole("alert")).toHaveText(/image could not be opened/i);
});

test("educators can drop, move, constrain, layer, resize proportionally, and reopen sprites", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Environments" }).click();
  await page.getByRole("button", { name: "Create environment" }).click();

  await page.getByLabel("Add sprite image").setInputFiles(validImage("first_bird.png"));
  await page.getByLabel("Add sprite image").setInputFiles(validImage("second_fox.png"));
  const firstBird = page.getByRole("button", { name: "First Bird", exact: true });
  const secondFox = page.getByRole("button", { name: "Second Fox", exact: true });

  await expect(secondFox).toBeVisible();
  await expect(firstBird).toBeVisible();
  await expect(page.getByRole("status")).toHaveText("Saved on this device");

  await firstBird.focus();
  await firstBird.press("Enter");
  await expect(page.getByRole("status")).toHaveText("Saved on this device");
  await expect(firstBird).toHaveAttribute("aria-pressed", "true");
  await expect(firstBird).toHaveCSS("z-index", "2");

  const moveBirdTo = async (x, y) => {
    const box = await firstBird.boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(x, y);
    await page.mouse.up();
    await expect(page.getByRole("status")).toHaveText("Saved on this device");
  };
  const canvasBox = await page.locator(".activity-canvas").evaluate((element) => {
    const bounds = element.getBoundingClientRect();
    return { x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height };
  });
  await moveBirdTo(canvasBox.x - 200, canvasBox.y - 200);
  await expect.poll(() => spriteGeometry(page, "First Bird")).toMatchObject({ centerX: expect.closeTo(0.07, 1), centerY: expect.closeTo(0.07, 1) });
  await moveBirdTo(canvasBox.x + canvasBox.width + 200, canvasBox.y + canvasBox.height + 200);
  await expect.poll(() => spriteGeometry(page, "First Bird")).toMatchObject({ centerX: expect.closeTo(0.93, 1), centerY: expect.closeTo(0.93, 1) });

  await page.locator(".activity-canvas").evaluate((activityCanvas) => {
    const bounds = activityCanvas.getBoundingClientRect();
    const dataTransfer = new DataTransfer();
    dataTransfer.items.add(new File([
      Uint8Array.from(atob("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADElEQVR42mNk+M/wHwAF/gL+V3FuswAAAABJRU5ErkJggg=="), (character) => character.charCodeAt(0)),
    ], "dropped_owl.png", { type: "image/png" }));
    activityCanvas.dispatchEvent(new DragEvent("drop", {
      bubbles: true,
      clientX: bounds.left + bounds.width * 0.25,
      clientY: bounds.top + bounds.height * 0.65,
      dataTransfer,
    }));
  });
  const droppedOwl = page.getByRole("button", { name: "Dropped Owl", exact: true });
  await expect(droppedOwl).toBeVisible();
  await expect.poll(() => spriteGeometry(page, "Dropped Owl")).toMatchObject({ centerX: expect.closeTo(0.25, 1), centerY: expect.closeTo(0.65, 1) });
  await firstBird.focus();
  await firstBird.press("Enter");
  await expect(firstBird).toHaveCSS("z-index", "3");
  await expect(page.getByRole("status")).toHaveText("Saved on this device");


  await page.getByRole("button", { name: "Done" }).click();
  await page.reload();
  await page.getByRole("button", { name: "Environments" }).click();
  await page.getByRole("button", { name: "Edit" }).click();
  await expect(firstBird).toBeVisible();
  await expect(secondFox).toBeVisible();
  await expect(droppedOwl).toBeVisible();
  await expect(firstBird).toHaveCSS("z-index", "3");
  await expect.poll(() => spriteGeometry(page, "First Bird")).toMatchObject({
    centerX: expect.closeTo(0.93, 1),
    centerY: expect.closeTo(0.93, 1),
  });

  await page.setViewportSize({ width: 500, height: 800 });
  await expect.poll(() => spriteGeometry(page, "Dropped Owl")).toMatchObject({
    centerX: expect.closeTo(0.25, 1),
    centerY: expect.closeTo(0.65, 1),
    widthRatio: expect.closeTo(0.14, 2),
  });
});

test("the sprite menu offers rename, replace image, and delete, and closes on outside interaction", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Environments" }).click();
  await page.getByRole("button", { name: "Create environment" }).click();
  await page.getByLabel("Add sprite image").setInputFiles(validImage("garden_gnome.png"));

  const trigger = page.getByRole("button", { name: "Sprite options for Garden Gnome" });
  await expect(trigger).toBeVisible();
  await trigger.click();
  await expect(page.getByRole("menuitem", { name: "Rename" })).toBeVisible();
  await expect(page.getByLabel("Replace image")).toBeAttached();
  await expect(page.getByRole("menuitem", { name: "Delete" })).toBeVisible();

  await page.keyboard.press("Escape");
  await expect(page.getByRole("menuitem", { name: "Rename" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Garden Gnome", exact: true })).toHaveAttribute("aria-pressed", "true");

  await trigger.click();
  await expect(page.getByRole("menuitem", { name: "Rename" })).toBeVisible();
  await page.locator(".activity-canvas").click({ position: { x: 5, y: 5 } });
  await expect(page.getByRole("menuitem", { name: "Rename" })).toHaveCount(0);
});

test("educators can rename a sprite from its menu and the name survives reload", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Environments" }).click();
  await page.getByRole("button", { name: "Create environment" }).click();
  await page.getByLabel("Add sprite image").setInputFiles(validImage("old_name.png"));

  await page.getByRole("button", { name: "Sprite options for Old Name" }).click();
  await page.getByRole("menuitem", { name: "Rename" }).click();
  const nameField = page.getByLabel("Sprite name");
  await nameField.fill("Whispering Willow");
  await nameField.press("Enter");

  await expect(page.getByRole("button", { name: "Whispering Willow", exact: true })).toBeVisible();
  await expect(page.getByRole("status")).toHaveText("Saved on this device");

  await page.getByRole("button", { name: "Done" }).click();
  await page.reload();
  await page.getByRole("button", { name: "Environments" }).click();
  await page.getByRole("button", { name: "Edit" }).click();
  await expect(page.getByRole("button", { name: "Whispering Willow", exact: true })).toBeVisible();
});

test("replacing a sprite's image validates the file and preserves its position, size, and identity", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Environments" }).click();
  await page.getByRole("button", { name: "Create environment" }).click();
  await page.getByLabel("Add sprite image").setInputFiles(validImage("river_otter.png"));
  await expect(page.getByRole("button", { name: "River Otter", exact: true })).toBeVisible();
  await expect(page.getByRole("status")).toHaveText("Saved on this device");

  const before = await spriteGeometry(page, "River Otter");
  await page.getByRole("button", { name: "Sprite options for River Otter" }).click();

  const replace = page.getByLabel("Replace image");
  await replace.setInputFiles({ name: "notes.txt", mimeType: "text/plain", buffer: Buffer.from("not an image") });
  await expect(page.getByRole("alert")).toHaveText("Choose a PNG, JPEG, or WebP image.");

  await page.getByRole("button", { name: "Sprite options for River Otter" }).click();
  await page.getByLabel("Replace image").setInputFiles(validImage("river_otter_v2.png"));

  await expect(page.getByRole("button", { name: "River Otter", exact: true })).toBeVisible();
  await expect(page.getByRole("status")).toHaveText("Saved on this device");
  await expect.poll(() => spriteGeometry(page, "River Otter")).toMatchObject({
    centerX: expect.closeTo(before.centerX, 2),
    centerY: expect.closeTo(before.centerY, 2),
    widthRatio: expect.closeTo(before.widthRatio, 2),
  });

  await page.getByRole("button", { name: "Done" }).click();
  await page.reload();
  await page.getByRole("button", { name: "Environments" }).click();
  await page.getByRole("button", { name: "Edit" }).click();
  await expect(page.getByRole("button", { name: "River Otter", exact: true })).toBeVisible();
  await expect.poll(() => spriteGeometry(page, "River Otter")).toMatchObject({
    centerX: expect.closeTo(before.centerX, 2),
    centerY: expect.closeTo(before.centerY, 2),
    widthRatio: expect.closeTo(before.widthRatio, 2),
  });
});

test("the sprite menu can be opened and its actions triggered with the keyboard alone", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Environments" }).click();
  await page.getByRole("button", { name: "Create environment" }).click();
  await page.getByLabel("Add sprite image").setInputFiles(validImage("keyboard_kite.png"));
  await expect(page.getByRole("button", { name: "Keyboard Kite", exact: true })).toBeVisible();

  const trigger = page.getByRole("button", { name: "Sprite options for Keyboard Kite" });
  await trigger.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("menuitem", { name: "Rename" })).toBeFocused();

  await page.keyboard.press("Tab");
  await page.keyboard.press("Tab");
  await expect(page.getByRole("menuitem", { name: "Delete" })).toBeFocused();
  await page.keyboard.press("Enter");

  await expect(page.getByRole("button", { name: "Keyboard Kite", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Undo" })).toBeVisible();
});

test("dropping an image directly on an existing sprite creates a new sprite instead of replacing it", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Environments" }).click();
  await page.getByRole("button", { name: "Create environment" }).click();
  await page.getByLabel("Add sprite image").setInputFiles(validImage("anchor_point.png"));

  const target = page.getByRole("button", { name: "Anchor Point", exact: true });
  await expect(target).toBeVisible();
  await expect(page.getByRole("status")).toHaveText("Saved on this device");
  const box = await target.boundingBox();
  await page.locator(".activity-canvas").evaluate((canvas, [x, y]) => {
    const dataTransfer = new DataTransfer();
    dataTransfer.items.add(new File([
      Uint8Array.from(atob("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADElEQVR42mNk+M/wHwAF/gL+V3FuswAAAABJRU5ErkJggg=="), (character) => character.charCodeAt(0)),
    ], "second_layer.png", { type: "image/png" }));
    canvas.dispatchEvent(new DragEvent("drop", { bubbles: true, clientX: x, clientY: y, dataTransfer }));
  }, [box.x + box.width / 2, box.y + box.height / 2]);

  await expect(page.getByRole("button", { name: "Anchor Point", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Second Layer", exact: true })).toBeVisible();
  await expect(page.locator(".editor-sprite")).toHaveCount(2);
});

test("deleting a sprite offers a short-lived undo that restores it, and deletion persists otherwise", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Environments" }).click();
  await page.getByRole("button", { name: "Create environment" }).click();
  await page.getByLabel("Add sprite image").setInputFiles(validImage("kept_lantern.png"));
  await page.locator(".activity-canvas").evaluate((canvas) => {
    const bounds = canvas.getBoundingClientRect();
    const dataTransfer = new DataTransfer();
    dataTransfer.items.add(new File([
      Uint8Array.from(atob("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADElEQVR42mNk+M/wHwAF/gL+V3FuswAAAABJRU5ErkJggg=="), (character) => character.charCodeAt(0)),
    ], "doomed_kettle.png", { type: "image/png" }));
    canvas.dispatchEvent(new DragEvent("drop", {
      bubbles: true,
      clientX: bounds.left + bounds.width * 0.15,
      clientY: bounds.top + bounds.height * 0.15,
      dataTransfer,
    }));
  });
  await expect(page.getByRole("button", { name: "Doomed Kettle", exact: true })).toBeVisible();
  await expect(page.getByRole("status")).toHaveText("Saved on this device");

  const before = await spriteGeometry(page, "Doomed Kettle");
  await page.getByRole("button", { name: "Sprite options for Doomed Kettle" }).click();
  await page.getByRole("menuitem", { name: "Delete" }).click();

  await expect(page.getByRole("button", { name: "Doomed Kettle", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Undo" })).toBeVisible();
  await page.getByRole("button", { name: "Undo" }).click();

  await expect(page.getByRole("button", { name: "Doomed Kettle", exact: true })).toBeVisible();
  await expect(page.getByRole("status")).toHaveText("Saved on this device");
  await expect.poll(() => spriteGeometry(page, "Doomed Kettle")).toMatchObject({
    centerX: expect.closeTo(before.centerX, 2),
    centerY: expect.closeTo(before.centerY, 2),
  });

  await page.getByRole("button", { name: "Kept Lantern", exact: true }).click();
  await page.getByRole("button", { name: "Sprite options for Kept Lantern" }).click();
  await page.getByRole("menuitem", { name: "Delete" }).click();
  await page.getByRole("button", { name: "Done" }).click();
  await page.reload();
  await page.getByRole("button", { name: "Environments" }).click();
  await page.getByRole("button", { name: "Edit" }).click();
  await expect(page.getByRole("button", { name: "Kept Lantern", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Doomed Kettle", exact: true })).toBeVisible();
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
