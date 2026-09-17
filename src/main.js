import "./style.css";
import { environmentStorage } from "./environment-storage.js";
import { archiveFileName, packEnvironment, unpackEnvironment } from "./environment-archive.js";
import { buildParkEnvironment, parkEnvironmentId } from "./park-starter.js";
import { measureSpriteImage } from "./image-tools.js";
import { openBackdropCropper } from "./backdrop-cropper.js";
import { mountWaveformPlayer } from "./waveform-player.js";

// Cloudflare Web Analytics: the published site is given a beacon token at build time. The
// editing site has none, so nothing is loaded there.
const beaconToken = import.meta.env.VITE_CF_BEACON;
if (beaconToken) {
  const beacon = document.createElement("script");
  beacon.src = "https://static.cloudflareinsights.com/beacon.min.js";
  beacon.defer = true;
  beacon.dataset.cfBeacon = JSON.stringify({ token: beaconToken });
  document.head.append(beacon);
}

const app = document.querySelector("#app");
let activeEnvironment;
let activityOrigin;
let activitySounds = {};
let nextSoundTimeoutId;
let currentSound;
let audio;
let roundCount = 3;
let completedRounds = 0;
let activityFinished = false;
const maxPlaybackSeconds = 5;
let view = "library";
let firstVisit = false;
let environments = [];
let editingEnvironment;
let selectedSpriteId;
let focusEnvironmentName = false;
let undoStack = [];
let redoStack = [];
let saveState = "saved";
let saveMessage = "";
let backgroundModalOpen = false;
let backgroundConfirmation = { action: "none" };
let backgroundMessage = "";
let spriteMessage = "";
// The context menu (right-click or long-press on a sprite) lists the same actions as the sprite
// card; it is positioned where the pointer was, inside the activity area.
let spriteMenu;
let renameSpriteId;
let soundFlow;
// A copied sprite lives here until it is pasted; it never leaves the page.
let spriteClipboard;
let spritePreviewAudio;
let spritePreviewId;
let helpOpen = false;
// Library-card state: which card's Duplicate/Delete menu is open, and which environment is
// waiting on a delete confirmation. Both are session-only, so leaving the library clears them.
let environmentMenuOpenId;
let pendingDeleteId;
const renderObjectUrls = new Set();
const defaultSpriteSizePercent = 14;
const minSpriteSizePercent = 4;
const maxSpriteSizePercent = 60;
const editorHistoryLimit = 50;
const acceptedAudioTypes = ["audio/mpeg", "audio/wav", "audio/x-wav", "audio/mp4", "audio/x-m4a"];
let pendingEnvironmentSave = Promise.resolve();
// Save pacing: the indicator flips to "Saving…" the moment work starts, but waits out a short
// settling window before returning to "Saved" so a burst of edits reads as one save, not a flicker.
let pendingSaveCount = 0;
let lastSaveOutcome = "saved";
let saveSettleTimeoutId;
const saveSettleMs = 200;
// Transient editor guidance clears itself (and can be dismissed) so it can never stick on screen.
let editorMessageTimeoutId;
const editorMessageMs = 8000;
// Markup already written into each surgically updated editor region, so a refresh rewrites only
// the regions whose content actually changed and leaves live DOM (focus, images) untouched.
const renderedEditorRegions = new Map();
const spriteImageBlobs = new WeakMap();
let renderedBackdrop = { kind: "pending", blob: undefined };
const rotationSnapDegrees = 45;
const projectName = "Everyday Sound Lab";
// Every activity area — editor, preview, and play — is the same 16:9 frame, so a sprite placed
// in the editor sits in exactly the same spot when learners play.
const canvasAspectRatio = 16 / 9;
const acceptedImageTypes = ["image/png", "image/jpeg", "image/webp"];

// A tiny inline icon set: no dependency, no icon font, no network request. Every icon is
// decorative, so the control around it always carries the accessible name and the tooltip.
const iconShapes = {
  // The Home control wears the app's own favicon artwork, so the mark in the browser tab and the
  // mark in the toolbar are the same thing.
  home: `<rect width="32" height="32" rx="9" fill="#477b70"/><g fill="none" stroke="#fff8e5" stroke-linecap="round" stroke-width="4"><path d="M9 13.5v5"/><path d="M16 9v14"/><path d="M23 13.5v5"/></g>`,
  rename: `<path d="M4 20h4.5L19 9.5a2.1 2.1 0 0 0-3-3L5.5 17Z"/><path d="m13.5 9 3 3"/>`,
  image: `<rect x="3" y="5" width="18" height="14" rx="2.5"/><circle cx="8.6" cy="10" r="1.5"/><path d="m3.5 16.8 4.9-4.3 3.9 3.4 2.9-2.4 5.3 4.2"/>`,
  sound: `<path d="M4 10h3.5l4.5-4v12l-4.5-4H4Z"/><path d="M15.5 9.2a4 4 0 0 1 0 5.6M18.3 6.4a8 8 0 0 1 0 11.2"/>`,
  soundOff: `<path d="M4 10h3.5l4.5-4v12l-4.5-4H4Z"/><path d="m15.5 9.5 5 5M20.5 9.5l-5 5"/>`,
  play: `<path class="solid" d="m8.5 5.4 10.4 6.6-10.4 6.6z"/>`,
  pause: `<rect class="solid" x="6.5" y="5" width="4" height="14" rx="1"/><rect class="solid" x="13.5" y="5" width="4" height="14" rx="1"/>`,
  stop: `<rect class="solid" x="6" y="6" width="12" height="12" rx="2"/>`,
  close: `<path d="m6 6 12 12M18 6 6 18"/>`,
  back: `<path d="M15 5l-7 7 7 7"/>`,
  undo: `<path d="M9.5 8.5H14a5 5 0 0 1 0 10H7.5"/><path d="M12.5 5 9 8.5l3.5 3.5"/>`,
  redo: `<path d="M14.5 8.5H10a5 5 0 0 0 0 10h6.5"/><path d="M11.5 5 15 8.5 11.5 12"/>`,
  backdrop: `<rect x="3" y="5" width="18" height="14" rx="2.5"/><circle cx="8.6" cy="10" r="1.5"/><path d="m3.5 16.8 4.9-4.3 3.9 3.4 2.9-2.4 5.3 4.2"/>`,
  sprite: `<rect x="3" y="3" width="18" height="18" rx="4.5"/><path d="M12 8.2v7.6M8.2 12h7.6"/>`,
  preview: `<path class="solid" d="m8.5 5.4 10.4 6.6-10.4 6.6z"/>`,
  saved: `<rect x="2.5" y="4.2" width="19" height="12.4" rx="2.2"/><path d="M9 20.2h6M12 16.6v3.6"/><path d="m8.4 10.3 2.6 2.6 4.6-4.8"/>`,
  saving: `<rect x="2.5" y="4.2" width="19" height="12.4" rx="2.2"/><path d="M9 20.2h6M12 16.6v3.6"/><circle class="solid" cx="8.2" cy="10.4" r="1.15"/><circle class="solid" cx="12" cy="10.4" r="1.15"/><circle class="solid" cx="15.8" cy="10.4" r="1.15"/>`,
  saveFailed: `<rect x="2.5" y="4.2" width="19" height="12.4" rx="2.2"/><path d="M9 20.2h6M12 16.6v3.6"/><path d="M12 7.4v3.4"/><circle class="solid" cx="12" cy="13.4" r="1.05"/>`,
  more: `<circle class="solid" cx="12" cy="5.4" r="1.7"/><circle class="solid" cx="12" cy="12" r="1.7"/><circle class="solid" cx="12" cy="18.6" r="1.7"/>`,
  duplicate: `<rect x="9" y="9" width="11.5" height="11.5" rx="2.6"/><path d="M15.4 4.5H6.1A1.6 1.6 0 0 0 4.5 6.1v9.3"/>`,
  export: `<path d="M12 4.5v10.5"/><path d="m8 11 4 4 4-4"/><path d="M5 19.5h14"/>`,
  import: `<path d="M12 15V4.5"/><path d="m8 8.5 4-4 4 4"/><path d="M5 19.5h14"/>`,
  trash: `<path d="M4.6 7h14.8"/><path d="M9.6 7V5a.9.9 0 0 1 .9-.9h3a.9.9 0 0 1 .9.9v2"/><path d="m6.6 7 .9 11.4A1.7 1.7 0 0 0 9.2 20h5.6a1.7 1.7 0 0 0 1.7-1.6L17.4 7"/><path d="M10.4 10.6v5.8M13.6 10.6v5.8"/>`,
  help: `<circle cx="12" cy="12" r="9"/><path d="M9.8 9a2.4 2.4 0 1 1 3.4 2.2c-.8.4-1.2.9-1.2 1.8"/><circle class="solid" cx="12" cy="17" r="1"/>`,
};

function icon(name) {
  const artwork = name === "home";
  return `<svg class="icon${artwork ? " icon-artwork" : ""}" viewBox="${artwork ? "0 0 32 32" : "0 0 24 24"}" aria-hidden="true" focusable="false">${iconShapes[name]}</svg>`;
}

// Every surface has its own address. Ids live in the URL only — never in user-visible copy.
function parseRoute(pathname) {
  const [section, id] = pathname.split("/").filter(Boolean).map(decodeURIComponent);
  if (section === "environments" && id) return { name: "editor", id };
  if (section === "play" && id) return { name: "play", id };
  if (section === "welcome") return { name: "welcome" };
  if (section === "about") return { name: "about" };
  if (section === "privacy") return { name: "privacy" };
  return { name: "library" };
}

function routePath(route) {
  if (route.name === "editor") return `/environments/${encodeURIComponent(route.id)}`;
  if (route.name === "play") return `/play/${encodeURIComponent(route.id)}`;
  if (route.name === "welcome") return "/welcome";
  if (route.name === "about") return "/about";
  if (route.name === "privacy") return "/privacy";
  return "/";
}

function navigate(route, { replace = false, origin } = {}) {
  const state = { route: route.name, id: route.id, origin };
  history[replace ? "replaceState" : "pushState"](state, "", routePath(route));
  applyRoute();
}

function spriteHasSound(sprite) {
  return Boolean(sprite.sound?.blob);
}

function customEnvironmentSpriteMarkup(sprite, layer) {
  const style = `${spritePositionStyle(sprite, layer)};transform:${spriteRotationTransform(sprite)}`;
  return `<button class="sound-target custom-environment-sprite" data-object="${sprite.id}" style="${style}" aria-label="Choose the ${escapeHtml(sprite.name)}"><img src="${blobUrl(sprite.image.blob)}" alt="" draggable="false"><span class="ring"></span><span class="target-label">${escapeHtml(sprite.name)}</span></button>`;
}

function customEnvironmentScene(environment) {
  const backdrop = environment.background?.blob
    ? `<img class="custom-environment-background" src="${blobUrl(environment.background.blob)}" alt="" draggable="false">`
    : "";
  const blankClass = environment.background?.kind === "blank" ? " blank-backdrop" : "";
  const sprites = (environment.sprites || []).map((sprite, layer) => customEnvironmentSpriteMarkup(sprite, layer)).join("");
  return `<div class="scene-stage"><section class="scene custom-environment-scene${blankClass}" aria-label="${escapeHtml(environment.name)}">${backdrop}${sprites}</section></div>`;
}

// Computed once per renderActivity() call and cached in activitySounds — blobUrl() must only be
// called during a render pass (its URLs are revoked by the next clearRenderObjectUrls()), so the
// game-loop functions below read the cached map instead of recomputing it (and re-registering
// fresh, never-revoked object URLs) on every Listen/New sound/answer click.
function currentSounds() {
  const sounds = {};
  (activeEnvironment.sprites || []).forEach((sprite) => {
    if (spriteHasSound(sprite)) sounds[sprite.id] = { file: blobUrl(sprite.sound.blob), label: sprite.sound.label };
  });
  return sounds;
}

// The same mark and name lead every screen, and it always goes back to the library.
function brandMarkup() {
  return `<button class="editor-home brand" type="button" aria-label="Home" title="Home">${icon("home")}<span class="project-name">${projectName}</span></button>`;
}

function siteWordmark() {
  return `<a class="site-wordmark" href="/welcome"><img src="/favicon.svg" alt="" width="36" height="36"><span>${projectName}</span></a>`;
}

function siteFooter() {
  return `<footer class="site-footer">
    <a class="site-footer-credit" href="https://teacher.dev" target="_blank" rel="noopener noreferrer">
      <img src="/edtechathon-logo.svg" alt="" width="24" height="24">
      <span>Built by teacher.dev</span>
    </a>
    <a class="site-footer-link" href="/about">about</a>
    <a class="site-footer-link" href="/privacy">privacy</a>
  </footer>`;
}

function closeHelp() {
  document.querySelector(".help-backdrop")?.remove();
  helpOpen = false;
  document.querySelector(".help-button")?.focus();
}

function openHelp() {
  if (helpOpen) return;
  helpOpen = true;
  document.body.insertAdjacentHTML("beforeend", `<div class="modal-backdrop help-backdrop" role="presentation">
    <section class="help-dialog" role="dialog" aria-modal="true" aria-labelledby="help-title">
      <button class="close-help close-modal" type="button" aria-label="Close help">${icon("close")}</button>
      <h2 id="help-title">Need a hand?</h2>
      <p>If you’re running into trouble or have a suggestion, email us at <a href="mailto:support@teacher.dev?subject=Everyday%20Sound%20Lab">support@teacher.dev</a>.</p>
    </section>
  </div>`);
  document.querySelector(".close-help").addEventListener("click", closeHelp);
  bindModalBackdropClose(".help-dialog", closeHelp);
  document.querySelector(".close-help").focus();
}

function mountHelpButton() {
  const button = document.createElement("button");
  button.className = "help-button";
  button.type = "button";
  button.setAttribute("aria-label", "Help");
  button.setAttribute("aria-haspopup", "dialog");
  button.innerHTML = icon("help");
  button.addEventListener("click", openHelp);
  document.body.append(button);
}

function showActivityMediaFailure() {
  const message = document.querySelector(".message");
  if (message) message.textContent = "An image in this environment could not be displayed. Return to the editor and replace the affected image.";
}

function bindActivityMediaFailures() {
  document.querySelectorAll(".custom-environment-scene img").forEach((image) => {
    image.addEventListener("error", showActivityMediaFailure, { once: true });
    if (image.complete && image.naturalWidth === 0) showActivityMediaFailure();
  });
}

