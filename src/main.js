import "./style.css";

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

function render() {
  const scene = scenes[activeScene];
  app.innerHTML = `<main class="park"><header><p class="eyebrow">SOUND EXPLORER</p><div class="heading-row"><div><h1>${scene.title}</h1><p>${scene.description}</p></div><div class="scene-menu" aria-label="Choose a scene"><button class="scene-choice ${activeScene === "park" ? "active" : ""}" data-scene="park">Park</button><button class="scene-choice ${activeScene === "kitchen" ? "active" : ""}" data-scene="kitchen">Kitchen</button></div></div><div class="listen-panel"><button class="listen-button" type="button"><span>▶</span> Listen to the sound</button><button class="stop-button" type="button">■ Stop</button><button class="new-sound" type="button">New sound</button><label class="round-picker">Rounds <select aria-label="Number of practice rounds">${[1, 3, 5, 10].map((count) => `<option value="${count}" ${count === roundCount ? "selected" : ""}>${count}</option>`).join("")}</select></label><button class="manage-sprites" type="button">Add sprite</button><button class="manage-sounds" type="button">Manage sounds</button></div><p class="round-progress">Round ${Math.min(completedRounds + 1, roundCount)} of ${roundCount}</p></header>${activeScene === "park" ? parkScene() : kitchenScene()}<p class="message" role="status"></p>${managementModal()}${spriteModal()}</main>`;
  bindControls();
  chooseSound();
}

function bindControls() {
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

render();
