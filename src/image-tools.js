// Sprite images are measured when they arrive so their box on the activity area can match the
// picture instead of always being a square. Fully transparent margins (common in cut-out PNGs)
// are trimmed away first, so the box hugs what is actually drawn.

const alphaThreshold = 8;

function loadImage(blob) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Image could not be read"));
    };
    image.src = url;
  });
}

// The smallest rectangle containing every pixel that is not (nearly) transparent.
function opaqueBounds(context, width, height) {
  const { data } = context.getImageData(0, 0, width, height);
  let top = height;
  let bottom = -1;
  let left = width;
  let right = -1;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (data[(y * width + x) * 4 + 3] <= alphaThreshold) continue;
      if (y < top) top = y;
      if (y > bottom) bottom = y;
      if (x < left) left = x;
      if (x > right) right = x;
    }
  }
  if (bottom < 0) return null;
  return { x: left, y: top, width: right - left + 1, height: bottom - top + 1 };
}

function toBlob(canvas, type) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("Image could not be saved"))), type);
  });
}

// Returns the image to keep and its width-to-height ratio. JPEGs have no transparency, so they
// are kept exactly as uploaded; PNG and WebP are trimmed only when that changes something.
export async function measureSpriteImage(file) {
  const untouched = { blob: file.slice(0, file.size, file.type), aspectRatio: 1 };
  let image;
  try {
    image = await loadImage(file);
  } catch (error) {
    return untouched;
  }
  const { naturalWidth: width, naturalHeight: height } = image;
  if (!width || !height) return untouched;
  untouched.aspectRatio = width / height;
  if (file.type === "image/jpeg") return untouched;

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  context.drawImage(image, 0, 0);
  let bounds;
  try {
    bounds = opaqueBounds(context, width, height);
  } catch (error) {
    return untouched;
  }
  if (!bounds) return untouched;
  if (bounds.x === 0 && bounds.y === 0 && bounds.width === width && bounds.height === height) return untouched;

  const trimmed = document.createElement("canvas");
  trimmed.width = bounds.width;
  trimmed.height = bounds.height;
  trimmed.getContext("2d").drawImage(canvas, bounds.x, bounds.y, bounds.width, bounds.height, 0, 0, bounds.width, bounds.height);
  try {
    return { blob: await toBlob(trimmed, "image/png"), aspectRatio: bounds.width / bounds.height };
  } catch (error) {
    return untouched;
  }
}