function renderActivity() {
  const returnToEditor = activityOrigin === "editor";
  activitySounds = currentSounds();
  app.innerHTML = `<main class="park">
    <header class="app-topbar" role="toolbar" aria-label="Play toolbar">
      ${brandMarkup()}
      <h1 class="activity-title">${escapeHtml(activeEnvironment.name)}</h1>
      <span class="toolbar-spacer"></span>
      <button class="open-library" type="button">${icon("back")}<span>${returnToEditor ? "Back to editor" : "Environments"}</span></button>
    </header>
    <div class="listen-panel">
      <button class="listen-button" type="button">${icon("play")}<span>Listen to the sound</span></button>
      <button class="stop-button" type="button">${icon("stop")}<span>Stop</span></button>
      <button class="new-sound" type="button">New sound</button>
      <label class="round-picker">Rounds <select aria-label="Number of practice rounds">${[1, 3, 5, 10].map((count) => `<option value="${count}" ${count === roundCount ? "selected" : ""}>${count}</option>`).join("")}</select></label>
      <p class="round-progress">Round ${Math.min(completedRounds + 1, roundCount)} of ${roundCount}</p>
    </div>
    ${customEnvironmentScene(activeEnvironment)}
    <p class="message" role="status"></p>
  </main>`;
  bindControls();
  chooseSound();
  bindActivityMediaFailures();
}

function bindControls() {
  const editorEnvironmentId = activityOrigin === "editor" ? activeEnvironment.id : undefined;
  document.querySelector(".editor-home").addEventListener("click", () => navigate({ name: "library" }));
  document.querySelector(".open-library").addEventListener("click", () => {
    navigate(editorEnvironmentId ? { name: "editor", id: editorEnvironmentId } : { name: "library" });
  });
  document.querySelector(".listen-button").addEventListener("click", playCurrentSound);
  document.querySelector(".stop-button").addEventListener("click", stopSound);
  document.querySelector(".new-sound").addEventListener("click", () => { if (activityFinished) { completedRounds = 0; activityFinished = false; } chooseSound(); });
  document.querySelector(".round-picker select").addEventListener("change", (event) => { roundCount = Number(event.target.value); completedRounds = 0; activityFinished = false; chooseSound(); updateProgress(); });
  document.querySelectorAll(".sound-target").forEach((targetButton) => targetButton.addEventListener("click", () => checkAnswer(targetButton)));
}

function playCurrentSound() {
  if (!currentSound) return;
  audio?.pause();
  audio = new Audio();
  const showPlaybackFailure = () => {
    const message = document.querySelector(".message");
    if (message) message.textContent = "This sound could not be played. Return to the editor and replace its audio file.";
  };
  audio.addEventListener("error", showPlaybackFailure, { once: true });
  if (maxPlaybackSeconds > 0) audio.addEventListener("timeupdate", () => { if (audio.currentTime >= maxPlaybackSeconds) stopSound(false); });
  audio.src = activitySounds[currentSound].file;
  audio.play().catch(showPlaybackFailure);
}
function stopSound(showMessage = true) { if (!audio) return; audio.pause(); audio.currentTime = 0; if (showMessage) document.querySelector(".message").textContent = "Sound stopped. Press Listen to hear it again."; }
function updateProgress() { document.querySelector(".round-progress").textContent = activityFinished ? `You finished all ${roundCount} rounds!` : `Round ${Math.min(completedRounds + 1, roundCount)} of ${roundCount}`; }
function chooseSound() { clearTimeout(nextSoundTimeoutId); const available = Object.keys(activitySounds); const message = document.querySelector(".message"); if (activityFinished) { message.textContent = `Great work! You finished all ${roundCount} rounds. Choose New sound to practise again.`; return; } if (!available.length) { message.textContent = "This environment needs a sprite with a sound to play."; return; } currentSound = available[Math.floor(Math.random() * available.length)]; document.querySelectorAll(".sound-target").forEach((item) => item.classList.remove("selected", "correct", "incorrect")); message.textContent = "Listen carefully, then choose what made the sound."; updateProgress(); playCurrentSound(); }
function checkAnswer(targetButton) { const message = document.querySelector(".message"); if (activityFinished) { message.textContent = `You finished all ${roundCount} rounds. Choose New sound to play again.`; return; } if (!currentSound) { message.textContent = "Add a sound or press Listen to begin."; return; } document.querySelectorAll(".sound-target").forEach((item) => item.classList.remove("selected", "correct", "incorrect")); targetButton.classList.add("selected"); if (targetButton.dataset.object === currentSound) { targetButton.classList.add("correct"); completedRounds += 1; if (completedRounds === roundCount) { activityFinished = true; message.textContent = `Wonderful! You matched all ${roundCount} sounds.`; updateProgress(); stopSound(false); } else { message.textContent = `Yes! That was ${activitySounds[currentSound].label}.`; nextSoundTimeoutId = window.setTimeout(chooseSound, 1300); } } else { targetButton.classList.add("incorrect"); message.textContent = "Not quite. Listen once more and try again."; } }

async function loadEnvironments() {
  try {
    const records = await environmentStorage.list();
    if (!records.every(isEnvironmentRecord)) {
      throw new Error("Saved environment could not be read");
    }
    // The Park example always leads the library; everything else keeps its stored order.
    const loaded = records.map(environmentWithoutSessionState);
    environments = [
      ...loaded.filter((environment) => environment.id === parkEnvironmentId),
      ...loaded.filter((environment) => environment.id !== parkEnvironmentId),
    ];
    saveState = "saved";
  } catch (error) {
    saveState = "failed";
    saveMessage = error.message === "Saved environment could not be read"
      ? "A saved environment could not be read. It was not shown; try refreshing the page."
      : "We could not open saved environments on this device. Try refreshing the page.";
  }
}

function hasBackdrop(environment) {
  return Boolean(environment?.background?.blob || environment?.background?.kind === "blank");
}

function backdropKind(environment) {
  if (environment?.background?.blob) return "image";
  if (environment?.background?.kind === "blank") return "blank";
  return "missing";
}

function isEnvironmentRecord(record) {
  return record
    && typeof record === "object"
    && typeof record.id === "string"
    && typeof record.name === "string"
    && (!record.background || record.background.blob instanceof Blob || record.background.kind === "blank")
    && (!record.sprites || record.sprites.every((sprite) => sprite
      && typeof sprite.id === "string"
      && typeof sprite.name === "string"
      && typeof sprite.xPercent === "number"
      && typeof sprite.yPercent === "number"
      && typeof sprite.sizePercent === "number"
      && (sprite.aspectRatio === undefined || typeof sprite.aspectRatio === "number")
      && sprite.image?.blob instanceof Blob));
}

// Sprites saved before images were measured have no aspect ratio; they stay square.
function spriteAspectRatio(sprite) {
  return sprite.aspectRatio > 0 ? sprite.aspectRatio : 1;
}

function environmentWithoutSessionState(environment) {
  const { selectedSpriteId: _legacySelection, ...record } = environment;
  return record;
}

function snapshotEnvironment(environment) {
  const record = environmentWithoutSessionState(environment);
  return {
    ...record,
    background: record.background ? { ...record.background } : undefined,
    sprites: (record.sprites || []).map((sprite) => ({
      ...sprite,
      image: sprite.image ? { ...sprite.image } : undefined,
      sound: sprite.sound ? { ...sprite.sound } : undefined,
    })),
  };
}

function sameEnvironment(left, right) {
  if (!left || !right || left.id !== right.id || left.name !== right.name) return false;
  if (backdropKind(left) !== backdropKind(right)) return false;
  if (backdropKind(left) === "image" && left.background.blob !== right.background.blob) return false;
  const leftSprites = left.sprites || [];
  const rightSprites = right.sprites || [];
  if (leftSprites.length !== rightSprites.length) return false;
  return leftSprites.every((sprite, index) => {
    const other = rightSprites[index];
    return sprite.id === other?.id
      && sprite.name === other.name
      && sprite.xPercent === other.xPercent
      && sprite.yPercent === other.yPercent
      && sprite.sizePercent === other.sizePercent
      && spriteAspectRatio(sprite) === spriteAspectRatio(other)
      && (sprite.rotationDegrees || 0) === (other.rotationDegrees || 0)
      && sprite.image?.blob === other.image?.blob
      && sprite.sound?.blob === other.sound?.blob
      && sprite.sound?.label === other.sound?.label;
  });
}

function resetEditorHistory() {
  undoStack = [];
  redoStack = [];
  updateHistoryControls();
}

function pushHistory(stack, environment) {
  stack.push(snapshotEnvironment(environment));
  if (stack.length > editorHistoryLimit) stack.shift();
}

function updateHistoryControls() {
  const undo = document.querySelector(".undo-editor");
  const redo = document.querySelector(".redo-editor");
  if (undo) undo.disabled = undoStack.length === 0;
  if (redo) redo.disabled = redoStack.length === 0;
}

async function commitEditorMutation(environment) {
  const nextEnvironment = snapshotEnvironment(environment);
  if (sameEnvironment(editingEnvironment, nextEnvironment)) return;
  pushHistory(undoStack, editingEnvironment);
  redoStack = [];
  await saveEnvironment(nextEnvironment);
  updateHistoryControls();
}

async function commitEditorGesture(beforeGesture) {
  const nextEnvironment = snapshotEnvironment(editingEnvironment);
  if (sameEnvironment(beforeGesture, nextEnvironment)) return;
  pushHistory(undoStack, beforeGesture);
  redoStack = [];
  await saveEnvironment(nextEnvironment);
  updateHistoryControls();
}

async function restoreEditorHistory(fromStack, toStack) {
  if (!fromStack.length) return;
  pushHistory(toStack, editingEnvironment);
  const restored = fromStack.pop();
  selectedSpriteId = restored.sprites.some((sprite) => sprite.id === selectedSpriteId) ? selectedSpriteId : undefined;
  spriteMenu = undefined;
  renameSpriteId = undefined;
  soundFlow = undefined;
  backgroundConfirmation = { action: "none" };
  await saveEnvironment(restored);
  updateHistoryControls();
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);
}

function blobUrl(blob) {
  const url = URL.createObjectURL(blob);
  renderObjectUrls.add(url);
  return url;
}

function backgroundUrl(environment) {
  return environment.background?.blob ? blobUrl(environment.background.blob) : "";
}

// A sprite's width is a share of the activity area's width; its height follows the image's own
// shape. Both are percentages, so the same numbers place it identically at any screen size.
function spritePositionStyle(sprite, layer) {
  return `left:${sprite.xPercent}%;top:${sprite.yPercent}%;width:${sprite.sizePercent}%;aspect-ratio:${spriteAspectRatio(sprite)};z-index:${layer + 1}`;
}

function spriteRotationTransform(sprite) {
  return `translate(-50%,-50%) rotate(${sprite.rotationDegrees || 0}deg)`;
}

// The axis-aligned box a rotated sprite actually occupies, in percentages of the activity area
// (width as a share of its width, height as a share of its height). Everything that must stay
// upright — the sprite card, the edge clamp — is measured against this footprint.
function spriteFootprint(sprite) {
  const angleRad = ((sprite.rotationDegrees || 0) * Math.PI) / 180;
  const cos = Math.abs(Math.cos(angleRad));
  const sin = Math.abs(Math.sin(angleRad));
  const width = sprite.sizePercent;
  const height = sprite.sizePercent / spriteAspectRatio(sprite);
  return {
    widthPercent: width * cos + height * sin,
    heightPercent: (width * sin + height * cos) * canvasAspectRatio,
  };
}

function spriteFootprintStyle(sprite, layer) {
  const footprint = spriteFootprint(sprite);
  return `left:${sprite.xPercent}%;top:${sprite.yPercent}%;width:${footprint.widthPercent}%;height:${footprint.heightPercent}%;z-index:${layer + 1}`;
}

function spriteMarkup(sprite, layer) {
  const selected = sprite.id === selectedSpriteId;
  return `<button class="editor-sprite ${selected ? "selected" : ""}" data-sprite-id="${sprite.id}" aria-label="${escapeHtml(sprite.name)}" aria-pressed="${selected}" style="${spritePositionStyle(sprite, layer)};transform:${spriteRotationTransform(sprite)}"><img src="${blobUrl(sprite.image.blob)}" alt="${escapeHtml(sprite.name)}" draggable="false"><span class="ring"></span>${spriteNoSoundBadgeMarkup(sprite)}</button>${spriteTransformHandlesMarkup(sprite, layer, selected)}${spriteCardAnchorMarkup(sprite, layer, selected)}`;
}

// A sprite with no sound wears a small muted-speaker badge whether or not it is selected, so an
// educator can see at a glance which sprites still need one. The badge turns back against the
// sprite's rotation so it always reads upright.
function spriteNoSoundBadgeMarkup(sprite) {
  if (spriteHasSound(sprite)) return "";
  return `<span class="sprite-no-sound" title="No sound yet" style="transform:rotate(${-(sprite.rotationDegrees || 0)}deg)">${icon("soundOff")}</span>`;
}

function spriteTransformHandlesMarkup(sprite, layer, selected) {
  return `<div class="sprite-transform-handles ${selected ? "selected" : ""}" data-sprite-id="${sprite.id}" style="${spritePositionStyle(sprite, layer)};transform:${spriteRotationTransform(sprite)}">
    <div class="resize-handle handle-nw" data-corner="nw" title="Drag to resize"></div>
    <div class="resize-handle handle-ne" data-corner="ne" title="Drag to resize"></div>
    <div class="resize-handle handle-sw" data-corner="sw" title="Drag to resize"></div>
    <div class="resize-handle handle-se" data-corner="se" title="Drag to resize"></div>
    <div class="rotate-stem"></div>
    <div class="rotate-handle" title="Drag to rotate"></div>
  </div>`;
}

// The card anchor is the sprite's upright footprint, so the card hangs below the sprite however
// it is rotated and never tilts with it.
function spriteCardAnchorMarkup(sprite, layer, selected) {
  return `<div class="sprite-card-anchor ${selected ? "selected" : ""}" data-sprite-id="${sprite.id}" style="${spriteFootprintStyle(sprite, layer)}">
    <div class="sprite-card" role="toolbar" aria-label="Sprite options for ${escapeHtml(sprite.name)}">${spriteCardBodyMarkup(sprite)}</div>
  </div>`;
}

function spriteCardBodyMarkup(sprite) {
  if (sprite.id === renameSpriteId) {
    return `<form class="sprite-rename-form">
      <label><span class="sr-only">Sprite name</span><input name="name" value="${escapeHtml(sprite.name)}" aria-label="Sprite name" required></label>
      <button type="submit" class="save-sprite-name">Save name</button>
      <button type="button" class="cancel-sprite-rename" aria-label="Cancel rename" title="Cancel">${icon("close")}</button>
    </form>`;
  }
  const previewing = sprite.id === spritePreviewId;
  const sound = spriteHasSound(sprite)
    ? `<span class="sprite-card-sound">
        <button type="button" class="preview-sprite-sound" aria-label="${previewing ? "Stop" : "Play"} sound for ${escapeHtml(sprite.name)}" aria-pressed="${previewing}" title="${previewing ? "Stop" : "Play"} sound">${icon(previewing ? "pause" : "play")}</button>
        <button type="button" class="open-sprite-sound" title="Open sound">${escapeHtml(sprite.sound.label)}</button>
      </span>`
    : `<button type="button" class="open-sprite-sound add-sound" title="Add sound">${icon("sound")}<span>Add sound</span></button>`;
  return `<button type="button" class="rename-sprite" title="Rename ${escapeHtml(sprite.name)}" aria-label="Rename ${escapeHtml(sprite.name)}"><span class="sprite-card-name">${escapeHtml(sprite.name)}</span>${icon("rename")}</button>
    ${sound}
    <span class="sprite-card-divider"></span>
    <label class="replace-sprite-image file-picker" title="Replace image">${icon("image")}<input class="replace-sprite-image-file" aria-label="Replace image" type="file" accept="${acceptedImageTypes.join(",")}"></label>
    <button type="button" class="duplicate-sprite" aria-label="Duplicate" title="Duplicate">${icon("duplicate")}</button>
    <button type="button" class="delete-sprite" aria-label="Delete" title="Delete">${icon("trash")}</button>`;
}

