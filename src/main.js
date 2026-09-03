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
let currentSound;
let audio;
let modalOpen = false;
let spriteModalOpen = false;
let roundCount = 3;
let completedRounds = 0;
let activityFinished = false;
let maxPlaybackSeconds = 5;
let view = "activity";
let environments = [];
let editingEnvironment;
let saveState = "saved";
let saveMessage = "";
let backgroundModalOpen = false;
let backgroundConfirmation = { action: "none" };
let backgroundMessage = "";
let spriteMessage = "";
let spriteMenuOpenId;
let spriteMenuMode = "actions";
let undoDeletedSprite;
let undoTimeoutId;
const renderObjectUrls = new Set();
const defaultSpriteSizePercent = 14;
let pendingEnvironmentSave = Promise.resolve();

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

function renderActivity() {
  const scene = scenes[activeScene];
  app.innerHTML = `<main class="park"><header><p class="eyebrow">SOUND EXPLORER</p><div class="heading-row"><div><h1>${scene.title}</h1><p>${scene.description}</p></div><div class="scene-menu" aria-label="Choose a scene"><button class="scene-choice ${activeScene === "park" ? "active" : ""}" data-scene="park">Park</button><button class="scene-choice ${activeScene === "kitchen" ? "active" : ""}" data-scene="kitchen">Kitchen</button><button class="open-library" type="button">Environments</button></div></div><div class="listen-panel"><button class="listen-button" type="button"><span>▶</span> Listen to the sound</button><button class="stop-button" type="button">■ Stop</button><button class="new-sound" type="button">New sound</button><label class="round-picker">Rounds <select aria-label="Number of practice rounds">${[1, 3, 5, 10].map((count) => `<option value="${count}" ${count === roundCount ? "selected" : ""}>${count}</option>`).join("")}</select></label><button class="manage-sprites" type="button">Add sprite</button><button class="manage-sounds" type="button">Manage sounds</button></div><p class="round-progress">Round ${Math.min(completedRounds + 1, roundCount)} of ${roundCount}</p></header>${activeScene === "park" ? parkScene() : kitchenScene()}<p class="message" role="status"></p>${managementModal()}${spriteModal()}</main>`;
  bindControls();
  chooseSound();
}

