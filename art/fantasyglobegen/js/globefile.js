// .globe files: a zip holding manifest.json and one binary file per layer, level and
// diamond, laid out like the grid so that finer tiles can be added later:
//   manifest.json                  format, version, parameters, and one entry per layer
//   layers/<name>/L<n>/d<k>.bin    diamond k: frames × m × m values, frame by frame
//   layers/<name>/L<n>/poles.bin   frames × 2 values: north, south
// A layer entry holds { level, dtype, frames, scale, offset, unit }; integer types store
// round((value − offset) / scale). Everything is little-endian. Entries are deflated with
// the browser's own CompressionStream, so no library is needed, and any zip tool can open
// the file to look inside.

export const FORMAT = 'fantasy-globe';
export const VERSION = 1;

const DTYPES = {
  float32: { bytes: 4 },
  float16: { bytes: 2 },
  int16: { bytes: 2, min: -32768, max: 32767 },
  uint8: { bytes: 1, min: 0, max: 255 },
};

// ---- values ----

const f32 = new Float32Array(1), u32 = new Uint32Array(f32.buffer);

function toHalf(v) {
  f32[0] = v;
  const x = u32[0], sign = (x >>> 16) & 0x8000, e = (x >>> 23) & 0xff, m = x & 0x7fffff;
  if (e === 0xff) return sign | 0x7c00 | (m ? 0x200 : 0);
  const E = e - 127 + 15;
  if (E >= 0x1f) return sign | 0x7c00;
  if (E <= 0) {
    if (E < -10) return sign;
    const mm = (m | 0x800000) >>> (1 - E);
    return sign | ((mm + 0x1000) >>> 13);
  }
  // round to nearest; a carry into the exponent is still correct
  return sign | ((E << 10) + ((m + 0x1000) >>> 13));
}

function fromHalf(h) {
  const sign = h & 0x8000 ? -1 : 1, e = (h >>> 10) & 0x1f, m = h & 0x3ff;
  if (e === 0) return sign * m * 2 ** -24;
  if (e === 0x1f) return m ? NaN : sign * Infinity;
  return sign * (1 + m / 1024) * 2 ** (e - 15);
}

function encodeValues(values, start, count, layer) {
  const { dtype, scale = 1, offset = 0 } = layer, t = DTYPES[dtype];
  const buf = new ArrayBuffer(count * t.bytes), dv = new DataView(buf);
  for (let k = 0; k < count; k++) {
    const v = values[start + k];
    if (dtype === 'float32') dv.setFloat32(4 * k, v, true);
    else if (dtype === 'float16') dv.setUint16(2 * k, toHalf(v), true);
    else {
      const q = Math.max(t.min, Math.min(t.max, Math.round((v - offset) / scale)));
      if (dtype === 'int16') dv.setInt16(2 * k, q, true); else dv.setUint8(k, q);
    }
  }
  return new Uint8Array(buf);
}

function decodeValues(bytes, out, start, count, layer) {
  const { dtype, scale = 1, offset = 0 } = layer;
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (bytes.byteLength !== count * DTYPES[dtype].bytes) throw new Error(`globe file: wrong size for a ${dtype} block`);
  for (let k = 0; k < count; k++) {
    let v;
    if (dtype === 'float32') v = dv.getFloat32(4 * k, true);
    else if (dtype === 'float16') v = fromHalf(dv.getUint16(2 * k, true));
    else v = (dtype === 'int16' ? dv.getInt16(2 * k, true) : dv.getUint8(k)) * scale + offset;
    out[start + k] = v;
  }
}

// ---- zip ----