// The right-click menu offers the card's actions by name, for anyone who reaches for a menu.
function spriteContextMenuMarkup() {
  const sprite = spriteMenu && (editingEnvironment.sprites || []).find((item) => item.id === spriteMenu.spriteId);
  if (!sprite) return "";
  return `<ul class="sprite-context-menu" role="menu" data-sprite-id="${sprite.id}" style="left:${spriteMenu.xPercent}%;top:${spriteMenu.yPercent}%">
    <li><button type="button" class="rename-sprite" role="menuitem">${icon("rename")}<span>Rename</span></button></li>
    <li><label class="replace-sprite-image file-picker" role="menuitem">${icon("image")}<span>Replace image</span><input class="replace-sprite-image-file" aria-label="Replace image" type="file" accept="${acceptedImageTypes.join(",")}"></label></li>
    <li><button type="button" class="open-sprite-sound" role="menuitem">${icon("sound")}<span>${spriteHasSound(sprite) ? "Sound" : "Add sound"}</span></button></li>
    <li><button type="button" class="duplicate-sprite" role="menuitem">${icon("duplicate")}<span>Duplicate</span></button></li>
    <li><button type="button" class="delete-sprite" role="menuitem">${icon("trash")}<span>Delete</span></button></li>
  </ul>`;
}

function spriteNameFromFilename(filename) {
  const name = filename.replace(/\.[^.]+$/, "").replace(/[-_]+/g, " ").trim().replace(/\s+/g, " ");
  return name ? name.replace(/\b\w/g, (letter) => letter.toUpperCase()) : "Untitled sprite";
}

function clearRenderObjectUrls() {
  renderObjectUrls.forEach((url) => URL.revokeObjectURL(url));
  renderObjectUrls.clear();
}

// What a draft still needs before it can be played, in the order an educator would supply it.
const playabilityRequirements = [
  { met: (environment) => Boolean(environment.name.trim()), full: "a name", short: "a name" },
  { met: hasBackdrop, full: "a backdrop", short: "a backdrop" },
  { met: (environment) => (environment.sprites || []).some(spriteHasSound), full: "at least one sprite with a sound", short: "a sprite with a sound" },
];

function missingRequirements(environment) {
  return playabilityRequirements.filter((requirement) => !requirement.met(environment));
}

function isPlayable(environment) {
  return missingRequirements(environment).length === 0;
}

function draftGuidance(environment) {
  const missing = missingRequirements(environment);
  if (!missing.length) return "This environment is ready to play.";
  const phrases = missing.map((requirement) => requirement.full);
  const listed = phrases.length > 1 ? `${phrases.slice(0, -1).join(", ")} and ${phrases.at(-1)}` : phrases[0];
  return `This draft needs ${listed} before it can be played.`;
}

// A disabled Play or Preview control names the requirement it is waiting on, because "Not
// available yet" never told anyone what to do about it.
function unavailableLabel(environment) {
  return `Needs ${missingRequirements(environment)[0].short}`;
}

// Transient guidance carries its own dismiss control, and the message element itself keeps the
// bare text (and its alert role) so screen readers announce the sentence and nothing else.
function dismissibleMessageMarkup(kind, message, className, announceAsAlert) {
  if (!message) return "";
  const role = announceAsAlert ? ' role="alert"' : "";
  return `<div class="editor-message"><p class="${className}"${role}>${escapeHtml(message)}</p><button class="dismiss-editor-message" type="button" data-message="${kind}" aria-label="Dismiss message">×</button></div>`;
}

function backgroundMessageMarkup() {
  return dismissibleMessageMarkup("background", backgroundMessage, "background-message", !/^(Backdrop|Blank backdrop)/.test(backgroundMessage));
}

function spriteMessageMarkup() {
  return dismissibleMessageMarkup("sprite", spriteMessage, "sprite-message", true);
}

function scheduleEditorMessageClear() {
  clearTimeout(editorMessageTimeoutId);
  editorMessageTimeoutId = undefined;
  if (!spriteMessage && !backgroundMessage) return;
  editorMessageTimeoutId = window.setTimeout(() => {
    resetEditorMessages();
    refreshEditor();
  }, editorMessageMs);
}

function setSpriteMessage(message) {
  spriteMessage = message;
  scheduleEditorMessageClear();
}

function setBackgroundMessage(message) {
  backgroundMessage = message;
  scheduleEditorMessageClear();
}

function resetEditorMessages() {
  clearTimeout(editorMessageTimeoutId);
  editorMessageTimeoutId = undefined;
  spriteMessage = "";
  backgroundMessage = "";
}

function dismissEditorMessage(kind) {
  if (kind === "background") backgroundMessage = "";
  else spriteMessage = "";
  scheduleEditorMessageClear();
  refreshEditor();
}

function backdropOnboardingBody() {
  return `<div class="backdrop-onboarding-copy">
      <p class="eyebrow">FIRST, CHOOSE A BACKDROP</p>
      <h2 id="backdrop-onboarding-title">Drag backdrop in</h2>
      <p>Drop, paste, or choose one PNG, JPEG, or WebP image. You can zoom and position it before it fills the activity area.</p>
    </div>
    <div class="backdrop-onboarding-actions">
      <label class="initial-backdrop-picker file-picker">
        <span>Choose a backdrop image</span>
        <input class="initial-backdrop-file" aria-label="Choose backdrop image" type="file" accept="image/png,image/jpeg,image/webp">
      </label>
      <span class="backdrop-choice-divider">or</span>
      <button class="start-blank-backdrop" type="button">Start with a blank background</button>
    </div>
    ${backgroundMessageMarkup()}`;
}

function removeBackgroundConfirmation() {
  if (backgroundConfirmation.action !== "remove") return "";
  return `<section class="background-confirmation" aria-labelledby="remove-background-title">
    <h3 id="remove-background-title">Remove this backdrop?</h3>
    <p>The image will be removed. Existing sprites will stay in this environment.</p>
    <div>
      <button class="cancel-background-confirmation" type="button">Cancel</button>
      <button class="confirm-remove-background" type="button">Remove backdrop</button>
    </div>
  </section>`;
}

function backgroundModal() {
  if (!backgroundModalOpen) return "";
  const removeButton = hasBackdrop(editingEnvironment)
    ? `<div class="modal-actions"><button class="remove-background" type="button">Remove backdrop</button></div>`
    : "";
  return `<div class="modal-backdrop">
    <section class="background-modal" role="dialog" aria-modal="true" aria-labelledby="background-modal-title">
      <button class="close-background-modal close-modal" type="button" aria-label="Close">${icon("close")}</button>
      <p class="eyebrow">ENVIRONMENT BACKDROP</p>
      <h2 id="background-modal-title">Change backdrop</h2>
      <p class="modal-copy">Drop, paste, or choose a PNG, JPEG, or WebP image up to 10 MB. You can zoom and position it before it fills the activity area.</p>
      <label class="background-drop-zone" aria-label="Drop backdrop image">
        Drop or paste a backdrop image here, or <span>choose a file</span>
        <input class="background-file" aria-label="Choose backdrop image" type="file" accept="${acceptedImageTypes.join(",")}">
      </label>
      ${backgroundMessageMarkup()}
      ${removeButton}
      ${removeBackgroundConfirmation()}
    </section>
  </div>`;
}

function soundFlowSprite() {
  return (editingEnvironment.sprites || []).find((sprite) => sprite.id === soundFlow.spriteId);
}

// One modal covers every sound question about a sprite: hearing the sound it has, labelling a
// new one, replacing it, or removing it. A sprite with no sound opens straight onto the picker.
function soundFlowModal() {
  if (!soundFlow) return "";
  const sprite = soundFlowSprite();
  if (!sprite) return "";
  const audioInput = (label) => `<label class="sound-file-picker file-picker"><span>${label}</span><input class="attach-sprite-sound-file" aria-label="${label}" type="file" accept="${acceptedAudioTypes.join(",")}"></label>`;
  const error = soundFlow.error ? `<p class="sprite-message" role="alert">${escapeHtml(soundFlow.error)}</p>` : "";
  let body;
  if (soundFlow.stage === "choose") {
    body = `<h2 id="sound-modal-title">Add a sound</h2>
      <p class="modal-copy">Choose an MP3, WAV, or M4A file up to 20 MB for <b>${escapeHtml(sprite.name)}</b>. Learners will hear it and look for this sprite.</p>
      <label class="background-drop-zone sound-drop-zone" aria-label="Drop sound file">
        Drop a sound file here or <span>choose a file</span>
        <input class="attach-sprite-sound-file" aria-label="Add sound" type="file" accept="${acceptedAudioTypes.join(",")}">
      </label>
      ${error}`;
  } else if (soundFlow.stage === "label") {
    body = `<h2 id="sound-modal-title">${soundFlow.replacing ? "Replace this sound" : "Label this sound"}</h2>
      <p class="modal-copy">${soundFlow.replacing ? `The current sound on <b>${escapeHtml(sprite.name)}</b> will be replaced.` : `Give the sound on <b>${escapeHtml(sprite.name)}</b> a name learners will understand.`}</p>
      <div class="waveform-player" data-sound="new"></div>
      ${error}
      <form class="sound-label-form sound-form">
        <label>Sound label<input name="label" value="${escapeHtml(soundFlow.label)}" required></label>
        <div class="modal-actions">
          <button class="cancel-sound-flow" type="button">Cancel</button>
          <button class="save-sound" type="submit">${soundFlow.replacing ? "Replace sound" : "Add sound"}</button>
        </div>
      </form>`;
  } else {
    body = `<h2 id="sound-modal-title">${escapeHtml(sprite.sound.label)}</h2>
      <p class="modal-copy">The sound attached to <b>${escapeHtml(sprite.name)}</b>.</p>
      <div class="waveform-player" data-sound="current"></div>
      ${error}
      <form class="sound-label-form sound-form">
        <label>Sound label<input name="label" value="${escapeHtml(sprite.sound.label)}" required></label>
        <div class="modal-actions">
          <button class="save-sound" type="submit">Save label</button>
          ${audioInput("Replace sound")}
          <button class="remove-sprite-sound" type="button">Remove sound</button>
        </div>
      </form>`;
  }
  return `<div class="modal-backdrop">
    <section class="sound-modal" role="dialog" aria-modal="true" aria-labelledby="sound-modal-title">
      <button class="close-sound-flow close-modal" type="button" aria-label="Close">${icon("close")}</button>
      <p class="eyebrow">SPRITE SOUND</p>
      ${body}
    </section>
  </div>`;
}

function saveStatusText() {
  if (saveState === "saving") return "Saving on this device…";
  if (saveState === "failed") return "Could not save on this device";
  return "Saved on this device";
}

// The save state reads as a device with a check mark (or dots while saving, a warning when it
// failed). The sentence itself stays inside the live region for assistive technology, and the
// toolbar simply hides it visually — it is never removed.
function saveStatusBody() {
  const iconName = saveState === "saving" ? "saving" : saveState === "failed" ? "saveFailed" : "saved";
  return `${icon(iconName)}<span class="storage-status-text">${saveStatusText()}</span>`;
}

function saveStatus() {
  return `<div class="storage-status ${saveState}" role="status" title="${escapeHtml(saveStatusText())}">${saveStatusBody()}</div>`;
}

function recoveryGuidance() {
  return saveMessage ? `<p class="storage-guidance" role="alert">${saveMessage}</p>` : "";
}

function environmentMetadata(spriteCount, soundCount) {
  return `${spriteCount} ${spriteCount === 1 ? "sprite" : "sprites"} · ${soundCount} ${soundCount === 1 ? "sound" : "sounds"}`;
}

function userEnvironmentCard(environment) {
  const name = environment.name || "Untitled environment";
  const sprites = environment.sprites || [];
  const soundCount = sprites.filter(spriteHasSound).length;
  const playable = isPlayable(environment);
  const thumbnail = environment.background?.blob
    ? `<img class="environment-thumbnail image-thumbnail" src="${backgroundUrl(environment)}" alt="Backdrop for ${escapeHtml(name)}" draggable="false">`
    : environment.background?.kind === "blank"
      ? `<div class="environment-thumbnail blank-thumbnail" role="img" aria-label="Blank white backdrop for ${escapeHtml(name)}"></div>`
      : `<div class="environment-thumbnail draft-thumbnail" aria-hidden="true">Draft</div>`;
  const playButton = playable
    ? `<button class="play-environment" data-environment-id="${environment.id}" type="button" aria-label="Play ${escapeHtml(name)}">Play</button>`
    : `<button disabled type="button" aria-label="Play ${escapeHtml(name)}" title="${escapeHtml(draftGuidance(environment))}">${escapeHtml(unavailableLabel(environment))}</button>`;
  return `<article class="environment-card draft-card">
    ${thumbnail}
    <div class="environment-card-copy">
      <p class="card-kicker">${environment.id === parkEnvironmentId ? "Example · saved on this device" : "Saved on this device"}</p>
      <h2>${escapeHtml(name)}</h2>
      <p>${escapeHtml(draftGuidance(environment))}</p>
      <p class="environment-card-meta">${environmentMetadata(sprites.length, soundCount)}</p>
      <span class="environment-status ${playable ? "ready" : "draft"}">${playable ? "Ready to play" : "Draft"}</span>
    </div>
    <div class="environment-card-actions">
      ${playButton}
      <button class="edit-environment" data-environment-id="${environment.id}" type="button">Edit</button>
      ${environmentMenuMarkup(environment, name)}
    </div>
  </article>`;
}

// Only environments saved on this device carry this menu: the starter cards are protected, so
// they never offer Duplicate or Delete at all rather than offering them disabled.
function environmentMenuMarkup(environment, name) {
  const open = environment.id === environmentMenuOpenId;
  return `<div class="environment-menu-anchor">
      <button class="environment-menu-trigger" type="button" data-environment-id="${environment.id}" aria-haspopup="menu" aria-expanded="${open}" aria-label="More options for ${escapeHtml(name)}" title="More options">${icon("more")}</button>
      <ul class="environment-menu" role="menu"${open ? "" : " hidden"}>
        <li><button class="duplicate-environment" type="button" role="menuitem" data-environment-id="${environment.id}">${icon("duplicate")}<span>Duplicate</span></button></li>
        <li><button class="export-environment" type="button" role="menuitem" data-environment-id="${environment.id}">${icon("export")}<span>Export</span></button></li>
        <li><button class="delete-environment" type="button" role="menuitem" data-environment-id="${environment.id}">${icon("trash")}<span>Delete</span></button></li>
      </ul>
    </div>`;
}

