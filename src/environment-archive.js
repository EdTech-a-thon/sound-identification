// An environment can be shared as a single .zip file. Inside it, environment.json describes the
// environment and points at the media files stored alongside it:
//
//   environment.json
//   backdrop.png             (only when the backdrop is an image)
//   sprites/1-bird.png
//   sounds/1-bird.mp3
//
// Importing reads that back into a brand-new environment with fresh identities, so a shared file
// can be imported more than once without colliding with anything already on the device.

import { readZip, writeZip } from "./zip-file.js";

const archiveFormat = "sound-explorer-environment";
const manifestName = "environment.json";

const extensions = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/gif": "gif",
  "image/webp": "webp",
  "image/svg+xml": "svg",
  "audio/mpeg": "mp3",
  "audio/mp3": "mp3",
  "audio/wav": "wav",
  "audio/x-wav": "wav",
  "audio/ogg": "ogg",
  "audio/mp4": "m4a",
  "audio/x-m4a": "m4a",
  "audio/aac": "aac",
  "audio/webm": "webm",
  "audio/flac": "flac",
};

function fileName(folder, index, name, blob) {
  const slug = (name || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "file";
  return `${folder}/${index + 1}-${slug}.${extensions[blob.type] || "bin"}`;
}

async function bytesOf(blob) {
  return new Uint8Array(await blob.arrayBuffer());
}

// Everything worth sharing goes in; identities stay behind because the importer makes new ones.
export async function packEnvironment(environment) {
  const files = [];
  const addFile = async (name, blob) => {
    files.push({ name, bytes: await bytesOf(blob) });
    return { file: name, type: blob.type };
  };

  const background = environment.background?.blob
    ? { kind: "image", ...(await addFile(`backdrop.${extensions[environment.background.blob.type] || "bin"}`, environment.background.blob)) }
    : environment.background?.kind === "blank" ? { kind: "blank" } : { kind: "none" };

  const sprites = [];
  for (const [index, sprite] of (environment.sprites || []).entries()) {
    sprites.push({
      name: sprite.name,
      xPercent: sprite.xPercent,
      yPercent: sprite.yPercent,
      sizePercent: sprite.sizePercent,
      aspectRatio: sprite.aspectRatio,
      rotationDegrees: sprite.rotationDegrees || 0,
      image: await addFile(fileName("sprites", index, sprite.name, sprite.image.blob), sprite.image.blob),
      sound: sprite.sound?.blob
        ? { label: sprite.sound.label, ...(await addFile(fileName("sounds", index, sprite.name, sprite.sound.blob), sprite.sound.blob)) }
        : undefined,
    });
  }

  const manifest = { format: archiveFormat, version: 1, name: environment.name, background, sprites };
  files.unshift({ name: manifestName, bytes: new TextEncoder().encode(JSON.stringify(manifest, null, 2)) });
  return new Blob([writeZip(files)], { type: "application/zip" });
}

export function archiveFileName(environment) {
  const name = (environment.name || "Untitled environment").replace(/[\\/:*?"<>|]+/g, " ").trim();
  return `${name || "Untitled environment"}.zip`;
}

function isNumber(value) {
  return typeof value === "number" && Number.isFinite(value);
}

function mediaFrom(files, media, kind) {
  if (!media || typeof media.file !== "string") throw new Error("This file is not an Everyday Sound Lab environment.");
  const bytes = files.get(media.file);
  if (!bytes) throw new Error(`This environment is missing a ${kind} file (${media.file}).`);
  return new Blob([bytes], { type: typeof media.type === "string" ? media.type : "" });
}

// Turns a shared .zip file into an environment ready to be saved on this device. Anything that
// does not look like an environment made by Everyday Sound Lab is rejected with a plain reason.
export async function unpackEnvironment(file) {
  let files;
  try {
    files = await readZip(new Uint8Array(await file.arrayBuffer()));
  } catch (error) {
    throw new Error("This file is not an Everyday Sound Lab environment.");
  }

  const manifestBytes = files.get(manifestName);
  let manifest;
  try {
    manifest = JSON.parse(new TextDecoder().decode(manifestBytes));
  } catch (error) {
    throw new Error("This file is not an Everyday Sound Lab environment.");
  }
  if (manifest?.format !== archiveFormat || typeof manifest.name !== "string" || !Array.isArray(manifest.sprites)) {
    throw new Error("This file is not an Everyday Sound Lab environment.");
  }

  let background;
  if (manifest.background?.kind === "image") background = { blob: mediaFrom(files, manifest.background, "backdrop") };
  else if (manifest.background?.kind === "blank") background = { kind: "blank" };

  const sprites = manifest.sprites.map((sprite) => {
    if (!sprite || typeof sprite.name !== "string" || !isNumber(sprite.xPercent) || !isNumber(sprite.yPercent) || !isNumber(sprite.sizePercent)) {
      throw new Error("This file is not an Everyday Sound Lab environment.");
    }
    return {
      id: crypto.randomUUID(),
      name: sprite.name,
      xPercent: sprite.xPercent,
      yPercent: sprite.yPercent,
      sizePercent: sprite.sizePercent,
      aspectRatio: isNumber(sprite.aspectRatio) ? sprite.aspectRatio : undefined,
      rotationDegrees: isNumber(sprite.rotationDegrees) ? sprite.rotationDegrees : 0,
      image: { blob: mediaFrom(files, sprite.image, "sprite image") },
      sound: sprite.sound
        ? { blob: mediaFrom(files, sprite.sound, "sound"), label: typeof sprite.sound.label === "string" ? sprite.sound.label : sprite.name }
        : undefined,
    };
  });

  return { id: crypto.randomUUID(), name: manifest.name, background, sprites };
}
