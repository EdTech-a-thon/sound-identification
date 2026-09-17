import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("sound-explorer.welcomed", "true");
  });
});

const validImage = (name = "background.png", mimeType = "image/png") => ({
  name,
  mimeType,
  buffer: Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADElEQVR42mNk+M/wHwAF/gL+V3FuswAAAABJRU5ErkJggg==",
    "base64",
  ),
});

// A minimal, real, decodable WAV file (100ms of silence) so the browser's real <audio> decode
// check genuinely succeeds, the same way validImage() above is a real, decodable PNG.
const validAudio = (name = "chirp.mp3", mimeType = "audio/mpeg") => ({
  name,
  mimeType,
  buffer: Buffer.from(
    "UklGRkQDAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YSADAACAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgA==",
    "base64",
  ),
});

async function openLibrary(page) {
  const heading = page.getByRole("heading", { name: "Your environments" });
  const environmentsButton = page.getByRole("button", { name: "Environments" });
  await expect(heading.or(environmentsButton)).toBeVisible();
  if (await heading.isVisible()) return;
  await environmentsButton.click();
  await expect(heading).toBeVisible();
}

async function chooseBlankBackdrop(page) {
  await page.getByRole("button", { name: "Start with a blank background" }).click();
  await expect(page.getByRole("status")).toHaveText("Saved on this device");
  await expect(page.locator(".editor-backdrop.blank-backdrop")).toHaveCSS("background-color", "rgb(255, 255, 255)");
}

async function expectDocumentViewportContained(page) {
  await expect.poll(() => page.evaluate(() => ({
    clientHeight: document.documentElement.clientHeight,
    scrollHeight: document.documentElement.scrollHeight,
    bodyScrollHeight: document.body.scrollHeight,
    scrollY: window.scrollY,
  }))).toEqual(expect.objectContaining({
    clientHeight: await page.evaluate(() => window.innerHeight),
    scrollHeight: await page.evaluate(() => window.innerHeight),
    bodyScrollHeight: await page.evaluate(() => window.innerHeight),
    scrollY: 0,
  }));
}

// Reads what is actually on the device, media included: every blob comes back as its exact bytes
// so a duplicate can be compared to its original down to the last byte of image and audio.
async function storedEnvironments(page) {
  return page.evaluate(async () => {
    const database = await new Promise((resolve, reject) => {
      const request = indexedDB.open("sound-explorer", 1);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const records = await new Promise((resolve, reject) => {
      const transaction = database.transaction("environments", "readonly");
      const request = transaction.objectStore("environments").getAll();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    database.close();
    const describeBlob = async (blob) => blob
      ? { type: blob.type, bytes: [...new Uint8Array(await blob.arrayBuffer())] }
      : null;
    return Promise.all(records.map(async (record) => ({
      id: record.id,
      name: record.name,
      background: record.background
        ? { kind: record.background.kind ?? null, blob: await describeBlob(record.background.blob) }
        : null,
      sprites: await Promise.all((record.sprites || []).map(async (sprite) => ({
        id: sprite.id,
        name: sprite.name,
        xPercent: sprite.xPercent,
        yPercent: sprite.yPercent,
        sizePercent: sprite.sizePercent,
        rotationDegrees: sprite.rotationDegrees || 0,
        image: await describeBlob(sprite.image?.blob),
        sound: sprite.sound ? { label: sprite.sound.label, blob: await describeBlob(sprite.sound.blob) } : null,
      }))),
    })));
  });
}

function environmentNamed(records, name) {
  return records.find((record) => record.name === name);
}

function libraryCard(page, name) {
  return page.locator("article", { has: page.getByRole("heading", { name, exact: true }) });
}

async function openCardMenu(page, name) {
  await libraryCard(page, name).getByRole("button", { name: `More options for ${name}` }).click();
}

// Every uploaded backdrop passes through the cropper; confirming it is what saves the backdrop.
async function confirmBackdrop(page) {
  await page.getByRole("button", { name: "Use as backdrop" }).click();
  await expect(page.locator(".cropper-modal")).toHaveCount(0);
}

async function uploadBackdrop(page, file) {
  await page.getByLabel("Choose backdrop image").setInputFiles(file);
  await confirmBackdrop(page);
}

function spriteButton(page, name) {
  return page.getByRole("button", { name, exact: true });
}

// Selecting a sprite shows its card; the card's sound control opens the sound window.
async function openSpriteSound(page, name) {
  await spriteButton(page, name).click();
  await page.locator(".sprite-card-anchor.selected .open-sprite-sound").click();
  await expect(page.locator(".sound-modal")).toBeVisible();
}

function soundModal(page) {
  return page.locator(".sound-modal");
}

// Builds a two-sprite environment worth copying: an uploaded backdrop, one sprite with a sound
// and a rotation, and a second sprite dropped elsewhere so layer order is observable.
async function buildRichEnvironment(page, name) {
  await page.getByRole("button", { name: "Create environment" }).click();
  await page.getByLabel("Environment name").fill(name);
  await page.getByLabel("Environment name").press("Tab");
  await uploadBackdrop(page, validImage("meadow_backdrop.png"));
  await expect(page.getByRole("img", { name: "Environment backdrop" })).toBeVisible();

  await page.getByLabel("Add sprite image").setInputFiles(validImage("singing_lark.png"));
  await expect(page.getByRole("button", { name: "Singing Lark", exact: true })).toBeVisible();
  await openSpriteSound(page, "Singing Lark");
  await page.getByLabel("Add sound").setInputFiles(validAudio("lark_song.mp3"));
  await page.getByLabel("Sound label").fill("Lark singing");
  await soundModal(page).getByRole("button", { name: "Add sound" }).click();
  await expect(page.getByRole("status")).toHaveText("Saved on this device");

  await page.locator(".activity-canvas").evaluate((canvas, base64) => {
    const bounds = canvas.getBoundingClientRect();
    const dataTransfer = new DataTransfer();
    dataTransfer.items.add(new File([Uint8Array.from(atob(base64), (c) => c.charCodeAt(0))], "quiet_stone.png", { type: "image/png" }));
    canvas.dispatchEvent(new DragEvent("drop", { bubbles: true, clientX: bounds.left + bounds.width * 0.8, clientY: bounds.top + bounds.height * 0.25, dataTransfer }));
  }, "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADElEQVR42mNk+M/wHwAF/gL+V3FuswAAAABJRU5ErkJggg==");
  await expect(page.getByRole("button", { name: "Quiet Stone", exact: true })).toBeVisible();
  await expect(page.getByRole("status")).toHaveText("Saved on this device");

  // Rotate the lark so the copy has a rotation to preserve, not just the default zero.
  const lark = page.getByRole("button", { name: "Singing Lark", exact: true });
  await lark.click();
  const larkBox = await lark.boundingBox();
  const rotateHandle = page.locator(".sprite-transform-handles.selected .rotate-handle");
  const handleBox = await rotateHandle.boundingBox();
  await page.mouse.move(handleBox.x + handleBox.width / 2, handleBox.y + handleBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(larkBox.x + larkBox.width / 2 + 100, larkBox.y + larkBox.height / 2);
  await page.mouse.up();
  await expect(page.getByRole("status")).toHaveText("Saved on this device");
  expect(await spriteRotation(page, "Singing Lark")).toBeCloseTo(90, 0);

  await page.getByRole("button", { name: "Home" }).click();
  await expect(page.getByRole("heading", { name: "Your environments" })).toBeVisible();
}

async function spriteRotation(page, name) {
  return page.getByRole("button", { name, exact: true }).evaluate((el) => {
    const transform = getComputedStyle(el).transform;
    if (transform === "none") return 0;
    const [a, b] = transform.match(/^matrix\(([^)]+)\)$/)[1].split(",").map(Number);
    return Math.atan2(b, a) * (180 / Math.PI);
  });
}

async function spriteGeometry(page, name, containerSelector = ".activity-canvas") {
  const canvas = await page.locator(containerSelector).boundingBox();
  const sprite = await page.getByRole("button", { name, exact: true }).boundingBox();
  if (!canvas || !sprite) return null;
  return {
    centerX: (sprite.x + sprite.width / 2 - canvas.x) / canvas.width,
    centerY: (sprite.y + sprite.height / 2 - canvas.y) / canvas.height,
    widthRatio: sprite.width / canvas.width,
  };
}

test("first-time visitors see a welcome page, footer, and site information before entering the library", async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.removeItem("sound-explorer.welcomed");
    localStorage.removeItem("sound-explorer.park-added");
  });
  await page.goto("/");

  await expect(page.getByRole("heading", { name: "Turn everyday sounds into a learning adventure." })).toBeVisible();
  await expect(page.getByRole("contentinfo").getByRole("link", { name: "Built by teacher.dev" })).toHaveAttribute("href", "https://teacher.dev");
  await expect(page.getByRole("contentinfo").getByRole("link", { name: "about" })).toHaveAttribute("href", "/about");
  await expect(page.getByRole("contentinfo").getByRole("link", { name: "privacy" })).toHaveAttribute("href", "/privacy");

  await page.getByRole("button", { name: "Start creating" }).click();
  await expect(page.getByRole("heading", { name: "Your environments" })).toBeVisible();
  await page.getByRole("button", { name: "Help" }).click();
  await expect(page.getByRole("dialog", { name: "Need a hand?" })).toContainText("support@teacher.dev");
  await page.getByRole("button", { name: "Close help" }).click();
  await page.reload();
  await expect(page.getByRole("heading", { name: "Your environments" })).toBeVisible();

  await page.goto("/about");
  await expect(page.getByRole("heading", { name: "About Everyday Sound Lab" })).toBeVisible();
  await page.goto("/privacy");
  await expect(page.getByRole("heading", { name: "Privacy" })).toBeVisible();
});

test("every surface has its own address, the Park example included", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveURL("/");

  await page.getByRole("button", { name: "Play A day at the park" }).click();
  await expect(page).toHaveURL("/play/park");
  await expect(page.getByRole("heading", { name: "A day at the park" })).toBeVisible();

  await page.goto("/play/park");
  await expect(page.getByRole("heading", { name: "A day at the park" })).toBeVisible();
  await page.reload();
  await expect(page).toHaveURL("/play/park");
  await expect(page.getByRole("heading", { name: "A day at the park" })).toBeVisible();
});

test("quiz sounds are chosen independently, so the same sound can play twice in a row", async ({ page }) => {
  await page.addInitScript(() => {
    Math.random = () => 0;
  });
  await page.goto("/play/park");

  const bird = page.getByRole("button", { name: "Choose the Bird", exact: true });
  await bird.click();
  await expect(page.getByRole("status")).toHaveText("Yes! That was bird.");

  await page.getByRole("button", { name: "New sound" }).click();
  await bird.click();
  await expect(page.getByRole("status")).toHaveText("Yes! That was bird.");
});

test("an environment editor has its own address that survives a reload", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Create environment" }).click();
  const name = page.getByLabel("Environment name");
  await name.fill("Riverbank sounds");
  await name.press("Enter");
  await expect(page.getByRole("status")).toHaveText("Saved on this device");

  const editorUrl = page.url();
  expect(editorUrl).toMatch(/\/environments\/[0-9a-f-]{36}$/);

  await page.reload();
  await expect(page).toHaveURL(editorUrl);
  await expect(page.getByRole("toolbar", { name: "Editor toolbar" })).toBeVisible();
  await expect(page.getByLabel("Environment name")).toHaveValue("Riverbank sounds");
});