// Deleting takes media off the device for good, so it is always a deliberate, named confirmation
// rather than a menu item that acts on its first click.
function deleteConfirmationModal() {
  const environment = environments.find((item) => item.id === pendingDeleteId);
  if (!environment) return "";
  const name = environment.name || "Untitled environment";
  return `<div class="modal-backdrop">
    <section class="confirm-modal" role="dialog" aria-modal="true" aria-labelledby="delete-environment-title">
      <p class="eyebrow">DELETE ENVIRONMENT</p>
      <h2 id="delete-environment-title">Delete ${escapeHtml(name)}?</h2>
      <p class="modal-copy">This removes the environment, its backdrop, and every sprite image and sound from this device. This cannot be undone.</p>
      <div class="modal-actions">
        <button class="cancel-delete-environment" type="button">Cancel</button>
        <button class="confirm-delete-environment" type="button">Delete environment</button>
      </div>
    </section>
  </div>`;
}

function hasParkExample() {
  return environments.some((environment) => environment.id === parkEnvironmentId);
}

function renderWelcome() {
  app.innerHTML = `<div class="welcome-page">
    <header class="welcome-header">
      ${siteWordmark()}
      <nav class="welcome-nav" aria-label="Site">
        <a href="#how-it-works">How it works</a>
        <a href="/about">About</a>
        <button class="welcome-start small" type="button">Get started</button>
      </nav>
    </header>
    <main>
      <section class="welcome-hero">
        <div class="welcome-hero-copy">
          <p class="eyebrow">LISTEN · NOTICE · CONNECT</p>
          <h1>Turn everyday sounds into a learning adventure.</h1>
          <p class="welcome-lede">Build playful sound-matching activities from the places and objects your learners know. Add a backdrop, place pictures, attach sounds, and you’re ready to play.</p>
          <button class="welcome-start" type="button">Start creating ${icon("back")}</button>
          <p class="welcome-fineprint">Free to use. No account needed. Your work stays on this device.</p>
        </div>
        <div class="welcome-hero-art"><img class="welcome-art" src="/welcome-art.svg" alt=""></div>
      </section>
      <section class="welcome-band" id="how-it-works" aria-labelledby="how-it-works-title">
        <div class="welcome-section">
          <p class="eyebrow">HOW IT WORKS</p>
          <h2 id="how-it-works-title">From your world to a listening game</h2>
          <ol class="welcome-steps">
            <li><span>1</span><h3>Choose a scene</h3><p>Upload a photo or begin with a blank space for your activity.</p></li>
            <li><span>2</span><h3>Add pictures and sounds</h3><p>Place each object where it belongs, then attach its familiar sound.</p></li>
            <li><span>3</span><h3>Play together</h3><p>Learners listen closely and choose the picture that made each sound.</p></li>
          </ol>
        </div>
      </section>
      <section class="welcome-section">
        <div class="welcome-local-card">
          <h2>Made for classrooms. Private by design.</h2>
          <p>Your environments, pictures, and sounds are saved in this browser. There is no account to create and your activity files are not uploaded to us.</p>
          <button class="welcome-start" type="button">Create your first environment</button>
        </div>
      </section>
    </main>
    ${siteFooter()}
  </div>`;
  document.querySelectorAll(".welcome-start").forEach((button) => button.addEventListener("click", () => {
    markWelcomed();
    firstVisit = false;
    navigate({ name: "library" });
  }));
}

function infoPageMarkup(page) {
  if (page === "about") {
    return `<h1>About Everyday Sound Lab</h1>
      <p class="info-lede">A free tool for building playful listening and sound-matching activities.</p>
      <section class="info-card">
        <div class="info-card-heading"><img src="/edtechathon-logo.svg" alt="" width="42" height="42"><h2>From the EdTech-a-thon</h2></div>
        <p>Everyday Sound Lab was made at the <a href="https://edtechathon.com" target="_blank" rel="noopener noreferrer">EdTech-a-thon</a>, a community building free tools for classrooms.</p>
      </section>
      <section class="info-card"><h2>Our promise</h2><ul><li><strong>Zero paywalls.</strong></li><li><strong>Zero ads.</strong></li><li><strong>Zero tracking of personal data.</strong></li></ul></section>
      <section class="info-card"><h2>Feedback and ideas</h2><p>We’d love to hear what works, what doesn’t, and what would make the lab more useful for your learners.</p><a class="info-button" href="mailto:support@teacher.dev?subject=Everyday%20Sound%20Lab%20feedback">Email support@teacher.dev</a></section>`;
  }
  return `<h1>Privacy</h1>
    <p class="info-lede">What we collect, what we don’t, and where your activities live.</p>
    <section class="info-card">
      <p>Everyday Sound Lab does not collect personal information from teachers or learners. We use Cloudflare Web Analytics to count visits anonymously. It does not use cookies, fingerprint visitors, or follow people across websites. You can read <a href="https://www.cloudflare.com/privacypolicy/" target="_blank" rel="noopener noreferrer">Cloudflare’s privacy policy</a> for details.</p>
      <p>Your environments, pictures, and sounds are stored by your browser on this device. They are not uploaded to us. Environment exports are also created in your browser and saved directly to your downloads.</p>
      <p>Questions? Email <a href="mailto:support@teacher.dev?subject=Everyday%20Sound%20Lab%20privacy">support@teacher.dev</a>.</p>
    </section>`;
}

function renderInfoPage(page) {
  app.innerHTML = `<div class="info-page">
    <header class="welcome-header">
      ${siteWordmark()}
      <nav class="welcome-nav" aria-label="Site"><a href="/">Your environments</a></nav>
    </header>
    <main class="info-main">${infoPageMarkup(page)}</main>
    ${siteFooter()}
  </div>`;
}

function renderLibrary() {
  const emptyNote = environments.length ? "" : `<p class="library-empty">Nothing here yet. Create an environment to get started.</p>`;
  app.innerHTML = `<main class="library">
    <header class="app-topbar library-topbar">
      ${brandMarkup()}
      <span class="toolbar-spacer"></span>
      ${saveStatus()}
    </header>
    <div class="library-body">
      <div class="library-heading">
        <div>
          <h1>Your environments</h1>
          <p>Every environment stays on this device. Open one to edit it, or play it with your class.</p>
        </div>
        <div class="library-actions">
          <button class="import-environment" type="button">${icon("import")}<span>Import environment</span></button>
          <input class="import-environment-file" type="file" accept=".zip,application/zip" hidden>
          <button class="create-environment" type="button">${icon("sprite")}<span>Create environment</span></button>
        </div>
      </div>
      ${emptyNote}
      <section class="environment-grid">
        ${environments.map(userEnvironmentCard).join("")}
      </section>
      ${recoveryGuidance()}
    </div>
    ${siteFooter()}
    ${deleteConfirmationModal()}
  </main>`;
  document.querySelector(".editor-home").addEventListener("click", () => navigate({ name: "library" }));
  document.querySelector(".create-environment").addEventListener("click", createEnvironment);
  const importInput = document.querySelector(".import-environment-file");
  document.querySelector(".import-environment").addEventListener("click", () => importInput.click());
  importInput.addEventListener("change", () => {
    const [file] = importInput.files;
    importInput.value = "";
    if (file) importEnvironmentFile(file);
  });
  document.querySelectorAll(".edit-environment").forEach((button) => button.addEventListener("click", () => openEditor(button.dataset.environmentId)));
  document.querySelectorAll(".play-environment").forEach((button) => button.addEventListener("click", () => navigate({ name: "play", id: button.dataset.environmentId }, { origin: "library" })));
  bindEnvironmentMenus();
}

function bindEnvironmentMenus() {
  document.querySelectorAll(".environment-menu-trigger").forEach((trigger) => trigger.addEventListener("click", (event) => {
    event.stopPropagation();
    toggleEnvironmentMenu(trigger.dataset.environmentId);
  }));
  document.querySelectorAll(".duplicate-environment").forEach((button) => button.addEventListener("click", () => duplicateEnvironment(button.dataset.environmentId)));
  document.querySelectorAll(".export-environment").forEach((button) => button.addEventListener("click", () => exportEnvironment(button.dataset.environmentId)));
  document.querySelectorAll(".delete-environment").forEach((button) => button.addEventListener("click", () => askToDeleteEnvironment(button.dataset.environmentId)));
  document.querySelector(".cancel-delete-environment")?.addEventListener("click", cancelDeleteEnvironment);
  document.querySelector(".confirm-delete-environment")?.addEventListener("click", () => deleteEnvironment(pendingDeleteId));
  bindModalBackdropClose(".confirm-modal", cancelDeleteEnvironment);
  // Focus lands on Cancel when the delete confirmation opens — never on the button that
  // destroys the environment.
  document.querySelector(".cancel-delete-environment")?.focus();
  showEnvironmentMenu();
}

// Clicking outside a modal's panel closes it the same way its Close control does.
function bindModalBackdropClose(panelSelector, close) {
  const panel = document.querySelector(panelSelector);
  const backdrop = panel?.closest(".modal-backdrop");
  backdrop?.addEventListener("pointerdown", (event) => {
    if (event.target === backdrop) backdrop.dataset.pressedOutside = "true";
  });
  backdrop?.addEventListener("click", (event) => {
    const pressedOutside = backdrop.dataset.pressedOutside === "true";
    delete backdrop.dataset.pressedOutside;
    if (event.target === backdrop && pressedOutside) close();
  });
}

function menuTrigger(id) {
  return document.querySelector(`.environment-menu-trigger[data-environment-id="${CSS.escape(id)}"]`);
}

// The menu opens and closes in place: rebuilding the library here would reload every backdrop
// thumbnail, which showed as a flash each time the menu was used.
function showEnvironmentMenu() {
  document.querySelectorAll(".environment-menu-anchor").forEach((anchor) => {
    const trigger = anchor.querySelector(".environment-menu-trigger");
    const open = trigger.dataset.environmentId === environmentMenuOpenId;
    trigger.setAttribute("aria-expanded", String(open));
    anchor.querySelector(".environment-menu").hidden = !open;
  });
  if (environmentMenuOpenId) document.querySelector(".environment-menu:not([hidden]) button")?.focus();
}

function toggleEnvironmentMenu(id) {
  if (environmentMenuOpenId === id) return closeEnvironmentMenu(true);
  environmentMenuOpenId = id;
  showEnvironmentMenu();
}

function closeEnvironmentMenu(returnFocus = false) {
  if (!environmentMenuOpenId) return;
  const id = environmentMenuOpenId;
  environmentMenuOpenId = undefined;
  showEnvironmentMenu();
  if (returnFocus) menuTrigger(id)?.focus();
}

function askToDeleteEnvironment(id) {
  environmentMenuOpenId = undefined;
  pendingDeleteId = id;
  render();
}

function cancelDeleteEnvironment() {
  const id = pendingDeleteId;
  pendingDeleteId = undefined;
  render();
  menuTrigger(id)?.focus();
}

// A full editor render is reserved for entering the editor view. It lays out stable regions
// (toolbar, canvas, controls, feedback, modals) and then lets refreshEditor() fill them in, so
// every later update rewrites only what changed instead of replacing the whole editor.
function renderEditor() {
  renderedEditorRegions.clear();
  renderedBackdrop = { kind: "pending", blob: undefined };
  app.innerHTML = `<main class="editor">
    <header class="app-topbar editor-toolbar" role="toolbar" aria-label="Editor toolbar">
      ${brandMarkup()}
      <button class="undo-editor" type="button" aria-label="Undo" title="Undo" disabled>${icon("undo")}</button>
      <button class="redo-editor" type="button" aria-label="Redo" title="Redo" disabled>${icon("redo")}</button>
      <label class="environment-name-label" for="environment-name">Environment name</label>
      <input class="environment-name-input" id="environment-name" value="${escapeHtml(editingEnvironment.name)}" placeholder="Untitled environment" aria-label="Environment name">
      <span class="toolbar-spacer"></span>
      ${saveStatus()}
      <button class="preview-environment" type="button"></button>
    </header>
    <section class="editor-stage">
      <section class="activity-canvas" aria-label="Activity area"></section>
      <div class="editor-feedback"></div>
    </section>
    <div class="editor-controls" role="group" aria-label="Backdrop and sprites"></div>
    <div class="editor-modals"></div>
  </main>`;
  bindEditorShell();
  refreshEditor();
  if (focusEnvironmentName) {
    focusEnvironmentName = false;
    const nameInput = document.querySelector("#environment-name");
    nameInput.focus();
    nameInput.select();
  }
}

// Everything below the shell is updated in place. Regions whose markup is unchanged are left
// alone entirely, so saves never tear down the canvas, the name input, or an open menu.
function refreshEditor() {
  if (view !== "editor" || !editingEnvironment || !document.querySelector("main.editor")) return;
  refreshEditorToolbar();
  refreshEditorCanvas();
  updateEditorRegion(".editor-controls", editorControlsMarkup(), bindEditorControls);
  updateEditorRegion(".editor-feedback", editorFeedbackMarkup());
  updateEditorRegion(".editor-modals", `${backgroundModal()}${soundFlowModal()}`, bindEditorModals);
}

// The context menu is one element for the whole canvas, rebuilt only when it opens somewhere
// else or its sprite's sound status changes the wording.
function refreshSpriteContextMenu(canvas) {
  const markup = spriteContextMenuMarkup();
  const existing = canvas.querySelector(".sprite-context-menu");
  if (renderedEditorRegions.get(".sprite-context-menu") === markup && Boolean(existing) === Boolean(markup)) return;
  renderedEditorRegions.set(".sprite-context-menu", markup);
  existing?.remove();
  if (!markup) return;
  const holder = document.createElement("div");
  holder.innerHTML = markup;
  const menu = holder.firstElementChild;
  canvas.append(menu);
  bindSpriteActions(menu, menu.dataset.spriteId);
  menu.querySelector("button")?.focus();
}

function updateEditorRegion(selector, markup, bind) {
  const element = document.querySelector(selector);
  if (!element) return;
  if (renderedEditorRegions.get(selector) === markup) return;
  renderedEditorRegions.set(selector, markup);
  element.innerHTML = markup;
  bind?.(element);
}

