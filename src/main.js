import "./style.css";
import { environmentStorage } from "./environment-storage.js";

const scenes = {
  park: {
    title: "A day at the park",
    description: "Listen to the sound, then click the matching thing in the park.",
    objects: ["bird", "slide", "swing", "leaves"],
    sounds: {
      bird: { file: "/sounds/loswin23-bird-chirping-499424.mp3", label: "bird" },
      slide: { file: "/sounds/floraphonic-cute-character-wee-3-188163.mp3", label: "slide" },
      leaves: { file: "/sounds/leaves_rustling.mp3", label: "rustling leaves" },
      swing: { file: "/sounds/swing-squeak.mp3", label: "swing squeaking" },
    },
    sprites: [],
  },
  kitchen: {
    title: "Sounds in the kitchen",
    description: "Listen to the sound, then click the matching thing in the kitchen.",
    objects: ["sink", "dishwasher", "microwave"],
    sounds: {},
    sprites: [],
  },
};

const app = document.querySelector("#app");
let activeScene = "park";
let activeEnvironment;
let activityOrigin;
let activitySounds = {};
let nextSoundTimeoutId;
let currentSound;
let audio;
let modalOpen = false;
let spriteModalOpen = false;
let roundCount = 3;
let completedRounds = 0;
let activityFinished = false;
let maxPlaybackSeconds = 5;
let view = "library";
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
let spriteMenuOpenId;
let spriteMenuMode = "actions";
let soundFlow;
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
const sharedActivityDescription = "Listen to the sound, then click the matching thing.";
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
const renderedSpriteMenus = new WeakMap();
const spriteImageBlobs = new WeakMap();
let renderedBackdrop = { kind: "pending", blob: undefined };
const rotationSnapDegrees = 45;
const projectName = "Sound Explorer";
const starterSceneIds = ["park", "kitchen"];

// A tiny inline icon set: no dependency, no icon font, no network request. Every icon is
// decorative, so the control around it always carries the accessible name and the tooltip.
const iconShapes = {
  // The Home control wears the app's own favicon artwork, so the mark in the browser tab and the
  // mark in the toolbar are the same thing.
  home: `<rect width="32" height="32" rx="7" fill="#25424a"/><path fill="#fff8e5" d="M5 13h5l6-5a1 1 0 0 1 1.6.8v14.4A1 1 0 0 1 16 24l-6-5H5a1 1 0 0 1-1-1v-4a1 1 0 0 1 1-1Z"/><path fill="none" stroke="#ef8d67" stroke-linecap="round" stroke-width="2.5" d="M21 12.2a5.2 5.2 0 0 1 0 7.6M24.5 8.5a10.2 10.2 0 0 1 0 15"/>`,
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
  trash: `<path d="M4.6 7h14.8"/><path d="M9.6 7V5a.9.9 0 0 1 .9-.9h3a.9.9 0 0 1 .9.9v2"/><path d="m6.6 7 .9 11.4A1.7 1.7 0 0 0 9.2 20h5.6a1.7 1.7 0 0 0 1.7-1.6L17.4 7"/><path d="M10.4 10.6v5.8M13.6 10.6v5.8"/>`,
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
  return { name: "library" };
}

function routePath(route) {
  if (route.name === "editor") return `/environments/${encodeURIComponent(route.id)}`;
  if (route.name === "play") return `/play/${encodeURIComponent(route.id)}`;
  return "/";
}

function navigate(route, { replace = false, origin } = {}) {
  const state = { route: route.name, id: route.id, origin };
  history[replace ? "replaceState" : "pushState"](state, "", routePath(route));
  applyRoute();
}

function target(object, label, classes) {
  return `<button class="sound-target ${classes}" data-object="${object}" aria-label="Choose the ${label}"><span class="ring"></span><span class="target-label">${label}</span></button>`;
}

function customSprites() {
  return scenes[activeScene].sprites.map((sprite) => `<button class="custom-sprite sound-target" data-object="${sprite.id}" data-sprite-id="${sprite.id}" style="left:${sprite.x}%;top:${sprite.y}%;width:${sprite.size}px;height:${sprite.size}px" aria-label="Choose ${sprite.label}"><img src="${sprite.image}" alt=""><span class="ring"></span><span class="target-label">${sprite.label}</span></button>`).join("");
}

function parkScene() {
  return `<section class="scene park-scene" aria-label="An illustrated park with sounds to match"><div class="cloud cloud-one"></div><div class="cloud cloud-two"></div><div class="sun"></div><div class="hill hill-back"></div><div class="hill hill-front"></div><div class="path"></div><div class="tree tree-left"><div class="trunk"></div><div class="canopy canopy-one"></div><div class="canopy canopy-two"></div></div><div class="tree tree-right"><div class="trunk"></div><div class="canopy canopy-one"></div><div class="canopy canopy-two"></div><div class="canopy canopy-three"></div></div><div class="flowers flowers-left"><i></i><i></i><i></i></div><div class="flowers flowers-right"><i></i><i></i><i></i></div>${target("leaves", "Leaves", "leaves-target").replace('<span class="ring"></span>', '<span class="ring"></span><span class="leaf leaf-a">◆</span><span class="leaf leaf-b">◆</span><span class="leaf leaf-c">◆</span>')}<div class="bird"><span class="bird-body"></span><span class="bird-wing"></span><span class="bird-eye"></span><span class="bird-beak"></span><span class="bird-leg leg-left"></span><span class="bird-leg leg-right"></span></div>${target("bird", "Bird", "bird-target")}<div class="slide"><div class="slide-platform"></div><div class="slide-ladder"><i></i><i></i><i></i></div><div class="slide-chute"></div></div>${target("slide", "Slide", "slide-target")}<div class="swings"><div class="swing-top"></div><div class="swing-leg leg-one"></div><div class="swing-leg leg-two"></div><div class="rope rope-one"></div><div class="rope rope-two"></div><div class="seat"></div></div>${target("swing", "Swing", "swing-target")}${customSprites()}</section>`;
}

function kitchenScene() {
  return `<section class="scene kitchen-scene" aria-label="An illustrated kitchen with sounds to match"><div class="kitchen-wall"><div class="tile-row"></div><div class="window"><div class="window-sky"></div><div class="window-hill"></div><i></i><b></b></div><div class="shelf"><span class="jar jar-one"></span><span class="jar jar-two"></span><span class="plant"></span></div></div><div class="counter"><div class="counter-top"></div><div class="counter-base"></div></div><div class="sink"><div class="faucet"></div><div class="basin"><span></span></div></div>${target("sink", "Sink", "sink-target")}<div class="dishwasher"><div class="dishwasher-panel"><i></i><i></i><i></i></div><div class="dishwasher-handle"></div></div>${target("dishwasher", "Dishwasher", "dishwasher-target")}<div class="microwave"><div class="microwave-window"><i></i><i></i><i></i></div><div class="microwave-controls"><i></i><i></i><i></i></div></div>${target("microwave", "Microwave", "microwave-target")}<div class="kitchen-floor"></div>${customSprites()}</section>`;
}

