#!/usr/bin/env node
'use strict';
/**
 * Task 103: builds the files handed over after every three tasks
 * (docs/BLUEPRINT_V3.md, 20장):
 *
 *   dist/chaegul-gongbang-<label>.zip          index.html + css/ + js/ (+ any assets/), unzip and open index.html
 *   dist/chaegul-gongbang-<label>-single.html  one file with the CSS and every script inlined (for phones)
 *
 * Run:  node tools/build-dist.js [label]     (label defaults to the short git commit)
 *
 * No dependencies: the ZIP is written with Node's zlib (deflate) and a CRC-32
 * table. The game files are copied as they are; nothing in the game changes.
 */
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const ROOT = path.join(__dirname, '..');
const GAME_DIRS = ['css', 'js', 'assets']; // assets/ does not exist yet; picked up when it does

// Files that make up the runnable game, relative to the repo root (sorted, stable).
function gameFiles(root) {
  const out = ['index.html'];
  GAME_DIRS.forEach((dir) => {
    const walk = (rel) => {
      const abs = path.join(root, rel);
      if (!fs.existsSync(abs)) return;
      fs.readdirSync(abs).sort().forEach((name) => {
        const r = rel + '/' + name;
        if (fs.statSync(path.join(root, r)).isDirectory()) walk(r); else out.push(r);
      });
    };
    walk(dir);
  });
  return out;
}

// index.html with the stylesheet and every local <script src> inlined, in page order.
function buildSingleHtml(root) {
  const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');
  let html = read('index.html');
  html = html.replace(/<link rel="stylesheet" href="(css\/[^"]+)">/g, (m, href) => '<style>\n' + read(href) + '\n</style>');
  html = html.replace(/<script src="(js\/[^"]+)"><\/script>/g, (m, src) => {
    const code = read(src);
    if (/<\/script/i.test(code)) throw new Error(src + ' contains "</script" and cannot be inlined');
    return '<script>/* ' + src + ' */\n' + code + '\n</script>';
  });
  if (/<script src="js\//.test(html) || /href="css\//.test(html)) throw new Error('a local file was left un-inlined');
  return html;
}

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; }
  return t;
})();
function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

// A plain ZIP (deflate) of the given { name, data } entries, all under one folder.
function buildZip(entries, folder) {
  const locals = [], centrals = [];
  let offset = 0;
  const dosTime = 0, dosDate = (2026 - 1980) << 9 | 10 << 5 | 15; // fixed date: builds of the same files are identical
  entries.forEach(({ name, data }) => {
    const fname = Buffer.from(folder + '/' + name, 'utf8');
    const comp = zlib.deflateRawSync(data, { level: 9 });
    const crc = crc32(data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4); local.writeUInt16LE(0x0800, 6); local.writeUInt16LE(8, 8);
    local.writeUInt16LE(dosTime, 10); local.writeUInt16LE(dosDate, 12); local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(comp.length, 18); local.writeUInt32LE(data.length, 22); local.writeUInt16LE(fname.length, 26); local.writeUInt16LE(0, 28);
    locals.push(local, fname, comp);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0); central.writeUInt16LE(20, 4); central.writeUInt16LE(20, 6); central.writeUInt16LE(0x0800, 8); central.writeUInt16LE(8, 10);
    central.writeUInt16LE(dosTime, 12); central.writeUInt16LE(dosDate, 14); central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(comp.length, 20); central.writeUInt32LE(data.length, 24); central.writeUInt16LE(fname.length, 28);
    central.writeUInt32LE(offset, 42);
    centrals.push(central, fname);
    offset += 30 + fname.length + comp.length;
  });
  const centralBuf = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(entries.length, 8); end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralBuf.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, centralBuf, end]);
}

function build(root, outDir, label) {
  const files = gameFiles(root);
  const name = 'chaegul-gongbang-' + label;
  fs.mkdirSync(outDir, { recursive: true });
  const zipPath = path.join(outDir, name + '.zip');
  fs.writeFileSync(zipPath, buildZip(files.map((f) => ({ name: f, data: fs.readFileSync(path.join(root, f)) })), name));
  const htmlPath = path.join(outDir, name + '-single.html');
  fs.writeFileSync(htmlPath, buildSingleHtml(root));
  return { zipPath, htmlPath, files };
}

module.exports = { gameFiles, buildSingleHtml, buildZip, crc32, build };

if (require.main === module) {
  let label = process.argv[2];
  if (!label) {
    try { label = require('child_process').execSync('git rev-parse --short HEAD', { cwd: ROOT }).toString().trim(); } catch (e) { label = 'build'; }
  }
  const r = build(ROOT, path.join(ROOT, 'dist'), label);
  console.log('files:', r.files.length);
  console.log('zip :', path.relative(ROOT, r.zipPath), fs.statSync(r.zipPath).size + ' bytes');
  console.log('html:', path.relative(ROOT, r.htmlPath), fs.statSync(r.htmlPath).size + ' bytes');
}