// The control panel sits under the activity area: what the draft still needs on the left, and
// the things to do about it on the right. Sprites stay gated until a backdrop exists, and the
// picker stays a real, focusable file input.
function editorControlsMarkup() {
  const ready = hasBackdrop(editingEnvironment);
  const addSprite = ready
    ? `<label class="add-sprite control-button" title="Add sprite image">${icon("sprite")}<span class="control-text">Add sprite</span><input class="sprite-file" aria-label="Add sprite image" type="file" accept="${acceptedImageTypes.join(",")}"></label>`
    : `<button class="add-sprite-disabled control-button" type="button" disabled aria-label="Add sprite after choosing a backdrop" title="Choose a backdrop before adding sprites">${icon("sprite")}<span class="control-text">Add sprite</span></button>`;
  const changeBackdrop = ready
    ? `<button class="set-background control-button" type="button" aria-label="Change backdrop" title="Change backdrop">${icon("backdrop")}<span class="control-text">Change backdrop</span></button>`
    : "";
  return `<p class="editor-next-step">${escapeHtml(draftGuidance(editingEnvironment))}</p>
    <div class="control-buttons">${changeBackdrop}${addSprite}</div>`;
}

function editorFeedbackMarkup() {
  const showBackgroundMessage = hasBackdrop(editingEnvironment) && !backgroundModalOpen;
  return `${spriteMessageMarkup()}
        ${showBackgroundMessage ? backgroundMessageMarkup() : ""}
        ${recoveryGuidance()}`;
}

// The name input is deliberately never rebuilt, and its value is only synced from state while
// the educator is not typing in it, so an in-progress edit can always reach its change event.
function refreshEditorToolbar() {
  updateHistoryControls();
  updateSaveStatus();
  const nameInput = document.querySelector(".environment-name-input");
  if (nameInput && document.activeElement !== nameInput && nameInput.value !== editingEnvironment.name) {
    nameInput.value = editingEnvironment.name;
  }
  const preview = document.querySelector(".preview-environment");
  if (!preview) return;
  const playable = isPlayable(editingEnvironment);
  const label = playable ? "Preview" : unavailableLabel(editingEnvironment);
  preview.disabled = !playable;
  preview.title = playable ? "Preview this environment" : draftGuidance(editingEnvironment);
  preview.setAttribute("aria-label", label);
  preview.innerHTML = `${icon("preview")}<span class="control-text">${escapeHtml(label)}</span>`;
}

function currentBackdrop() {
  if (editingEnvironment.background?.blob) return { kind: "image", blob: editingEnvironment.background.blob };
  if (editingEnvironment.background?.kind === "blank") return { kind: "blank", blob: undefined };
  return { kind: "none", blob: undefined };
}

function backdropElementMarkup(backdrop) {
  if (backdrop.kind === "image") return `<img class="editor-backdrop" src="${blobUrl(backdrop.blob)}" alt="Environment backdrop" draggable="false">`;
  if (backdrop.kind === "blank") return `<div class="editor-backdrop blank-backdrop" aria-label="Blank white backdrop"></div>`;
  return `<section class="backdrop-onboarding" aria-labelledby="backdrop-onboarding-title"></section>`;
}

function refreshEditorCanvas() {
  const canvas = document.querySelector(".activity-canvas");
  if (!canvas) return;
  const backdropReady = hasBackdrop(editingEnvironment);
  canvas.classList.toggle("has-backdrop", backdropReady);
  canvas.classList.toggle("awaiting-backdrop", !backdropReady);
  refreshEditorBackdrop(canvas);
  refreshEditorSprites(canvas, backdropReady);
}

// The backdrop element is only replaced when the chosen backdrop itself changes, so adding a
// sprite or saving never reloads the backdrop image (the visible "flash" the educator reported).
function refreshEditorBackdrop(canvas) {
  const backdrop = currentBackdrop();
  const existing = canvas.querySelector(".editor-backdrop, .backdrop-onboarding");
  if (!existing || renderedBackdrop.kind !== backdrop.kind || renderedBackdrop.blob !== backdrop.blob) {
    renderedBackdrop = backdrop;
    renderedEditorRegions.delete(".backdrop-onboarding");
    const holder = document.createElement("div");
    holder.innerHTML = backdropElementMarkup(backdrop);
    const replacement = holder.firstElementChild;
    if (existing) existing.replaceWith(replacement);
    else canvas.prepend(replacement);
  }
  if (backdrop.kind === "none") updateEditorRegion(".backdrop-onboarding", backdropOnboardingBody(), bindBackdropOnboarding);
}

function refreshEditorSprites(canvas, backdropReady) {
  const sprites = backdropReady ? (editingEnvironment.sprites || []) : [];
  const wanted = new Set(sprites.map((sprite) => sprite.id));
  canvas.querySelectorAll("[data-sprite-id]").forEach((element) => {
    if (!wanted.has(element.dataset.spriteId)) element.remove();
  });
  sprites.forEach((sprite, layer) => {
    if (!overlayElements(sprite.id).button) addSpriteElements(canvas, sprite, layer);
    updateSpriteElements(sprite, layer);
  });
  refreshSpriteContextMenu(canvas);
}

function addSpriteElements(canvas, sprite, layer) {
  const holder = document.createElement("div");
  holder.innerHTML = spriteMarkup(sprite, layer);
  [...holder.children].forEach((node) => canvas.append(node));
  const { button, cardAnchor, transformHandles } = overlayElements(sprite.id);
  if (button) {
    bindSpriteEvents(button);
    const image = button.querySelector("img");
    if (image) spriteImageBlobs.set(image, sprite.image.blob);
  }
  if (cardAnchor) {
    renderedEditorRegions.set(cardKey(sprite.id), cardAnchor.querySelector(".sprite-card").innerHTML);
    bindSpriteCard(cardAnchor);
  }
  if (transformHandles) bindSpriteTransformHandles(transformHandles);
}

function cardKey(id) {
  return `.sprite-card[${id}]`;
}

function updateSpriteElements(sprite, layer) {
  const selected = sprite.id === selectedSpriteId;
  const transform = spriteRotationTransform(sprite);
  const { button, cardAnchor, transformHandles } = overlayElements(sprite.id);
  [button, transformHandles].forEach((element) => {
    if (!element) return;
    element.classList.toggle("selected", selected);
    element.style.left = `${sprite.xPercent}%`;
    element.style.top = `${sprite.yPercent}%`;
    element.style.width = `${sprite.sizePercent}%`;
    element.style.aspectRatio = String(spriteAspectRatio(sprite));
    element.style.zIndex = layer + 1;
    element.style.transform = transform;
  });
  if (cardAnchor) {
    cardAnchor.classList.toggle("selected", selected);
    updateSpriteCard(cardAnchor, sprite);
    placeSpriteCardAnchor(cardAnchor, sprite, layer);
  }
  if (!button) return;
  button.setAttribute("aria-pressed", String(selected));
  button.setAttribute("aria-label", sprite.name);
  const image = button.querySelector("img");
  if (!image) return;
  image.alt = sprite.name;
  if (spriteImageBlobs.get(image) === sprite.image.blob) return;
  spriteImageBlobs.set(image, sprite.image.blob);
  image.src = blobUrl(sprite.image.blob);
}

// The card is rebuilt only when its words change (a rename, a new sound, a preview starting),
// so a half-typed name or the focus inside it survives every other refresh.
function updateSpriteCard(cardAnchor, sprite) {
  const card = cardAnchor.querySelector(".sprite-card");
  const markup = spriteCardBodyMarkup(sprite);
  card.setAttribute("aria-label", `Sprite options for ${sprite.name}`);
  if (renderedEditorRegions.get(cardKey(sprite.id)) === markup) return;
  renderedEditorRegions.set(cardKey(sprite.id), markup);
  card.innerHTML = markup;
  bindSpriteCard(cardAnchor);
  if (sprite.id === renameSpriteId) {
    const input = card.querySelector("input[name=name]");
    input?.focus();
    input?.select();
  }
}

function bindEditorControls() {
  document.querySelector(".set-background")?.addEventListener("click", () => {
    backgroundModalOpen = true;
    setBackgroundMessage("");
    refreshEditor();
  });
  const spriteFile = document.querySelector(".sprite-file");
  spriteFile?.addEventListener("change", () => addSpriteFromFile(takeChosenFile(spriteFile)));
}

function bindBackdropOnboarding() {
  const initialBackdropFile = document.querySelector(".initial-backdrop-file");
  initialBackdropFile?.addEventListener("change", () => selectBackground(takeChosenFile(initialBackdropFile)));
  document.querySelector(".start-blank-backdrop")?.addEventListener("click", startWithBlankBackdrop);
}

// File pickers now outlive the edits they trigger, so hand back the chosen file and clear the
// input: picking the very same file again still counts as a fresh choice.
function takeChosenFile(input) {
  const file = input.files[0];
  input.value = "";
  return file;
}

function bindEditorModals() {
  bindSoundModal();
  bindBackgroundModal();
}

function bindSoundModal() {
  const modal = document.querySelector(".sound-modal");
  if (!modal) return;
  modal.querySelector(".close-sound-flow").addEventListener("click", cancelSoundFlow);
  modal.querySelector(".cancel-sound-flow")?.addEventListener("click", cancelSoundFlow);
  bindModalBackdropClose(".sound-modal", cancelSoundFlow);
  modal.querySelector(".sound-label-form")?.addEventListener("submit", (event) => {
    event.preventDefault();
    submitSoundLabel(new FormData(event.currentTarget).get("label"));
  });
  modal.querySelectorAll(".attach-sprite-sound-file").forEach((input) => input.addEventListener("change", () => {
    const file = takeChosenFile(input);
    if (file) beginAttachSound(soundFlow.spriteId, file);
  }));
  modal.querySelector(".remove-sprite-sound")?.addEventListener("click", removeSpriteSound);
  const dropZone = modal.querySelector(".sound-drop-zone");
  dropZone?.addEventListener("dragover", (event) => event.preventDefault());
  dropZone?.addEventListener("drop", (event) => {
    event.preventDefault();
    event.stopPropagation();
    const files = event.dataTransfer.files;
    if (files.length !== 1) {
      soundFlow = { ...soundFlow, error: "Drop one sound file at a time." };
      refreshEditor();
      return;
    }
    beginAttachSound(soundFlow.spriteId, files[0]);
  });
  const player = modal.querySelector(".waveform-player");
  if (player) {
    const sprite = soundFlowSprite();
    const blob = player.dataset.sound === "new" ? soundFlow.file : sprite?.sound?.blob;
    if (blob) mountWaveformPlayer(player, blob);
  }
}

function bindEditorShell() {
  const nameInput = document.querySelector("#environment-name");
  nameInput.addEventListener("change", () => {
    const name = nameInput.value;
    if (name !== editingEnvironment.name) commitEditorMutation({ ...editingEnvironment, name });
  });
  nameInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") nameInput.blur();
    if (event.key === "Escape") {
      nameInput.value = editingEnvironment.name;
      nameInput.blur();
    }
  });
  // Home is the only "leave" control in the toolbar: real browser Back now does what the old
  // in-app Back button did, so keeping both would be two names for one behaviour.
  document.querySelector(".editor-home").addEventListener("click", () => navigate({ name: "library" }));
  document.querySelector(".undo-editor").addEventListener("click", () => restoreEditorHistory(undoStack, redoStack));
  document.querySelector(".redo-editor").addEventListener("click", () => restoreEditorHistory(redoStack, undoStack));
  document.querySelector(".preview-environment")?.addEventListener("click", () => {
    if (!isPlayable(editingEnvironment)) return;
    navigate({ name: "play", id: editingEnvironment.id }, { origin: "editor" });
  });
  document.querySelector("main.editor").addEventListener("click", (event) => {
    const dismiss = event.target.closest(".dismiss-editor-message");
    if (dismiss) dismissEditorMessage(dismiss.dataset.message);
  });
  const canvas = document.querySelector(".activity-canvas");
  canvas.addEventListener("click", (event) => {
    if (event.target === canvas || event.target.matches(".editor-backdrop")) deselectSprite();
  });
  canvas.addEventListener("contextmenu", (event) => {
    const spriteElement = event.target.closest("[data-sprite-id]");
    if (!spriteElement || !hasBackdrop(editingEnvironment)) return;
    event.preventDefault();
    openSpriteContextMenu(spriteElement.dataset.spriteId, event, canvas);
  });
  canvas.addEventListener("dragover", (event) => event.preventDefault());
  canvas.addEventListener("drop", (event) => {
    event.preventDefault();
    dropOntoCanvas(event, canvas);
  });
}

// Sprites render as three sibling overlays sharing one data-sprite-id (the button, its card, and
// its resize/rotate handles) — a sound dropped on any of them lands on that sprite.
async function dropOntoCanvas(event, canvas) {
  const files = event.dataTransfer.files;
  if (files.length > 1) {
    if (hasBackdrop(editingEnvironment)) setSpriteMessage("Drop one image at a time.");
    else setBackgroundMessage("Drop one backdrop image at a time.");
    refreshEditor();
    return;
  }
  const position = dropPosition(event, canvas);
  const file = files[0] || await fileFromDraggedWebImage(event.dataTransfer);
  if (!file) {
    const message = "That image could not be brought across from the other page. Right-click it, choose Copy image, and paste it here instead.";
    if (hasBackdrop(editingEnvironment)) setSpriteMessage(message);
    else setBackgroundMessage(message);
    refreshEditor();
    return;
  }
  if (!hasBackdrop(editingEnvironment)) {
    if (file.type.startsWith("audio/")) {
      setBackgroundMessage("Choose a backdrop before adding sprites or sounds.");
      refreshEditor();
      return;
    }
    selectBackground(file);
    return;
  }
  if (file.type.startsWith("audio/")) {
    const targetSprite = event.target.closest("[data-sprite-id]");
    if (!targetSprite || targetSprite.dataset.spriteId !== selectedSpriteId) {
      setSpriteMessage("Drop the sound onto a sprite to attach it.");
      refreshEditor();
      return;
    }
    beginAttachSound(targetSprite.dataset.spriteId, file);
    return;
  }
  addSpriteFromFile(file, position);
}

// An image dragged straight from another browser tab arrives as an address, not a file. If the
// other site allows it, the image is fetched and used as though it had been dropped from disk.
async function fileFromDraggedWebImage(dataTransfer) {
  const url = draggedImageUrl(dataTransfer);
  if (!url) return undefined;
  try {
    const response = await fetch(url, { mode: "cors" });
    if (!response.ok) return undefined;
    const blob = await response.blob();
    if (!acceptedImageTypes.includes(blob.type)) return undefined;
    const name = new URL(url).pathname.split("/").pop() || "image";
    return new File([blob], name, { type: blob.type });
  } catch (error) {
    return undefined;
  }
}

function draggedImageUrl(dataTransfer) {
  const html = dataTransfer.getData("text/html");
  const source = html && new DOMParser().parseFromString(html, "text/html").querySelector("img")?.getAttribute("src");
  const listed = dataTransfer.getData("text/uri-list").split("\n").find((line) => line && !line.startsWith("#"));
  const candidate = source || listed || dataTransfer.getData("text/plain");
  return /^https?:\/\//.test(candidate || "") ? candidate : undefined;
}