function bindControls() {
  document.querySelector(".open-library").addEventListener("click", () => { audio?.pause(); view = "library"; render(); });
  document.querySelectorAll(".scene-choice").forEach((button) => button.addEventListener("click", () => { audio?.pause(); activeScene = button.dataset.scene; currentSound = undefined; completedRounds = 0; activityFinished = false; modalOpen = false; spriteModalOpen = false; render(); }));
  document.querySelector(".listen-button").addEventListener("click", playCurrentSound);
  document.querySelector(".stop-button").addEventListener("click", stopSound);
  document.querySelector(".new-sound").addEventListener("click", () => { if (activityFinished) { completedRounds = 0; activityFinished = false; } chooseSound(); });
  document.querySelector(".round-picker select").addEventListener("change", (event) => { roundCount = Number(event.target.value); completedRounds = 0; activityFinished = false; chooseSound(); updateProgress(); });
  document.querySelector(".manage-sounds").addEventListener("click", () => { modalOpen = true; render(); });
  document.querySelector(".manage-sprites").addEventListener("click", () => { spriteModalOpen = true; render(); });
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

function playCurrentSound() { if (!currentSound) return; audio?.pause(); audio = new Audio(scenes[activeScene].sounds[currentSound].file); if (maxPlaybackSeconds > 0) audio.addEventListener("timeupdate", () => { if (audio.currentTime >= maxPlaybackSeconds) stopSound(false); }); audio.play().catch(() => { document.querySelector(".message").textContent = "Press Listen again to play the sound."; }); }
function stopSound(showMessage = true) { if (!audio) return; audio.pause(); audio.currentTime = 0; if (showMessage) document.querySelector(".message").textContent = "Sound stopped. Press Listen to hear it again."; }
function updateProgress() { document.querySelector(".round-progress").textContent = activityFinished ? `You finished all ${roundCount} rounds!` : `Round ${Math.min(completedRounds + 1, roundCount)} of ${roundCount}`; }
function chooseSound() { const available = Object.keys(scenes[activeScene].sounds); const message = document.querySelector(".message"); if (activityFinished) { message.textContent = `Great work! You finished all ${roundCount} rounds. Choose New sound to practise again.`; return; } if (!available.length) { message.textContent = "Add an audio file with Manage sounds to start this scene."; return; } const choices = available.filter((sound) => sound !== currentSound); currentSound = (choices.length ? choices : available)[Math.floor(Math.random() * (choices.length ? choices.length : available.length))]; document.querySelectorAll(".sound-target").forEach((item) => item.classList.remove("selected", "correct", "incorrect")); message.textContent = "Listen carefully, then choose what made the sound."; updateProgress(); playCurrentSound(); }
function checkAnswer(targetButton) { const message = document.querySelector(".message"); if (activityFinished) { message.textContent = `You finished all ${roundCount} rounds. Choose New sound to play again.`; return; } if (!currentSound) { message.textContent = "Add a sound or press Listen to begin."; return; } document.querySelectorAll(".sound-target").forEach((item) => item.classList.remove("selected", "correct", "incorrect")); targetButton.classList.add("selected"); if (targetButton.dataset.object === currentSound) { targetButton.classList.add("correct"); completedRounds += 1; if (completedRounds === roundCount) { activityFinished = true; message.textContent = `Wonderful! You matched all ${roundCount} sounds.`; updateProgress(); stopSound(false); } else { message.textContent = `Yes! That was ${scenes[activeScene].sounds[currentSound].label}.`; window.setTimeout(chooseSound, 1300); } } else { targetButton.classList.add("incorrect"); message.textContent = "Not quite. Listen once more and try again."; } }

async function loadEnvironments() {
  try {
    const records = await environmentStorage.list();
    if (!records.every(isEnvironmentRecord)) {
      throw new Error("Saved environment could not be read");
    }
    environments = records;
    saveState = "saved";
  } catch (error) {
    saveState = "failed";
    saveMessage = error.message === "Saved environment could not be read"
      ? "A saved environment could not be read. It was not shown; try refreshing the page."
      : "We could not open saved environments on this device. Try refreshing the page.";
  }
}

function isEnvironmentRecord(record) {
  return record
    && typeof record === "object"
    && typeof record.id === "string"
    && typeof record.name === "string"
    && (!record.sprites || record.sprites.every((sprite) => sprite
      && typeof sprite.id === "string"
      && typeof sprite.name === "string"
      && typeof sprite.xPercent === "number"
      && typeof sprite.yPercent === "number"
      && typeof sprite.sizePercent === "number"
      && sprite.image?.blob instanceof Blob));
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

function spriteMarkup(sprite, layer) {
  const selected = sprite.id === editingEnvironment.selectedSpriteId;
  return `<button class="editor-sprite ${selected ? "selected" : ""}" data-sprite-id="${sprite.id}" aria-label="${escapeHtml(sprite.name)}" aria-pressed="${selected}" style="${spritePositionStyle(sprite, layer)}"><img src="${blobUrl(sprite.image.blob)}" alt="${escapeHtml(sprite.name)}"></button>${spriteMenuAnchorMarkup(sprite, layer, selected)}`;
}

function spriteMenuAnchorMarkup(sprite, layer, selected) {
  const open = sprite.id === spriteMenuOpenId;
  return `<div class="sprite-menu-anchor ${selected ? "selected" : ""}" data-sprite-id="${sprite.id}" style="${spritePositionStyle(sprite, layer)}">
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
  return `<ul class="sprite-menu-actions">
    <li><button type="button" class="rename-sprite" role="menuitem">Rename</button></li>
    <li><label class="replace-sprite-image file-picker" role="menuitem"><span>Replace image</span><input class="replace-sprite-image-file" aria-label="Replace image" type="file" accept="image/png,image/jpeg,image/webp"></label></li>
    <li><button type="button" class="delete-sprite" role="menuitem">Delete</button></li>
  </ul>`;
}

function spriteUndoMarkup() {
  return `<p class="sprite-undo" role="alert">Sprite deleted. <button class="undo-delete-sprite" type="button">Undo</button></p>`;
}

function spriteNameFromFilename(filename) {
  const name = filename.replace(/\.[^.]+$/, "").replace(/[-_]+/g, " ").trim().replace(/\s+/g, " ");
  return name ? name.replace(/\b\w/g, (letter) => letter.toUpperCase()) : "Untitled sprite";
}

function clearRenderObjectUrls() {
  renderObjectUrls.forEach((url) => URL.revokeObjectURL(url));
  renderObjectUrls.clear();
}

function draftGuidance(environment) {
  const missing = [];
  if (!environment.name.trim()) missing.push("a name");
  if (!environment.background) missing.push("a background");
  missing.push("at least one sprite with a sound");
  return `This draft needs ${missing.join(", ")} before it can be played.`;
}

function backgroundMessageMarkup() {
  if (!backgroundMessage) return "";
  return `<p class="background-message" role="alert">${escapeHtml(backgroundMessage)}</p>`;
}

function replaceBackgroundConfirmation() {
  if (backgroundConfirmation.action !== "replace") return "";
  return `<section class="background-confirmation" aria-labelledby="replace-background-title">
    <h3 id="replace-background-title">Replace this background?</h3>
    <p>The current image will be replaced.</p>
    <div>
      <button class="cancel-background-confirmation" type="button">Cancel</button>
      <button class="confirm-replace-background" type="button">Replace background</button>
    </div>
  </section>`;
}

function removeBackgroundConfirmation() {
  if (backgroundConfirmation.action !== "remove") return "";
  return `<section class="background-confirmation" aria-labelledby="remove-background-title">
    <h3 id="remove-background-title">Remove this background?</h3>
    <p>The image will be removed from this environment.</p>
    <div>
      <button class="cancel-background-confirmation" type="button">Cancel</button>
      <button class="confirm-remove-background" type="button">Remove background</button>
    </div>
  </section>`;
}

function backgroundModal() {
  if (!backgroundModalOpen) return "";
  const removeButton = editingEnvironment.background
    ? `<div class="background-actions"><button class="remove-background" type="button">Remove background</button></div>`
    : "";
  return `<div class="modal-backdrop">
    <section class="background-modal" role="dialog" aria-modal="true" aria-labelledby="background-modal-title">
      <button class="close-background-modal close-modal" type="button" aria-label="Close">×</button>
      <p class="eyebrow">ENVIRONMENT BACKGROUND</p>
      <h2 id="background-modal-title">Set background</h2>
      <p class="modal-copy">Choose a PNG, JPEG, or WebP image up to 10 MB. It will fill the activity area and stay centered.</p>
      <label class="background-drop-zone" aria-label="Drop background image">
        Drop an image here or <span>choose a file</span>
        <input class="background-file" aria-label="Choose background image" type="file" accept="image/png,image/jpeg,image/webp">
      </label>
      ${backgroundMessageMarkup()}
      ${removeButton}
      ${replaceBackgroundConfirmation()}
      ${removeBackgroundConfirmation()}
    </section>
  </div>`;
}

function saveStatus() {
  const text = saveState === "saving"
    ? "Saving on this device…"
    : saveState === "failed"
      ? "Could not save on this device"
      : "Saved on this device";
  return `<div class="storage-status ${saveState}" role="status">${text}</div>`;
}

function recoveryGuidance() {
  return saveMessage ? `<p class="storage-guidance" role="alert">${saveMessage}</p>` : "";
}

function starterCard(name, state, description) {
  const playable = state === "Ready to play";
  const action = playable
    ? `<button class="play-starter" data-scene="${name.toLowerCase()}" type="button" aria-label="Play ${name}">Play</button>`
    : `<button disabled type="button" aria-label="Play ${name}">Not available yet</button>`;

  return `<article class="environment-card starter-card">
    <div class="environment-thumbnail ${name.toLowerCase()}-thumbnail" aria-hidden="true"></div>
    <div class="environment-card-copy">
      <p class="card-kicker">Starter environment</p>
      <h2>${name}</h2>
      <p>${description}</p>
      <span class="environment-status ${playable ? "ready" : "soon"}">${state}</span>
    </div>
    ${action}
  </article>`;
}

function userEnvironmentCard(environment) {
  const name = environment.name || "Untitled environment";
  const thumbnail = environment.background
    ? `<img class="environment-thumbnail image-thumbnail" src="${backgroundUrl(environment)}" alt="Background for ${escapeHtml(name)}">`
    : `<div class="environment-thumbnail draft-thumbnail" aria-hidden="true">Draft</div>`;
  return `<article class="environment-card draft-card">
    ${thumbnail}
    <div class="environment-card-copy">
      <p class="card-kicker">Saved on this device</p>
      <h2>${escapeHtml(name)}</h2>
      <p>${escapeHtml(draftGuidance(environment))}</p>
      <span class="environment-status draft">Draft</span>
    </div>
    <button class="edit-environment" data-environment-id="${environment.id}" type="button">Edit</button>
  </article>`;
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
      ${starterCard("Park", "Ready to play", "A working sound-matching example.")}
      ${starterCard("Kitchen", "Coming soon", "This starter activity is not ready to play yet.")}
      ${environments.map(userEnvironmentCard).join("")}
    </section>
    <button class="create-environment" type="button">Create environment</button>
    ${recoveryGuidance()}
  </main>`;
  document.querySelector(".create-environment").addEventListener("click", createEnvironment);
  document.querySelectorAll(".edit-environment").forEach((button) => button.addEventListener("click", () => openEditor(button.dataset.environmentId)));
  document.querySelectorAll(".play-starter").forEach((button) => button.addEventListener("click", () => { activeScene = button.dataset.scene; view = "activity"; render(); }));
}

function renderEditor() {
  const background = editingEnvironment.background
    ? `<img src="${backgroundUrl(editingEnvironment)}" alt="Environment background">`
    : `<p>No background yet</p>`;
  const sprites = (editingEnvironment.sprites || []).map(spriteMarkup).join("");
  app.innerHTML = `<main class="editor">
    <header class="editor-header">
      <div>
        <p class="eyebrow">ENVIRONMENT EDITOR</p>
        <h1>Build your activity</h1>
        <p>Changes save automatically on this device.</p>
      </div>
      ${saveStatus()}
      <button class="done-editing" type="button">Done</button>
    </header>
    <section class="editor-workspace">
      <label for="environment-name">Environment name</label>
      <input id="environment-name" value="${escapeHtml(editingEnvironment.name)}" placeholder="Untitled environment">
      <section class="activity-canvas" aria-label="Activity area">${background}${sprites}</section>
      <button class="set-background" type="button">${editingEnvironment.background ? "Change background" : "Set background"}</button>
      <label class="add-sprite">Add sprite image<input class="sprite-file" aria-label="Add sprite image" type="file" accept="image/png,image/jpeg,image/webp"></label>
      ${spriteMessage ? `<p class="sprite-message" role="alert">${escapeHtml(spriteMessage)}</p>` : ""}
      ${undoDeletedSprite ? spriteUndoMarkup() : ""}
      <p class="editor-next-step">${escapeHtml(draftGuidance(editingEnvironment))}</p>
    </section>
    ${recoveryGuidance()}
    ${backgroundModal()}
  </main>`;
  const nameInput = document.querySelector("#environment-name");
  nameInput.focus();
  nameInput.select();
  nameInput.addEventListener("change", () => saveEnvironment({ ...editingEnvironment, name: nameInput.value }));
  document.querySelector(".done-editing").addEventListener("click", () => { view = "library"; backgroundModalOpen = false; spriteMenuOpenId = undefined; spriteMenuMode = "actions"; clearUndoState(); render(); });
  document.querySelector(".set-background").addEventListener("click", () => { backgroundModalOpen = true; backgroundMessage = ""; render(); });
  const spriteFile = document.querySelector(".sprite-file");
  spriteFile.addEventListener("change", () => addSpriteFromFile(spriteFile.files[0]));
  document.querySelectorAll(".editor-sprite").forEach(bindSpriteEvents);
  document.querySelectorAll(".sprite-menu-anchor").forEach(bindSpriteMenuAnchor);
  document.querySelector(".undo-delete-sprite")?.addEventListener("click", undoDeleteSprite);
  const canvas = document.querySelector(".activity-canvas");
  canvas.addEventListener("click", (event) => {
    if (event.target === canvas || event.target.matches(".activity-canvas > img, .activity-canvas > p")) deselectSprite();
  });
  canvas.addEventListener("dragover", (event) => event.preventDefault());
  canvas.addEventListener("drop", (event) => {
    event.preventDefault();
    const file = event.dataTransfer.files[0];
    if (event.dataTransfer.files.length !== 1) {
      spriteMessage = "Drop one image at a time.";
      render();
      return;
    }
    addSpriteFromFile(file, dropPosition(event, canvas));
  });
  bindBackgroundModal();
}

function render() {
  clearRenderObjectUrls();
  if (view === "library") return renderLibrary();
  if (view === "editor") return renderEditor();
  renderActivity();
}

async function imageValidationError(file, validate) {
  const error = validate(file);
  if (error) return error;
  if (!await imageCanDecode(file)) return "This image could not be opened. Choose a PNG, JPEG, or WebP image that is not damaged.";
  return "";
}

async function addSpriteFromFile(file, position = { xPercent: 50, yPercent: 50 }) {
  const error = await imageValidationError(file, validateImage);
  if (error) {
    spriteMessage = error;
    render();
    return;
  }
  spriteMessage = "";
  const sprite = {
    id: crypto.randomUUID(),
    name: spriteNameFromFilename(file.name),
    image: { blob: file.slice(0, file.size, file.type) },
    xPercent: position.xPercent,
    yPercent: position.yPercent,
    sizePercent: defaultSpriteSizePercent,
  };
  await saveEnvironment({ ...editingEnvironment, sprites: [...(editingEnvironment.sprites || []), sprite], selectedSpriteId: sprite.id }, false, true);
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

function showSelectedSprite(id) {
  editingEnvironment.sprites.forEach((sprite, layer) => {
    const selected = sprite.id === id;
    const element = document.querySelector(`.editor-sprite[data-sprite-id="${CSS.escape(sprite.id)}"]`);
    if (element) {
      element.classList.toggle("selected", selected);
      element.setAttribute("aria-pressed", String(selected));
      element.style.zIndex = layer + 1;
    }
    const anchor = document.querySelector(`.sprite-menu-anchor[data-sprite-id="${CSS.escape(sprite.id)}"]`);
    if (anchor) {
      anchor.classList.toggle("selected", selected);
      anchor.style.zIndex = layer + 1;
    }
  });
}

function selectSprite(id) {
  const currentSprites = editingEnvironment.sprites || [];
  if (editingEnvironment.selectedSpriteId === id && currentSprites.at(-1)?.id === id) return;
  if (editingEnvironment.selectedSpriteId !== id) closeSpriteMenu();
  const sprites = bringSpriteToFront(id, currentSprites);
  editingEnvironment = { ...editingEnvironment, sprites, selectedSpriteId: id };
  showSelectedSprite(id);
  saveEnvironment(editingEnvironment);
}

function deselectSprite() {
  if (!editingEnvironment.selectedSpriteId) return;
  closeSpriteMenu();
  editingEnvironment = { ...editingEnvironment, selectedSpriteId: undefined };
  showSelectedSprite();
  saveEnvironment(editingEnvironment);
}

function moveSpriteToFront(id) {
  editingEnvironment = {
    ...editingEnvironment,
    sprites: bringSpriteToFront(id),
    selectedSpriteId: id,
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
  const anchor = document.querySelector(`.sprite-menu-anchor[data-sprite-id="${element.dataset.spriteId}"]`);
  if (anchor) {
    anchor.style.left = element.style.left;
    anchor.style.top = element.style.top;
  }
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
      saveEnvironment(editingEnvironment);
    };
    element.addEventListener("pointermove", move);
    element.addEventListener("pointerup", finish, { once: true });
    element.addEventListener("pointercancel", finish, { once: true });
  });
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
    const sprite = editingEnvironment.sprites.find((item) => item.id === id);
    const open = id === spriteMenuOpenId && sprite;
    const trigger = anchor.querySelector(".sprite-menu-trigger");
    const menu = anchor.querySelector(".sprite-menu");
    trigger.setAttribute("aria-expanded", String(Boolean(open)));
    menu.hidden = !open;
    menu.innerHTML = open ? spriteMenuBodyMarkup(sprite) : "";
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
    spriteMessage = "Sprite name can't be empty.";
    render();
    return;
  }
  spriteMessage = "";
  editingEnvironment = {
    ...editingEnvironment,
    sprites: editingEnvironment.sprites.map((sprite) => sprite.id === id ? { ...sprite, name } : sprite),
  };
  updateSpriteNameDom(id, name);
  closeSpriteMenu();
  saveEnvironment(editingEnvironment);
}

