// A small reader and writer for ordinary .zip files, enough to bundle an environment's files
// and read them back. Files are stored without compression — images and sounds are already
// compressed, so there is nothing to gain — but zips made by other tools (which usually use
// "deflate") can still be read.

const localHeaderSignature = 0x04034b50;
const centralHeaderSignature = 0x02014b50;
const endOfCentralDirectorySignature = 0x06054b50;
const utf8NamesFlag = 0x0800;
const storedMethod = 0;
const deflatedMethod = 8;

const crcTable = new Uint32Array(256).map((_, index) => {
  let value = index;
  for (let bit = 0; bit < 8; bit += 1) value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  return value >>> 0;
});

function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

// Zip timestamps use MS-DOS packing: two 16-bit numbers for the time and the date.
function dosDateTime(date) {
  const time = (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2);
  const day = ((date.getFullYear() - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate();
  return { time, day };
}

function concatBytes(parts) {
  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    bytes.set(part, offset);
    offset += part.length;
  }
  return bytes;
}

function fieldWriter(size) {
  const bytes = new Uint8Array(size);
  const view = new DataView(bytes.buffer);
  let offset = 0;
  return {
    bytes,
    u16: (value) => { view.setUint16(offset, value, true); offset += 2; },
    u32: (value) => { view.setUint32(offset, value >>> 0, true); offset += 4; },
  };
}

// entries: [{ name, bytes: Uint8Array }] — returns the whole zip as bytes.
export function writeZip(entries) {
  const encoder = new TextEncoder();
  const { time, day } = dosDateTime(new Date());
  const localParts = [];
  const centralParts = [];
  let offset = 0;

  for (const entry of entries) {
    const name = encoder.encode(entry.name);
    const crc = crc32(entry.bytes);
    const size = entry.bytes.length;

    const local = fieldWriter(30);
    local.u32(localHeaderSignature);
    local.u16(20); local.u16(utf8NamesFlag); local.u16(storedMethod);
    local.u16(time); local.u16(day);
    local.u32(crc); local.u32(size); local.u32(size);
    local.u16(name.length); local.u16(0);
    localParts.push(local.bytes, name, entry.bytes);

    const central = fieldWriter(46);
    central.u32(centralHeaderSignature);
    central.u16(20); central.u16(20); central.u16(utf8NamesFlag); central.u16(storedMethod);
    central.u16(time); central.u16(day);
    central.u32(crc); central.u32(size); central.u32(size);
    central.u16(name.length); central.u16(0); central.u16(0);
    central.u16(0); central.u16(0); central.u32(0);
    central.u32(offset);
    centralParts.push(central.bytes, name);

    offset += 30 + name.length + size;
  }

  const centralDirectory = concatBytes(centralParts);
  const end = fieldWriter(22);
  end.u32(endOfCentralDirectorySignature);
  end.u16(0); end.u16(0);
  end.u16(entries.length); end.u16(entries.length);
  end.u32(centralDirectory.length); end.u32(offset);
  end.u16(0);

  return concatBytes([...localParts, centralDirectory, end.bytes]);
}

async function inflate(bytes) {
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

function findEndOfCentralDirectory(view) {
  // The end record sits at the very end of the file, after an optional comment of up to 64 KB.
  const earliest = Math.max(0, view.byteLength - 22 - 0xffff);
  for (let position = view.byteLength - 22; position >= earliest; position -= 1) {
    if (view.getUint32(position, true) === endOfCentralDirectorySignature) return position;
  }
  throw new Error("Not a zip file");
}

// Returns a Map of file name → Uint8Array for every file in the zip.
export async function readZip(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (bytes.length < 22) throw new Error("Not a zip file");
  const endPosition = findEndOfCentralDirectory(view);
  const entryCount = view.getUint16(endPosition + 10, true);
  let position = view.getUint32(endPosition + 16, true);
  const decoder = new TextDecoder();
  const files = new Map();

  for (let index = 0; index < entryCount; index += 1) {
    if (view.getUint32(position, true) !== centralHeaderSignature) throw new Error("Not a zip file");
    const method = view.getUint16(position + 10, true);
    const compressedSize = view.getUint32(position + 20, true);
    const nameLength = view.getUint16(position + 28, true);
    const extraLength = view.getUint16(position + 30, true);
    const commentLength = view.getUint16(position + 32, true);
    const localOffset = view.getUint32(position + 42, true);
    const name = decoder.decode(bytes.subarray(position + 46, position + 46 + nameLength));
    position += 46 + nameLength + extraLength + commentLength;

    if (view.getUint32(localOffset, true) !== localHeaderSignature) throw new Error("Not a zip file");
    const dataStart = localOffset + 30
      + view.getUint16(localOffset + 26, true)
      + view.getUint16(localOffset + 28, true);
    const data = bytes.subarray(dataStart, dataStart + compressedSize);

    if (name.endsWith("/")) continue;
    if (method === storedMethod) files.set(name, data);
    else if (method === deflatedMethod) files.set(name, await inflate(data));
    else throw new Error("Unsupported zip compression");
  }

  return files;
}