// A pasted image goes wherever a dropped one would: it becomes the backdrop until there is one,
// and a sprite afterwards. Pasting with the backdrop window open always replaces the backdrop.
function pasteIntoEditor(event) {
  if (isTypingTarget(event.target)) return;
  const file = [...(event.clipboardData?.files || [])].find((item) => item.type.startsWith("image/"));
  if (file) {
    event.preventDefault();
    if (backgroundModalOpen || !hasBackdrop(editingEnvironment)) selectBackground(file);
    else addSpriteFromFile(file);
    return;
  }
  if (spriteClipboard && hasBackdrop(editingEnvironment) && !soundFlow && !backgroundModalOpen) {
    event.preventDefault();
    pasteSprite();
  }
}

function isTypingTarget(element) {
  return Boolean(element?.closest?.("input, textarea, select, [contenteditable=true]"));
}

// Keyboard shortcuts for the selected sprite: copy, paste, duplicate, and delete. The name
// field and modal forms keep their own keys.
function editorKeyboardShortcut(event) {
  if (isTypingTarget(event.target) || soundFlow || backgroundModalOpen) return;
  const command = event.metaKey || event.ctrlKey;
  const key = event.key.toLowerCase();
  if (command && key === "c" && selectedSpriteId) {
    copySprite(selectedSpriteId);
    event.preventDefault();
  } else if (command && key === "d" && selectedSpriteId) {
    duplicateSprite(selectedSpriteId);
    event.preventDefault();
  } else if (command && key === "z") {
    restoreEditorHistory(event.shiftKey ? redoStack : undoStack, event.shiftKey ? undoStack : redoStack);
    event.preventDefault();
  } else if ((event.key === "Delete" || event.key === "Backspace") && selectedSpriteId && !command) {
    deleteSprite(selectedSpriteId);
    event.preventDefault();
  }
}

function render() {
  clearRenderObjectUrls();
  stopSpritePreview();
  document.body.dataset.view = view;
  if (view === "welcome") return renderWelcome();
  if (view === "about" || view === "privacy") return renderInfoPage(view);
  if (view === "library") return renderLibrary();
  if (view === "editor") return renderEditor();
  renderActivity();
}

// The address bar is the single source of truth for which surface is on screen, so browser Back,
// Forward, and a reloaded deep link all arrive here and rebuild the same surface.
function applyRoute() {
  const route = parseRoute(window.location.pathname);
  audio?.pause();
  clearTimeout(nextSoundTimeoutId);
  if (route.name === "editor") return enterEditor(route.id);
  if (route.name === "play") return enterActivity(route.id, history.state?.origin);
  if (route.name === "welcome") return enterSitePage("welcome");
  if (route.name === "about" || route.name === "privacy") return enterSitePage(route.name);
  if (window.location.pathname !== "/") return fallBackToLibrary();
  if (firstVisit) return enterSitePage("welcome");
  enterLibrary();
}

// An address that names an environment that is gone (or never existed) is not an error screen:
// it quietly becomes the library, and the address bar is corrected to match.
function fallBackToLibrary() {
  history.replaceState({ route: "library" }, "", "/");
  enterLibrary();
}

function enterSitePage(page) {
  view = page;
  activeEnvironment = undefined;
  activityOrigin = undefined;
  editingEnvironment = undefined;
  selectedSpriteId = undefined;
  clearEditorSession();
  render();
}

function clearEditorSession() {
  backgroundModalOpen = false;
  backgroundConfirmation = { action: "none" };
  resetEditorMessages();
  stopSpritePreview();
  soundFlow = undefined;
  spriteMenu = undefined;
  renameSpriteId = undefined;
}

function enterLibrary() {
  view = "library";
  activeEnvironment = undefined;
  activityOrigin = undefined;
  editingEnvironment = undefined;
  selectedSpriteId = undefined;
  environmentMenuOpenId = undefined;
  pendingDeleteId = undefined;
  clearEditorSession();
  resetEditorHistory();
  render();
}

// Returning to the editor you just previewed keeps that editing session — its undo history and
// selection — intact; arriving at a different environment starts a fresh session.
function enterEditor(id) {
  const environment = environments.find((item) => item.id === id);
  if (!environment) return fallBackToLibrary();
  const resumingSameEnvironment = editingEnvironment?.id === id;
  activeEnvironment = undefined;
  activityOrigin = undefined;
  clearEditorSession();
  if (!resumingSameEnvironment) {
    editingEnvironment = snapshotEnvironment(environment);
    selectedSpriteId = undefined;
    resetEditorHistory();
  }
  view = "editor";
  render();
}

function enterActivity(id, origin) {
  const environment = environments.find((item) => item.id === id);
  if (!environment) return fallBackToLibrary();
  activeEnvironment = environment;
  activityOrigin = origin === "editor" ? "editor" : "library";
  currentSound = undefined;
  completedRounds = 0;
  activityFinished = false;
  view = "activity";
  render();
}

async function imageValidationError(file, validate) {
  const error = validate(file);
  if (error) return error;
  if (!await imageCanDecode(file)) return "This image could not be opened. Choose a PNG, JPEG, or WebP image that is not damaged.";
  return "";
}

async function addSpriteFromFile(file, position = { xPercent: 50, yPercent: 50 }) {
  if (!hasBackdrop(editingEnvironment)) {
    setSpriteMessage("Choose a backdrop before adding sprites.");
    refreshEditor();
    return;
  }
  const error = await imageValidationError(file, validateImage);
  if (error) {
    setSpriteMessage(error);
    refreshEditor();
    return;
  }
  setSpriteMessage("");
  // Transparent margins are trimmed away so the sprite's box hugs what is actually drawn.
  const measured = await measureSpriteImage(file);
  const sprite = {
    id: crypto.randomUUID(),
    name: spriteNameFromFilename(file.name),
    image: { blob: measured.blob },
    xPercent: position.xPercent,
    yPercent: position.yPercent,
    sizePercent: defaultSpriteSizePercent,
    aspectRatio: measured.aspectRatio,
  };
  selectedSpriteId = sprite.id;
  await commitEditorMutation({ ...editingEnvironment, sprites: [...(editingEnvironment.sprites || []), sprite] });
}

// Half of a sprite's upright footprint, as percentages of the activity area on each axis.
function spriteHalfExtents(sprite) {
  const footprint = spriteFootprint(sprite);
  return { xPercent: footprint.widthPercent / 2, yPercent: footprint.heightPercent / 2 };
}

function constrainedPercent(point, start, length, halfExtentPercent) {
  return Math.max(halfExtentPercent, Math.min(100 - halfExtentPercent, ((point - start) / length) * 100));
}

function dropPosition(event, canvas) {
  const bounds = canvas.getBoundingClientRect();
  const half = spriteHalfExtents({ sizePercent: defaultSpriteSizePercent, aspectRatio: 1 });
  return {
    xPercent: constrainedPercent(event.clientX, bounds.left, bounds.width, half.xPercent),
    yPercent: constrainedPercent(event.clientY, bounds.top, bounds.height, half.yPercent),
  };
}

function draggedSpritePosition(event, drag) {
  const half = spriteHalfExtents(drag.sprite);
  return {
    xPercent: constrainedPercent(drag.startCanvasX + event.clientX - drag.startPointerX, drag.bounds.left, drag.bounds.width, half.xPercent),
    yPercent: constrainedPercent(drag.startCanvasY + event.clientY - drag.startPointerY, drag.bounds.top, drag.bounds.height, half.yPercent),
  };
}

function bringSpriteToFront(id, sprites = editingEnvironment.sprites || []) {
  const selected = sprites.find((sprite) => sprite.id === id);
  return selected ? [...sprites.filter((sprite) => sprite.id !== id), selected] : sprites;
}

function overlayElements(id) {
  const escaped = CSS.escape(id);
  return {
    button: document.querySelector(`.editor-sprite[data-sprite-id="${escaped}"]`),
    cardAnchor: document.querySelector(`.sprite-card-anchor[data-sprite-id="${escaped}"]`),
    transformHandles: document.querySelector(`.sprite-transform-handles[data-sprite-id="${escaped}"]`),
  };
}

function showSelectedSprite(id) {
  editingEnvironment.sprites.forEach((sprite, layer) => {
    const selected = sprite.id === id;
    const { button, cardAnchor, transformHandles } = overlayElements(sprite.id);
    if (button) {
      button.classList.toggle("selected", selected);
      button.setAttribute("aria-pressed", String(selected));
      button.style.zIndex = layer + 1;
    }
    [cardAnchor, transformHandles].forEach((element) => {
      if (!element) return;
      element.classList.toggle("selected", selected);
      element.style.zIndex = layer + 1;
    });
    if (selected && cardAnchor) placeSpriteCardAnchor(cardAnchor, sprite, layer);
  });
}

function selectSprite(id) {
  const currentSprites = editingEnvironment.sprites || [];
  if (selectedSpriteId === id && currentSprites.at(-1)?.id === id) return;
  if (selectedSpriteId !== id) {
    closeSpriteMenu();
    cancelSpriteRename();
    stopSpritePreview();
  }
  selectedSpriteId = id;
  if (currentSprites.at(-1)?.id === id) {
    showSelectedSprite(id);
    return;
  }
  const beforeSelection = snapshotEnvironment(editingEnvironment);
  editingEnvironment = { ...editingEnvironment, sprites: bringSpriteToFront(id, currentSprites) };
  showSelectedSprite(id);
  commitEditorGesture(beforeSelection);
}

function deselectSprite() {
  if (!selectedSpriteId) return;
  closeSpriteMenu();
  cancelSpriteRename();
  stopSpritePreview();
  selectedSpriteId = undefined;
  showSelectedSprite();
}

// A copy keeps everything about the original — image, sound, size, rotation — under a new
// identity, and lands a little down and to the right so both are visible.
function spriteCopy(sprite, offsetPercent = 3) {
  const half = spriteHalfExtents(sprite);
  return {
    ...sprite,
    id: crypto.randomUUID(),
    image: copiedMedia(sprite.image),
    sound: copiedMedia(sprite.sound),
    xPercent: clampPercent(sprite.xPercent + offsetPercent, half.xPercent, 100 - half.xPercent),
    yPercent: clampPercent(sprite.yPercent + offsetPercent * canvasAspectRatio, half.yPercent, 100 - half.yPercent),
  };
}

function copySprite(id) {
  const sprite = editingEnvironment.sprites.find((item) => item.id === id);
  if (!sprite) return;
  spriteClipboard = snapshotEnvironment({ ...editingEnvironment, sprites: [sprite] }).sprites[0];
  setSpriteMessage(`Copied ${sprite.name}. Paste to add a copy.`);
  refreshEditor();
}

function pasteSprite() {
  if (!spriteClipboard) return;
  const copy = spriteCopy(spriteClipboard);
  closeSpriteMenu();
  selectedSpriteId = copy.id;
  setSpriteMessage("");
  commitEditorMutation({ ...editingEnvironment, sprites: [...(editingEnvironment.sprites || []), copy] });
}

function duplicateSprite(id) {
  const sprite = editingEnvironment.sprites.find((item) => item.id === id);
  if (!sprite) return;
  const copy = spriteCopy(sprite);
  closeSpriteMenu();
  selectedSpriteId = copy.id;
  commitEditorMutation({ ...editingEnvironment, sprites: [...editingEnvironment.sprites, copy] });
}

// Option-drag (Alt-drag) leaves the original where it is and drags a fresh copy away from it.
function duplicateSpriteInPlace(sprite) {
  const copy = spriteCopy(sprite, 0);
  editingEnvironment = { ...editingEnvironment, sprites: [...editingEnvironment.sprites, copy] };
  selectedSpriteId = copy.id;
  refreshEditorCanvas();
  return copy;
}

function moveSpriteToFront(id) {
  selectedSpriteId = id;
  editingEnvironment = {
    ...editingEnvironment,
    sprites: bringSpriteToFront(id),
  };
}

function updateSpritePosition(id, position) {
  editingEnvironment = {
    ...editingEnvironment,
    sprites: editingEnvironment.sprites.map((sprite) => sprite.id === id ? { ...sprite, ...position } : sprite),
  };
}

function showDraggedSprite(element, position) {
  showSelectedSprite(element.dataset.spriteId);
  showSpritePosition(element.dataset.spriteId, position.xPercent, position.yPercent);
}

function dragStart(event, element, sprite, canvas) {
  const bounds = canvas.getBoundingClientRect();
  return {
    element,
    sprite,
    bounds,
    startPointerX: event.clientX,
    startPointerY: event.clientY,
    startCanvasX: bounds.left + (sprite.xPercent / 100) * bounds.width,
    startCanvasY: bounds.top + (sprite.yPercent / 100) * bounds.height,
  };
}

function bindSpriteEvents(element) {
  element.addEventListener("click", (event) => {
    event.stopPropagation();
    selectSprite(element.dataset.spriteId);
  });
  element.addEventListener("pointerdown", (event) => {
    if (event.button === 2) return;
    event.preventDefault();
    event.stopPropagation();
    let sprite = editingEnvironment.sprites.find((item) => item.id === element.dataset.spriteId);
    if (!sprite) return;
    const canvas = document.querySelector(".activity-canvas");
    const beforeGesture = snapshotEnvironment(editingEnvironment);
    closeSpriteMenu();
    if (selectedSpriteId !== sprite.id) {
      cancelSpriteRename();
      stopSpritePreview();
    }
    let dragged = element;
    if (event.altKey) {
      sprite = duplicateSpriteInPlace(sprite);
      dragged = overlayElements(sprite.id).button;
    }
    moveSpriteToFront(sprite.id);
    showSelectedSprite(sprite.id);
    dragged.setPointerCapture(event.pointerId);
    const drag = dragStart(event, dragged, sprite, canvas);
    const move = (moveEvent) => {
      const position = draggedSpritePosition(moveEvent, drag);
      updateSpritePosition(sprite.id, position);
      showDraggedSprite(dragged, position);
    };
    const finish = () => {
      dragged.removeEventListener("pointermove", move);
      dragged.removeEventListener("pointerup", finish);
      dragged.removeEventListener("pointercancel", finish);
      if (dragged.hasPointerCapture(event.pointerId)) dragged.releasePointerCapture(event.pointerId);
      commitEditorGesture(beforeGesture);
    };
    dragged.addEventListener("pointermove", move);
    dragged.addEventListener("pointerup", finish, { once: true });
    dragged.addEventListener("pointercancel", finish, { once: true });
  });
}