async function replaceSpriteImage(id, file) {
  const error = await imageValidationError(file, validateImage);
  if (error) {
    spriteMessage = error;
    render();
    return;
  }
  spriteMessage = "";
  spriteMenuOpenId = undefined;
  spriteMenuMode = "actions";
  const sprites = editingEnvironment.sprites.map((sprite) => sprite.id === id ? { ...sprite, image: { blob: file.slice(0, file.size, file.type) } } : sprite);
  await saveEnvironment({ ...editingEnvironment, sprites }, false, true);
}

function deleteSprite(id) {
  const index = editingEnvironment.sprites.findIndex((sprite) => sprite.id === id);
  if (index === -1) return;
  const sprite = editingEnvironment.sprites[index];
  const sprites = editingEnvironment.sprites.filter((item) => item.id !== id);
  spriteMenuOpenId = undefined;
  spriteMenuMode = "actions";
  clearTimeout(undoTimeoutId);
  undoDeletedSprite = { sprite, index };
  saveEnvironment({ ...editingEnvironment, sprites, selectedSpriteId: undefined }, false, true);
  undoTimeoutId = window.setTimeout(() => {
    undoDeletedSprite = undefined;
    if (view === "editor") render();
  }, 8000);
}

function undoDeleteSprite() {
  if (!undoDeletedSprite) return;
  clearTimeout(undoTimeoutId);
  const { sprite, index } = undoDeletedSprite;
  undoDeletedSprite = undefined;
  const sprites = [...editingEnvironment.sprites];
  sprites.splice(index, 0, sprite);
  saveEnvironment({ ...editingEnvironment, sprites, selectedSpriteId: sprite.id }, false, true);
}