function managementModal() {
  if (!modalOpen) return "";
  const scene = scenes[activeScene];
  const assignments = Object.entries(scene.sounds).map(([object, sound]) => `<li><span><b>${sound.label}</b><small>${sound.file.startsWith("blob:") ? "New uploaded audio" : sound.file.split("/").pop()}</small></span><button class="remove-sound" data-object="${object}" aria-label="Remove ${sound.label}">Remove</button></li>`).join("") || "<li class=\"empty-list\">No sounds have been added yet.</li>";
  const choices = [
    ...scene.objects.map((object) => ({ id: object, label: object[0].toUpperCase() + object.slice(1) })),
    ...scene.sprites.map((sprite) => ({ id: sprite.id, label: sprite.label })),
  ].map((object) => `<option value="${object.id}">${object.label}</option>`).join("");
  return `<div class="modal-backdrop"><section class="sound-modal" role="dialog" aria-modal="true" aria-labelledby="sound-manager-title"><button class="close-modal" aria-label="Close">×</button><p class="eyebrow">TEACHER TOOLS</p><h2 id="sound-manager-title">Manage ${activeScene} sounds</h2><p class="modal-copy">Attach a sound to an item, replace a sound already there, or remove one.</p><label class="playback-length">Maximum playback length <output>${maxPlaybackSeconds === 0 ? "Full clip" : `${maxPlaybackSeconds} seconds`}</output><input class="length-slider" type="range" min="0" max="20" value="${maxPlaybackSeconds}"><small>Set to 0 to play the full audio clip.</small></label><form class="sound-form"><label>Sound name<input name="label" required placeholder="For example, running water"></label><label>Connect it to<select name="object">${choices}</select></label><label class="file-picker">Choose audio file<input name="audio" type="file" accept="audio/*" required><span>Choose an audio file</span></label><button class="save-sound" type="submit">Add or replace sound</button></form><div class="assignment-heading"><h3>Current sounds</h3><span>${Object.keys(scene.sounds).length}</span></div><ul class="sound-list">${assignments}</ul></section></div>`;
}

function spriteModal() {
  if (!spriteModalOpen) return "";
  const sprites = scenes[activeScene].sprites.map((sprite) => `<li><img src="${sprite.image}" alt=""><span><b>${sprite.label}</b><small>${sprite.sound ? "Sound attached" : "No sound attached"}</small></span><button class="remove-sprite" data-sprite-id="${sprite.id}">Remove</button></li>`).join("") || "<li class=\"empty-list\">No custom sprites have been added yet.</li>";
  return `<div class="modal-backdrop"><section class="sound-modal sprite-modal" role="dialog" aria-modal="true" aria-labelledby="sprite-manager-title"><button class="close-sprite-modal close-modal" aria-label="Close">×</button><p class="eyebrow">TEACHER TOOLS</p><h2 id="sprite-manager-title">Add a custom sprite</h2><p class="modal-copy">Upload a PNG or JPEG, give it an optional sound, then place it anywhere in this scene.</p><form class="sprite-form sound-form"><label>Sprite name<input name="label" required placeholder="For example, barking dog"></label><label class="file-picker">Choose PNG or JPEG<input name="image" type="file" accept="image/png,image/jpeg" required><span>Choose an image</span></label><label class="file-picker">Optional sound file<input name="audio" type="file" accept="audio/*"><span>Choose an audio file</span></label><div class="position-row"><label>Left <input name="x" type="range" min="0" max="90" value="45"><output>45%</output></label><label>Top <input name="y" type="range" min="0" max="80" value="45"><output>45%</output></label></div><label>Size <input name="size" type="range" min="60" max="180" value="110"><output>110 px</output></label><button class="save-sound" type="submit">Add sprite to scene</button></form><div class="assignment-heading"><h3>Custom sprites</h3><span>${scenes[activeScene].sprites.length}</span></div><ul class="sound-list sprite-list">${sprites}</ul></section></div>`;
}

function spriteHasSound(sprite) {
  return Boolean(sprite.sound?.blob);
}

function customEnvironmentSpriteMarkup(sprite, layer) {
  const style = `${spritePositionStyle(sprite, layer)};height:auto;transform:${spriteRotationTransform(sprite)}`;
  return `<button class="sound-target custom-environment-sprite" data-object="${sprite.id}" style="${style}" aria-label="Choose the ${escapeHtml(sprite.name)}"><img src="${blobUrl(sprite.image.blob)}" alt=""><span class="ring"></span><span class="target-label">${escapeHtml(sprite.name)}</span></button>`;
}

function customEnvironmentScene(environment) {
  const backdrop = environment.background?.blob
    ? `<img class="custom-environment-background" src="${blobUrl(environment.background.blob)}" alt="">`
    : "";
  const blankClass = environment.background?.kind === "blank" ? " blank-backdrop" : "";
  const sprites = (environment.sprites || []).map((sprite, layer) => customEnvironmentSpriteMarkup(sprite, layer)).join("");
  return `<section class="scene custom-environment-scene${blankClass}" aria-label="${escapeHtml(environment.name)}">${backdrop}${sprites}</section>`;
}

// Computed once per renderActivity() call and cached in activitySounds — blobUrl() must only be
// called during a render pass (its URLs are revoked by the next clearRenderObjectUrls()), so the
// game-loop functions below read the cached map instead of recomputing it (and re-registering
// fresh, never-revoked object URLs) on every Listen/New sound/answer click.
function currentSounds() {
  if (!activeEnvironment) return scenes[activeScene].sounds;
  const sounds = {};
  (activeEnvironment.sprites || []).forEach((sprite) => {
    if (spriteHasSound(sprite)) sounds[sprite.id] = { file: blobUrl(sprite.sound.blob), label: sprite.sound.label };
  });
  return sounds;
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
  const scene = scenes[activeScene];
  const title = activeEnvironment ? escapeHtml(activeEnvironment.name) : scene.title;
  const description = activeEnvironment ? sharedActivityDescription : scene.description;
  const sceneMarkup = activeEnvironment ? customEnvironmentScene(activeEnvironment) : (activeScene === "park" ? parkScene() : kitchenScene());
  const returnToEditor = Boolean(activeEnvironment) && activityOrigin === "editor";
  const sceneChoiceMarkup = activeEnvironment ? "" : `<button class="scene-choice ${activeScene === "park" ? "active" : ""}" data-scene="park">Park</button><button class="scene-choice ${activeScene === "kitchen" ? "active" : ""}" data-scene="kitchen">Kitchen</button>`;
  const legacyToolsMarkup = activeEnvironment ? "" : `<button class="manage-sprites" type="button">Add sprite</button><button class="manage-sounds" type="button">Manage sounds</button>`;
  activitySounds = currentSounds();
  app.innerHTML = `<main class="park"><header><p class="eyebrow">SOUND EXPLORER</p><div class="heading-row"><div><h1>${title}</h1><p>${description}</p></div><div class="scene-menu" aria-label="Choose a scene">${sceneChoiceMarkup}<button class="open-library" type="button">${returnToEditor ? "Back to editor" : "Environments"}</button></div></div><div class="listen-panel"><button class="listen-button" type="button"><span>▶</span> Listen to the sound</button><button class="stop-button" type="button">■ Stop</button><button class="new-sound" type="button">New sound</button><label class="round-picker">Rounds <select aria-label="Number of practice rounds">${[1, 3, 5, 10].map((count) => `<option value="${count}" ${count === roundCount ? "selected" : ""}>${count}</option>`).join("")}</select></label>${legacyToolsMarkup}</div><p class="round-progress">Round ${Math.min(completedRounds + 1, roundCount)} of ${roundCount}</p></header>${sceneMarkup}<p class="message" role="status"></p>${activeEnvironment ? "" : managementModal()}${activeEnvironment ? "" : spriteModal()}</main>`;
  bindControls();
  chooseSound();
  bindActivityMediaFailures();
}