function clampPercent(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function spriteCenterPx(sprite, bounds) {
  return {
    x: bounds.left + (sprite.xPercent / 100) * bounds.width,
    y: bounds.top + (sprite.yPercent / 100) * bounds.height,
  };
}

function updateSpriteGeometry(id, changes) {
  editingEnvironment = {
    ...editingEnvironment,
    sprites: editingEnvironment.sprites.map((sprite) => sprite.id === id ? { ...sprite, ...changes } : sprite),
  };
}

// The card anchor follows the sprite's upright footprint, so any change to size, rotation, or
// position re-derives it from the sprite record rather than copying one style across.
function showSpriteCardAnchor(id) {
  const layer = editingEnvironment.sprites.findIndex((item) => item.id === id);
  const sprite = editingEnvironment.sprites[layer];
  const { cardAnchor } = overlayElements(id);
  if (sprite && cardAnchor) placeSpriteCardAnchor(cardAnchor, sprite, layer);
}

// The card flips above a sprite that sits near the bottom edge, and slides sideways just enough
// to stay inside the activity area when the sprite is near either side.
function placeSpriteCardAnchor(cardAnchor, sprite, layer) {
  cardAnchor.style.cssText = spriteFootprintStyle(sprite, layer);
  const footprint = spriteFootprint(sprite);
  cardAnchor.classList.toggle("card-above", sprite.yPercent + footprint.heightPercent / 2 > 82);
  const canvas = cardAnchor.parentElement;
  const card = cardAnchor.querySelector(".sprite-card");
  if (!canvas || !card) return;
  const canvasWidth = canvas.clientWidth;
  const cardWidth = card.offsetWidth;
  const centerPx = (sprite.xPercent / 100) * canvasWidth;
  const margin = 8;
  const shift = Math.min(0, canvasWidth - margin - (centerPx + cardWidth / 2)) + Math.max(0, margin - (centerPx - cardWidth / 2));
  card.style.setProperty("--card-shift", `${Math.round(shift)}px`);
}

function showSpriteSize(id, sizePercent) {
  const { button, transformHandles } = overlayElements(id);
  [button, transformHandles].forEach((element) => { if (element) element.style.width = `${sizePercent}%`; });
  showSpriteCardAnchor(id);
}

function showSpriteRotation(id, rotationDegrees) {
  const transform = spriteRotationTransform({ rotationDegrees });
  const { button, transformHandles } = overlayElements(id);
  if (button) button.style.transform = transform;
  if (transformHandles) transformHandles.style.transform = transform;
  showSpriteCardAnchor(id);
}

function showSpritePosition(id, xPercent, yPercent) {
  const { button, transformHandles } = overlayElements(id);
  [button, transformHandles].forEach((element) => {
    if (!element) return;
    element.style.left = `${xPercent}%`;
    element.style.top = `${yPercent}%`;
  });
  showSpriteCardAnchor(id);
}

// A rotated sprite's on-screen (axis-aligned) footprint is wider than its own sides — use that
// footprint when keeping a resized or rotated sprite's center far enough from the edge to stay
// recoverable.
function keepSpriteRecoverable(id) {
  const sprite = editingEnvironment.sprites.find((item) => item.id === id);
  if (!sprite) return;
  const half = spriteHalfExtents(sprite);
  const xPercent = clampPercent(sprite.xPercent, half.xPercent, 100 - half.xPercent);
  const yPercent = clampPercent(sprite.yPercent, half.yPercent, 100 - half.yPercent);
  if (xPercent === sprite.xPercent && yPercent === sprite.yPercent) return;
  updateSpriteGeometry(id, { xPercent, yPercent });
  showSpritePosition(id, xPercent, yPercent);
}

function bindPointerDrag(handle, event, onMove, onFinish) {
  event.preventDefault();
  event.stopPropagation();
  handle.setPointerCapture(event.pointerId);
  const move = (moveEvent) => onMove(moveEvent);
  const finish = () => {
    handle.removeEventListener("pointermove", move);
    handle.removeEventListener("pointerup", finish);
    handle.removeEventListener("pointercancel", finish);
    if (handle.hasPointerCapture(event.pointerId)) handle.releasePointerCapture(event.pointerId);
    onFinish();
  };
  handle.addEventListener("pointermove", move);
  handle.addEventListener("pointerup", finish, { once: true });
  handle.addEventListener("pointercancel", finish, { once: true });
}

function spriteDragContext(id) {
  const sprite = editingEnvironment.sprites.find((item) => item.id === id);
  if (!sprite) return null;
  const bounds = document.querySelector(".activity-canvas").getBoundingClientRect();
  return { sprite, bounds, center: spriteCenterPx(sprite, bounds) };
}

function startResizeSprite(event, id, handle) {
  const context = spriteDragContext(id);
  if (!context) return;
  const { sprite, bounds, center } = context;
  const beforeGesture = snapshotEnvironment(editingEnvironment);
  // Un-rotate the pointer offset into the sprite's own (unrotated) frame so a corner handle
  // tracks the pointer correctly even when the sprite is currently rotated.
  const angleRad = ((sprite.rotationDegrees || 0) * Math.PI) / 180;
  bindPointerDrag(handle, event, (moveEvent) => {
    const dx = moveEvent.clientX - center.x;
    const dy = moveEvent.clientY - center.y;
    const localX = dx * Math.cos(-angleRad) - dy * Math.sin(-angleRad);
    const localY = dx * Math.sin(-angleRad) + dy * Math.cos(-angleRad);
    const halfSizeFloorPx = 6; // keeps the box from collapsing to zero directly under the pointer
    // The box keeps the image's shape, so whichever axis the pointer has pulled furthest sets
    // the new width and the height follows.
    const halfWidthPx = Math.max(halfSizeFloorPx, Math.abs(localX), Math.abs(localY) * spriteAspectRatio(sprite));
    const sizePercent = clampPercent(((halfWidthPx * 2) / bounds.width) * 100, minSpriteSizePercent, maxSpriteSizePercent);
    updateSpriteGeometry(id, { sizePercent });
    showSpriteSize(id, sizePercent);
    keepSpriteRecoverable(id);
  }, () => commitEditorGesture(beforeGesture));
}

// Rotation lands on 45-degree steps (0/45/90/…) by default so sprites line up without fiddling;
// holding Shift while dragging opts out and gives the raw pointer angle.
function snappedRotation(degrees, freeRotation) {
  const normalized = ((degrees % 360) + 360) % 360;
  if (freeRotation) return normalized;
  return (Math.round(normalized / rotationSnapDegrees) * rotationSnapDegrees) % 360;
}

function startRotateSprite(event, id, handle) {
  const context = spriteDragContext(id);
  if (!context) return;
  const { center } = context;
  const beforeGesture = snapshotEnvironment(editingEnvironment);
  bindPointerDrag(handle, event, (moveEvent) => {
    const dx = moveEvent.clientX - center.x;
    const dy = moveEvent.clientY - center.y;
    // atan2 measures from the positive x-axis (pointing right); the rotation stem points up
    // (the sprite's unrotated 0deg), which is 90deg further around, hence the offset.
    const rotationDegrees = snappedRotation((Math.atan2(dy, dx) * 180) / Math.PI + 90, moveEvent.shiftKey);
    updateSpriteGeometry(id, { rotationDegrees });
    showSpriteRotation(id, rotationDegrees);
    keepSpriteRecoverable(id);
  }, () => commitEditorGesture(beforeGesture));
}

function bindSpriteTransformHandles(container) {
  const id = container.dataset.spriteId;
  container.querySelectorAll(".resize-handle").forEach((handle) => {
    handle.addEventListener("pointerdown", (event) => startResizeSprite(event, id, handle));
  });
  const rotateHandle = container.querySelector(".rotate-handle");
  rotateHandle?.addEventListener("pointerdown", (event) => startRotateSprite(event, id, rotateHandle));
}

function bindSpriteCard(anchor) {
  const id = anchor.dataset.spriteId;
  const card = anchor.querySelector(".sprite-card");
  // Pointer events inside the card must not start a drag or count as a click on the canvas.
  card.addEventListener("pointerdown", (event) => event.stopPropagation());
  card.addEventListener("click", (event) => event.stopPropagation());
  bindSpriteActions(card, id);
  card.querySelector(".preview-sprite-sound")?.addEventListener("click", () => toggleSpritePreview(id));
  card.querySelector(".cancel-sprite-rename")?.addEventListener("click", cancelSpriteRename);
  const renameInput = card.querySelector(".sprite-rename-form input");
  renameInput?.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      event.stopPropagation();
      cancelSpriteRename();
    }
  });
}

// The card and the context menu share one set of actions, so both bind the same way.
function bindSpriteActions(container, id) {
  container.querySelector(".rename-sprite")?.addEventListener("click", (event) => {
    event.stopPropagation();
    openSpriteRename(id);
  });
  container.querySelector(".delete-sprite")?.addEventListener("click", (event) => {
    event.stopPropagation();
    deleteSprite(id);
  });
  container.querySelector(".duplicate-sprite")?.addEventListener("click", (event) => {
    event.stopPropagation();
    duplicateSprite(id);
  });
  container.querySelector(".open-sprite-sound")?.addEventListener("click", (event) => {
    event.stopPropagation();
    openSpriteSound(id);
  });
  const imageInput = container.querySelector(".replace-sprite-image-file");
  imageInput?.addEventListener("click", (event) => event.stopPropagation());
  imageInput?.addEventListener("change", () => replaceSpriteImage(id, takeChosenFile(imageInput)));
  container.querySelector(".sprite-rename-form")?.addEventListener("submit", (event) => {
    event.preventDefault();
    event.stopPropagation();
    submitSpriteRename(id, new FormData(event.currentTarget).get("name"));
  });
}

function openSpriteContextMenu(id, event, canvas) {
  const bounds = canvas.getBoundingClientRect();
  selectSprite(id);
  spriteMenu = {
    spriteId: id,
    xPercent: ((event.clientX - bounds.left) / bounds.width) * 100,
    yPercent: ((event.clientY - bounds.top) / bounds.height) * 100,
  };
  refreshSpriteContextMenu(canvas);
}

function closeSpriteMenu() {
  if (!spriteMenu) return;
  spriteMenu = undefined;
  const canvas = document.querySelector(".activity-canvas");
  if (canvas) refreshSpriteContextMenu(canvas);
}

function openSpriteRename(id) {
  closeSpriteMenu();
  renameSpriteId = id;
  refreshEditorCanvas();
}

function cancelSpriteRename() {
  if (!renameSpriteId) return;
  renameSpriteId = undefined;
  refreshEditorCanvas();
}

function submitSpriteRename(id, rawName) {
  const name = (rawName || "").trim();
  if (!name) {
    setSpriteMessage("Sprite name can't be empty.");
    refreshEditor();
    return;
  }
  setSpriteMessage("");
  renameSpriteId = undefined;
  const environment = {
    ...editingEnvironment,
    sprites: editingEnvironment.sprites.map((sprite) => sprite.id === id ? { ...sprite, name } : sprite),
  };
  commitEditorMutation(environment);
  refreshEditorCanvas();
}

// Hearing a sprite's sound from its card uses a separate player from the learner activity, so
// stopping a preview never touches a game in progress elsewhere.
function toggleSpritePreview(id) {
  if (spritePreviewId === id) {
    stopSpritePreview();
    return;
  }
  const sprite = editingEnvironment.sprites.find((item) => item.id === id);
  if (!spriteHasSound(sprite)) return;
  stopSpritePreview();
  const url = URL.createObjectURL(sprite.sound.blob);
  spritePreviewAudio = new Audio(url);
  spritePreviewId = id;
  const finish = () => {
    if (spritePreviewId === id) stopSpritePreview();
  };
  spritePreviewAudio.addEventListener("ended", finish, { once: true });
  spritePreviewAudio.addEventListener("error", () => {
    finish();
    setSpriteMessage("This sound could not be played. Open it and replace the audio file.");
    refreshEditor();
  }, { once: true });
  spritePreviewAudio.play().catch(() => {});
  refreshEditorCanvas();
}

function stopSpritePreview() {
  if (!spritePreviewAudio) return;
  spritePreviewAudio.pause();
  URL.revokeObjectURL(spritePreviewAudio.src);
  spritePreviewAudio = undefined;
  spritePreviewId = undefined;
  if (view === "editor" && document.querySelector(".activity-canvas")) refreshEditorCanvas();
}

async function replaceSpriteImage(id, file) {
  closeSpriteMenu();
  const error = await imageValidationError(file, validateImage);
  if (error) {
    setSpriteMessage(error);
    refreshEditor();
    return;
  }
  setSpriteMessage("");
  const measured = await measureSpriteImage(file);
  const sprites = editingEnvironment.sprites.map((sprite) => sprite.id === id ? { ...sprite, image: { blob: measured.blob }, aspectRatio: measured.aspectRatio } : sprite);
  await commitEditorMutation({ ...editingEnvironment, sprites });
}

function deleteSprite(id) {
  if (!editingEnvironment.sprites.some((sprite) => sprite.id === id)) return;
  const sprites = editingEnvironment.sprites.filter((item) => item.id !== id);
  spriteMenu = undefined;
  renameSpriteId = undefined;
  if (spritePreviewId === id) stopSpritePreview();
  selectedSpriteId = undefined;
  commitEditorMutation({ ...editingEnvironment, sprites });
}

function validateImage(file) {
  if (!file) return "Choose an image to continue.";
  if (!["image/png", "image/jpeg", "image/webp"].includes(file.type)) {
    return "Choose a PNG, JPEG, or WebP image.";
  }
  if (file.size > 10 * 1024 * 1024) return "Choose an image smaller than 10 MB.";
  return "";
}

function validateBackground(file) {
  return validateImage(file);
}

function mediaCanDecode(element, successEvent, file) {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const finish = (canDecode) => {
      URL.revokeObjectURL(url);
      resolve(canDecode);
    };
    element.addEventListener(successEvent, () => finish(true), { once: true });
    element.addEventListener("error", () => finish(false), { once: true });
    element.src = url;
  });
}

function imageCanDecode(file) {
  return mediaCanDecode(new Image(), "load", file);
}

function validateAudio(file) {
  if (!file) return "Choose an audio file to continue.";
  if (!acceptedAudioTypes.includes(file.type)) return "Choose an MP3, WAV, or M4A audio file.";
  if (file.size > 20 * 1024 * 1024) return "Choose an audio file smaller than 20 MB.";
  return "";
}

function audioCanDecode(file) {
  return mediaCanDecode(new Audio(), "loadedmetadata", file);
}

async function audioValidationError(file) {
  const error = validateAudio(file);
  if (error) return error;
  if (!await audioCanDecode(file)) return "This audio could not be opened. Choose an MP3, WAV, or M4A file that is not damaged.";
  return "";
}

// Opening a sprite's sound shows what it has; a sprite without one goes straight to choosing.
function openSpriteSound(spriteId) {
  closeSpriteMenu();
  stopSpritePreview();
  const sprite = editingEnvironment.sprites.find((item) => item.id === spriteId);
  if (!sprite) return;
  soundFlow = { spriteId, stage: spriteHasSound(sprite) ? "view" : "choose" };
  refreshEditor();
}