function clearUndoState() {
  clearTimeout(undoTimeoutId);
  undoDeletedSprite = undefined;
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

function imageCanDecode(file) {
  return new Promise((resolve) => {
    const image = new Image();
    const url = URL.createObjectURL(file);
    const finish = (canDecode) => {
      URL.revokeObjectURL(url);
      resolve(canDecode);
    };
    image.onload = () => finish(true);
    image.onerror = () => finish(false);
    image.src = url;
  });
}

async function selectBackground(file) {
  const error = await imageValidationError(file, validateBackground);
  if (error) {
    backgroundMessage = error;
    render();
    return;
  }
  if (editingEnvironment.background) {
    backgroundConfirmation = { action: "replace", file };
    render();
    return;
  }
  saveBackground(file);
}

async function saveBackground(file) {
  backgroundConfirmation = { action: "none" };
  backgroundMessage = editingEnvironment.background ? "Background replaced." : "Background added.";
  await saveEnvironment({ ...editingEnvironment, background: { blob: file.slice(0, file.size, file.type) } }, false, true);
}

function bindBackgroundModal() {
  const modal = document.querySelector(".background-modal");
  if (!modal) return;
  document.querySelector(".close-background-modal").addEventListener("click", () => {
    backgroundModalOpen = false;
    backgroundConfirmation = { action: "none" };
    render();
  });
  const input = document.querySelector(".background-file");
  input.addEventListener("change", () => selectBackground(input.files[0]));
  const dropZone = document.querySelector(".background-drop-zone");
  dropZone.addEventListener("dragover", (event) => event.preventDefault());
  dropZone.addEventListener("drop", (event) => {
    event.preventDefault();
    selectBackground(event.dataTransfer.files[0]);
  });
  document.querySelector(".remove-background")?.addEventListener("click", () => {
    backgroundConfirmation = { action: "remove" };
    render();
  });
  document.querySelector(".cancel-background-confirmation")?.addEventListener("click", () => {
    backgroundConfirmation = { action: "none" };
    render();
  });
  document.querySelector(".confirm-replace-background")?.addEventListener("click", () => {
    saveBackground(backgroundConfirmation.file);
  });
  document.querySelector(".confirm-remove-background")?.addEventListener("click", async () => {
    backgroundConfirmation = { action: "none" };
    backgroundMessage = "Background removed.";
    await saveEnvironment({ ...editingEnvironment, background: undefined }, false, true);
  });
}

async function createEnvironment() {
  const environment = { id: crypto.randomUUID(), name: "Untitled environment" };
  await saveEnvironment(environment, true);
}

function openEditor(id) {
  editingEnvironment = environments.find((environment) => environment.id === id);
  if (!editingEnvironment) return;
  view = "editor";
  spriteMenuOpenId = undefined;
  spriteMenuMode = "actions";
  clearUndoState();
  render();
}

function updateSaveStatus() {
  const status = document.querySelector(".storage-status");
  if (!status) return;
  status.className = `storage-status ${saveState}`;
  status.textContent = saveState === "saving"
    ? "Saving on this device…"
    : saveState === "failed"
      ? "Could not save on this device"
      : "Saved on this device";
}

function updateSaveGuidance() {
  const guidance = document.querySelector(".storage-guidance");
  if (guidance) guidance.textContent = saveMessage;
}

async function saveEnvironment(environment, openAfterSave = false, renderEditorAfterSave = false) {
  editingEnvironment = environment;
  const existingIndex = environments.findIndex((item) => item.id === environment.id);
  if (existingIndex === -1) environments = [...environments, environment];
  else environments[existingIndex] = environment;
  saveState = "saving";
  saveMessage = "";
  if (view === "editor" && !openAfterSave && !renderEditorAfterSave) updateSaveStatus();
  else render();
  try {
    const save = pendingEnvironmentSave.then(() => environmentStorage.save(environment));
    pendingEnvironmentSave = save.catch(() => {});
    await save;
    saveState = "saved";
    if (openAfterSave) view = "editor";
  } catch (error) {
    saveState = "failed";
    saveMessage = "This environment could not be saved on this device. Check browser storage and try again.";
  }
  if (view === "editor" && !openAfterSave && !renderEditorAfterSave) {
    updateSaveStatus();
    updateSaveGuidance();
  } else render();
}

// Bound once at module scope (unlike the render-scoped listeners above): `document` itself is
// never replaced by a render, so a listener bound inside renderEditor() would duplicate on
// every render instead of being cleaned up with the rest of the editor markup.
document.addEventListener("click", (event) => {
  if (view === "editor" && spriteMenuOpenId && !event.target.closest(".sprite-menu-anchor")) closeSpriteMenu();
});
document.addEventListener("focusin", (event) => {
  if (view === "editor" && spriteMenuOpenId && !event.target.closest(".sprite-menu-anchor")) closeSpriteMenu();
});
document.addEventListener("keydown", (event) => {
  if (view === "editor" && spriteMenuOpenId && event.key === "Escape") closeSpriteMenu(true);
});

async function start() {
  await loadEnvironments();
  render();
}

start();