const CRC = new Uint32Array(256);
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  CRC[n] = c >>> 0;
}
function crc32(b) {
  let c = 0xffffffff;
  for (let i = 0; i < b.length; i++) c = CRC[(c ^ b[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

async function pipe(bytes, stream) {
  return new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(stream)).arrayBuffer());
}

async function zip(entries) {
  const enc = new TextEncoder(), parts = [], central = [];
  let offset = 0;
  const now = new Date();
  const time = (now.getHours() << 11) | (now.getMinutes() << 5) | (now.getSeconds() >> 1);
  const date = ((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate();
  for (const [name, data] of entries) {
    const nameBytes = enc.encode(name), crc = crc32(data);
    const packed = await pipe(data, new CompressionStream('deflate-raw'));
    const method = packed.length < data.length ? 8 : 0, body = method ? packed : data;
    const head = new DataView(new ArrayBuffer(30));
    head.setUint32(0, 0x04034b50, true); head.setUint16(4, 20, true); head.setUint16(6, 0x0800, true);
    head.setUint16(8, method, true); head.setUint16(10, time, true); head.setUint16(12, date, true);
    head.setUint32(14, crc, true); head.setUint32(18, body.length, true); head.setUint32(22, data.length, true);
    head.setUint16(26, nameBytes.length, true); head.setUint16(28, 0, true);
    const cd = new DataView(new ArrayBuffer(46));
    cd.setUint32(0, 0x02014b50, true); cd.setUint16(4, 20, true); cd.setUint16(6, 20, true); cd.setUint16(8, 0x0800, true);
    cd.setUint16(10, method, true); cd.setUint16(12, time, true); cd.setUint16(14, date, true);
    cd.setUint32(16, crc, true); cd.setUint32(20, body.length, true); cd.setUint32(24, data.length, true);
    cd.setUint16(28, nameBytes.length, true); cd.setUint32(42, offset, true);
    parts.push(new Uint8Array(head.buffer), nameBytes, body);
    central.push(new Uint8Array(cd.buffer), nameBytes);
    offset += 30 + nameBytes.length + body.length;
  }
  const cdSize = central.reduce((s, b) => s + b.length, 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true); end.setUint16(8, entries.length, true); end.setUint16(10, entries.length, true);
  end.setUint32(12, cdSize, true); end.setUint32(16, offset, true);
  const all = [...parts, ...central, new Uint8Array(end.buffer)];
  const out = new Uint8Array(all.reduce((s, b) => s + b.length, 0));
  let p = 0;
  for (const b of all) { out.set(b, p); p += b.length; }
  return out;
}

async function unzip(bytes) {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength), dec = new TextDecoder();
  let e = bytes.length - 22;
  while (e >= 0 && dv.getUint32(e, true) !== 0x06054b50) e--;
  if (e < 0) throw new Error('not a .globe file (no zip directory found)');
  const n = dv.getUint16(e + 10, true);
  let c = dv.getUint32(e + 16, true);
  const files = new Map();
  for (let k = 0; k < n; k++) {
    if (dv.getUint32(c, true) !== 0x02014b50) throw new Error('globe file: damaged zip directory');
    const method = dv.getUint16(c + 10, true), crc = dv.getUint32(c + 16, true);
    const size = dv.getUint32(c + 20, true), nameLen = dv.getUint16(c + 28, true);
    const extraLen = dv.getUint16(c + 30, true), commentLen = dv.getUint16(c + 32, true);
    const local = dv.getUint32(c + 42, true);
    const name = dec.decode(bytes.subarray(c + 46, c + 46 + nameLen));
    const start = local + 30 + dv.getUint16(local + 26, true) + dv.getUint16(local + 28, true);
    const raw = bytes.subarray(start, start + size);
    if (method !== 8 && method !== 0) throw new Error(`globe file: ${name} uses an unsupported compression`);
    let data = raw;
    if (method === 8) {
      try { data = await pipe(raw, new DecompressionStream('deflate-raw')); }
      catch { throw new Error(`globe file: ${name} is damaged (can't decompress)`); }
    }
    if (crc32(data) !== crc) throw new Error(`globe file: ${name} is damaged (checksum)`);
    if (!name.endsWith('/')) files.set(name, data);
    c += 46 + nameLen + extraLen + commentLen;
  }
  return files;
}

// ---- globes ----

// globe = { params: {...}, layers: { name: { level, dtype, frames?, scale?, offset?, unit?, values } } }
// where values is a Float32Array of frames × (10·4ⁿ + 2), frame by frame, in cell-id order
export async function encodeGlobe(globe) {
  const manifest = { format: FORMAT, version: VERSION, created: new Date().toISOString(), params: globe.params || {}, layers: {} };
  const entries = [];
  for (const [name, layer] of Object.entries(globe.layers)) {
    if (!/^[\w-]+$/.test(name)) throw new Error(`layer name "${name}": letters, digits, - and _ only`);
    const { values, ...meta } = layer;
    meta.frames = meta.frames || 1;
    if (!DTYPES[meta.dtype]) throw new Error(`layer ${name}: unknown type ${meta.dtype}`);
    const m = 1 << meta.level, mm = m * m, N = 10 * mm + 2;
    if (values.length !== meta.frames * N) throw new Error(`layer ${name}: expected ${meta.frames} × ${N} values`);
    manifest.layers[name] = meta;
    const dir = `layers/${name}/L${meta.level}/`;
    for (let d = 0; d < 10; d++) {
      const block = new Uint8Array(meta.frames * mm * DTYPES[meta.dtype].bytes);
      for (let f = 0; f < meta.frames; f++) block.set(encodeValues(values, f * N + d * mm, mm, meta), f * mm * DTYPES[meta.dtype].bytes);
      entries.push([`${dir}d${d}.bin`, block]);
    }
    const poles = new Float32Array(2 * meta.frames);
    for (let f = 0; f < meta.frames; f++) { poles[2 * f] = values[f * N + 10 * mm]; poles[2 * f + 1] = values[f * N + 10 * mm + 1]; }
    entries.push([`${dir}poles.bin`, encodeValues(poles, 0, poles.length, meta)]);
  }
  entries.unshift(['manifest.json', new TextEncoder().encode(JSON.stringify(manifest, null, 2))]);
  return zip(entries);
}

export async function decodeGlobe(bytes) {
  const files = await unzip(bytes);
  const mf = files.get('manifest.json');
  if (!mf) throw new Error('not a .globe file (no manifest.json)');
  const manifest = JSON.parse(new TextDecoder().decode(mf));
  if (manifest.format !== FORMAT) throw new Error('not a .globe file');
  if (manifest.version > VERSION) throw new Error(`this .globe file is version ${manifest.version}; this page reads up to ${VERSION}`);
  const layers = {};
  for (const [name, meta] of Object.entries(manifest.layers)) {
    const frames = meta.frames || 1, m = 1 << meta.level, mm = m * m, N = 10 * mm + 2;
    const values = new Float32Array(frames * N), dir = `layers/${name}/L${meta.level}/`;
    const block = new Float32Array(frames * mm);
    for (let d = 0; d < 10; d++) {
      const b = files.get(`${dir}d${d}.bin`);
      if (!b) throw new Error(`globe file: ${dir}d${d}.bin is missing`);
      decodeValues(b, block, 0, frames * mm, meta);
      for (let f = 0; f < frames; f++) values.set(block.subarray(f * mm, (f + 1) * mm), f * N + d * mm);
    }
    const p = files.get(`${dir}poles.bin`), poles = new Float32Array(2 * frames);
    if (!p) throw new Error(`globe file: ${dir}poles.bin is missing`);
    decodeValues(p, poles, 0, 2 * frames, meta);
    for (let f = 0; f < frames; f++) { values[f * N + 10 * mm] = poles[2 * f]; values[f * N + 10 * mm + 1] = poles[2 * f + 1]; }
    layers[name] = { ...meta, frames, values };
  }
  return { params: manifest.params || {}, created: manifest.created, layers };
}
