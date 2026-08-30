#!/usr/bin/env node
// Regenerates every TextureStudio icon variant from docs/assets/icon-master.svg.
//
//   node scripts/export-icons.mjs
//
// The master holds geometry only. This script is where colour and plates live, so
// the two never duplicate: one geometry, one variant table, N outputs. See
// ICON_PLAN.md sections 3, 5, 7 and 8 in the private `brand` repository.
//
// Rasterizer is @resvg/resvg-js, pinned below and in package.json.
//
// resvg has no equivalent of "rsvg-convert --id", so variants cannot be selected
// out of the master at render time. Instead each variant is composed into a
// standalone SVG here and rasterized from that. Those composed SVGs are committed
// (platforms and the README reference them directly) but are generated output -
// edit the master, never them.
//
// TWO INVARIANTS ARE ENFORCED, and both must fail the run rather than warn:
//
//   1. Safe zone. Artwork must fit inside radius 460 of centre on the 1024 canvas,
//      or circular avatar crops eat its corners.
//   2. Palette. A themed variant must contain its own colours and none of the other
//      theme's.
//
// A gate that silently passes is worse than no gate, because it still prints "ok".
// This script parses the master strictly and refuses anything it does not fully
// understand instead of skipping it.

import { execSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const RESVG = '@resvg/resvg-js@2.6.2';
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const ASSETS = join(ROOT, 'docs', 'assets');
const TOOLS = join(ROOT, 'build', 'icon-tools');

const CANVAS = 1024;
const CENTRE = CANVAS / 2;
const SAFE_RADIUS = 460; // ICON_PLAN section 2

// ---------------------------------------------------------------- palette

const PLATE = '#12161A';
const TEAL = '#2DD4BF';       // structural stroke, dark contexts (9.84:1 on #12161A)
const TEAL_DARK = '#0F766E';  // structural stroke, light contexts (4.65:1 on #F2F4F7)
const AMBER = '#FFAC1C';      // family accent, dark contexts (9.25:1 on #12161A)
const AMBER_DARK = '#B8730A'; // family accent, light contexts (3.47:1 on #F2F4F7)
const SILVER = '#E8EDF2';

// Colours that must never appear in a variant of the opposite theme. Every variant
// carries a theme, including the opaque one - it is the avatar most people see.
const THEME_INK = { dark: [TEAL, AMBER], light: [TEAL_DARK, AMBER_DARK] };

const VARIANTS = [
  // v1 - primary, opaque. Platform avatars: Modrinth, Hangar, GitHub, CurseForge.
  { file: 'icon', geo: 'geo', plate: PLATE, stroke: TEAL, dot: AMBER, theme: 'dark',
    sizes: [64, 128, 180, 256, 400, 512, 1024] },

  // v1r - rounded plate. Apple touch icon, docs headers.
  { file: 'icon-rounded', geo: 'geo', plate: PLATE, rx: 225, stroke: TEAL, dot: AMBER,
    theme: 'dark', sizes: [180, 256, 512, 1024] },

  // v2/v3 - transparent, one per theme.
  { file: 'icon-transparent-dark', geo: 'geo', stroke: TEAL, dot: AMBER,
    theme: 'dark', sizes: [64, 128, 256, 512] },
  { file: 'icon-transparent-light', geo: 'geo', stroke: TEAL_DARK, dot: AMBER_DARK,
    theme: 'light', sizes: [64, 128, 256, 512] },

  // v4 - simplified small cut, <=24px (stroke 118, dot dropped).
  { file: 'icon-small-dark', geo: 'geo-small', stroke: TEAL, theme: 'dark',
    sizes: [16, 24, 32, 48, 64] },
  { file: 'icon-small-light', geo: 'geo-small', stroke: TEAL_DARK, theme: 'light',
    sizes: [16, 24, 32, 48, 64] },
  { file: 'icon-small-plate', geo: 'geo-small', plate: PLATE, stroke: TEAL,
    theme: 'dark', sizes: [64, 128] },

  // v5 - monochrome. Single colour, no raster ladder.
  { file: 'icon-mono-dark', geo: 'geo-small', stroke: SILVER, theme: 'dark', sizes: [] },
  { file: 'icon-mono-light', geo: 'geo-small', stroke: PLATE, theme: 'light', sizes: [] },
];

const STALE = [];

// ------------------------------------------------------------- svg parsing

function parseElements(xml) {
  const els = [];
  let i = 0;
  while (i < xml.length) {
    const lt = xml.indexOf('<', i);
    if (lt < 0) break;
    if (xml.startsWith('<!--', lt)) {
      const end = xml.indexOf('-->', lt);
      i = end < 0 ? xml.length : end + 3;
      continue;
    }
    if (xml.startsWith('<?', lt) || xml.startsWith('<!', lt)) {
      const end = xml.indexOf('>', lt);
      i = end < 0 ? xml.length : end + 1;
      continue;
    }
    let j = lt + 1;
    let quote = null;
    while (j < xml.length) {
      const c = xml[j];
      if (quote) { if (c === quote) quote = null; }
      else if (c === '"' || c === "'") quote = c;
      else if (c === '>') break;
      j++;
    }
    const raw = xml.slice(lt + 1, j);
    i = j + 1;
    if (raw.startsWith('/')) { els.push({ tag: raw.slice(1).trim(), close: true, attrs: {} }); continue; }
    const name = raw.match(/^([a-zA-Z][\w:-]*)/);
    if (!name) continue;
    const attrs = {};
    const attrRe = /([a-zA-Z_:][\w:.-]*)\s*=\s*("([^"]*)"|'([^']*)')/g;
    let a;
    while ((a = attrRe.exec(raw))) attrs[a[1]] = a[3] !== undefined ? a[3] : a[4];
    els.push({ tag: name[1], attrs, selfClose: /\/\s*$/.test(raw) });
  }
  return els;
}