test("browser Back and Forward move between the library, an editor, and play", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Create environment" }).click();
  const name = page.getByLabel("Environment name");
  await name.fill("Harbour sounds");
  await name.press("Enter");
  await expect(page.getByRole("status")).toHaveText("Saved on this device");
  const editorUrl = page.url();

  await page.getByRole("button", { name: "Home" }).click();
  await expect(page).toHaveURL("/");
  await page.getByRole("button", { name: "Play A day at the park" }).click();
  await expect(page.getByRole("heading", { name: "A day at the park" })).toBeVisible();

  await page.goBack();
  await expect(page).toHaveURL("/");
  await expect(page.getByRole("heading", { name: "Your environments" })).toBeVisible();

  await page.goBack();
  await expect(page).toHaveURL(editorUrl);
  await expect(page.getByLabel("Environment name")).toHaveValue("Harbour sounds");

  await page.goForward();
  await expect(page).toHaveURL("/");
  await page.goForward();
  await expect(page).toHaveURL("/play/park");
  await expect(page.getByRole("heading", { name: "A day at the park" })).toBeVisible();
});

test("an address for an environment that is not there falls back to the library", async ({ page }) => {
  await page.goto("/environments/00000000-0000-4000-8000-000000000000");
  await expect(page.getByRole("heading", { name: "Your environments" })).toBeVisible();
  await expect(page).toHaveURL("/");

  await page.goto("/play/00000000-0000-4000-8000-000000000000");
  await expect(page.getByRole("heading", { name: "Your environments" })).toBeVisible();
  await expect(page).toHaveURL("/");

  await page.goto("/somewhere/else");
  await expect(page.getByRole("heading", { name: "Your environments" })).toBeVisible();
  await expect(page).toHaveURL("/");
});

