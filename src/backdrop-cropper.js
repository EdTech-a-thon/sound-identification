// The backdrop cropper: the picture sits inside a frame shaped like the activity area, and the
// educator drags it around and zooms in or out until the right part fills the frame. Nothing is
// stretched — the frame simply shows which part of the picture will be kept.

const outputWidth = 1600;
const maxZoom = 4;

function loadImage(url) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Image could not be read"));
    image.src = url;
  });
}

export function openBackdropCropper({ file, aspectRatio, onConfirm, onCancel }) {
  const url = URL.createObjectURL(file);
  const root = document.createElement("div");
  root.className = "modal-backdrop backdrop-cropper";
  root.innerHTML = `
    <section class="cropper-modal" role="dialog" aria-modal="true" aria-labelledby="cropper-title">
      <button class="close-cropper close-modal" type="button" aria-label="Close"><svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18"/></svg></button>
      <p class="eyebrow">ENVIRONMENT BACKDROP</p>
      <h2 id="cropper-title">Position your backdrop</h2>
      <p class="modal-copy">Drag the picture to move it and use the slider (or pinch) to zoom. Everything inside the frame becomes the activity area.</p>
      <div class="cropper-frame" style="aspect-ratio:${aspectRatio}">
        <img class="cropper-image" alt="" draggable="false">
        <div class="cropper-grid" aria-hidden="true"><i></i><i></i><i></i><i></i></div>
      </div>
      <label class="cropper-zoom">Zoom<input class="cropper-zoom-slider" type="range" min="1" max="${maxZoom}" step="0.01" value="1" aria-label="Zoom"></label>
      <div class="modal-actions">
        <button class="cancel-cropper" type="button">Cancel</button>
        <button class="confirm-cropper" type="button">Use as backdrop</button>
      </div>
    </section>`;
  document.body.append(root);

  const frame = root.querySelector(".cropper-frame");
  const imageElement = root.querySelector(".cropper-image");
  const slider = root.querySelector(".cropper-zoom-slider");
  const state = { zoom: 1, x: 0, y: 0, image: undefined, cover: 1 };
  const pointers = new Map();
  let pinchStart;

  function frameSize() {
    const bounds = frame.getBoundingClientRect();
    return { width: bounds.width, height: bounds.height };
  }

  // At zoom 1 the picture just covers the frame; every zoom multiplies that.
  function scale() {
    return state.cover * state.zoom;
  }

  function clampOffset() {
    const { width, height } = frameSize();
    const drawnWidth = state.image.naturalWidth * scale();
    const drawnHeight = state.image.naturalHeight * scale();
    const maxX = Math.max(0, (drawnWidth - width) / 2);
    const maxY = Math.max(0, (drawnHeight - height) / 2);
    state.x = Math.max(-maxX, Math.min(maxX, state.x));
    state.y = Math.max(-maxY, Math.min(maxY, state.y));
  }

  function draw() {
    if (!state.image) return;
    clampOffset();
    const drawnWidth = state.image.naturalWidth * scale();
    imageElement.style.width = `${drawnWidth}px`;
    imageElement.style.transform = `translate(calc(-50% + ${state.x}px), calc(-50% + ${state.y}px))`;
    slider.value = String(state.zoom);
  }

  function setZoom(zoom, focus) {
    const next = Math.max(1, Math.min(maxZoom, zoom));
    if (focus) {
      // Keep the point under the pointer still while zooming around it.
      const ratio = next / state.zoom;
      state.x = focus.x - (focus.x - state.x) * ratio;
      state.y = focus.y - (focus.y - state.y) * ratio;
    }
    state.zoom = next;
    draw();
  }

  function pointInFrame(event) {
    const bounds = frame.getBoundingClientRect();
    return { x: event.clientX - bounds.left - bounds.width / 2, y: event.clientY - bounds.top - bounds.height / 2 };
  }

  function close() {
    URL.revokeObjectURL(url);
    window.removeEventListener("resize", fit);
    document.removeEventListener("keydown", onKey);
    root.remove();
  }

  function cancel() {
    close();
    onCancel?.();
  }

  function onKey(event) {
    if (event.key === "Escape") {
      event.stopPropagation();
      cancel();
    }
  }

  function fit() {
    if (!state.image) return;
    const { width, height } = frameSize();
    state.cover = Math.max(width / state.image.naturalWidth, height / state.image.naturalHeight);
    draw();
  }

  async function confirm() {
    if (!state.image) return;
    const { width, height } = frameSize();
    const drawn = scale();
    // The frame's top-left corner in picture pixels, then the frame itself in picture pixels.
    const sourceX = (state.image.naturalWidth * drawn / 2 - width / 2 - state.x) / drawn;
    const sourceY = (state.image.naturalHeight * drawn / 2 - height / 2 - state.y) / drawn;
    const sourceWidth = width / drawn;
    const sourceHeight = height / drawn;
    const canvas = document.createElement("canvas");
    canvas.width = outputWidth;
    canvas.height = Math.round(outputWidth / aspectRatio);
    const context = canvas.getContext("2d");
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(state.image, sourceX, sourceY, sourceWidth, sourceHeight, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.9));
    close();
    if (blob) onConfirm(blob);
    else onCancel?.();
  }

  frame.addEventListener("pointerdown", (event) => {
    event.preventDefault();
    frame.setPointerCapture(event.pointerId);
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pointers.size === 2) {
      const [first, second] = [...pointers.values()];
      pinchStart = { distance: Math.hypot(first.x - second.x, first.y - second.y), zoom: state.zoom };
    }
  });
  frame.addEventListener("pointermove", (event) => {
    const previous = pointers.get(event.pointerId);
    if (!previous) return;
    const current = { x: event.clientX, y: event.clientY };
    pointers.set(event.pointerId, current);
    if (pointers.size === 2 && pinchStart) {
      const [first, second] = [...pointers.values()];
      const distance = Math.hypot(first.x - second.x, first.y - second.y);
      setZoom(pinchStart.zoom * (distance / pinchStart.distance));
      return;
    }
    state.x += current.x - previous.x;
    state.y += current.y - previous.y;
    draw();
  });
  const release = (event) => {
    pointers.delete(event.pointerId);
    if (pointers.size < 2) pinchStart = undefined;
  };
  frame.addEventListener("pointerup", release);
  frame.addEventListener("pointercancel", release);
  frame.addEventListener("wheel", (event) => {
    event.preventDefault();
    setZoom(state.zoom * Math.exp(-event.deltaY / 400), pointInFrame(event));
  }, { passive: false });
  slider.addEventListener("input", () => setZoom(Number(slider.value)));
  root.querySelector(".close-cropper").addEventListener("click", cancel);
  root.querySelector(".cancel-cropper").addEventListener("click", cancel);
  root.querySelector(".confirm-cropper").addEventListener("click", confirm);
  root.addEventListener("click", (event) => {
    if (event.target === root) cancel();
  });
  document.addEventListener("keydown", onKey);
  window.addEventListener("resize", fit);

  loadImage(url).then((image) => {
    state.image = image;
    imageElement.src = url;
    fit();
    root.querySelector(".confirm-cropper").focus();
  }).catch(cancel);

  return { close: cancel };
}