const master = readFileSync(join(ASSETS, 'icon-master.svg'), 'utf8');
const masterEls = parseElements(master);

{
  const svg = masterEls.find((e) => e.tag === 'svg');
  const want = `0 0 ${CANVAS} ${CANVAS}`;
  if (!svg || svg.attrs.viewBox !== want) {
    throw new Error(`icon-master.svg viewBox must be "${want}", found "${svg?.attrs.viewBox}"`);
  }
}

function num(v, desc) {
  const n = Number(v);
  if (!Number.isFinite(n)) throw new Error(`${desc}: non-numeric value ${JSON.stringify(v)}`);
  return n;
}

function geometryOf(id) {
  let inDefs = false;
  let inTarget = false;
  const els = [];
  for (const e of masterEls) {
    if (e.tag === 'defs' && !e.close) inDefs = true;
    else if (e.tag === 'defs' && e.close) inDefs = false;
    else if (inDefs && e.tag === 'g' && e.attrs.id === id && !e.close) inTarget = true;
    else if (inTarget && e.tag === 'g' && e.close) { inTarget = false; break; }
    else if (inTarget && !e.close) {
      if (e.attrs.transform) {
        throw new Error(`<${e.tag}> inside #${id} has transform="${e.attrs.transform}". `
          + 'The master must bake transforms into its coordinates, not declare them. '
          + 'Transforms are refused because a scale() silently rescales stroke-width '
          + 'and a translate() makes the safe-zone gate measure the unshifted points.');
      }
      els.push(e);
    }
  }
  if (!els.length) throw new Error(`found no geometry inside <g id="${id}"> in <defs>`);
  return els;
}

// ---------------------------------------------------- safe-zone assertion