async function beginAttachSound(spriteId, file) {
  const error = await audioValidationError(file);
  if (error) {
    if (soundFlow?.spriteId === spriteId) soundFlow = { ...soundFlow, error };
    else setSpriteMessage(error);
    refreshEditor();
    return;
  }
  setSpriteMessage("");
  stopSpritePreview();
  const sprite = editingEnvironment.sprites.find((item) => item.id === spriteId);
  const replacing = spriteHasSound(sprite);
  soundFlow = {
    spriteId,
    file,
    label: spriteNameFromFilename(file.name),
    replacing,
    stage: "label",
  };
  refreshEditor();
}

function cancelSoundFlow() {
  soundFlow = undefined;
  refreshEditor();
}

async function submitSoundLabel(rawLabel) {
  const label = (rawLabel || "").trim();
  if (!label) {
    soundFlow = { ...soundFlow, error: "Sound label can't be empty." };
    refreshEditor();
    return;
  }
  const { spriteId, file, stage } = soundFlow;
  const sprites = editingEnvironment.sprites.map((sprite) => {
    if (sprite.id !== spriteId) return sprite;
    if (stage === "view") return { ...sprite, sound: { ...sprite.sound, label } };
    return { ...sprite, sound: { blob: file.slice(0, file.size, file.type), label } };
  });
  soundFlow = undefined;
  await commitEditorMutation({ ...editingEnvironment, sprites });
}

async function removeSpriteSound() {
  const { spriteId } = soundFlow;
  const sprites = editingEnvironment.sprites.map((sprite) => {
    if (sprite.id !== spriteId) return sprite;
    const { sound: _removed, ...rest } = sprite;
    return rest;
  });
  soundFlow = undefined;
  await commitEditorMutation({ ...editingEnvironment, sprites });
}

// Every new backdrop passes through the cropper, where the educator zooms and positions the
// image inside the 16:9 frame. Confirming there is the deliberate step that replaces a backdrop.
async function selectBackground(file) {
  const error = await imageValidationError(file, validateBackground);
  if (error) {
    setBackgroundMessage(error);
    refreshEditor();
    return;
  }
  backgroundModalOpen = false;
  backgroundConfirmation = { action: "none" };
  refreshEditor();
  openBackdropCropper({
    file,
    aspectRatio: canvasAspectRatio,
    onConfirm: (blob) => saveBackground(blob),
    onCancel: () => {},
  });
}

async function saveBackground(file) {
  const replacing = hasBackdrop(editingEnvironment);
  backgroundConfirmation = { action: "none" };
  setBackgroundMessage(replacing ? "Backdrop replaced." : "Backdrop added.");
  await commitEditorMutation({ ...editingEnvironment, background: { blob: file.slice(0, file.size, file.type) } });
}

async function startWithBlankBackdrop() {
  if (hasBackdrop(editingEnvironment)) return;
  setBackgroundMessage("Blank backdrop added.");
  await commitEditorMutation({ ...editingEnvironment, background: { kind: "blank" } });
}

async function removeBackdrop() {
  backgroundModalOpen = false;
  backgroundConfirmation = { action: "none" };
  setBackgroundMessage("Backdrop removed. Choose a new backdrop before adding more sprites.");
  await commitEditorMutation({ ...editingEnvironment, background: undefined });
}

function closeBackgroundModal() {
  backgroundModalOpen = false;
  backgroundConfirmation = { action: "none" };
  refreshEditor();
}

function bindBackgroundModal() {
  const modal = document.querySelector(".background-modal");
  if (!modal) return;
  document.querySelector(".close-background-modal").addEventListener("click", closeBackgroundModal);
  bindModalBackdropClose(".background-modal", closeBackgroundModal);
  const input = document.querySelector(".background-file");
  input.addEventListener("change", () => selectBackground(takeChosenFile(input)));
  const dropZone = document.querySelector(".background-drop-zone");
  dropZone.addEventListener("dragover", (event) => event.preventDefault());
  dropZone.addEventListener("drop", async (event) => {
    event.preventDefault();
    const files = event.dataTransfer.files;
    if (files.length > 1) {
      setBackgroundMessage("Drop one backdrop image at a time.");
      refreshEditor();
      return;
    }
    const file = files[0] || await fileFromDraggedWebImage(event.dataTransfer);
    if (!file) {
      setBackgroundMessage("That image could not be brought across from the other page. Right-click it, choose Copy image, and paste it here instead.");
      refreshEditor();
      return;
    }
    selectBackground(file);
  });
  document.querySelector(".remove-background")?.addEventListener("click", () => {
    if (editingEnvironment.background?.blob) {
      backgroundConfirmation = { action: "remove" };
      refreshEditor();
      return;
    }
    removeBackdrop();
  });
  document.querySelector(".cancel-background-confirmation")?.addEventListener("click", () => {
    backgroundConfirmation = { action: "none" };
    refreshEditor();
  });
  document.querySelector(".confirm-remove-background")?.addEventListener("click", removeBackdrop);
}

async function createEnvironment() {
  const environment = { id: crypto.randomUUID(), name: "Untitled environment" };
  clearEditorSession();
  selectedSpriteId = undefined;
  focusEnvironmentName = true;
  resetEditorHistory();
  await saveEnvironment(environment, true);
}

function openEditor(id) {
  focusEnvironmentName = false;
  navigate({ name: "editor", id });
}

// A duplicate has to be able to outlive its original, so every Blob is copied rather than
// shared: the backdrop image (a blank backdrop has none), each sprite image, and each sound.
function copiedMedia(media) {
  if (!media) return undefined;
  if (!media.blob) return { ...media };
  return { ...media, blob: media.blob.slice(0, media.blob.size, media.blob.type) };
}

// Sprite order (and so layering), names, positions, sizes, rotations, and sound labels all carry
// over; only the identities change, so the copy is separate from the moment it exists.
function environmentCopy(environment) {
  const record = environmentWithoutSessionState(environment);
  return {
    ...record,
    id: crypto.randomUUID(),
    name: `Copy of ${record.name || "Untitled environment"}`,
    background: copiedMedia(record.background),
    sprites: (record.sprites || []).map((sprite) => ({
      ...sprite,
      id: crypto.randomUUID(),
      image: copiedMedia(sprite.image),
      sound: copiedMedia(sprite.sound),
    })),
  };
}

// Library writes persist first and change the library only afterwards — the opposite of the
// optimistic editor save — so a storage failure leaves the library exactly as it was and says so.
// Both queue behind the same chain as every other write, so writes never overlap.
async function runLibraryWrite(write, failureMessage) {
  saveMessage = "";
  beginSaveIndicator();
  render();
  try {
    const pending = pendingEnvironmentSave.then(write);
    pendingEnvironmentSave = pending.catch(() => {});
    await pending;
    endSaveIndicator("saved");
    return true;
  } catch (error) {
    saveMessage = failureMessage;
    endSaveIndicator("failed");
    render();
    return false;
  }
}

async function duplicateEnvironment(id) {
  const source = environments.find((item) => item.id === id);
  if (!source) return;
  environmentMenuOpenId = undefined;
  const copy = environmentCopy(source);
  const stored = await runLibraryWrite(
    () => environmentStorage.save(copy),
    "This copy could not be saved on this device. The original environment is unchanged. Check browser storage and try again.",
  );
  if (!stored) return;
  environments = [...environments, copy];
  openEditor(copy.id);
}

// Exporting bundles the environment and all of its media into one .zip file the browser
// downloads, so it can be sent to someone else and imported on their device.
async function exportEnvironment(id) {
  const environment = environments.find((item) => item.id === id);
  if (!environment) return;
  environmentMenuOpenId = undefined;
  showEnvironmentMenu();
  saveMessage = "";
  let archive;
  try {
    archive = await packEnvironment(environment);
  } catch (error) {
    saveMessage = "This environment could not be exported. Try again in a moment.";
    render();
    return;
  }
  const url = URL.createObjectURL(archive);
  const link = document.createElement("a");
  link.href = url;
  link.download = archiveFileName(environment);
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 60000);
}

// An imported environment is saved as a new environment on this device, exactly like a copy.
async function importEnvironmentFile(file) {
  saveMessage = "";
  let environment;
  try {
    environment = await unpackEnvironment(file);
  } catch (error) {
    saveMessage = error.message || "This file is not an Everyday Sound Lab environment.";
    render();
    return;
  }
  const stored = await runLibraryWrite(
    () => environmentStorage.save(environment),
    "The imported environment could not be saved on this device. Check browser storage and try again.",
  );
  if (!stored) return;
  environments = [...environments, environment];
  render();
}

async function deleteEnvironment(id) {
  if (!environments.some((item) => item.id === id)) return;
  pendingDeleteId = undefined;
  environmentMenuOpenId = undefined;
  const removed = await runLibraryWrite(
    () => environmentStorage.delete(id),
    "This environment could not be deleted on this device. It is still saved here. Check browser storage and try again.",
  );
  if (!removed) return;
  environments = environments.filter((item) => item.id !== id);
  // Any session still pointed at the deleted environment is dropped; its address now names
  // nothing, so arriving there (browser Back, a bookmark) falls back to the library.
  if (editingEnvironment?.id === id) {
    editingEnvironment = undefined;
    selectedSpriteId = undefined;
    resetEditorHistory();
  }
  if (activeEnvironment?.id === id) activeEnvironment = undefined;
  render();
}

function updateSaveStatus() {
  const status = document.querySelector(".storage-status");
  if (!status) return;
  status.className = `storage-status ${saveState}`;
  status.title = saveStatusText();
  status.innerHTML = saveStatusBody();
}

function applySaveState(state) {
  if (saveState === state) return;
  saveState = state;
  updateSaveStatus();
}

function beginSaveIndicator() {
  pendingSaveCount += 1;
  clearTimeout(saveSettleTimeoutId);
  saveSettleTimeoutId = undefined;
  applySaveState("saving");
}

// Settling keeps "Saving on this device…" on screen for a beat after the last write finishes, so
// a run of quick edits shows one calm Saving → Saved cycle instead of flickering between the two.
function endSaveIndicator(outcome) {
  lastSaveOutcome = outcome;
  pendingSaveCount = Math.max(0, pendingSaveCount - 1);
  if (pendingSaveCount > 0) return;
  clearTimeout(saveSettleTimeoutId);
  saveSettleTimeoutId = undefined;
  if (outcome === "failed") {
    applySaveState("failed");
    return;
  }
  saveSettleTimeoutId = window.setTimeout(() => {
    saveSettleTimeoutId = undefined;
    if (pendingSaveCount === 0) applySaveState(lastSaveOutcome);
  }, saveSettleMs);
}

// Saving never re-renders the editor: it updates the record, refreshes the editor's regions in
// place, and reports progress through the status indicator alone. Only opening the editor from
// the library (openAfterSave) is a real view change and therefore a full render.
async function saveEnvironment(environment, openAfterSave = false) {
  const record = environmentWithoutSessionState(environment);
  editingEnvironment = record;
  const existingIndex = environments.findIndex((item) => item.id === record.id);
  if (existingIndex === -1) environments = [...environments, record];
  else environments[existingIndex] = record;
  saveMessage = "";
  beginSaveIndicator();
  if (view === "editor") refreshEditor();
  else render();
  try {
    const save = pendingEnvironmentSave.then(() => environmentStorage.save(record));
    pendingEnvironmentSave = save.catch(() => {});
    await save;
    endSaveIndicator("saved");
    if (openAfterSave) {
      navigate({ name: "editor", id: record.id });
      return;
    }
  } catch (error) {
    saveMessage = "This environment could not be saved on this device. Check browser storage and try again.";
    endSaveIndicator("failed");
  }
  if (view === "editor") updateEditorRegion(".editor-feedback", editorFeedbackMarkup());
  else render();
}

// Bound once at module scope (unlike the render-scoped listeners above): `document` itself is
// never replaced by a render, so a listener bound inside renderEditor() would duplicate on
// every render instead of being cleaned up with the rest of the editor markup.
document.addEventListener("click", (event) => {
  if (view === "editor" && spriteMenu && !event.target.closest(".sprite-context-menu")) closeSpriteMenu();
  if (view === "library" && environmentMenuOpenId && !event.target.closest(".environment-menu-anchor")) closeEnvironmentMenu();
});
document.addEventListener("focusin", (event) => {
  if (view === "editor" && spriteMenu && !event.target.closest(".sprite-context-menu")) closeSpriteMenu();
});
document.addEventListener("keydown", (event) => {
  if (view === "editor" && event.key !== "Escape") return editorKeyboardShortcut(event);
  if (event.key !== "Escape") return;
  if (helpOpen) return closeHelp();
  if (view === "editor") {
    if (spriteMenu) closeSpriteMenu();
    else if (renameSpriteId) cancelSpriteRename();
    else if (soundFlow) cancelSoundFlow();
    else if (backgroundModalOpen) closeBackgroundModal();
    else if (selectedSpriteId) deselectSprite();
  }
  if (view !== "library") return;
  if (pendingDeleteId) cancelDeleteEnvironment();
  else if (environmentMenuOpenId) closeEnvironmentMenu(true);
});
document.addEventListener("paste", (event) => {
  if (view === "editor" && editingEnvironment) pasteIntoEditor(event);
});

window.addEventListener("popstate", applyRoute);

// The Park example ships with Everyday Sound Lab: it is drawn and saved the first time this device
// opens the app, and only then, so an educator who deletes it later has chosen to. If the first
// attempt fails (for example, the sound files could not be fetched) it is tried again next visit.
const parkAddedKey = "sound-explorer.park-added";
const welcomedKey = "sound-explorer.welcomed";

function hasBeenWelcomed() {
  try {
    return localStorage.getItem(welcomedKey) === "true";
  } catch (error) {
    return false;
  }
}

function markWelcomed() {
  try {
    localStorage.setItem(welcomedKey, "true");
  } catch (error) {
    // If storage is unavailable, showing the welcome page again is safer than hiding it forever.
  }
}

function hasUsedAppBefore() {
  try {
    return localStorage.getItem(parkAddedKey) === "true" || environments.length > 0;
  } catch (error) {
    return environments.length > 0;
  }
}

async function addParkOnFirstRun() {
  let alreadyAdded = false;
  try {
    alreadyAdded = localStorage.getItem(parkAddedKey) === "true";
  } catch (error) {
    alreadyAdded = false;
  }
  if (alreadyAdded || saveState === "failed" || hasParkExample()) return;
  try {
    const park = await buildParkEnvironment();
    await environmentStorage.save(park);
    environments = [park, ...environments];
    localStorage.setItem(parkAddedKey, "true");
  } catch (error) {
    // The library simply starts empty this time, and the Park example is tried again next visit.
  }
}

async function start() {
  mountHelpButton();
  await loadEnvironments();
  firstVisit = !hasBeenWelcomed() && !hasUsedAppBefore();
  if (!firstVisit) markWelcomed();
  await addParkOnFirstRun();
  applyRoute();
}

start();