test("the Park example ships with the app, is editable, and stays deleted once deleted", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByRole("heading", { name: "Your environments" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "A day at the park" })).toBeVisible();
  await expect(page.getByText("Ready to play", { exact: true })).toBeVisible();
  await expect(page.getByText("4 sprites · 4 sounds", { exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Kitchen" })).toHaveCount(0);

  // Park is an ordinary environment: it opens in the editor with its sprites in place.
  await libraryCard(page, "A day at the park").getByRole("button", { name: "Edit" }).click();
  await expect(page.getByRole("button", { name: "Slide", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Bird", exact: true })).toBeVisible();

  // Deleting it is allowed and it stays deleted after a reload; there is no button to add it back.
  await page.getByRole("button", { name: "Home" }).click();
  await openCardMenu(page, "A day at the park");
  await page.getByRole("menuitem", { name: "Delete" }).click();
  await page.getByRole("button", { name: "Delete environment" }).click();
  await expect(page.getByRole("heading", { name: "A day at the park" })).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole("heading", { name: "Your environments" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "A day at the park" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Add the Park example" })).toHaveCount(0);
});

test("educators can create, name, and reopen a saved draft", async ({ page }) => {
  await page.goto("/");
  await openLibrary(page);
  await page.getByRole("button", { name: "Create environment" }).click();

  const name = page.getByLabel("Environment name");
  await expect(name).toBeFocused();
  await expect(name).toHaveValue("Untitled environment");
  await name.fill("Forest sounds");
  await name.press("Tab");
  await expect(page.getByRole("status")).toHaveText("Saved on this device");

  await page.getByRole("button", { name: "Home" }).click();
  await expect(page.getByRole("heading", { name: "Forest sounds" })).toBeVisible();
  await page.reload();
  await openLibrary(page);
  await expect(page.getByRole("heading", { name: "Forest sounds" })).toBeVisible();
  await libraryCard(page, "Forest sounds").getByRole("button", { name: "Edit" }).click();
  await expect(page.getByLabel("Environment name")).toHaveValue("Forest sounds");
});

test("the editor toolbar leads with the project mark, arrow undo and redo, and no second Back button", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Create environment" }).click();

  const toolbar = page.getByRole("toolbar", { name: "Editor toolbar" });
  await expect(toolbar).toBeVisible();

  const home = toolbar.getByRole("button", { name: "Home" });
  await expect(home).toBeVisible();
  await expect(home).toHaveAttribute("title", "Home");
  await expect(home.locator("svg.icon-artwork")).toBeVisible();
  await expect(toolbar.getByText("Everyday Sound Lab", { exact: true })).toBeVisible();
  // Browser Back now does exactly what the old in-app Back button did, so there is only one.
  await expect(toolbar.getByRole("button", { name: "Back", exact: true })).toHaveCount(0);

  const undo = toolbar.getByRole("button", { name: "Undo" });
  const redo = toolbar.getByRole("button", { name: "Redo" });
  await expect(undo).toBeDisabled();
  await expect(redo).toBeDisabled();
  await expect(undo).toHaveAttribute("title", "Undo");
  await expect(redo).toHaveAttribute("title", "Redo");
  await expect(undo.locator("svg")).toBeVisible();
  await expect(redo.locator("svg")).toBeVisible();

  const name = page.getByRole("textbox", { name: "Environment name" });
  await expect(name).toBeFocused();
  await name.fill("Woodland listening");
  await name.press("Enter");
  await expect(page.getByRole("status")).toHaveText("Saved on this device");
  await expect(undo).toBeEnabled();

  await undo.click();
  await expect(name).toHaveValue("Untitled environment");
  await redo.click();
  await expect(name).toHaveValue("Woodland listening");

  await home.click();
  await expect(page).toHaveURL("/");
  await expect(page.getByRole("heading", { name: "Your environments" })).toBeVisible();
});

test("the save state reads as an icon while keeping its wording for assistive technology", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Create environment" }).click();

  const status = page.getByRole("status");
  await expect(status).toHaveText("Saved on this device");
  await expect(status).toHaveAttribute("title", "Saved on this device");
  await expect(status.locator("svg")).toBeVisible();
  // The sentence is still in the live region; the toolbar simply gives it no pixels.
  expect(await status.locator(".storage-status-text").evaluate((element) => element.getBoundingClientRect().width)).toBeLessThanOrEqual(1);

  await page.getByRole("button", { name: "Home" }).click();
  await expect(page.getByRole("status")).toHaveText("Saved on this device");
  await expect(page.getByRole("status").locator("svg")).toBeVisible();
});

test("Change backdrop and Add sprite live in the control panel under the activity area, and sprites stay gated until a backdrop exists", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Create environment" }).click();

  const controls = page.getByRole("group", { name: "Backdrop and sprites" });
  await expect(controls.getByRole("button", { name: "Add sprite after choosing a backdrop" })).toBeDisabled();
  await expect(controls.getByRole("button", { name: "Change backdrop" })).toHaveCount(0);
  await expect(page.getByLabel("Add sprite image")).toHaveCount(0);
  // The panel also carries the guidance that used to float over the activity area.
  await expect(controls.getByText(/This draft needs a backdrop/)).toBeVisible();

  await chooseBlankBackdrop(page);
  await expect(controls.getByRole("button", { name: "Change backdrop" })).toBeVisible();
  // The panel sits below the activity area, not above it.
  const canvas = await page.locator(".activity-canvas").boundingBox();
  const panel = await controls.boundingBox();
  expect(panel.y).toBeGreaterThanOrEqual(canvas.y + canvas.height - 1);

  const spritePicker = controls.getByLabel("Add sprite image");
  await expect(spritePicker).toBeAttached();
  await spritePicker.focus();
  await expect(spritePicker).toBeFocused();
  await spritePicker.setInputFiles(validImage("toolbar_tent.png"));
  await expect(page.getByRole("button", { name: "Toolbar Tent", exact: true })).toBeVisible();

  await controls.getByRole("button", { name: "Change backdrop" }).click();
  await expect(page.getByRole("dialog", { name: "Change backdrop" })).toBeVisible();
});

test("the activity area is not wrapped in a card and keeps its size as guidance appears and clears", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Create environment" }).click();
  await chooseBlankBackdrop(page);
  await page.getByLabel("Add sprite image").setInputFiles(validImage("steady_stone.png"));
  await expect(page.getByRole("status")).toHaveText("Saved on this device");

  await expect(page.locator(".editor-workspace")).toHaveCount(0);
  const canvas = page.locator(".activity-canvas");
  const before = await canvas.boundingBox();

  await canvas.evaluate((element) => {
    const dataTransfer = new DataTransfer();
    dataTransfer.items.add(new File(["first"], "first.png", { type: "image/png" }));
    dataTransfer.items.add(new File(["second"], "second.png", { type: "image/png" }));
    element.dispatchEvent(new DragEvent("drop", { bubbles: true, dataTransfer }));
  });
  await expect(page.getByRole("alert")).toHaveText("Drop one image at a time.");
  const withGuidance = await canvas.boundingBox();
  expect(withGuidance.width).toBeCloseTo(before.width, 1);
  expect(withGuidance.height).toBeCloseTo(before.height, 1);
  expect(withGuidance.y).toBeCloseTo(before.y, 1);

  await page.locator(".editor-message", { has: page.getByRole("alert") }).getByRole("button", { name: "Dismiss message" }).click();
  await expect(page.getByText("Drop one image at a time.")).toHaveCount(0);
  const afterGuidance = await canvas.boundingBox();
  expect(afterGuidance.width).toBeCloseTo(before.width, 1);
  expect(afterGuidance.height).toBeCloseTo(before.height, 1);
  expect(afterGuidance.y).toBeCloseTo(before.y, 1);
});

test("the initial canvas offers direct backdrop picking and persists an uploaded backdrop", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Create environment" }).click();

  await expect(page.getByRole("heading", { name: "Drag backdrop in" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Start with a blank background" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Add sprite after choosing a backdrop" })).toBeDisabled();
  await expect(page.getByLabel("Add sprite image")).toHaveCount(0);
  await expect(page.getByText(/This draft needs a backdrop/i)).toBeVisible();

  await uploadBackdrop(page, validImage("forest.png"));
  await expect(page.getByText("Backdrop added.")).toBeVisible();
  await expect(page.getByRole("img", { name: "Environment backdrop" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Change backdrop" })).toBeVisible();
  await expect(page.getByRole("status")).toHaveText("Saved on this device");

  await page.getByRole("button", { name: "Home" }).click();
  const card = page.locator("article", { has: page.getByRole("heading", { name: "Untitled environment" }) });
  await expect(card.getByRole("img", { name: "Backdrop for Untitled environment" })).toBeVisible();
  await expect(card).toContainText(/at least one sprite with a sound/i);

  await page.reload();
  const reopenedCard = page.locator("article", { has: page.getByRole("heading", { name: "Untitled environment" }) });
  await expect(reopenedCard.getByRole("img", { name: "Backdrop for Untitled environment" })).toBeVisible();
  await reopenedCard.getByRole("button", { name: "Edit" }).click();
  await expect(page.getByRole("img", { name: "Environment backdrop" })).toBeVisible();
});

test("direct backdrop drop works and uploaded backdrop replacement or removal stays deliberate", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Create environment" }).click();

  await page.locator(".activity-canvas").evaluate((canvas) => {
    const dataTransfer = new DataTransfer();
    dataTransfer.items.add(new File([
      Uint8Array.from(atob("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADElEQVR42mNk+M/wHwAF/gL+V3FuswAAAABJRU5ErkJggg=="), (character) => character.charCodeAt(0)),
    ], "dropped.webp", { type: "image/webp" }));
    canvas.dispatchEvent(new DragEvent("drop", { bubbles: true, dataTransfer }));
  });
  // A dropped picture opens the cropper first; the backdrop is only saved once it is confirmed.
  await expect(page.getByRole("dialog", { name: "Position your backdrop" })).toBeVisible();
  await confirmBackdrop(page);
  await expect(page.getByText("Backdrop added.")).toBeVisible();
  await page.getByLabel("Add sprite image").setInputFiles(validImage("kept_sprite.png"));
  await expect(page.getByRole("button", { name: "Kept Sprite", exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Change backdrop" }).click();
  await expect(page.getByRole("dialog", { name: "Change backdrop" })).toBeVisible();
  const picker = page.getByLabel("Choose backdrop image");
  await picker.setInputFiles(validImage("replacement.jpg", "image/jpeg"));
  await expect(page.getByRole("dialog", { name: "Position your backdrop" })).toBeVisible();
  await page.getByRole("button", { name: "Cancel" }).click();
  await expect(page.getByRole("dialog", { name: "Position your backdrop" })).toHaveCount(0);
  await expect(page.getByText("Backdrop replaced.")).toHaveCount(0);

  await page.getByRole("button", { name: "Change backdrop" }).click();
  await uploadBackdrop(page, validImage("replacement.jpg", "image/jpeg"));
  await expect(page.getByText("Backdrop replaced.")).toBeVisible();
  await page.getByRole("button", { name: "Change backdrop" }).click();
  await page.getByRole("button", { name: "Remove backdrop" }).click();
  await expect(page.getByRole("heading", { name: "Remove this backdrop?" })).toBeVisible();
  await page.getByRole("button", { name: "Remove backdrop" }).last().click();

  await expect(page.getByRole("heading", { name: "Drag backdrop in" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Add sprite after choosing a backdrop" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Kept Sprite", exact: true })).toHaveCount(0);
  await chooseBlankBackdrop(page);
  await expect(page.getByRole("button", { name: "Kept Sprite", exact: true })).toBeVisible();
});

test("initial backdrop validation rejects bad files without history and gates sprite image or audio drops", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Create environment" }).click();

  const picker = page.getByLabel("Choose backdrop image");
  await picker.setInputFiles({ name: "notes.txt", mimeType: "text/plain", buffer: Buffer.from("not an image") });
  await expect(page.getByRole("alert")).toHaveText("Choose a PNG, JPEG, or WebP image.");
  await expect(page.getByRole("button", { name: "Undo" })).toBeDisabled();

  await picker.setInputFiles({ name: "large.png", mimeType: "image/png", buffer: Buffer.alloc(10 * 1024 * 1024 + 1) });
  await expect(page.getByRole("alert")).toHaveText("Choose an image smaller than 10 MB.");
  await picker.setInputFiles({ name: "broken.png", mimeType: "image/png", buffer: Buffer.from("these bytes are not an image") });
  await expect(page.getByRole("alert")).toHaveText(/image could not be opened/i);

  await page.locator(".activity-canvas").evaluate((canvas) => {
    const dataTransfer = new DataTransfer();
    dataTransfer.items.add(new File(["audio"], "bird.mp3", { type: "audio/mpeg" }));
    canvas.dispatchEvent(new DragEvent("drop", { bubbles: true, dataTransfer }));
  });
  await expect(page.getByRole("alert")).toHaveText("Choose a backdrop before adding sprites or sounds.");
  await expect(page.locator(".editor-sprite")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Undo" })).toBeDisabled();
});

test("educators can deselect a sprite by clicking empty canvas space", async ({ page }) => {
  await page.goto("/");
  await openLibrary(page);
  await page.getByRole("button", { name: "Create environment" }).click();
  await chooseBlankBackdrop(page);
  await page.getByLabel("Add sprite image").setInputFiles(validImage("scene.png"));

  await expect(page.getByRole("button", { name: "Scene", exact: true })).toHaveAttribute("aria-pressed", "true");
  await page.locator(".activity-canvas").click({ position: { x: 10, y: 10 } });
  await expect(page.getByRole("button", { name: "Scene", exact: true })).toHaveAttribute("aria-pressed", "false");
});

test("educators add a named, centered sprite whose relative size adapts to the activity area", async ({ page }) => {
  await page.goto("/");
  await openLibrary(page);
  await page.getByRole("button", { name: "Create environment" }).click();
  await chooseBlankBackdrop(page);

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

test("a selected sprite shows resize handles, and dragging a corner handle resizes it proportionally and persists", async ({ page }) => {
  await page.goto("/");
  await openLibrary(page);
  await page.getByRole("button", { name: "Create environment" }).click();
  await chooseBlankBackdrop(page);
  await page.getByLabel("Add sprite image").setInputFiles(validImage("puzzle_piece.png"));
  await expect(page.getByRole("button", { name: "Puzzle Piece", exact: true })).toBeVisible();
  await expect(page.getByRole("status")).toHaveText("Saved on this device");

  const before = await spriteGeometry(page, "Puzzle Piece");
  const seHandle = page.locator(".sprite-transform-handles.selected .handle-se");
  await expect(seHandle).toBeVisible();
  await expect(page.locator(".sprite-transform-handles.selected .rotate-handle")).toBeVisible();
  await expect(page.locator(".sprite-transform-handles.selected .resize-handle")).toHaveCount(4);

  const handleBox = await seHandle.boundingBox();
  await page.mouse.move(handleBox.x + handleBox.width / 2, handleBox.y + handleBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(handleBox.x + 60, handleBox.y + 60);
  await page.mouse.up();
  await expect(page.getByRole("status")).toHaveText("Saved on this device");

  const after = await spriteGeometry(page, "Puzzle Piece");
  expect(after.widthRatio).toBeGreaterThan(before.widthRatio);
  expect(after.centerX).toBeCloseTo(before.centerX, 1);
  expect(after.centerY).toBeCloseTo(before.centerY, 1);

  await page.getByRole("button", { name: "Home" }).click();
  await page.reload();
  await openLibrary(page);
  await page.getByRole("button", { name: "Edit" }).last().click();
  await expect.poll(() => spriteGeometry(page, "Puzzle Piece")).toMatchObject({
    widthRatio: expect.closeTo(after.widthRatio, 2),
  });
});

test("resizing or rotating a sprite already at the canvas edge keeps it recoverable within the activity area", async ({ page }) => {
  await page.goto("/");
  await openLibrary(page);
  await page.getByRole("button", { name: "Create environment" }).click();
  await chooseBlankBackdrop(page);
  await page.getByLabel("Add sprite image").setInputFiles(validImage("corner_lamp.png"));
  const sprite = page.getByRole("button", { name: "Corner Lamp", exact: true });
  await expect(sprite).toBeVisible();
  await expect(page.getByRole("status")).toHaveText("Saved on this device");

  const canvasBox = await page.locator(".activity-canvas").boundingBox();
  const spriteBox = await sprite.boundingBox();
  await page.mouse.move(spriteBox.x + spriteBox.width / 2, spriteBox.y + spriteBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(canvasBox.x + canvasBox.width + 300, canvasBox.y + canvasBox.height + 300);
  await page.mouse.up();
  await expect(page.getByRole("status")).toHaveText("Saved on this device");
  const atCorner = await spriteGeometry(page, "Corner Lamp");
  expect(atCorner.centerX).toBeGreaterThan(0.85);

  const seHandle = page.locator(".sprite-transform-handles.selected .handle-se");
  const seBox = await seHandle.boundingBox();
  await page.mouse.move(seBox.x + seBox.width / 2, seBox.y + seBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(seBox.x + 220, seBox.y + 220);
  await page.mouse.up();
  await expect(page.getByRole("status")).toHaveText("Saved on this device");
  const afterResize = await spriteGeometry(page, "Corner Lamp");
  expect(afterResize.centerX + afterResize.widthRatio / 2).toBeLessThanOrEqual(1.01);
  expect(afterResize.centerY + afterResize.widthRatio / 2).toBeLessThanOrEqual(1.01);

  const rotateHandle = page.locator(".sprite-transform-handles.selected .rotate-handle");
  const rotateBox = await rotateHandle.boundingBox();
  const spriteCenter = await sprite.boundingBox().then((box) => ({ x: box.x + box.width / 2, y: box.y + box.height / 2 }));
  await page.mouse.move(rotateBox.x + rotateBox.width / 2, rotateBox.y + rotateBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(spriteCenter.x + 80, spriteCenter.y - 80);
  await page.mouse.up();
  await expect(page.getByRole("status")).toHaveText("Saved on this device");
  const afterRotate = await spriteGeometry(page, "Corner Lamp");
  expect(afterRotate.centerX + afterRotate.widthRatio / 2).toBeLessThanOrEqual(1.01);
  expect(afterRotate.centerY + afterRotate.widthRatio / 2).toBeLessThanOrEqual(1.01);
});

test("rotation snaps to 45-degree steps, Shift rotates freely, and rotation persists and renders consistently across sizes", async ({ page }) => {
  await page.goto("/");
  await openLibrary(page);
  await page.getByRole("button", { name: "Create environment" }).click();
  await chooseBlankBackdrop(page);
  await page.getByLabel("Add sprite image").setInputFiles(validImage("weathervane.png"));
  await expect(page.getByRole("button", { name: "Weathervane", exact: true })).toBeVisible();
  await expect(page.getByRole("status")).toHaveText("Saved on this device");

  expect(await spriteRotation(page, "Weathervane")).toBeCloseTo(0, 0);

  // Drags the rotation handle until the pointer sits `degreesFromUp` clockwise from straight up,
  // which is the angle the sprite would take if rotation were completely unsnapped.
  const dragRotationHandleTo = async (degreesFromUp, freeRotation = false) => {
    const box = await page.getByRole("button", { name: "Weathervane", exact: true }).boundingBox();
    const centerX = box.x + box.width / 2;
    const centerY = box.y + box.height / 2;
    const rotateHandle = page.locator(".sprite-transform-handles.selected .rotate-handle");
    await expect(rotateHandle).toBeVisible();
    const handleBox = await rotateHandle.boundingBox();
    const radians = ((degreesFromUp - 90) * Math.PI) / 180;
    await page.mouse.move(handleBox.x + handleBox.width / 2, handleBox.y + handleBox.height / 2);
    await page.mouse.down();
    if (freeRotation) await page.keyboard.down("Shift");
    await page.mouse.move(centerX + Math.cos(radians) * 120, centerY + Math.sin(radians) * 120);
    await page.mouse.up();
    if (freeRotation) await page.keyboard.up("Shift");
    await expect(page.getByRole("status")).toHaveText("Saved on this device");
  };

  await dragRotationHandleTo(100);
  expect(await spriteRotation(page, "Weathervane")).toBeCloseTo(90, 0);

  await dragRotationHandleTo(120, true);
  expect(Math.abs(await spriteRotation(page, "Weathervane") - 120)).toBeLessThan(1.5);

  await dragRotationHandleTo(80);
  expect(await spriteRotation(page, "Weathervane")).toBeCloseTo(90, 0);

  await page.getByRole("button", { name: "Home" }).click();
  await page.reload();
  await openLibrary(page);
  await page.getByRole("button", { name: "Edit" }).last().click();
  await expect(page.getByRole("button", { name: "Weathervane", exact: true })).toBeVisible();
  expect(await spriteRotation(page, "Weathervane")).toBeCloseTo(90, 0);

  await page.setViewportSize({ width: 500, height: 800 });
  expect(await spriteRotation(page, "Weathervane")).toBeCloseTo(90, 0);
});

test("the sprite card sits upright under the sprite's footprint however the sprite is rotated", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Create environment" }).click();
  await chooseBlankBackdrop(page);
  await page.getByLabel("Add sprite image").setInputFiles(validImage("compass_rose.png"));
  const sprite = page.getByRole("button", { name: "Compass Rose", exact: true });
  await expect(sprite).toBeVisible();
  await expect(page.getByRole("status")).toHaveText("Saved on this device");

  const card = page.getByRole("toolbar", { name: "Sprite options for Compass Rose" });
  await expect(card).toBeVisible();
  await expect(card.getByRole("button", { name: "Rename Compass Rose" })).toBeVisible();
  await expect(card.getByRole("button", { name: "Add sound" })).toBeVisible();
  await expect(card.getByLabel("Replace image")).toBeAttached();
  await expect(card.getByRole("button", { name: "Duplicate" })).toBeVisible();
  await expect(card.getByRole("button", { name: "Delete" })).toBeVisible();

  const cardPlacement = async () => {
    const spriteBox = await sprite.boundingBox();
    const cardBox = await card.boundingBox();
    return {
      belowSprite: cardBox.y >= spriteBox.y + spriteBox.height,
      centeredOnSprite: Math.abs(cardBox.x + cardBox.width / 2 - (spriteBox.x + spriteBox.width / 2)) < 2,
      rotation: await card.evaluate((element) => {
        const transform = getComputedStyle(element).transform;
        if (transform === "none") return 0;
        const matrix = new DOMMatrix(transform);
        return Math.round(Math.atan2(matrix.b, matrix.a) * (180 / Math.PI));
      }),
    };
  };
  expect(await cardPlacement()).toEqual({ belowSprite: true, centeredOnSprite: true, rotation: 0 });

  const spriteBox = await sprite.boundingBox();
  const centerX = spriteBox.x + spriteBox.width / 2;
  const centerY = spriteBox.y + spriteBox.height / 2;
  const rotateHandle = page.locator(".sprite-transform-handles.selected .rotate-handle");
  const handleBox = await rotateHandle.boundingBox();
  await page.mouse.move(handleBox.x + handleBox.width / 2, handleBox.y + handleBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(centerX + 70, centerY - 70);
  await page.mouse.up();
  await expect(page.getByRole("status")).toHaveText("Saved on this device");
  expect(await spriteRotation(page, "Compass Rose")).toBeCloseTo(45, 0);

  // Rotated 45 degrees the sprite's footprint is taller; the card is still upright and below it.
  expect(await cardPlacement()).toEqual({ belowSprite: true, centeredOnSprite: true, rotation: 0 });
});

test("sprite selection and saving keep the canvas and image preview in place", async ({ page }) => {
  await page.goto("/");
  await openLibrary(page);
  await page.getByRole("button", { name: "Create environment" }).click();
  await chooseBlankBackdrop(page);
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

test("adding a sprite leaves the canvas, backdrop, name field, and existing sprites untouched", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Create environment" }).click();
  await uploadBackdrop(page, validImage("steady_backdrop.png"));
  await expect(page.getByRole("img", { name: "Environment backdrop" })).toBeVisible();
  await page.getByLabel("Add sprite image").setInputFiles(validImage("first_lamp.png"));
  await expect(page.getByRole("button", { name: "First Lamp", exact: true })).toBeVisible();
  await expect(page.getByRole("status")).toHaveText("Saved on this device");

  await page.evaluate(() => {
    const backdrop = document.querySelector(".editor-backdrop");
    window.editorDomBeforeAdd = {
      canvas: document.querySelector(".activity-canvas"),
      backdrop,
      backdropSrc: backdrop.src,
      firstSprite: document.querySelector(".editor-sprite"),
      nameInput: document.querySelector(".environment-name-input"),
    };
  });

  await page.getByLabel("Add sprite image").setInputFiles(validImage("second_lamp.png"));
  await expect(page.getByRole("button", { name: "Second Lamp", exact: true })).toBeVisible();
  await expect(page.getByRole("status")).toHaveText("Saved on this device");

  await expect.poll(() => page.evaluate(() => {
    const before = window.editorDomBeforeAdd;
    const backdrop = document.querySelector(".editor-backdrop");
    return document.querySelector(".activity-canvas") === before.canvas
      && backdrop === before.backdrop
      && backdrop.src === before.backdropSrc
      && document.querySelector(".environment-name-input") === before.nameInput
      && before.firstSprite.isConnected;
  })).toBe(true);
});

test("transient editor guidance can be dismissed so it never sticks to the screen", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Create environment" }).click();
  await chooseBlankBackdrop(page);

  await page.locator(".activity-canvas").evaluate((canvas) => {
    const dataTransfer = new DataTransfer();
    dataTransfer.items.add(new File(["first"], "first.png", { type: "image/png" }));
    dataTransfer.items.add(new File(["second"], "second.png", { type: "image/png" }));
    canvas.dispatchEvent(new DragEvent("drop", { bubbles: true, dataTransfer }));
  });
  await expect(page.getByRole("alert")).toHaveText("Drop one image at a time.");

  const guidance = page.locator(".editor-message", { has: page.getByRole("alert") });
  await guidance.getByRole("button", { name: "Dismiss message" }).click();
  await expect(page.getByText("Drop one image at a time.")).toHaveCount(0);
  await expect(page.getByText("Blank backdrop added.")).toBeVisible();
});

test("one multi-move drag is one undo step, redo restores it, and a new edit clears redo", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Create environment" }).click();
  await chooseBlankBackdrop(page);
  await page.getByLabel("Add sprite image").setInputFiles(validImage("history_heron.png"));
  await expect(page.getByRole("status")).toHaveText("Saved on this device");

  const sprite = page.getByRole("button", { name: "History Heron", exact: true });
  const before = await spriteGeometry(page, "History Heron");
  const spriteBox = await sprite.boundingBox();
  await page.mouse.move(spriteBox.x + spriteBox.width / 2, spriteBox.y + spriteBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(spriteBox.x + spriteBox.width / 2 + 120, spriteBox.y + spriteBox.height / 2 + 70, { steps: 8 });
  await page.mouse.up();
  await expect(page.getByRole("status")).toHaveText("Saved on this device");
  const after = await spriteGeometry(page, "History Heron");
  expect(after.centerX).toBeGreaterThan(before.centerX);

  await page.getByRole("button", { name: "Undo" }).click();
  await expect.poll(() => spriteGeometry(page, "History Heron")).toMatchObject({
    centerX: expect.closeTo(before.centerX, 2),
    centerY: expect.closeTo(before.centerY, 2),
  });
  await page.getByRole("button", { name: "Redo" }).click();
  await expect.poll(() => spriteGeometry(page, "History Heron")).toMatchObject({
    centerX: expect.closeTo(after.centerX, 2),
    centerY: expect.closeTo(after.centerY, 2),
  });

  await page.getByRole("button", { name: "Undo" }).click();
  const name = page.getByLabel("Environment name");
  await name.fill("A new branch");
  await name.press("Enter");
  await expect(page.getByRole("button", { name: "Redo" })).toBeDisabled();
});

test("educators can only drop one sprite image at a time", async ({ page }) => {
  await page.goto("/");
  await openLibrary(page);
  await page.getByRole("button", { name: "Create environment" }).click();
  await chooseBlankBackdrop(page);

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
  await openLibrary(page);
  await page.getByRole("button", { name: "Create environment" }).click();
  await chooseBlankBackdrop(page);

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
  await openLibrary(page);
  await page.getByRole("button", { name: "Create environment" }).click();
  await chooseBlankBackdrop(page);

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
  // The activity area is 16:9, so a sprite 14% wide is 14% × 16/9 ≈ 25% tall: it stops with its
  // center 7% in from the sides and about 12.5% in from the top and bottom.
  await moveBirdTo(canvasBox.x - 200, canvasBox.y - 200);
  await expect.poll(() => spriteGeometry(page, "First Bird")).toMatchObject({ centerX: expect.closeTo(0.07, 1), centerY: expect.closeTo(0.125, 1) });
  await moveBirdTo(canvasBox.x + canvasBox.width + 200, canvasBox.y + canvasBox.height + 200);
  await expect.poll(() => spriteGeometry(page, "First Bird")).toMatchObject({ centerX: expect.closeTo(0.93, 1), centerY: expect.closeTo(0.875, 1) });

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


  await page.getByRole("button", { name: "Home" }).click();
  await page.reload();
  await openLibrary(page);
  await page.getByRole("button", { name: "Edit" }).last().click();
  await expect(firstBird).toBeVisible();
  await expect(secondFox).toBeVisible();
  await expect(droppedOwl).toBeVisible();
  await expect(firstBird).toHaveCSS("z-index", "3");
  await expect.poll(() => spriteGeometry(page, "First Bird")).toMatchObject({
    centerX: expect.closeTo(0.93, 1),
    centerY: expect.closeTo(0.875, 1),
  });

  await page.setViewportSize({ width: 500, height: 800 });
  await expect.poll(() => spriteGeometry(page, "Dropped Owl")).toMatchObject({
    centerX: expect.closeTo(0.25, 1),
    centerY: expect.closeTo(0.65, 1),
    widthRatio: expect.closeTo(0.14, 2),
  });
});

test("right-clicking a sprite opens a context menu with the card's actions, which closes on Escape or an outside click", async ({ page }) => {
  await page.goto("/");
  await openLibrary(page);
  await page.getByRole("button", { name: "Create environment" }).click();
  await chooseBlankBackdrop(page);
  await page.getByLabel("Add sprite image").setInputFiles(validImage("garden_gnome.png"));

  const sprite = page.getByRole("button", { name: "Garden Gnome", exact: true });
  await expect(sprite).toBeVisible();
  await sprite.click({ button: "right" });
  const menu = page.getByRole("menu");
  await expect(menu).toBeVisible();
  await expect(menu.getByRole("menuitem", { name: "Rename" })).toBeVisible();
  await expect(menu.getByLabel("Replace image")).toBeAttached();
  await expect(menu.getByRole("menuitem", { name: "Add sound" })).toBeVisible();
  await expect(menu.getByRole("menuitem", { name: "Duplicate" })).toBeVisible();
  await expect(menu.getByRole("menuitem", { name: "Delete" })).toBeVisible();

  await page.keyboard.press("Escape");
  await expect(menu).toHaveCount(0);
  await expect(sprite).toHaveAttribute("aria-pressed", "true");

  await sprite.click({ button: "right" });
  await expect(menu).toBeVisible();
  await page.locator(".activity-canvas").click({ position: { x: 5, y: 5 } });
  await expect(menu).toHaveCount(0);

  // The menu's Duplicate does what the card's Duplicate does: a second, selected copy appears.
  await sprite.click({ button: "right" });
  await menu.getByRole("menuitem", { name: "Duplicate" }).click();
  await expect(page.getByRole("button", { name: "Garden Gnome", exact: true })).toHaveCount(2);
  await expect(page.getByRole("status")).toHaveText("Saved on this device");
});

test("educators can rename a sprite from its card and the name survives reload", async ({ page }) => {
  await page.goto("/");
  await openLibrary(page);
  await page.getByRole("button", { name: "Create environment" }).click();
  await chooseBlankBackdrop(page);
  await page.getByLabel("Add sprite image").setInputFiles(validImage("old_name.png"));

  await spriteButton(page, "Old Name").click();
  await page.getByRole("button", { name: "Rename Old Name" }).click();
  const nameField = page.getByLabel("Sprite name");
  await expect(nameField).toBeFocused();
  await nameField.fill("Whispering Willow");
  await nameField.press("Enter");

  await expect(page.getByRole("button", { name: "Whispering Willow", exact: true })).toBeVisible();
  await expect(page.getByRole("status")).toHaveText("Saved on this device");

  await page.getByRole("button", { name: "Home" }).click();
  await page.reload();
  await openLibrary(page);
  await page.getByRole("button", { name: "Edit" }).last().click();
  await expect(page.getByRole("button", { name: "Whispering Willow", exact: true })).toBeVisible();
});

test("replacing a sprite's image validates the file and preserves its position, size, and identity", async ({ page }) => {
  await page.goto("/");
  await openLibrary(page);
  await page.getByRole("button", { name: "Create environment" }).click();
  await chooseBlankBackdrop(page);
  await page.getByLabel("Add sprite image").setInputFiles(validImage("river_otter.png"));
  await expect(page.getByRole("button", { name: "River Otter", exact: true })).toBeVisible();
  await expect(page.getByRole("status")).toHaveText("Saved on this device");

  const before = await spriteGeometry(page, "River Otter");
  await spriteButton(page, "River Otter").click();

  const replace = page.getByRole("toolbar", { name: "Sprite options for River Otter" }).getByLabel("Replace image");
  await replace.setInputFiles({ name: "notes.txt", mimeType: "text/plain", buffer: Buffer.from("not an image") });
  await expect(page.getByRole("alert")).toHaveText("Choose a PNG, JPEG, or WebP image.");

  await replace.setInputFiles(validImage("river_otter_v2.png"));

  await expect(page.getByRole("button", { name: "River Otter", exact: true })).toBeVisible();
  await expect(page.getByRole("status")).toHaveText("Saved on this device");
  await expect.poll(() => spriteGeometry(page, "River Otter")).toMatchObject({
    centerX: expect.closeTo(before.centerX, 2),
    centerY: expect.closeTo(before.centerY, 2),
    widthRatio: expect.closeTo(before.widthRatio, 2),
  });

  await page.getByRole("button", { name: "Home" }).click();
  await page.reload();
  await openLibrary(page);
  await page.getByRole("button", { name: "Edit" }).last().click();
  await expect(page.getByRole("button", { name: "River Otter", exact: true })).toBeVisible();
  await expect.poll(() => spriteGeometry(page, "River Otter")).toMatchObject({
    centerX: expect.closeTo(before.centerX, 2),
    centerY: expect.closeTo(before.centerY, 2),
    widthRatio: expect.closeTo(before.widthRatio, 2),
  });
});

test("the sprite card can be reached and used with the keyboard alone, and Delete removes the selected sprite", async ({ page }) => {
  await page.goto("/");
  await openLibrary(page);
  await page.getByRole("button", { name: "Create environment" }).click();
  await chooseBlankBackdrop(page);
  await page.getByLabel("Add sprite image").setInputFiles(validImage("keyboard_kite.png"));
  const sprite = page.getByRole("button", { name: "Keyboard Kite", exact: true });
  await expect(sprite).toBeVisible();
  await expect(page.getByRole("status")).toHaveText("Saved on this device");

  // Tab moves from the sprite into its card: rename, add sound, replace image, duplicate, delete.
  await sprite.focus();
  await page.keyboard.press("Tab");
  await expect(page.getByRole("button", { name: "Rename Keyboard Kite" })).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(page.getByRole("button", { name: "Add sound" })).toBeFocused();
  await page.keyboard.press("Tab");
  await page.keyboard.press("Tab");
  await expect(page.getByRole("button", { name: "Duplicate" })).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(page.getByRole("button", { name: "Delete" })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(sprite).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Undo" })).toBeEnabled();

  // The Delete key on a selected sprite does the same.
  await page.getByRole("button", { name: "Undo" }).click();
  await expect(sprite).toBeVisible();
  await sprite.click();
  await page.keyboard.press("Delete");
  await expect(sprite).toHaveCount(0);
});

test("dropping an image directly on an existing sprite creates a new sprite instead of replacing it", async ({ page }) => {
  await page.goto("/");
  await openLibrary(page);
  await page.getByRole("button", { name: "Create environment" }).click();
  await chooseBlankBackdrop(page);
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

test("deleting a sprite can be undone from the editor history, and deletion persists otherwise", async ({ page }) => {
  await page.goto("/");
  await openLibrary(page);
  await page.getByRole("button", { name: "Create environment" }).click();
  await chooseBlankBackdrop(page);
  await page.getByLabel("Add sprite image").setInputFiles(validImage("kept_lantern.png"));
  await expect(page.getByRole("button", { name: "Kept Lantern", exact: true })).toBeVisible();
  await expect(page.getByRole("status")).toHaveText("Saved on this device");
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
  await spriteButton(page, "Doomed Kettle").click();
  await page.getByRole("toolbar", { name: "Sprite options for Doomed Kettle" }).getByRole("button", { name: "Delete" }).click();

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
  await spriteButton(page, "Kept Lantern").click();
  await page.getByRole("toolbar", { name: "Sprite options for Kept Lantern" }).getByRole("button", { name: "Delete" }).click();
  await page.getByRole("button", { name: "Home" }).click();
  await page.reload();
  await openLibrary(page);
  await page.getByRole("button", { name: "Edit" }).last().click();
  await expect(page.getByRole("button", { name: "Kept Lantern", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Doomed Kettle", exact: true })).toBeVisible();
});

test("editor and learner activity stay within the document viewport on desktop and mobile", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto("/");
  await page.getByRole("button", { name: "Create environment" }).click();
  await expectDocumentViewportContained(page);

  await page.setViewportSize({ width: 400, height: 760 });
  await expect(page.getByRole("toolbar", { name: "Editor toolbar" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Home" })).toBeVisible();
  await expectDocumentViewportContained(page);

  await page.getByRole("button", { name: "Home" }).click();
  await page.getByRole("button", { name: "Play A day at the park" }).click();
  await expect(page.getByRole("heading", { name: "A day at the park" })).toBeVisible();
  await expectDocumentViewportContained(page);

  await page.setViewportSize({ width: 1280, height: 720 });
  await expectDocumentViewportContained(page);
});

test("the environment library is allowed to document-scroll as cards grow", async ({ page }) => {
  await page.setViewportSize({ width: 400, height: 600 });
  await page.goto("/");
  await page.evaluate(async () => {
    const database = await new Promise((resolve, reject) => {
      const request = indexedDB.open("sound-explorer", 1);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    await new Promise((resolve, reject) => {
      const transaction = database.transaction("environments", "readwrite");
      const store = transaction.objectStore("environments");
      for (let index = 0; index < 10; index += 1) {
        store.put({ id: `scroll-${index}`, name: `Environment ${index}` });
      }
      transaction.oncomplete = resolve;
      transaction.onerror = () => reject(transaction.error);
    });
    database.close();
  });
  await page.reload();

  await expect(page.getByRole("heading", { name: "Your environments" })).toBeVisible();
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollHeight > document.documentElement.clientHeight)).toBe(true);
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(0);
});

test("no surface scrolls sideways at a narrow width", async ({ page }) => {
  const noSidewaysScroll = () => expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth))
    .toBeLessThanOrEqual(0);

  await page.setViewportSize({ width: 400, height: 760 });
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Your environments" })).toBeVisible();
  await noSidewaysScroll();

  await page.getByRole("button", { name: "Create environment" }).click();
  await chooseBlankBackdrop(page);
  await noSidewaysScroll();

  await page.getByRole("button", { name: "Home" }).click();
  await expect(page.getByRole("heading", { name: "Your environments" })).toBeVisible();
  await noSidewaysScroll();

  await page.getByRole("button", { name: "Play A day at the park" }).click();
  await expect(page.getByRole("heading", { name: "A day at the park" })).toBeVisible();
  await noSidewaysScroll();
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
  await openLibrary(page);

  await expect(page.getByRole("alert")).toHaveText(/saved environment could not be read/i);
  await expect(page.getByRole("heading", { name: "Your environments" })).toBeVisible();
});

test("shows recovery guidance when browser storage is unavailable", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, "indexedDB", { value: undefined });
  });
  await page.goto("/");
  await openLibrary(page);

  await expect(page.getByRole("status")).toHaveText("Could not save on this device");
  await expect(page.getByRole("alert")).toHaveText(/could not open saved environments/i);
});

test("shows saving until the browser finishes storing a new environment", async ({ page }) => {
  await page.goto("/");
  await openLibrary(page);
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
  await openLibrary(page);
  await page.evaluate(() => Object.defineProperty(window, "indexedDB", { value: undefined }));
  await page.getByRole("button", { name: "Create environment" }).click();

  await expect(page.getByRole("status")).toHaveText("Could not save on this device");
  await expect(page.getByRole("alert")).toHaveText(/could not be saved on this device/i);
});

test("an educator can attach a sound through the sprite menu with an editable, prefilled label, and it persists", async ({ page }) => {
  await page.goto("/");
  await openLibrary(page);
  await page.getByRole("button", { name: "Create environment" }).click();
  await chooseBlankBackdrop(page);
  await page.getByLabel("Add sprite image").setInputFiles(validImage("wind_chime.png"));
  await expect(page.getByRole("button", { name: "Wind Chime", exact: true })).toBeVisible();
  await expect(page.getByRole("status")).toHaveText("Saved on this device");

  await openSpriteSound(page, "Wind Chime");
  await page.getByLabel("Add sound").setInputFiles(validAudio("gentle_chime_ring.mp3"));

  await expect(page.getByRole("heading", { name: "Label this sound" })).toBeVisible();
  const labelField = page.getByLabel("Sound label");
  await expect(labelField).toHaveValue("Gentle Chime Ring");
  await labelField.fill("Wind chime ringing");
  await soundModal(page).getByRole("button", { name: "Add sound" }).click();

  await expect(page.getByRole("heading", { name: "Label this sound" })).toHaveCount(0);
  await expect(page.getByRole("status")).toHaveText("Saved on this device");
  // The card now shows the sound by its label, with a play control beside it.
  const card = page.getByRole("toolbar", { name: "Sprite options for Wind Chime" });
  await expect(card.getByRole("button", { name: "Wind chime ringing" })).toBeVisible();
  await expect(card.getByRole("button", { name: "Play sound for Wind Chime" })).toBeVisible();

  await page.getByRole("button", { name: "Home" }).click();
  await page.reload();
  await openLibrary(page);
  await page.getByRole("button", { name: "Edit" }).last().click();
  await page.getByRole("button", { name: "Wind Chime", exact: true }).click();
  await expect(card.getByRole("button", { name: "Wind chime ringing" })).toBeVisible();

  // Opening the sound again shows it, with its label ready to edit.
  await card.getByRole("button", { name: "Wind chime ringing" }).click();
  await expect(page.getByRole("dialog", { name: "Wind chime ringing" })).toBeVisible();
  await expect(soundModal(page).getByRole("button", { name: "Play sound" })).toBeVisible();
  await page.getByLabel("Sound label").fill("Chime");
  await soundModal(page).getByRole("button", { name: "Save label" }).click();
  await expect(page.getByRole("status")).toHaveText("Saved on this device");
  await expect(card.getByRole("button", { name: "Chime", exact: true })).toBeVisible();
});

test("dropping a sound onto the selected sprite attaches it; dropping elsewhere is rejected with guidance", async ({ page }) => {
  await page.goto("/");
  await openLibrary(page);
  await page.getByRole("button", { name: "Create environment" }).click();
  await chooseBlankBackdrop(page);
  await page.getByLabel("Add sprite image").setInputFiles(validImage("music_box.png"));
  await expect(page.getByRole("button", { name: "Music Box", exact: true })).toBeVisible();
  await expect(page.getByRole("status")).toHaveText("Saved on this device");

  await page.locator(".activity-canvas").evaluate((canvas) => {
    const dataTransfer = new DataTransfer();
    dataTransfer.items.add(new File([Uint8Array.from(atob("UklGRkQDAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YSADAACAgA=="), (c) => c.charCodeAt(0))], "off_target.mp3", { type: "audio/mpeg" }));
    canvas.dispatchEvent(new DragEvent("drop", { bubbles: true, dataTransfer }));
  });
  await expect(page.getByRole("alert")).toHaveText("Drop the sound onto a sprite to attach it.");

  const sprite = page.getByRole("button", { name: "Music Box", exact: true });
  await sprite.evaluate((element, audioBase64) => {
    const dataTransfer = new DataTransfer();
    dataTransfer.items.add(new File([Uint8Array.from(atob(audioBase64), (c) => c.charCodeAt(0))], "music_box_melody.mp3", { type: "audio/mpeg" }));
    element.dispatchEvent(new DragEvent("drop", { bubbles: true, dataTransfer }));
  }, "UklGRkQDAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YSADAACAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgA==");

  await expect(page.getByRole("heading", { name: "Label this sound" })).toBeVisible();
  await expect(page.getByLabel("Sound label")).toHaveValue("Music Box Melody");

  // A drop landing on the sprite's resize/rotate overlay (a DOM sibling of the sprite button,
  // not a descendant) must still count as "dropped on the selected sprite."
  await page.getByRole("button", { name: "Close" }).click();
  await expect(page.getByRole("heading", { name: "Label this sound" })).toHaveCount(0);
  const resizeHandle = page.locator(".sprite-transform-handles.selected .handle-se");
  await resizeHandle.evaluate((element, audioBase64) => {
    const dataTransfer = new DataTransfer();
    dataTransfer.items.add(new File([Uint8Array.from(atob(audioBase64), (c) => c.charCodeAt(0))], "handle_drop.mp3", { type: "audio/mpeg" }));
    element.dispatchEvent(new DragEvent("drop", { bubbles: true, dataTransfer }));
  }, validAudio().buffer.toString("base64"));
  await expect(page.getByRole("heading", { name: "Label this sound" })).toBeVisible();
});

test("unsupported, oversized, and damaged audio receive friendly guidance", async ({ page }) => {
  await page.goto("/");
  await openLibrary(page);
  await page.getByRole("button", { name: "Create environment" }).click();
  await chooseBlankBackdrop(page);
  await page.getByLabel("Add sprite image").setInputFiles(validImage("clock_tower.png"));
  await expect(page.getByRole("button", { name: "Clock Tower", exact: true })).toBeVisible();
  await expect(page.getByRole("status")).toHaveText("Saved on this device");

  await openSpriteSound(page, "Clock Tower");
  const picker = page.getByLabel("Add sound");
  await picker.setInputFiles({ name: "notes.txt", mimeType: "text/plain", buffer: Buffer.from("not audio") });
  await expect(page.getByRole("alert")).toHaveText("Choose an MP3, WAV, or M4A audio file.");

  await picker.setInputFiles({ name: "huge.mp3", mimeType: "audio/mpeg", buffer: Buffer.alloc(20 * 1024 * 1024 + 1) });
  await expect(page.getByRole("alert")).toHaveText("Choose an audio file smaller than 20 MB.");

  await picker.setInputFiles({ name: "broken.mp3", mimeType: "audio/mpeg", buffer: Buffer.from("these bytes are not audio") });
  await expect(page.getByRole("alert")).toHaveText(/audio could not be opened/i);
});

test("replacing or removing an existing sprite sound happens from the sound window and can be backed out of", async ({ page }) => {
  await page.goto("/");
  await openLibrary(page);
  await page.getByRole("button", { name: "Create environment" }).click();
  await chooseBlankBackdrop(page);
  await page.getByLabel("Add sprite image").setInputFiles(validImage("bell_tower.png"));
  await expect(page.getByRole("button", { name: "Bell Tower", exact: true })).toBeVisible();
  await expect(page.getByRole("status")).toHaveText("Saved on this device");

  await openSpriteSound(page, "Bell Tower");
  await page.getByLabel("Add sound").setInputFiles(validAudio("first_ring.mp3"));
  await soundModal(page).getByRole("button", { name: "Add sound" }).click();
  await expect(page.getByRole("status")).toHaveText("Saved on this device");
  const card = page.getByRole("toolbar", { name: "Sprite options for Bell Tower" });
  await expect(card.getByRole("button", { name: "First Ring" })).toBeVisible();

  // Choosing a replacement shows it for review; Cancel keeps the first sound.
  await openSpriteSound(page, "Bell Tower");
  await expect(page.getByRole("dialog", { name: "First Ring" })).toBeVisible();
  await page.getByLabel("Replace sound").setInputFiles(validAudio("second_ring.mp3"));
  await expect(page.getByRole("heading", { name: "Replace this sound" })).toBeVisible();
  await expect(page.getByLabel("Sound label")).toHaveValue("Second Ring");
  await soundModal(page).getByRole("button", { name: "Cancel" }).click();
  await expect(page.getByRole("heading", { name: "Replace this sound" })).toHaveCount(0);
  await expect(card.getByRole("button", { name: "First Ring" })).toBeVisible();

  await openSpriteSound(page, "Bell Tower");
  await page.getByLabel("Replace sound").setInputFiles(validAudio("second_ring.mp3"));
  await soundModal(page).getByRole("button", { name: "Replace sound" }).click();
  await expect(page.getByRole("status")).toHaveText("Saved on this device");
  await expect(card.getByRole("button", { name: "Second Ring" })).toBeVisible();

  // Removing the sound leaves the sprite in place, without a sound.
  await openSpriteSound(page, "Bell Tower");
  await soundModal(page).getByRole("button", { name: "Remove sound" }).click();
  await expect(page.getByRole("status")).toHaveText("Saved on this device");
  await expect(card.getByRole("button", { name: "Add sound" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Bell Tower", exact: true })).toBeVisible();
});

test("blank, image, and missing backdrop states are distinct undo and redo steps", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Create environment" }).click();

  await chooseBlankBackdrop(page);
  await page.getByRole("button", { name: "Undo" }).click();
  await expect(page.getByRole("heading", { name: "Drag backdrop in" })).toBeVisible();
  await page.getByRole("button", { name: "Redo" }).click();
  await expect(page.locator(".editor-backdrop.blank-backdrop")).toHaveCSS("background-color", "rgb(255, 255, 255)");

  await page.getByRole("button", { name: "Change backdrop" }).click();
  await uploadBackdrop(page, validImage("history_backdrop.png"));
  await expect(page.getByRole("img", { name: "Environment backdrop" })).toBeVisible();
  await expect(page.getByRole("dialog", { name: "Change backdrop" })).toHaveCount(0);

  await page.getByRole("button", { name: "Undo" }).click();
  await expect(page.locator(".editor-backdrop.blank-backdrop")).toBeVisible();
  await page.getByRole("button", { name: "Redo" }).click();
  await expect(page.getByRole("img", { name: "Environment backdrop" })).toBeVisible();

  await page.getByRole("button", { name: "Change backdrop" }).click();
  await page.getByRole("button", { name: "Remove backdrop" }).click();
  await page.getByRole("button", { name: "Remove backdrop" }).last().click();
  await expect(page.getByRole("heading", { name: "Drag backdrop in" })).toBeVisible();
  await page.getByRole("button", { name: "Undo" }).click();
  await expect(page.getByRole("img", { name: "Environment backdrop" })).toBeVisible();
});

test("a blank white backdrop persists, appears in the library, and is playable", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Create environment" }).click();
  await page.getByLabel("Environment name").fill("Whiteboard sounds");
  await page.getByLabel("Environment name").press("Tab");
  await chooseBlankBackdrop(page);
  await page.getByLabel("Add sprite image").setInputFiles(validImage("marker.png"));
  await openSpriteSound(page, "Marker");
  await page.getByLabel("Add sound").setInputFiles(validAudio("marker_tap.mp3"));
  await soundModal(page).getByRole("button", { name: "Add sound" }).click();
  await expect(page.getByRole("button", { name: "Preview" })).toBeEnabled();

  await page.getByRole("button", { name: "Home" }).click();
  let card = page.locator("article", { has: page.getByRole("heading", { name: "Whiteboard sounds" }) });
  await expect(card.getByRole("img", { name: "Blank white backdrop for Whiteboard sounds" })).toHaveCSS("background-color", "rgb(255, 255, 255)");
  await expect(card.getByRole("button", { name: "Play Whiteboard sounds" })).toBeEnabled();

  await page.reload();
  card = page.locator("article", { has: page.getByRole("heading", { name: "Whiteboard sounds" }) });
  await expect(card.getByRole("img", { name: "Blank white backdrop for Whiteboard sounds" })).toBeVisible();
  expect(await page.evaluate(async () => {
    const database = await new Promise((resolve, reject) => {
      const request = indexedDB.open("sound-explorer", 1);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const records = await new Promise((resolve, reject) => {
      const transaction = database.transaction("environments", "readonly");
      const request = transaction.objectStore("environments").getAll();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    database.close();
    return records.find((environment) => environment.name === "Whiteboard sounds").background;
  })).toEqual({ kind: "blank" });

  await card.getByRole("button", { name: "Play Whiteboard sounds" }).click();
  await expect(page.locator(".custom-environment-scene.blank-backdrop")).toHaveCSS("background-color", "rgb(255, 255, 255)");
  await expect(page.getByRole("button", { name: "Choose the Marker" })).toBeVisible();
});

test("an environment becomes playable once it has a name, a backdrop, and a sprite with a sound", async ({ page }) => {
  await page.goto("/");
  await openLibrary(page);
  await page.getByRole("button", { name: "Create environment" }).click();
  await page.getByLabel("Environment name").fill("Backyard sounds");
  await page.getByLabel("Environment name").press("Tab");
  await expect(page.getByRole("status")).toHaveText("Saved on this device");
  await expect(page.getByText(/This draft needs a backdrop and at least one sprite with a sound/i)).toBeVisible();

  await uploadBackdrop(page, validImage("yard.png"));
  await expect(page.getByText(/This draft needs at least one sprite with a sound/i)).toBeVisible();

  await page.getByLabel("Add sprite image").setInputFiles(validImage("cricket.png"));
  await expect(page.getByRole("button", { name: "Cricket", exact: true })).toBeVisible();
  await expect(page.getByText(/This draft needs at least one sprite with a sound/i)).toBeVisible();

  await openSpriteSound(page, "Cricket");
  await page.getByLabel("Add sound").setInputFiles(validAudio("cricket_chirp.mp3"));
  await soundModal(page).getByRole("button", { name: "Add sound" }).click();
  await expect(page.getByRole("status")).toHaveText("Saved on this device");
  await expect(page.getByText("This environment is ready to play.")).toBeVisible();

  await page.getByRole("button", { name: "Home" }).click();
  const card = page.locator("article", { has: page.getByRole("heading", { name: "Backyard sounds" }) });
  await expect(card.getByText("Ready to play", { exact: true })).toBeVisible();
  await expect(card.getByText("Draft", { exact: true })).toHaveCount(0);
});

test("a draft names the requirement it is waiting on instead of saying it is not available yet", async ({ page }) => {
  await page.goto("/");
  await openLibrary(page);
  await page.getByRole("button", { name: "Create environment" }).click();
  await page.getByLabel("Environment name").fill("Meadow sounds");
  await page.getByLabel("Environment name").press("Tab");
  await expect(page.getByRole("status")).toHaveText("Saved on this device");

  await expect(page.getByRole("button", { name: "Not available yet" })).toHaveCount(0);
  const previewButton = page.getByRole("button", { name: "Needs a backdrop" });
  await expect(previewButton).toBeVisible();
  await expect(previewButton).toBeDisabled();
  await expect(previewButton).toHaveAttribute("title", /This draft needs a backdrop/);
  await expect(page.getByText(/This draft needs a backdrop/i)).toBeVisible();

  await page.getByRole("button", { name: "Home" }).click();
  const card = page.locator("article", { has: page.getByRole("heading", { name: "Meadow sounds" }) });
  const cardPlay = card.getByRole("button", { name: "Play Meadow sounds" });
  await expect(cardPlay).toBeDisabled();
  await expect(cardPlay).toHaveText("Needs a backdrop");
  await expect(cardPlay).toHaveAttribute("title", /This draft needs a backdrop/);

  await card.getByRole("button", { name: "Edit" }).click();
  await uploadBackdrop(page, validImage("meadow.png"));
  await page.getByLabel("Add sprite image").setInputFiles(validImage("cricket.png"));
  await expect(page.getByRole("button", { name: "Cricket", exact: true })).toBeVisible();
  await openSpriteSound(page, "Cricket");
  await page.getByLabel("Add sound").setInputFiles(validAudio("cricket_chirp.mp3"));
  await soundModal(page).getByRole("button", { name: "Add sound" }).click();
  await expect(page.getByRole("status")).toHaveText("Saved on this device");

  await expect(page.getByRole("button", { name: "Preview" })).toBeVisible();
  await page.getByRole("button", { name: "Home" }).click();
  await expect(page.locator("article", { has: page.getByRole("heading", { name: "Meadow sounds" }) }).getByRole("button", { name: "Play Meadow sounds" })).toBeEnabled();
});

test("Preview renders the saved backdrop, sprite geometry, rotation, and layer order, and returns to the editor without losing changes", async ({ page }) => {
  await page.goto("/");
  await openLibrary(page);
  await page.getByRole("button", { name: "Create environment" }).click();
  await page.getByLabel("Environment name").fill("Garden sounds");
  await page.getByLabel("Environment name").press("Tab");
  await uploadBackdrop(page, validImage("garden_bg.png"));

  await page.getByLabel("Add sprite image").setInputFiles(validImage("bee.png"));
  await expect(page.getByRole("button", { name: "Bee", exact: true })).toBeVisible();
  await openSpriteSound(page, "Bee");
  await page.getByLabel("Add sound").setInputFiles(validAudio("bee_buzz.mp3"));
  await soundModal(page).getByRole("button", { name: "Add sound" }).click();
  await expect(page.getByRole("status")).toHaveText("Saved on this device");

  // Drop Pebble far from Bee's current (still-default-centered) position so the two never overlap.
  await page.locator(".activity-canvas").evaluate((canvas, base64) => {
    const bounds = canvas.getBoundingClientRect();
    const dataTransfer = new DataTransfer();
    dataTransfer.items.add(new File([Uint8Array.from(atob(base64), (c) => c.charCodeAt(0))], "pebble.png", { type: "image/png" }));
    canvas.dispatchEvent(new DragEvent("drop", { bubbles: true, clientX: bounds.left + bounds.width * 0.8, clientY: bounds.top + bounds.height * 0.25, dataTransfer }));
  }, "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADElEQVR42mNk+M/wHwAF/gL+V3FuswAAAABJRU5ErkJggg==");
  await expect(page.getByRole("button", { name: "Pebble", exact: true })).toBeVisible();
  await expect(page.getByRole("status")).toHaveText("Saved on this device");

  const bee = page.getByRole("button", { name: "Bee", exact: true });
  await bee.click();
  const canvasBox = await page.locator(".activity-canvas").boundingBox();
  let box = await bee.boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(canvasBox.x + canvasBox.width * 0.22, canvasBox.y + canvasBox.height * 0.28);
  await page.mouse.up();
  await expect(page.getByRole("status")).toHaveText("Saved on this device");

  const rotateHandle = page.locator(".sprite-transform-handles.selected .rotate-handle");
  box = await rotateHandle.boundingBox();
  const beeCenterBox = await bee.boundingBox();
  const beeCenter = { x: beeCenterBox.x + beeCenterBox.width / 2, y: beeCenterBox.y + beeCenterBox.height / 2 };
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(beeCenter.x + 80, beeCenter.y);
  await page.mouse.up();
  await expect(page.getByRole("status")).toHaveText("Saved on this device");
  await expect(bee).toHaveCSS("z-index", "2");

  const editorGeometry = await spriteGeometry(page, "Bee");
  const editorRotation = await spriteRotation(page, "Bee");

  const editorUrl = page.url();
  await page.getByRole("button", { name: "Preview" }).click();
  await expect(page).toHaveURL(editorUrl.replace("/environments/", "/play/"));
  await expect(page.getByRole("heading", { name: "Garden sounds" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Back to editor" })).toBeVisible();

  const beeButtonName = "Choose the Bee";
  const pebbleButtonName = "Choose the Pebble";
  const previewBee = page.getByRole("button", { name: beeButtonName, exact: true });
  await expect(previewBee).toBeVisible();
  await expect(page.getByRole("button", { name: pebbleButtonName, exact: true })).toBeVisible();
  await expect(previewBee).toHaveCSS("z-index", "2");

  const previewGeometry = await spriteGeometry(page, beeButtonName, ".scene");
  expect(previewGeometry.centerX).toBeCloseTo(editorGeometry.centerX, 1);
  expect(previewGeometry.centerY).toBeCloseTo(editorGeometry.centerY, 1);
  expect(previewGeometry.widthRatio).toBeCloseTo(editorGeometry.widthRatio, 1);
  expect(await spriteRotation(page, beeButtonName)).toBeCloseTo(editorRotation, 0);

  await page.getByRole("button", { name: "Back to editor" }).click();
  await expect(page).toHaveURL(editorUrl);
  await expect(page.getByLabel("Environment name")).toHaveValue("Garden sounds");
  await expect(page.getByRole("button", { name: "Bee", exact: true })).toBeVisible();
});

test("Play from the library only selects sounded sprites as questions, keeps soundless sprites as distractors with saved-label feedback, and returns to the library when left", async ({ page }) => {
  await page.goto("/");
  await openLibrary(page);
  await page.getByRole("button", { name: "Create environment" }).click();
  await page.getByLabel("Environment name").fill("Pond sounds");
  await page.getByLabel("Environment name").press("Tab");
  await uploadBackdrop(page, validImage("pond_bg.png"));

  await page.getByLabel("Add sprite image").setInputFiles(validImage("frog.png"));
  await expect(page.getByRole("button", { name: "Frog", exact: true })).toBeVisible();
  await openSpriteSound(page, "Frog");
  await page.getByLabel("Add sound").setInputFiles(validAudio("frog_croak.mp3"));
  await soundModal(page).getByRole("button", { name: "Add sound" }).click();
  await expect(page.getByRole("status")).toHaveText("Saved on this device");

  // Drop Lily Pad far from Frog's default-centered position so the two never overlap.
  await page.locator(".activity-canvas").evaluate((canvas, base64) => {
    const bounds = canvas.getBoundingClientRect();
    const dataTransfer = new DataTransfer();
    dataTransfer.items.add(new File([Uint8Array.from(atob(base64), (c) => c.charCodeAt(0))], "lily_pad.png", { type: "image/png" }));
    canvas.dispatchEvent(new DragEvent("drop", { bubbles: true, clientX: bounds.left + bounds.width * 0.8, clientY: bounds.top + bounds.height * 0.25, dataTransfer }));
  }, "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADElEQVR42mNk+M/wHwAF/gL+V3FuswAAAABJRU5ErkJggg==");
  await expect(page.getByRole("button", { name: "Lily Pad", exact: true })).toBeVisible();
  await expect(page.getByRole("status")).toHaveText("Saved on this device");

  await page.getByRole("button", { name: "Home" }).click();
  const card = page.locator("article", { has: page.getByRole("heading", { name: "Pond sounds" }) });
  await card.getByRole("button", { name: "Play Pond sounds" }).click();

  await expect(page).toHaveURL(/\/play\/[0-9a-f-]{36}$/);
  await expect(page.getByRole("heading", { name: "Pond sounds" })).toBeVisible();
  // Play started from the library returns to the library, not to an editor.
  await expect(page.getByRole("button", { name: "Back to editor" })).toHaveCount(0);
  const frogButton = page.getByRole("button", { name: "Choose the Frog", exact: true });
  const lilyPadButton = page.getByRole("button", { name: "Choose the Lily Pad", exact: true });
  await expect(frogButton).toBeVisible();
  await expect(lilyPadButton).toBeVisible();

  const newSoundButton = page.getByRole("button", { name: "New sound" });
  await lilyPadButton.click();
  await expect(page.getByRole("status")).toHaveText("Not quite. Listen once more and try again.");
  await newSoundButton.click();

  await frogButton.click();
  await expect(page.getByRole("status")).toHaveText("Yes! That was Frog Croak.");

  await page.getByRole("button", { name: "Stop" }).click();
  await expect(page.getByRole("status")).toHaveText("Sound stopped. Press Listen to hear it again.");
  await page.getByRole("button", { name: "Listen to the sound" }).click();
  await page.getByLabel("Number of practice rounds").selectOption("1");
  await expect(page.getByText("Round 1 of 1", { exact: true })).toBeVisible();
  await frogButton.click();
  await expect(page.getByRole("status")).toHaveText("Wonderful! You matched all 1 sounds.");
  await expect(page.getByText("You finished all 1 rounds!", { exact: true })).toBeVisible();
  await newSoundButton.click();
  await expect(page.getByText("Round 1 of 1", { exact: true })).toBeVisible();

  await openLibrary(page);
  await expect(page).toHaveURL("/");
  await expect(page.getByRole("heading", { name: "Your environments" })).toBeVisible();
});

test("custom activity media failures provide visible recovery guidance", async ({ page }) => {
  await page.goto("/");
  await openLibrary(page);
  await page.getByRole("button", { name: "Create environment" }).click();
  await page.getByLabel("Environment name").fill("Creek sounds");
  await page.getByLabel("Environment name").press("Tab");
  await uploadBackdrop(page, validImage("creek.png"));
  await page.getByLabel("Add sprite image").setInputFiles(validImage("duck.png"));
  await openSpriteSound(page, "Duck");
  await page.getByLabel("Add sound").setInputFiles(validAudio("quack.mp3"));
  await soundModal(page).getByRole("button", { name: "Add sound" }).click();
  await expect(page.getByRole("status")).toHaveText("Saved on this device");
  await page.getByRole("button", { name: "Home" }).click();

  await page.evaluate(() => {
    HTMLMediaElement.prototype.play = () => Promise.reject(new DOMException("Playback failed", "NotSupportedError"));
  });
  await page.getByRole("button", { name: "Play Creek sounds" }).click();
  await expect(page.getByRole("status")).toHaveText("This sound could not be played. Return to the editor and replace its audio file.");
  await openLibrary(page);

  await page.evaluate(async () => {
    const database = await new Promise((resolve, reject) => {
      const request = indexedDB.open("sound-explorer", 1);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    await new Promise((resolve, reject) => {
      const transaction = database.transaction("environments", "readwrite");
      const store = transaction.objectStore("environments");
      const request = store.getAll();
      request.onsuccess = () => {
        const environment = request.result.find((item) => item.name === "Creek sounds");
        environment.sprites[0].image.blob = new Blob(["damaged image"], { type: "image/png" });
        store.put(environment);
      };
      request.onerror = () => reject(request.error);
      transaction.oncomplete = resolve;
      transaction.onerror = () => reject(transaction.error);
    });
    database.close();
  });

  await page.reload();
  await openLibrary(page);
  await page.getByRole("button", { name: "Play Creek sounds" }).click();
  await expect(page.getByRole("status")).toHaveText("An image in this environment could not be displayed. Return to the editor and replace the affected image.");
});

test("every card offers Duplicate and Delete behind one menu, the Park example included", async ({ page }) => {
  await page.setViewportSize({ width: 400, height: 760 });
  await page.goto("/");
  await page.getByRole("button", { name: "Create environment" }).click();
  await page.getByLabel("Environment name").fill("Rockpool sounds");
  await page.getByLabel("Environment name").press("Tab");
  await expect(page.getByRole("status")).toHaveText("Saved on this device");
  await page.getByRole("button", { name: "Home" }).click();

  await expect(libraryCard(page, "A day at the park").getByRole("button", { name: /More options/ })).toHaveCount(1);
  await expect(page.getByRole("menuitem", { name: "Duplicate" })).toHaveCount(0);
  await expect(page.getByRole("menuitem", { name: "Delete" })).toHaveCount(0);

  const trigger = libraryCard(page, "Rockpool sounds").getByRole("button", { name: "More options for Rockpool sounds" });
  await expect(trigger).toHaveAttribute("aria-expanded", "false");
  const pageSize = () => page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    scrollHeight: document.documentElement.scrollHeight,
  }));
  const closedSize = await pageSize();
  await trigger.click();
  await expect(trigger).toHaveAttribute("aria-expanded", "true");
  const duplicate = page.getByRole("menuitem", { name: "Duplicate" });
  await expect(duplicate).toBeVisible();
  await expect(duplicate).toBeFocused();
  await expect(page.getByRole("menuitem", { name: "Delete" })).toBeVisible();

  // On a narrow screen the menu opens back over its own card, and adds no page scroll of its own.
  const menu = await page.locator(".environment-menu:not([hidden])").boundingBox();
  const card = await libraryCard(page, "Rockpool sounds").boundingBox();
  expect(menu.x).toBeGreaterThanOrEqual(card.x);
  expect(menu.x + menu.width).toBeLessThanOrEqual(card.x + card.width);
  expect(await pageSize()).toEqual(closedSize);

  await page.keyboard.press("Escape");
  await expect(page.getByRole("menuitem", { name: "Duplicate" })).toHaveCount(0);
  await expect(trigger).toBeFocused();
});

test("duplicating copies the backdrop, every sprite image, sound blobs and labels, geometry, rotation, and layer order into a new environment opened in the editor", async ({ page }) => {
  await page.goto("/");
  await buildRichEnvironment(page, "Meadow original");

  await openCardMenu(page, "Meadow original");
  await page.getByRole("menuitem", { name: "Duplicate" }).click();

  await expect(page).toHaveURL(/\/environments\/[0-9a-f-]{36}$/);
  await expect(page.getByLabel("Environment name")).toHaveValue("Copy of Meadow original");
  await expect(page.getByRole("status")).toHaveText("Saved on this device");
  await expect(page.getByRole("img", { name: "Environment backdrop" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Singing Lark", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Quiet Stone", exact: true })).toBeVisible();
  expect(await spriteRotation(page, "Singing Lark")).toBeCloseTo(90, 0);

  const records = await storedEnvironments(page);
  const original = environmentNamed(records, "Meadow original");
  const copy = environmentNamed(records, "Copy of Meadow original");
  expect(copy).toBeTruthy();
  expect(copy.id).not.toBe(original.id);

  // The backdrop is copied byte for byte, and it is a real image rather than an empty blob.
  expect(copy.background).toEqual(original.background);
  expect(copy.background.blob.bytes.length).toBeGreaterThan(0);

  // Order (and so layering), names, geometry, rotation, images, sounds, and sound labels all
  // carry over; only the sprite identities are new.
  expect(copy.sprites.map((sprite) => sprite.name)).toEqual(["Quiet Stone", "Singing Lark"]);
  expect(new Set(copy.sprites.map((sprite) => sprite.id)).size).toBe(2);
  copy.sprites.forEach((sprite, index) => {
    const source = original.sprites[index];
    expect(sprite.id).not.toBe(source.id);
    expect({ ...sprite, id: null }).toEqual({ ...source, id: null });
  });
  const copiedSound = copy.sprites.find((sprite) => sprite.sound);
  expect(copiedSound.name).toBe("Singing Lark");
  expect(copiedSound.sound.label).toBe("Lark singing");
  expect(copiedSound.sound.blob.bytes.length).toBeGreaterThan(0);
  expect(copiedSound.rotationDegrees).toBe(90);
});

test("a duplicate is saved on this device and is still there after a reload", async ({ page }) => {
  await page.goto("/");
  await buildRichEnvironment(page, "Rockpool original");
  await openCardMenu(page, "Rockpool original");
  await page.getByRole("menuitem", { name: "Duplicate" }).click();
  await expect(page.getByLabel("Environment name")).toHaveValue("Copy of Rockpool original");
  await expect(page.getByRole("status")).toHaveText("Saved on this device");
  const copyUrl = page.url();

  await page.reload();
  await expect(page).toHaveURL(copyUrl);
  await expect(page.getByLabel("Environment name")).toHaveValue("Copy of Rockpool original");
  await expect(page.getByRole("img", { name: "Environment backdrop" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Singing Lark", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Quiet Stone", exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Home" }).click();
  await expect(libraryCard(page, "Rockpool original")).toHaveCount(1);
  const copyCard = libraryCard(page, "Copy of Rockpool original");
  await expect(copyCard).toHaveCount(1);
  await expect(copyCard.getByRole("button", { name: "Play Copy of Rockpool original" })).toBeEnabled();
});

test("the copy is independent: editing it leaves the original alone, and deleting it leaves the original's media intact", async ({ page }) => {
  await page.goto("/");
  await buildRichEnvironment(page, "Meadow original");
  await openCardMenu(page, "Meadow original");
  await page.getByRole("menuitem", { name: "Duplicate" }).click();
  await expect(page.getByLabel("Environment name")).toHaveValue("Copy of Meadow original");
  await expect(page.getByRole("status")).toHaveText("Saved on this device");

  await page.getByLabel("Environment name").fill("Renamed copy");
  await page.getByLabel("Environment name").press("Enter");
  await page.getByRole("button", { name: "Singing Lark", exact: true }).click();
  await page.getByRole("button", { name: "Rename Singing Lark" }).click();
  await page.getByLabel("Sprite name").fill("Copied Lark");
  await page.getByLabel("Sprite name").press("Enter");
  await expect(page.getByRole("button", { name: "Copied Lark", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Quiet Stone", exact: true }).click();
  await spriteButton(page, "Quiet Stone").click();
  await page.getByRole("toolbar", { name: "Sprite options for Quiet Stone" }).getByRole("button", { name: "Delete" }).click();
  await expect(page.getByRole("button", { name: "Quiet Stone", exact: true })).toHaveCount(0);
  await expect(page.getByRole("status")).toHaveText("Saved on this device");

  const afterEditing = await storedEnvironments(page);
  const original = environmentNamed(afterEditing, "Meadow original");
  expect(original.sprites.map((sprite) => sprite.name)).toEqual(["Quiet Stone", "Singing Lark"]);
  expect(original.sprites.find((sprite) => sprite.sound).sound.label).toBe("Lark singing");
  expect(environmentNamed(afterEditing, "Copy of Meadow original")).toBeUndefined();
  expect(environmentNamed(afterEditing, "Renamed copy").sprites.map((sprite) => sprite.name)).toEqual(["Copied Lark"]);

  await page.getByRole("button", { name: "Home" }).click();
  await openCardMenu(page, "Renamed copy");
  await page.getByRole("menuitem", { name: "Delete" }).click();
  await page.getByRole("button", { name: "Delete environment" }).click();
  await expect(libraryCard(page, "Renamed copy")).toHaveCount(0);
  await expect(page.getByRole("status")).toHaveText("Saved on this device");

  await page.reload();
  expect(await storedEnvironments(page)).toEqual([original]);

  await libraryCard(page, "Meadow original").getByRole("button", { name: "Play Meadow original" }).click();
  const lark = page.getByRole("button", { name: "Choose the Singing Lark", exact: true });
  await expect(lark).toBeVisible();
  await expect(page.getByRole("button", { name: "Choose the Quiet Stone", exact: true })).toBeVisible();
  await lark.click();
  await expect(page.getByRole("status")).toHaveText("Yes! That was Lark singing.");
});

test("deleting asks first, and cancelling leaves the environment and its media exactly as they were", async ({ page }) => {
  await page.goto("/");
  await buildRichEnvironment(page, "Kept meadow");
  const before = await storedEnvironments(page);

  await openCardMenu(page, "Kept meadow");
  await page.getByRole("menuitem", { name: "Delete" }).click();
  const dialog = page.getByRole("dialog", { name: "Delete Kept meadow?" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Cancel" })).toBeFocused();
  await dialog.getByRole("button", { name: "Cancel" }).click();

  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(libraryCard(page, "Kept meadow")).toHaveCount(1);
  expect(await storedEnvironments(page)).toEqual(before);

  // Escape answers the question the same way Cancel does.
  await openCardMenu(page, "Kept meadow");
  await page.getByRole("menuitem", { name: "Delete" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);

  await page.reload();
  await expect(libraryCard(page, "Kept meadow")).toHaveCount(1);
  expect(await storedEnvironments(page)).toEqual(before);
});

test("a confirmed delete removes the environment and its media from this device, survives a reload, and its old address falls back to the library", async ({ page }) => {
  await page.goto("/");
  await buildRichEnvironment(page, "Doomed meadow");
  await libraryCard(page, "Doomed meadow").getByRole("button", { name: "Edit" }).click();
  const deletedUrl = page.url();
  await page.getByRole("button", { name: "Home" }).click();
  expect((await storedEnvironments(page)).length).toBe(1);

  await openCardMenu(page, "Doomed meadow");
  await page.getByRole("menuitem", { name: "Delete" }).click();
  await page.getByRole("button", { name: "Delete environment" }).click();

  await expect(libraryCard(page, "Doomed meadow")).toHaveCount(0);
  await expect(page.getByRole("status")).toHaveText("Saved on this device");
  expect(await storedEnvironments(page)).toEqual([]);

  await page.reload();
  await expect(page.getByRole("heading", { name: "Your environments" })).toBeVisible();
  await expect(libraryCard(page, "Doomed meadow")).toHaveCount(0);
  expect(await storedEnvironments(page)).toEqual([]);

  // The editor and play addresses of a deleted environment are not a broken screen.
  await page.goto(deletedUrl);
  await expect(page.getByRole("heading", { name: "Your environments" })).toBeVisible();
  await expect(page).toHaveURL("/");
  await page.goto(deletedUrl.replace("/environments/", "/play/"));
  await expect(page.getByRole("heading", { name: "Your environments" })).toBeVisible();
  await expect(page).toHaveURL("/");

  // The Park example is untouched by any of this.
  await expect(page.getByRole("heading", { name: "A day at the park" })).toBeVisible();
});

test("a copy that cannot be saved leaves the original intact with visible recovery guidance", async ({ page }) => {
  await page.goto("/");
  await buildRichEnvironment(page, "Safe meadow");
  const before = await storedEnvironments(page);

  await page.evaluate(() => Object.defineProperty(window, "indexedDB", { value: undefined }));
  await openCardMenu(page, "Safe meadow");
  await page.getByRole("menuitem", { name: "Duplicate" }).click();

  await expect(page.getByRole("status")).toHaveText("Could not save on this device");
  await expect(page.getByRole("alert")).toHaveText(/copy could not be saved on this device.*original environment is unchanged/i);
  await expect(page).toHaveURL("/");
  await expect(libraryCard(page, "Safe meadow")).toHaveCount(1);
  await expect(page.locator("article", { has: page.getByRole("heading", { name: /^Copy of/ }) })).toHaveCount(0);

  await page.reload();
  await expect(libraryCard(page, "Safe meadow")).toHaveCount(1);
  expect(await storedEnvironments(page)).toEqual(before);
});

test("a delete that cannot be completed keeps the environment with visible recovery guidance", async ({ page }) => {
  await page.goto("/");
  await buildRichEnvironment(page, "Stubborn meadow");
  const before = await storedEnvironments(page);

  await page.evaluate(() => Object.defineProperty(window, "indexedDB", { value: undefined }));
  await openCardMenu(page, "Stubborn meadow");
  await page.getByRole("menuitem", { name: "Delete" }).click();
  await page.getByRole("button", { name: "Delete environment" }).click();

  await expect(page.getByRole("status")).toHaveText("Could not save on this device");
  await expect(page.getByRole("alert")).toHaveText(/could not be deleted on this device.*still saved here/i);
  await expect(libraryCard(page, "Stubborn meadow")).toHaveCount(1);

  await page.reload();
  await expect(libraryCard(page, "Stubborn meadow")).toHaveCount(1);
  expect(await storedEnvironments(page)).toEqual(before);
});