function bindControls() {
  const editorEnvironmentId = activeEnvironment && activityOrigin === "editor" ? activeEnvironment.id : undefined;
  document.querySelector(".open-library").addEventListener("click", () => {
    navigate(editorEnvironmentId ? { name: "editor", id: editorEnvironmentId } : { name: "library" });
  });
  document.querySelectorAll(".scene-choice").forEach((button) => button.addEventListener("click", () => navigate({ name: "play", id: button.dataset.scene }, { origin: "library" })));
  document.querySelector(".listen-button").addEventListener("click", playCurrentSound);
  document.querySelector(".stop-button").addEventListener("click", stopSound);
  document.querySelector(".new-sound").addEventListener("click", () => { if (activityFinished) { completedRounds = 0; activityFinished = false; } chooseSound(); });
  document.querySelector(".round-picker select").addEventListener("change", (event) => { roundCount = Number(event.target.value); completedRounds = 0; activityFinished = false; chooseSound(); updateProgress(); });
  document.querySelector(".manage-sounds")?.addEventListener("click", () => { modalOpen = true; render(); });
  document.querySelector(".manage-sprites")?.addEventListener("click", () => { spriteModalOpen = true; render(); });
  document.querySelectorAll(".sound-target").forEach((targetButton) => targetButton.addEventListener("click", () => checkAnswer(targetButton)));
  document.querySelector(".close-modal")?.addEventListener("click", () => { modalOpen = false; render(); });
  document.querySelector(".length-slider")?.addEventListener("input", (event) => { maxPlaybackSeconds = Number(event.target.value); const output = document.querySelector(".playback-length output"); output.textContent = maxPlaybackSeconds === 0 ? "Full clip" : `${maxPlaybackSeconds} seconds`; });
  document.querySelector(".sound-form")?.addEventListener("submit", addSound);
  document.querySelector(".close-sprite-modal")?.addEventListener("click", () => { spriteModalOpen = false; render(); });
  document.querySelector(".sprite-form")?.addEventListener("submit", addSprite);
  document.querySelectorAll(".sprite-form input[type=range]").forEach((input) => input.addEventListener("input", () => { input.nextElementSibling.textContent = `${input.value}${input.name === "size" ? " px" : "%"}`; }));
  document.querySelectorAll(".remove-sound").forEach((button) => button.addEventListener("click", () => { delete scenes[activeScene].sounds[button.dataset.object]; currentSound = undefined; render(); }));
  document.querySelectorAll(".remove-sprite").forEach((button) => button.addEventListener("click", () => removeSprite(button.dataset.spriteId)));
}

function addSound(event) {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  const file = form.get("audio");
  const object = form.get("object");
  scenes[activeScene].sounds[object] = { file: URL.createObjectURL(file), label: form.get("label").trim() || object };
  currentSound = undefined;
  render();
}

function addSprite(event) {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  const image = form.get("image");
  const sound = form.get("audio");
  const id = `sprite-${Date.now()}`;
  const label = form.get("label").trim();
  scenes[activeScene].sprites.push({ id, label, image: URL.createObjectURL(image), sound: sound.size ? URL.createObjectURL(sound) : "", x: Number(form.get("x")), y: Number(form.get("y")), size: Number(form.get("size")) });
  if (sound.size) scenes[activeScene].sounds[id] = { file: scenes[activeScene].sprites.at(-1).sound, label };
  currentSound = undefined;
  spriteModalOpen = false;
  render();
}

function removeSprite(id) {
  const sprite = scenes[activeScene].sprites.find((item) => item.id === id);
  if (sprite) URL.revokeObjectURL(sprite.image);
  if (sprite?.sound) URL.revokeObjectURL(sprite.sound);
  scenes[activeScene].sprites = scenes[activeScene].sprites.filter((item) => item.id !== id);
  delete scenes[activeScene].sounds[id];
  currentSound = undefined;
  render();
}

function playCurrentSound() {
  if (!currentSound) return;
  audio?.pause();
  audio = new Audio();
  const showPlaybackFailure = () => {
    const message = document.querySelector(".message");
    if (message) message.textContent = activeEnvironment
      ? "This sound could not be played. Return to the editor and replace its audio file."
      : "This sound could not be played. Try again or choose a new sound.";
  };
  audio.addEventListener("error", showPlaybackFailure, { once: true });
  if (maxPlaybackSeconds > 0) audio.addEventListener("timeupdate", () => { if (audio.currentTime >= maxPlaybackSeconds) stopSound(false); });
  audio.src = activitySounds[currentSound].file;
  audio.play().catch(showPlaybackFailure);
}
function stopSound(showMessage = true) { if (!audio) return; audio.pause(); audio.currentTime = 0; if (showMessage) document.querySelector(".message").textContent = "Sound stopped. Press Listen to hear it again."; }
function updateProgress() { document.querySelector(".round-progress").textContent = activityFinished ? `You finished all ${roundCount} rounds!` : `Round ${Math.min(completedRounds + 1, roundCount)} of ${roundCount}`; }
function chooseSound() { clearTimeout(nextSoundTimeoutId); const available = Object.keys(activitySounds); const message = document.querySelector(".message"); if (activityFinished) { message.textContent = `Great work! You finished all ${roundCount} rounds. Choose New sound to practise again.`; return; } if (!available.length) { message.textContent = activeEnvironment ? "This environment needs a sprite with a sound to play." : "Add an audio file with Manage sounds to start this scene."; return; } const choices = available.filter((sound) => sound !== currentSound); currentSound = (choices.length ? choices : available)[Math.floor(Math.random() * (choices.length ? choices.length : available.length))]; document.querySelectorAll(".sound-target").forEach((item) => item.classList.remove("selected", "correct", "incorrect")); message.textContent = "Listen carefully, then choose what made the sound."; updateProgress(); playCurrentSound(); }
function checkAnswer(targetButton) { const message = document.querySelector(".message"); if (activityFinished) { message.textContent = `You finished all ${roundCount} rounds. Choose New sound to play again.`; return; } if (!currentSound) { message.textContent = "Add a sound or press Listen to begin."; return; } document.querySelectorAll(".sound-target").forEach((item) => item.classList.remove("selected", "correct", "incorrect")); targetButton.classList.add("selected"); if (targetButton.dataset.object === currentSound) { targetButton.classList.add("correct"); completedRounds += 1; if (completedRounds === roundCount) { activityFinished = true; message.textContent = `Wonderful! You matched all ${roundCount} sounds.`; updateProgress(); stopSound(false); } else { message.textContent = `Yes! That was ${activitySounds[currentSound].label}.`; nextSoundTimeoutId = window.setTimeout(chooseSound, 1300); } } else { targetButton.classList.add("incorrect"); message.textContent = "Not quite. Listen once more and try again."; } }