function worstRadius(elements) {
  const cand = [];
  for (const el of elements) {
    if (el.tag === 'polyline') {
      const sw = num(el.attrs['stroke-width'], 'polyline stroke-width');
      const hw = sw / 2;
      const pts = String(el.attrs.points ?? '').trim().split(/\s+/).filter(Boolean)
        .map((p) => {
          if (!/^-?[\d.]+,-?[\d.]+$/.test(p)) {
            throw new Error(`polyline point ${JSON.stringify(p)} is not "x,y".`);
          }
          return p.split(',').map(Number);
        });
      if (pts.length < 2) throw new Error('polyline needs at least two points');

      for (let k = 1; k < pts.length; k++) {
        if (pts[k][0] !== pts[k - 1][0] && pts[k][1] !== pts[k - 1][1]) {
          throw new Error(`polyline segment ${pts[k - 1]} -> ${pts[k]} is diagonal. `
            + 'The miter maths assumes orthogonal right angles.');
        }
      }

      // square caps at both ends
      for (const [i, j] of [[0, 1], [pts.length - 1, pts.length - 2]]) {
        const [x, y] = pts[i];
        const [xn, yn] = pts[j];
        const len = Math.hypot(x - xn, y - yn);
        if (len === 0) throw new Error('polyline has a zero-length end segment');
        const ux = (x - xn) / len;
        const uy = (y - yn) / len;
        const ex = x + ux * hw;
        const ey = y + uy * hw;
        cand.push([ex - uy * hw, ey + ux * hw], [ex + uy * hw, ey - ux * hw]);
      }
      // miter joins
      for (let k = 1; k < pts.length - 1; k++) {
        const [x, y] = pts[k];
        for (const a of [-1, 1]) for (const b of [-1, 1]) cand.push([x + a * hw, y + b * hw]);
      }
    } else if (el.tag === 'circle') {
      const cx = num(el.attrs.cx, 'circle cx');
      const cy = num(el.attrs.cy, 'circle cy');
      const r = num(el.attrs.r, 'circle r');
      cand.push([cx + r, cy], [cx - r, cy], [cx, cy + r], [cx, cy - r],
        [cx + r * 0.7071, cy + r * 0.7071], [cx - r * 0.7071, cy - r * 0.7071],
        [cx + r * 0.7071, cy - r * 0.7071], [cx - r * 0.7071, cy + r * 0.7071]);
    } else {
      throw new Error(`worstRadius cannot measure <${el.tag}>; teach it, or the `
        + 'safe-zone gate will pass artwork it never looked at');
    }
  }

  let worst = 0;
  let at = null;
  for (const [x, y] of cand) {
    const r = Math.hypot(x - CENTRE, y - CENTRE);
    if (!Number.isFinite(r)) throw new Error('non-finite candidate point');
    if (r > worst) { worst = r; at = [x, y]; }
  }
  if (!at) throw new Error('no geometry to measure');
  return { worst, at };
}

// ---------------------------------------------------------------- compose

