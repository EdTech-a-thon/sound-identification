// The Park example is an ordinary environment: a backdrop image plus four sprites with sounds.
// Its artwork is drawn here as SVG and turned into image files the first time it is added, so
// once it is in the library it can be edited, duplicated, and deleted like anything else.

import { measureSpriteImage } from "./image-tools.js";

export const parkEnvironmentId = "park";

const backdropSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1600 900">
  <rect width="1600" height="900" fill="#bce7ed"/>
  <circle cx="1330" cy="150" r="62" fill="#ffd774"/>
  <circle cx="1330" cy="150" r="78" fill="#ffebad" opacity=".45"/>
  <g fill="#fffdf7" opacity=".92">
    <ellipse cx="300" cy="190" rx="90" ry="26"/><circle cx="272" cy="172" r="36"/><circle cx="330" cy="168" r="28"/>
    <ellipse cx="820" cy="270" rx="66" ry="18"/><circle cx="800" cy="256" r="26"/><circle cx="842" cy="254" r="20"/>
  </g>
  <ellipse cx="420" cy="720" rx="760" ry="300" fill="#9bca7d"/>
  <ellipse cx="1260" cy="760" rx="700" ry="250" fill="#78b86d"/>
  <rect y="640" width="1600" height="260" fill="#83bd6d"/>
  <path d="M600 900 C 640 760, 760 720, 800 640 C 840 720, 960 760, 1000 900 Z" fill="#e9d39c"/>
  <g>
    <rect x="182" y="480" width="34" height="180" rx="14" fill="#77563f"/>
    <ellipse cx="200" cy="440" rx="120" ry="110" fill="#438e63"/>
    <ellipse cx="270" cy="410" rx="95" ry="90" fill="#5eaa68"/>
    <ellipse cx="135" cy="405" rx="80" ry="78" fill="#77b96e"/>
  </g>
  <g>
    <rect x="1382" y="450" width="38" height="210" rx="16" fill="#77563f"/>
    <ellipse cx="1400" cy="410" rx="140" ry="125" fill="#438e63"/>
    <ellipse cx="1480" cy="370" rx="105" ry="100" fill="#5eaa68"/>
    <ellipse cx="1320" cy="360" rx="90" ry="88" fill="#77b96e"/>
  </g>
  <g fill="#f7d365">
    <circle cx="330" cy="790" r="9"/><circle cx="360" cy="810" r="9"/><circle cx="390" cy="792" r="9"/>
    <circle cx="1180" cy="800" r="9"/><circle cx="1210" cy="820" r="9"/><circle cx="1240" cy="802" r="9"/>
  </g>
  <g fill="#e57f7d">
    <circle cx="345" cy="800" r="6"/><circle cx="375" cy="802" r="6"/><circle cx="1195" cy="810" r="6"/><circle cx="1225" cy="812" r="6"/>
  </g>
</svg>`;

const spriteSvgs = {
  bird: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200">
    <ellipse cx="96" cy="104" rx="58" ry="48" fill="#447b9a"/>
    <path d="M60 110 C 40 96, 60 70, 100 92 C 90 120, 70 128, 60 110 Z" fill="#2d627f"/>
    <circle cx="130" cy="88" r="7" fill="#fff"/><circle cx="132" cy="88" r="3" fill="#25424a"/>
    <path d="M150 100 L 186 110 L 150 122 Z" fill="#efa563"/>
    <path d="M80 150 L 74 184 M112 150 L 118 184" stroke="#755a40" stroke-width="5" stroke-linecap="round"/>
  </svg>`,
  slide: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200">
    <rect x="40" y="52" width="70" height="14" rx="7" fill="#ef8d67"/>
    <path d="M52 66 L 52 186 M92 66 L 92 186" stroke="#f4a26f" stroke-width="10" stroke-linecap="round"/>
    <path d="M52 92 H 92 M52 118 H 92 M52 144 H 92 M52 170 H 92" stroke="#f4a26f" stroke-width="7" stroke-linecap="round"/>
    <path d="M110 58 C 130 110, 150 160, 190 186" stroke="#f5a370" stroke-width="22" fill="none" stroke-linecap="round"/>
  </svg>`,
  swing: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200">
    <path d="M30 40 L 8 190 M170 40 L 192 190" stroke="#5b6675" stroke-width="12" stroke-linecap="round"/>
    <rect x="18" y="34" width="164" height="14" rx="7" fill="#5b6675"/>
    <path d="M78 48 L 74 150 M122 48 L 126 150" stroke="#e7e3d7" stroke-width="4"/>
    <rect x="66" y="148" width="68" height="16" rx="8" fill="#dd765f"/>
  </svg>`,
  leaves: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200">
    <path d="M60 120 C 40 80, 70 40, 110 42 C 112 90, 90 120, 60 120 Z" fill="#f2c960" transform="rotate(18 80 80)"/>
    <path d="M110 150 C 90 110, 120 70, 160 72 C 162 120, 140 150, 110 150 Z" fill="#f09867" transform="rotate(-24 135 110)"/>
    <path d="M40 176 C 22 140, 50 104, 88 106 C 90 152, 68 180, 40 176 Z" fill="#8fbf6e" transform="rotate(50 60 140)"/>
  </svg>`,
};

const parkSprites = [
  { key: "bird", name: "Bird", xPercent: 49, yPercent: 24, sizePercent: 8, sound: "/sounds/loswin23-bird-chirping-499424.mp3", label: "bird" },
  { key: "slide", name: "Slide", xPercent: 34, yPercent: 62, sizePercent: 14, sound: "/sounds/floraphonic-cute-character-wee-3-188163.mp3", label: "slide" },
  { key: "swing", name: "Swing", xPercent: 70, yPercent: 62, sizePercent: 15, sound: "/sounds/swing-squeak.mp3", label: "swing squeaking" },
  { key: "leaves", name: "Leaves", xPercent: 12, yPercent: 30, sizePercent: 8, sound: "/sounds/leaves_rustling.mp3", label: "rustling leaves" },
];

function rasterize(svg, width, height) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      canvas.getContext("2d").drawImage(image, 0, 0, width, height);
      canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("Could not draw the Park artwork"))), "image/png");
    };
    image.onerror = () => reject(new Error("Could not draw the Park artwork"));
    image.src = url;
  });
}

async function fetchSound(path) {
  const response = await fetch(path);
  if (!response.ok) throw new Error("Could not load a Park sound");
  const blob = await response.blob();
  return blob.type.startsWith("audio/") ? blob : blob.slice(0, blob.size, "audio/mpeg");
}

export async function buildParkEnvironment() {
  const background = await rasterize(backdropSvg, 1600, 900);
  const sprites = await Promise.all(parkSprites.map(async (sprite) => {
    const image = await measureSpriteImage(await rasterize(spriteSvgs[sprite.key], 400, 400));
    return {
      id: `park-${sprite.key}`,
      name: sprite.name,
      xPercent: sprite.xPercent,
      yPercent: sprite.yPercent,
      sizePercent: sprite.sizePercent,
      aspectRatio: image.aspectRatio,
      image: { blob: image.blob },
      sound: { blob: await fetchSound(sprite.sound), label: sprite.label },
    };
  }));
  return { id: parkEnvironmentId, name: "A day at the park", background: { blob: background }, sprites };
}