async function loadEnvironments() {
  try {
    const records = await environmentStorage.list();
    if (!records.every(isEnvironmentRecord)) {
      throw new Error("Saved environment could not be read");
    }
    environments = records.map(environmentWithoutSessionState);
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
      && sprite.image?.blob instanceof Blob));
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
  spriteMenuOpenId = undefined;
  spriteMenuMode = "actions";
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

function spritePositionStyle(sprite, layer) {
  return `left:${sprite.xPercent}%;top:${sprite.yPercent}%;width:${sprite.sizePercent}%;aspect-ratio:1;z-index:${layer + 1}`;
}

function spriteRotationTransform(sprite) {
  return `translate(-50%,-50%) rotate(${sprite.rotationDegrees || 0}deg)`;
}

function spriteMarkup(sprite, layer) {
  const selected = sprite.id === selectedSpriteId;
  return `<button class="editor-sprite ${selected ? "selected" : ""}" data-sprite-id="${sprite.id}" aria-label="${escapeHtml(sprite.name)}" aria-pressed="${selected}" style="${spritePositionStyle(sprite, layer)};transform:${spriteRotationTransform(sprite)}"><img src="${blobUrl(sprite.image.blob)}" alt="${escapeHtml(sprite.name)}"></button>${spriteMenuAnchorMarkup(sprite, layer, selected)}${spriteTransformHandlesMarkup(sprite, layer, selected)}`;
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

// The anchor shares the sprite's rotated frame so the ⋮ button stays welded to the sprite's edge;
// the stylesheet counter-rotates the button and its menu by --sprite-rotation so both stay upright.
function spriteMenuAnchorMarkup(sprite, layer, selected) {
  const open = sprite.id === spriteMenuOpenId;
  return `<div class="sprite-menu-anchor ${selected ? "selected" : ""}" data-sprite-id="${sprite.id}" style="${spritePositionStyle(sprite, layer)};--sprite-rotation:${sprite.rotationDegrees || 0}deg">
    <button class="sprite-menu-trigger" type="button" aria-haspopup="menu" aria-expanded="${open}" aria-label="Sprite options for ${escapeHtml(sprite.name)}">⋮</button>
    <div class="sprite-menu" role="menu" ${open ? "" : "hidden"}>${open ? spriteMenuBodyMarkup(sprite) : ""}</div>
  </div>`;
}

function spriteMenuBodyMarkup(sprite) {
  if (spriteMenuMode === "rename") {
    return `<form class="sprite-rename-form">
      <label>Sprite name<input name="name" value="${escapeHtml(sprite.name)}" required></label>
      <button type="submit">Save name</button>
    </form>`;
  }
  const soundLabel = sprite.sound ? "Replace sound" : "Add sound";
  return `<ul class="sprite-menu-actions">
    <li><button type="button" class="rename-sprite" role="menuitem">Rename</button></li>
    <li><label class="replace-sprite-image file-picker" role="menuitem"><span>Replace image</span><input class="replace-sprite-image-file" aria-label="Replace image" type="file" accept="image/png,image/jpeg,image/webp"></label></li>
    <li><label class="attach-sprite-sound file-picker" role="menuitem"><span>${soundLabel}</span><input class="attach-sprite-sound-file" aria-label="${soundLabel}" type="file" accept="${acceptedAudioTypes.join(",")}"></label></li>
    <li><button type="button" class="delete-sprite" role="menuitem">Delete</button></li>
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
      <p>Drop one PNG, JPEG, or WebP image here to fill the activity area.</p>
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

function replaceBackgroundConfirmation() {
  if (backgroundConfirmation.action !== "replace") return "";
  return `<section class="background-confirmation" aria-labelledby="replace-background-title">
    <h3 id="replace-background-title">Replace this backdrop?</h3>
    <p>The current image will be replaced.</p>
    <div>
      <button class="cancel-background-confirmation" type="button">Cancel</button>
      <button class="confirm-replace-background" type="button">Replace backdrop</button>
    </div>
  </section>`;
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
      <button class="close-background-modal close-modal" type="button" aria-label="Close">×</button>
      <p class="eyebrow">ENVIRONMENT BACKDROP</p>
      <h2 id="background-modal-title">Change backdrop</h2>
      <p class="modal-copy">Choose a PNG, JPEG, or WebP image up to 10 MB. It will fill the activity area and stay centered.</p>
      <label class="background-drop-zone" aria-label="Drop backdrop image">
        Drop a backdrop image here or <span>choose a file</span>
        <input class="background-file" aria-label="Choose backdrop image" type="file" accept="image/png,image/jpeg,image/webp">
      </label>
      ${backgroundMessageMarkup()}
      ${removeButton}
      ${replaceBackgroundConfirmation()}
      ${removeBackgroundConfirmation()}
    </section>
  </div>`;
}

// Cached per sound-flow so re-rendering the modal region reuses one object URL instead of
// handing the <audio> element a fresh src (which would restart the preview) on every refresh.
function soundFlowPreviewUrl() {
  if (!soundFlow.previewUrl) soundFlow.previewUrl = blobUrl(soundFlow.file);
  return soundFlow.previewUrl;
}

function soundFlowModal() {
  if (!soundFlow) return "";
  if (soundFlow.stage === "confirm-replace") {
    return `<div class="modal-backdrop">
      <section class="sound-modal" role="dialog" aria-modal="true" aria-labelledby="replace-sound-title">
        <button class="close-sound-flow close-modal" type="button" aria-label="Close">×</button>
        <p class="eyebrow">SPRITE SOUND</p>
        <h2 id="replace-sound-title">Replace this sound?</h2>
        <p class="modal-copy">This sprite already has a sound attached. Replacing it will remove the current one.</p>
        <div class="modal-actions">
          <button class="cancel-sound-flow" type="button">Cancel</button>
          <button class="confirm-replace-sound" type="button">Replace sound</button>
        </div>
      </section>
    </div>`;
  }
  return `<div class="modal-backdrop">
    <section class="sound-modal" role="dialog" aria-modal="true" aria-labelledby="label-sound-title">
      <button class="close-sound-flow close-modal" type="button" aria-label="Close">×</button>
      <p class="eyebrow">SPRITE SOUND</p>
      <h2 id="label-sound-title">Label this sound</h2>
      <audio class="sound-preview" controls src="${soundFlowPreviewUrl()}"></audio>
      ${soundFlow.error ? `<p class="sprite-message" role="alert">${escapeHtml(soundFlow.error)}</p>` : ""}
      <form class="sound-label-form sound-form">
        <label>Sound label<input name="label" value="${escapeHtml(soundFlow.label)}" required></label>
        <button class="save-sound" type="submit">${soundFlow.replacing ? "Replace sound" : "Add sound"}</button>
      </form>
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

function starterCard(name, state, description, spriteCount, soundCount) {
  const playable = state === "Ready to play";
  const action = playable
    ? `<button class="play-starter" data-scene="${name.toLowerCase()}" type="button" aria-label="Play ${name}">Play</button>`
    : `<button disabled type="button" aria-label="Play ${name}" title="This starter activity needs a sound before it can be played.">Needs a sound</button>`;

  return `<article class="environment-card starter-card">
    <div class="environment-thumbnail ${name.toLowerCase()}-thumbnail" aria-hidden="true"></div>
    <div class="environment-card-copy">
      <p class="card-kicker">Starter environment</p>
      <h2>${name}</h2>
      <p>${description}</p>
      <p class="environment-card-meta">${environmentMetadata(spriteCount, soundCount)}</p>
      <span class="environment-status ${playable ? "ready" : "soon"}">${state}</span>
    </div>
    ${action}
  </article>`;
}

function userEnvironmentCard(environment) {
  const name = environment.name || "Untitled environment";
  const sprites = environment.sprites || [];
  const soundCount = sprites.filter(spriteHasSound).length;
  const playable = isPlayable(environment);
  const thumbnail = environment.background?.blob
    ? `<img class="environment-thumbnail image-thumbnail" src="${backgroundUrl(environment)}" alt="Backdrop for ${escapeHtml(name)}">`
    : environment.background?.kind === "blank"
      ? `<div class="environment-thumbnail blank-thumbnail" role="img" aria-label="Blank white backdrop for ${escapeHtml(name)}"></div>`
      : `<div class="environment-thumbnail draft-thumbnail" aria-hidden="true">Draft</div>`;
  const playButton = playable
    ? `<button class="play-environment" data-environment-id="${environment.id}" type="button" aria-label="Play ${escapeHtml(name)}">Play</button>`
    : `<button disabled type="button" aria-label="Play ${escapeHtml(name)}" title="${escapeHtml(draftGuidance(environment))}">${escapeHtml(unavailableLabel(environment))}</button>`;
  return `<article class="environment-card draft-card">
    ${thumbnail}
    <div class="environment-card-copy">
      <p class="card-kicker">Saved on this device</p>
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

function renderLibrary() {
  app.innerHTML = `<main class="library">
    <header class="library-header">
      <div>
        <p class="eyebrow">SOUND EXPLORER</p>
        <h1>Your environments</h1>
        <p>Choose a starter activity or create one that stays on this device.</p>
      </div>
      ${saveStatus()}
    </header>
    <section class="environment-grid">
      ${starterCard("Park", "Ready to play", "A working sound-matching example.", 4, 4)}
      ${starterCard("Kitchen", "Coming soon", "This starter activity is not ready to play yet.", 3, 0)}
      ${environments.map(userEnvironmentCard).join("")}
    </section>
    <button class="create-environment" type="button">Create environment</button>
    ${recoveryGuidance()}
    ${deleteConfirmationModal()}
  </main>`;
  document.querySelector(".create-environment").addEventListener("click", createEnvironment);
  document.querySelectorAll(".edit-environment").forEach((button) => button.addEventListener("click", () => openEditor(button.dataset.environmentId)));
  document.querySelectorAll(".play-starter").forEach((button) => button.addEventListener("click", () => navigate({ name: "play", id: button.dataset.scene }, { origin: "library" })));
  document.querySelectorAll(".play-environment").forEach((button) => button.addEventListener("click", () => navigate({ name: "play", id: button.dataset.environmentId }, { origin: "library" })));
  bindEnvironmentMenus();
}

function bindEnvironmentMenus() {
  document.querySelectorAll(".environment-menu-trigger").forEach((trigger) => trigger.addEventListener("click", (event) => {
    event.stopPropagation();
    toggleEnvironmentMenu(trigger.dataset.environmentId);
  }));
  document.querySelectorAll(".duplicate-environment").forEach((button) => button.addEventListener("click", () => duplicateEnvironment(button.dataset.environmentId)));
  document.querySelectorAll(".delete-environment").forEach((button) => button.addEventListener("click", () => askToDeleteEnvironment(button.dataset.environmentId)));
  document.querySelector(".cancel-delete-environment")?.addEventListener("click", cancelDeleteEnvironment);
  document.querySelector(".confirm-delete-environment")?.addEventListener("click", () => deleteEnvironment(pendingDeleteId));
  // Focus lands on the first menu item when a menu opens, and on Cancel when the delete
  // confirmation opens — never on the button that destroys the environment.
  if (environmentMenuOpenId) document.querySelector(".environment-menu:not([hidden]) button")?.focus();
  document.querySelector(".cancel-delete-environment")?.focus();
}

function menuTrigger(id) {
  return document.querySelector(`.environment-menu-trigger[data-environment-id="${CSS.escape(id)}"]`);
}

function toggleEnvironmentMenu(id) {
  if (environmentMenuOpenId === id) return closeEnvironmentMenu(true);
  environmentMenuOpenId = id;
  render();
}

function closeEnvironmentMenu(returnFocus = false) {
  if (!environmentMenuOpenId) return;
  const id = environmentMenuOpenId;
  environmentMenuOpenId = undefined;
  render();
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
    <header class="editor-toolbar" role="toolbar" aria-label="Editor toolbar">
      <button class="editor-home" type="button" aria-label="Home" title="Home">${icon("home")}</button>
      <span class="project-name">${projectName}</span>
      <button class="undo-editor" type="button" aria-label="Undo" title="Undo" disabled>${icon("undo")}</button>
      <button class="redo-editor" type="button" aria-label="Redo" title="Redo" disabled>${icon("redo")}</button>
      <label class="environment-name-label" for="environment-name">Environment name</label>
      <input class="environment-name-input" id="environment-name" value="${escapeHtml(editingEnvironment.name)}" placeholder="Untitled environment" aria-label="Environment name">
      <span class="toolbar-spacer"></span>
      <div class="editor-controls" role="group" aria-label="Backdrop and sprites"></div>
      ${saveStatus()}
      <button class="preview-environment" type="button"></button>
    </header>
    <section class="editor-stage">
      <section class="activity-canvas" aria-label="Activity area"></section>
      <div class="editor-feedback"></div>
    </section>
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

function updateEditorRegion(selector, markup, bind) {
  const element = document.querySelector(selector);
  if (!element) return;
  if (renderedEditorRegions.get(selector) === markup) return;
  renderedEditorRegions.set(selector, markup);
  element.innerHTML = markup;
  bind?.(element);
}

// Both live in the toolbar: neither one deserves a row of its own under the backdrop. Sprites
// stay gated until a backdrop exists, and the picker stays a real, focusable file input.
function editorControlsMarkup() {
  if (!hasBackdrop(editingEnvironment)) {
    return `<button class="add-sprite-disabled" type="button" disabled aria-label="Add sprite after choosing a backdrop" title="Choose a backdrop before adding sprites">${icon("sprite")}<span class="control-text">Add sprite</span></button>`;
  }
  return `<button class="set-background" type="button" aria-label="Change backdrop" title="Change backdrop">${icon("backdrop")}<span class="control-text">Change backdrop</span></button>
    <label class="add-sprite" title="Add sprite image">${icon("sprite")}<span class="control-text">Add sprite</span><input class="sprite-file" aria-label="Add sprite image" type="file" accept="image/png,image/jpeg,image/webp"></label>`;
}

function editorFeedbackMarkup() {
  const showBackgroundMessage = hasBackdrop(editingEnvironment) && !backgroundModalOpen;
  return `${spriteMessageMarkup()}
        ${showBackgroundMessage ? backgroundMessageMarkup() : ""}
        <p class="editor-next-step">${escapeHtml(draftGuidance(editingEnvironment))}</p>
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
  if (backdrop.kind === "image") return `<img class="editor-backdrop" src="${blobUrl(backdrop.blob)}" alt="Environment backdrop">`;
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
  updateSpriteMenuDom();
}

function addSpriteElements(canvas, sprite, layer) {
  const holder = document.createElement("div");
  holder.innerHTML = spriteMarkup(sprite, layer);
  [...holder.children].forEach((node) => canvas.append(node));
  const { button, menuAnchor, transformHandles } = overlayElements(sprite.id);
  if (button) {
    bindSpriteEvents(button);
    const image = button.querySelector("img");
    if (image) spriteImageBlobs.set(image, sprite.image.blob);
  }
  if (menuAnchor) bindSpriteMenuAnchor(menuAnchor);
  if (transformHandles) bindSpriteTransformHandles(transformHandles);
}

function updateSpriteElements(sprite, layer) {
  const selected = sprite.id === selectedSpriteId;
  const transform = spriteRotationTransform(sprite);
  const { button, menuAnchor, transformHandles } = overlayElements(sprite.id);
  [button, menuAnchor, transformHandles].forEach((element) => {
    if (!element) return;
    element.classList.toggle("selected", selected);
    element.style.left = `${sprite.xPercent}%`;
    element.style.top = `${sprite.yPercent}%`;
    element.style.width = `${sprite.sizePercent}%`;
    element.style.zIndex = layer + 1;
  });
  if (transformHandles) transformHandles.style.transform = transform;
  if (menuAnchor) {
    menuAnchor.style.setProperty("--sprite-rotation", `${sprite.rotationDegrees || 0}deg`);
    menuAnchor.querySelector(".sprite-menu-trigger")?.setAttribute("aria-label", `Sprite options for ${sprite.name}`);
  }
  if (!button) return;
  button.setAttribute("aria-pressed", String(selected));
  button.setAttribute("aria-label", sprite.name);
  button.style.transform = transform;
  const image = button.querySelector("img");
  if (!image) return;
  image.alt = sprite.name;
  if (spriteImageBlobs.get(image) === sprite.image.blob) return;
  spriteImageBlobs.set(image, sprite.image.blob);
  image.src = blobUrl(sprite.image.blob);
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
  document.querySelector(".close-sound-flow")?.addEventListener("click", cancelSoundFlow);
  document.querySelector(".cancel-sound-flow")?.addEventListener("click", cancelSoundFlow);
  document.querySelector(".confirm-replace-sound")?.addEventListener("click", confirmReplaceSound);
  document.querySelector(".sound-label-form")?.addEventListener("submit", (event) => {
    event.preventDefault();
    submitSoundLabel(new FormData(event.currentTarget).get("label"));
  });
  bindBackgroundModal();
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
  canvas.addEventListener("dragover", (event) => event.preventDefault());
  canvas.addEventListener("drop", (event) => {
    event.preventDefault();
    const files = event.dataTransfer.files;
    if (files.length !== 1) {
      if (hasBackdrop(editingEnvironment)) setSpriteMessage("Drop one image at a time.");
      else setBackgroundMessage("Drop one backdrop image at a time.");
      refreshEditor();
      return;
    }
    const file = files[0];
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
      // Sprites render as three sibling overlays sharing one data-sprite-id (the button, its
      // three-dot menu, and its resize/rotate handles) — match any of them, not just the button.
      const targetSprite = event.target.closest("[data-sprite-id]");
      if (!targetSprite || targetSprite.dataset.spriteId !== selectedSpriteId) {
        setSpriteMessage("Drop the sound onto a sprite to attach it.");
        refreshEditor();
        return;
      }
      beginAttachSound(targetSprite.dataset.spriteId, file);
      return;
    }
    addSpriteFromFile(file, dropPosition(event, canvas));
  });
}

function render() {
  clearRenderObjectUrls();
  // A full render discards every object URL, so any cached preview URL has to be remade.
  if (soundFlow) soundFlow = { ...soundFlow, previewUrl: undefined };
  document.body.dataset.view = view;
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
  if (window.location.pathname !== "/") return fallBackToLibrary();
  enterLibrary();
}

// An address that names an environment that is gone (or never existed) is not an error screen:
// it quietly becomes the library, and the address bar is corrected to match.
function fallBackToLibrary() {
  history.replaceState({ route: "library" }, "", "/");
  enterLibrary();
}

function clearEditorSession() {
  backgroundModalOpen = false;
  backgroundConfirmation = { action: "none" };
  resetEditorMessages();
  soundFlow = undefined;
  spriteMenuOpenId = undefined;
  spriteMenuMode = "actions";
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
  if (starterSceneIds.includes(id)) {
    activeScene = id;
    activeEnvironment = undefined;
  } else {
    const environment = environments.find((item) => item.id === id);
    if (!environment) return fallBackToLibrary();
    activeEnvironment = environment;
  }
  activityOrigin = activeEnvironment && origin === "editor" ? "editor" : "library";
  currentSound = undefined;
  completedRounds = 0;
  activityFinished = false;
  modalOpen = false;
  spriteModalOpen = false;
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
  const sprite = {
    id: crypto.randomUUID(),
    name: spriteNameFromFilename(file.name),
    image: { blob: file.slice(0, file.size, file.type) },
    xPercent: position.xPercent,
    yPercent: position.yPercent,
    sizePercent: defaultSpriteSizePercent,
  };
  selectedSpriteId = sprite.id;
  await commitEditorMutation({ ...editingEnvironment, sprites: [...(editingEnvironment.sprites || []), sprite] });
}

function constrainedPercent(point, start, length, sizePercent) {
  const halfSize = sizePercent / 2;
  return Math.max(halfSize, Math.min(100 - halfSize, ((point - start) / length) * 100));
}

function dropPosition(event, canvas) {
  const bounds = canvas.getBoundingClientRect();
  return {
    xPercent: constrainedPercent(event.clientX, bounds.left, bounds.width, defaultSpriteSizePercent),
    yPercent: constrainedPercent(event.clientY, bounds.top, bounds.height, defaultSpriteSizePercent),
  };
}

function draggedSpritePosition(event, drag) {
  return {
    xPercent: constrainedPercent(drag.startCanvasX + event.clientX - drag.startPointerX, drag.bounds.left, drag.bounds.width, drag.sprite.sizePercent),
    yPercent: constrainedPercent(drag.startCanvasY + event.clientY - drag.startPointerY, drag.bounds.top, drag.bounds.height, drag.sprite.sizePercent),
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
    menuAnchor: document.querySelector(`.sprite-menu-anchor[data-sprite-id="${escaped}"]`),
    transformHandles: document.querySelector(`.sprite-transform-handles[data-sprite-id="${escaped}"]`),
  };
}

function showSelectedSprite(id) {
  editingEnvironment.sprites.forEach((sprite, layer) => {
    const selected = sprite.id === id;
    const { button, menuAnchor, transformHandles } = overlayElements(sprite.id);
    if (button) {
      button.classList.toggle("selected", selected);
      button.setAttribute("aria-pressed", String(selected));
      button.style.zIndex = layer + 1;
    }
    [menuAnchor, transformHandles].forEach((element) => {
      if (!element) return;
      element.classList.toggle("selected", selected);
      element.style.zIndex = layer + 1;
    });
  });
}

function selectSprite(id) {
  const currentSprites = editingEnvironment.sprites || [];
  if (selectedSpriteId === id && currentSprites.at(-1)?.id === id) return;
  if (selectedSpriteId !== id) closeSpriteMenu();
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
  selectedSpriteId = undefined;
  showSelectedSprite();
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
  element.style.left = `${position.xPercent}%`;
  element.style.top = `${position.yPercent}%`;
  showSelectedSprite(element.dataset.spriteId);
  const { menuAnchor, transformHandles } = overlayElements(element.dataset.spriteId);
  [menuAnchor, transformHandles].forEach((overlay) => {
    if (!overlay) return;
    overlay.style.left = element.style.left;
    overlay.style.top = element.style.top;
  });
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
    event.preventDefault();
    event.stopPropagation();
    const sprite = editingEnvironment.sprites.find((item) => item.id === element.dataset.spriteId);
    if (!sprite) return;
    const canvas = document.querySelector(".activity-canvas");
    const beforeGesture = snapshotEnvironment(editingEnvironment);
    moveSpriteToFront(sprite.id);
    showSelectedSprite(sprite.id);
    element.setPointerCapture(event.pointerId);
    const drag = dragStart(event, element, sprite, canvas);
    const move = (moveEvent) => {
      const position = draggedSpritePosition(moveEvent, drag);
      updateSpritePosition(sprite.id, position);
      showDraggedSprite(element, position);
    };
    const finish = () => {
      element.removeEventListener("pointermove", move);
      element.removeEventListener("pointerup", finish);
      element.removeEventListener("pointercancel", finish);
      if (element.hasPointerCapture(event.pointerId)) element.releasePointerCapture(event.pointerId);
      commitEditorGesture(beforeGesture);
    };
    element.addEventListener("pointermove", move);
    element.addEventListener("pointerup", finish, { once: true });
    element.addEventListener("pointercancel", finish, { once: true });
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

function showSpriteSize(id, sizePercent) {
  const { button, menuAnchor, transformHandles } = overlayElements(id);
  [button, menuAnchor, transformHandles].forEach((element) => { if (element) element.style.width = `${sizePercent}%`; });
}

function showSpriteRotation(id, rotationDegrees) {
  const transform = spriteRotationTransform({ rotationDegrees });
  const { button, menuAnchor, transformHandles } = overlayElements(id);
  if (button) button.style.transform = transform;
  if (transformHandles) transformHandles.style.transform = transform;
  if (menuAnchor) menuAnchor.style.setProperty("--sprite-rotation", `${rotationDegrees || 0}deg`);
}

function showSpritePosition(id, xPercent, yPercent) {
  const { button, menuAnchor, transformHandles } = overlayElements(id);
  [button, menuAnchor, transformHandles].forEach((element) => {
    if (!element) return;
    element.style.left = `${xPercent}%`;
    element.style.top = `${yPercent}%`;
  });
}

// A rotated square's on-screen (axis-aligned) footprint is wider than its own side length —
// up to sqrt(2)x at 45deg. Use that footprint, not the raw sizePercent, when keeping a
// resized or rotated sprite's center far enough from the canvas edge to stay recoverable.
function spriteFootprintPercent(sprite) {
  const angleRad = ((sprite.rotationDegrees || 0) * Math.PI) / 180;
  return sprite.sizePercent * (Math.abs(Math.cos(angleRad)) + Math.abs(Math.sin(angleRad)));
}

function keepSpriteRecoverable(id) {
  const sprite = editingEnvironment.sprites.find((item) => item.id === id);
  if (!sprite) return;
  const halfFootprint = spriteFootprintPercent(sprite) / 2;
  const xPercent = clampPercent(sprite.xPercent, halfFootprint, 100 - halfFootprint);
  const yPercent = clampPercent(sprite.yPercent, halfFootprint, 100 - halfFootprint);
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
    const halfSizePx = Math.max(halfSizeFloorPx, (Math.abs(localX) + Math.abs(localY)) / 2);
    const sizePercent = clampPercent(((halfSizePx * 2) / bounds.width) * 100, minSpriteSizePercent, maxSpriteSizePercent);
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

function bindSpriteMenuAnchor(anchor) {
  const id = anchor.dataset.spriteId;
  anchor.querySelector(".sprite-menu-trigger").addEventListener("click", (event) => {
    event.stopPropagation();
    toggleSpriteMenu(id);
  });
  bindSpriteMenuBody(anchor, id);
}

function bindSpriteMenuBody(anchor, id) {
  anchor.querySelector(".rename-sprite")?.addEventListener("click", (event) => {
    event.stopPropagation();
    openSpriteRename(id);
  });
  anchor.querySelector(".delete-sprite")?.addEventListener("click", (event) => {
    event.stopPropagation();
    deleteSprite(id);
  });
  anchor.querySelector(".replace-sprite-image-file")?.addEventListener("click", (event) => event.stopPropagation());
  anchor.querySelector(".replace-sprite-image-file")?.addEventListener("change", (event) => {
    replaceSpriteImage(id, event.target.files[0]);
  });
  anchor.querySelector(".attach-sprite-sound-file")?.addEventListener("click", (event) => event.stopPropagation());
  anchor.querySelector(".attach-sprite-sound-file")?.addEventListener("change", (event) => {
    closeSpriteMenu();
    beginAttachSound(id, event.target.files[0]);
  });
  anchor.querySelector(".sprite-rename-form")?.addEventListener("submit", (event) => {
    event.preventDefault();
    event.stopPropagation();
    submitSpriteRename(id, new FormData(event.currentTarget).get("name"));
  });
}

function focusFirstSpriteMenuControl() {
  document.querySelector(".sprite-menu-anchor.selected .sprite-menu:not([hidden]) input, .sprite-menu-anchor.selected .sprite-menu:not([hidden]) button")?.focus();
}

function updateSpriteMenuDom() {
  document.querySelectorAll(".sprite-menu-anchor").forEach((anchor) => {
    const id = anchor.dataset.spriteId;
    const sprite = (editingEnvironment.sprites || []).find((item) => item.id === id);
    const open = Boolean(id === spriteMenuOpenId && sprite);
    const trigger = anchor.querySelector(".sprite-menu-trigger");
    const menu = anchor.querySelector(".sprite-menu");
    const markup = open ? spriteMenuBodyMarkup(sprite) : "";
    trigger.setAttribute("aria-expanded", String(open));
    menu.hidden = !open;
    // Rebuild the menu only when its content really changes, so a refresh can never throw away
    // a half-typed rename or the focus sitting inside an open menu.
    if (renderedSpriteMenus.get(menu) === markup) return;
    renderedSpriteMenus.set(menu, markup);
    menu.innerHTML = markup;
    if (open) bindSpriteMenuBody(anchor, id);
  });
}

function toggleSpriteMenu(id) {
  spriteMenuOpenId = spriteMenuOpenId === id ? undefined : id;
  spriteMenuMode = "actions";
  updateSpriteMenuDom();
  if (spriteMenuOpenId) focusFirstSpriteMenuControl();
}

function closeSpriteMenu(returnFocus = false) {
  if (!spriteMenuOpenId) return;
  const id = spriteMenuOpenId;
  spriteMenuOpenId = undefined;
  spriteMenuMode = "actions";
  updateSpriteMenuDom();
  if (returnFocus) document.querySelector(`.sprite-menu-anchor[data-sprite-id="${CSS.escape(id)}"] .sprite-menu-trigger`)?.focus();
}

function openSpriteRename(id) {
  spriteMenuOpenId = id;
  spriteMenuMode = "rename";
  updateSpriteMenuDom();
  focusFirstSpriteMenuControl();
}

function updateSpriteNameDom(id, name) {
  const button = document.querySelector(`.editor-sprite[data-sprite-id="${CSS.escape(id)}"]`);
  button?.setAttribute("aria-label", name);
  if (button?.querySelector("img")) button.querySelector("img").alt = name;
  const trigger = document.querySelector(`.sprite-menu-anchor[data-sprite-id="${CSS.escape(id)}"] .sprite-menu-trigger`);
  trigger?.setAttribute("aria-label", `Sprite options for ${name}`);
}

function submitSpriteRename(id, rawName) {
  const name = (rawName || "").trim();
  if (!name) {
    setSpriteMessage("Sprite name can't be empty.");
    refreshEditor();
    return;
  }
  setSpriteMessage("");
  const environment = {
    ...editingEnvironment,
    sprites: editingEnvironment.sprites.map((sprite) => sprite.id === id ? { ...sprite, name } : sprite),
  };
  updateSpriteNameDom(id, name);
  closeSpriteMenu();
  commitEditorMutation(environment);
}

async function replaceSpriteImage(id, file) {
  const error = await imageValidationError(file, validateImage);
  if (error) {
    setSpriteMessage(error);
    spriteMenuOpenId = undefined;
    spriteMenuMode = "actions";
    refreshEditor();
    return;
  }
  setSpriteMessage("");
  spriteMenuOpenId = undefined;
  spriteMenuMode = "actions";
  const sprites = editingEnvironment.sprites.map((sprite) => sprite.id === id ? { ...sprite, image: { blob: file.slice(0, file.size, file.type) } } : sprite);
  await commitEditorMutation({ ...editingEnvironment, sprites });
}

function deleteSprite(id) {
  if (!editingEnvironment.sprites.some((sprite) => sprite.id === id)) return;
  const sprites = editingEnvironment.sprites.filter((item) => item.id !== id);
  spriteMenuOpenId = undefined;
  spriteMenuMode = "actions";
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

async function beginAttachSound(spriteId, file) {
  const error = await audioValidationError(file);
  if (error) {
    setSpriteMessage(error);
    refreshEditor();
    return;
  }
  setSpriteMessage("");
  const sprite = editingEnvironment.sprites.find((item) => item.id === spriteId);
  const hasSound = Boolean(sprite?.sound);
  soundFlow = {
    spriteId,
    file,
    label: spriteNameFromFilename(file.name),
    replacing: hasSound,
    stage: hasSound ? "confirm-replace" : "label",
  };
  refreshEditor();
}

function cancelSoundFlow() {
  soundFlow = undefined;
  refreshEditor();
}

function confirmReplaceSound() {
  soundFlow = { ...soundFlow, stage: "label" };
  refreshEditor();
}

async function submitSoundLabel(rawLabel) {
  const label = (rawLabel || "").trim();
  if (!label) {
    soundFlow = { ...soundFlow, error: "Sound label can't be empty." };
    refreshEditor();
    return;
  }
  const { spriteId, file } = soundFlow;
  const sprites = editingEnvironment.sprites.map((sprite) => sprite.id === spriteId
    ? { ...sprite, sound: { blob: file.slice(0, file.size, file.type), label } }
    : sprite);
  soundFlow = undefined;
  await commitEditorMutation({ ...editingEnvironment, sprites });
}

async function selectBackground(file) {
  const error = await imageValidationError(file, validateBackground);
  if (error) {
    setBackgroundMessage(error);
    refreshEditor();
    return;
  }
  if (editingEnvironment.background?.blob) {
    backgroundConfirmation = { action: "replace", file };
    refreshEditor();
    return;
  }
  await saveBackground(file);
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

function bindBackgroundModal() {
  const modal = document.querySelector(".background-modal");
  if (!modal) return;
  document.querySelector(".close-background-modal").addEventListener("click", () => {
    backgroundModalOpen = false;
    backgroundConfirmation = { action: "none" };
    refreshEditor();
  });
  const input = document.querySelector(".background-file");
  input.addEventListener("change", () => selectBackground(takeChosenFile(input)));
  const dropZone = document.querySelector(".background-drop-zone");
  dropZone.addEventListener("dragover", (event) => event.preventDefault());
  dropZone.addEventListener("drop", (event) => {
    event.preventDefault();
    if (event.dataTransfer.files.length !== 1) {
      setBackgroundMessage("Drop one backdrop image at a time.");
      refreshEditor();
      return;
    }
    selectBackground(event.dataTransfer.files[0]);
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
  document.querySelector(".confirm-replace-background")?.addEventListener("click", () => {
    saveBackground(backgroundConfirmation.file);
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
  if (view === "editor" && spriteMenuOpenId && !event.target.closest(".sprite-menu-anchor")) closeSpriteMenu();
  if (view === "library" && environmentMenuOpenId && !event.target.closest(".environment-menu-anchor")) closeEnvironmentMenu();
});
document.addEventListener("focusin", (event) => {
  if (view === "editor" && spriteMenuOpenId && !event.target.closest(".sprite-menu-anchor")) closeSpriteMenu();
});
document.addEventListener("keydown", (event) => {
  if (event.key !== "Escape") return;
  if (view === "editor" && spriteMenuOpenId) closeSpriteMenu(true);
  if (view !== "library") return;
  if (pendingDeleteId) cancelDeleteEnvironment();
  else if (environmentMenuOpenId) closeEnvironmentMenu(true);
});

window.addEventListener("popstate", applyRoute);

async function start() {
  await loadEnvironments();
  applyRoute();
}

start();