function compose(v) {
  const els = geometryOf(v.geo);

  const body = els.map((e) => {
    const attrs = Object.entries(e.attrs).map(([k, val]) => `${k}="${val}"`).join(' ');
    return `    <${e.tag} ${attrs} />`;
  }).join('\n');

  const paint = [`stroke="${v.stroke}"`, v.dot ? `fill="${v.dot}"` : null]
    .filter(Boolean).join(' ');
  const rx = v.rx ? ` rx="${v.rx}"` : '';
  const plate = v.plate
    ? `\n  <rect width="${CANVAS}" height="${CANVAS}"${rx} fill="${v.plate}" />`
    : '';

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${CANVAS} ${CANVAS}" width="${CANVAS}" height="${CANVAS}">
  <!-- GENERATED by scripts/export-icons.mjs from icon-master.svg. Do not edit.
       Colour and plate are applied here; the master carries geometry only. -->${plate}
  <g ${paint}>
${body}
  </g>
</svg>
`;
}

// ---------------------------------------------------------------- rasterize

async function loadResvg() {
  try {
    const mod = await import('@resvg/resvg-js');
    if (mod.Resvg) return mod;
  } catch {}

  const entry = join(TOOLS, 'node_modules', '@resvg', 'resvg-js', 'index.js');
  const attempt = () => import(pathToFileURL(entry).href);
  if (existsSync(entry)) {
    try { return await attempt(); } catch {
      console.log('  cached resvg is incomplete, reinstalling ...');
      rmSync(TOOLS, { recursive: true, force: true });
    }
  }
  console.log(`  fetching ${RESVG} into build/icon-tools ...`);
  mkdirSync(TOOLS, { recursive: true });
  writeFileSync(join(TOOLS, 'package.json'), '{"private":true}\n');
  execSync(`npm install --no-save --ignore-scripts --prefix "${TOOLS}" ${RESVG}`,
    { stdio: 'inherit' });
  return attempt();
}

const { Resvg } = await loadResvg();

function hexAt(px, i) {
  return '#' + [px[i], px[i + 1], px[i + 2]]
    .map((c) => c.toString(16).padStart(2, '0')).join('').toUpperCase();
}

// ---------------------------------------------------------------- run

const problems = [];

console.log(`safe zone (limit ${SAFE_RADIUS}):`);
for (const id of [...new Set(VARIANTS.map((v) => v.geo))]) {
  const { worst, at } = worstRadius(geometryOf(id));
  const ok = worst <= SAFE_RADIUS;
  if (!ok) problems.push(`${id} breaches the safe zone at r ${worst.toFixed(1)}`);
  console.log(`  ${id.padEnd(10)}  r = ${worst.toFixed(1)}`
    + ` at (${at.map((n) => n.toFixed(0)).join(',')})  ${ok ? 'ok' : 'BREACH'}`);
}
if (problems.length) {
  console.error('\nrefusing to export: artwork would be clipped by a circular crop.');
  for (const p of problems) console.error(`  ${p}`);
  process.exit(1);
}

console.log('\nvariants:');
const pending = [];

for (const v of VARIANTS) {
  const svg = compose(v);
  const label = [];

  const forbidden = THEME_INK[v.theme === 'light' ? 'dark' : 'light'];
  if (!svg.includes(v.stroke)) problems.push(`${v.file}: stroke ${v.stroke} missing`);
  for (const bad of forbidden) {
    if (svg.includes(bad)) {
      problems.push(`${v.file}: ${v.theme === 'light' ? 'dark' : 'light'}-theme `
        + `${bad} present in a ${v.theme} variant`);
    }
  }
  pending.push([join(ASSETS, `${v.file}.svg`), Buffer.from(svg, 'utf8')]);

  for (const size of v.sizes) {
    const img = new Resvg(svg, {
      fitTo: { mode: 'width', value: size },
      font: { loadSystemFonts: false }
    }).render();

    if (size >= 64) {
      const px = img.pixels;
      let seen = false;
      for (let i = 0; i < px.length && !seen; i += 4) {
        if (px[i + 3] >= 250 && hexAt(px, i) === v.stroke.toUpperCase()) seen = true;
      }
      if (!seen) problems.push(`${v.file}@${size}: stroke ${v.stroke} did not render`);
    }

    pending.push([join(ASSETS, `${v.file}-${size}.png`), img.asPng()]);
    label.push(String(size));
  }
  console.log(`  ${v.file.padEnd(24)}  ${label.join(' ') || '(svg only)'}`);
}

if (problems.length) {
  console.error(`\n${problems.length} problem(s); nothing was written:`);
  for (const p of problems) console.error(`  ${p}`);
  process.exit(1);
}

for (const [path, buf] of pending) writeFileSync(path, buf);

for (const f of STALE) {
  const p = join(ASSETS, f);
  if (existsSync(p)) { rmSync(p); console.log(`  removed stale ${f}`); }
}

console.log(`\ndone. ${pending.length} files written.`);
