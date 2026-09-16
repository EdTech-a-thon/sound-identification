// A small sound player drawn by hand: a play/pause control, the sound's waveform, and a marker
// that moves through it. It replaces the browser's own audio controls so the sound window looks
// like the rest of Everyday Sound Lab.

const barCount = 48;

async function waveformBars(blob) {
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) return null;
  const context = new AudioContextClass();
  try {
    const buffer = await context.decodeAudioData(await blob.arrayBuffer());
    const samples = buffer.getChannelData(0);
    const chunk = Math.max(1, Math.floor(samples.length / barCount));
    const bars = [];
    for (let index = 0; index < barCount; index += 1) {
      let peak = 0;
      const start = index * chunk;
      const end = Math.min(samples.length, start + chunk);
      for (let position = start; position < end; position += 1) {
        const value = Math.abs(samples[position]);
        if (value > peak) peak = value;
      }
      bars.push(peak);
    }
    const loudest = Math.max(...bars, 0.001);
    // Quiet passages are lifted a little (square root) so a soft sound still shows its shape.
    return bars.map((peak) => Math.sqrt(peak / loudest));
  } catch (error) {
    return null;
  } finally {
    context.close().catch(() => {});
  }
}

function barsMarkup(bars) {
  const heights = bars || Array.from({ length: barCount }, () => 0.12);
  return heights.map((height) => `<i style="height:${Math.max(6, Math.round(height * 100))}%"></i>`).join("");
}

function formatTime(seconds) {
  if (!Number.isFinite(seconds)) return "0:00";
  const whole = Math.floor(seconds);
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, "0")}`;
}

const playIcon = `<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path class="solid" d="m8.5 5.4 10.4 6.6-10.4 6.6z"/></svg>`;
const pauseIcon = `<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><rect class="solid" x="6.5" y="5" width="4" height="14" rx="1"/><rect class="solid" x="13.5" y="5" width="4" height="14" rx="1"/></svg>`;

// Mounts the player inside `container`. The container is expected to be replaced (not reused)
// when the modal closes, so the object URL is released when the audio element goes away.
export function mountWaveformPlayer(container, blob) {
  const url = URL.createObjectURL(blob);
  container.innerHTML = `
    <button type="button" class="waveform-toggle" aria-label="Play sound" aria-pressed="false">${playIcon}</button>
    <div class="waveform-track" role="slider" aria-label="Position in sound" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0" tabindex="0">
      <div class="waveform-bars">${barsMarkup(null)}</div>
      <div class="waveform-progress"><div class="waveform-bars">${barsMarkup(null)}</div></div>
    </div>
    <span class="waveform-time">0:00</span>`;
  const toggle = container.querySelector(".waveform-toggle");
  const track = container.querySelector(".waveform-track");
  const progress = container.querySelector(".waveform-progress");
  const time = container.querySelector(".waveform-time");
  const audio = new Audio(url);
  audio.preload = "metadata";

  const showPlaying = (playing) => {
    toggle.innerHTML = playing ? pauseIcon : playIcon;
    toggle.setAttribute("aria-label", playing ? "Pause sound" : "Play sound");
    toggle.setAttribute("aria-pressed", String(playing));
  };
  const showPosition = () => {
    const fraction = audio.duration ? audio.currentTime / audio.duration : 0;
    progress.style.clipPath = `inset(0 ${100 - fraction * 100}% 0 0)`;
    track.setAttribute("aria-valuenow", String(Math.round(fraction * 100)));
    time.textContent = `${formatTime(audio.currentTime)} / ${formatTime(audio.duration)}`;
  };
  const seekTo = (clientX) => {
    if (!audio.duration) return;
    const bounds = track.getBoundingClientRect();
    const fraction = Math.max(0, Math.min(1, (clientX - bounds.left) / bounds.width));
    audio.currentTime = fraction * audio.duration;
    showPosition();
  };

  toggle.addEventListener("click", () => {
    if (audio.paused) audio.play().catch(() => {});
    else audio.pause();
  });
  audio.addEventListener("play", () => showPlaying(true));
  audio.addEventListener("pause", () => showPlaying(false));
  audio.addEventListener("ended", () => { audio.currentTime = 0; showPosition(); });
  audio.addEventListener("timeupdate", showPosition);
  audio.addEventListener("loadedmetadata", showPosition);
  audio.addEventListener("error", () => {
    time.textContent = "Could not play";
    toggle.disabled = true;
  });
  track.addEventListener("pointerdown", (event) => {
    track.setPointerCapture(event.pointerId);
    seekTo(event.clientX);
    const move = (moveEvent) => seekTo(moveEvent.clientX);
    const finish = () => {
      track.removeEventListener("pointermove", move);
      track.removeEventListener("pointerup", finish);
      track.removeEventListener("pointercancel", finish);
    };
    track.addEventListener("pointermove", move);
    track.addEventListener("pointerup", finish);
    track.addEventListener("pointercancel", finish);
  });
  track.addEventListener("keydown", (event) => {
    if (!audio.duration) return;
    const step = audio.duration / 20;
    if (event.key === "ArrowRight") audio.currentTime = Math.min(audio.duration, audio.currentTime + step);
    else if (event.key === "ArrowLeft") audio.currentTime = Math.max(0, audio.currentTime - step);
    else if (event.key === " ") toggle.click();
    else return;
    event.preventDefault();
    showPosition();
  });

  // Stop and release the sound as soon as the player leaves the page.
  const observer = new MutationObserver(() => {
    if (document.body.contains(container)) return;
    audio.pause();
    URL.revokeObjectURL(url);
    observer.disconnect();
  });
  observer.observe(document.body, { childList: true, subtree: true });

  waveformBars(blob).then((bars) => {
    if (!bars || !document.body.contains(container)) return;
    container.querySelectorAll(".waveform-bars").forEach((element) => { element.innerHTML = barsMarkup(bars); });
  });
  return audio;
}
