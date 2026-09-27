import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import {
  getPbrTexture,
  handlePbrRequest,
  generateNormalMap,
  generateSpecularMap,
  generatePbrMaps,
  encodePng,
  crc32,
  loadPbrRules,
  resolveMaterial,
  normalizeMapType,
  findBlockTextureFile,
  clearPbrCache,
  DEFAULT_FALLBACK_RULES
} from "../server-pbr.mjs";

const PNG_HEADER = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

const SAMPLE_SVG = `
<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16">
  <rect width="16" height="16" fill="#7e8187"/>
  <rect x="2" y="2" width="4" height="4" fill="#5f6268"/>
  <rect x="8" y="8" width="6" height="6" fill="#a4a7ae"/>
</svg>
`;

describe("LabPBR 1.3 Core Generator & Encoding", () => {
  test("crc32 produces correct IEEE 802.3 checksum", () => {
    const data = Buffer.from("123456789", "ascii");
    const checksum = crc32(data);
    assert.equal(checksum, 0xcbf43926);
  });

  test("encodePng encodes raw RGBA buffer into valid PNG starting with signature", () => {
    const width = 4;
    const height = 4;
    const rgba = Buffer.alloc(width * height * 4);
    for (let i = 0; i < rgba.length; i += 4) {
      rgba[i] = 120;
      rgba[i + 1] = 130;
      rgba[i + 2] = 140;
      rgba[i + 3] = 255;
    }

    const png = encodePng(width, height, rgba);
    assert(Buffer.isBuffer(png));
    assert(png.length > 8);
    assert.deepEqual(png.subarray(0, 8), PNG_HEADER);
  });

  test("encodePng throws error if buffer is smaller than width * height * 4", () => {
    assert.throws(
      () => encodePng(4, 4, Buffer.alloc(10)),
      /Invalid buffer length/
    );
  });

  test("loadPbrRules returns fallback rules if file not found", () => {
    const rules = loadPbrRules("/non/existent/path/rules.json");
    assert(rules && rules.defaultMaterial);
    assert.equal(rules.defaultMaterial.baseHeight, 215);
  });

  test("resolveMaterial resolves known and wildcard pattern materials", () => {
    const stone = resolveMaterial("stone");
    assert.equal(stone.smoothness, 35);
    assert.equal(stone.f0, 10);

    const diamondOre = resolveMaterial("diamond_ore");
    assert.equal(diamondOre.baseHeight, 215);
    assert(Array.isArray(diamondOre.parsedFeatures));

    const ironOre = resolveMaterial("iron_ore");
    assert.equal(ironOre.baseHeight, 215); // Resolved via *_ore pattern

    const unknown = resolveMaterial("completely_unknown_block");
    assert.equal(unknown.baseHeight, 215);
  });

  test("generateNormalMap produces DirectX Y- normal map and POM height", () => {
    const width = 4;
    const height = 4;
    const pixels = Buffer.alloc(width * height * 4);
    for (let i = 0; i < pixels.length; i += 4) {
      pixels[i] = 0x7e;
      pixels[i + 1] = 0x81;
      pixels[i + 2] = 0x87;
      pixels[i + 3] = 255;
    }

    const normalMap = generateNormalMap("stone", pixels, width, height, { encode: true });
    assert(Buffer.isBuffer(normalMap));
    assert.deepEqual(normalMap.subarray(0, 8), PNG_HEADER);
    assert(normalMap.pixels instanceof Buffer);
    // Flat normal map values: R ~ 128 (center X), G ~ 128 (center Y), B = AO (255), A = Height (215)
    assert.equal(normalMap.pixels[0], 128);
    assert.equal(normalMap.pixels[1], 128);
    assert.equal(normalMap.pixels[2], 255);
    assert.equal(normalMap.pixels[3], 215);
  });

  test("generateSpecularMap produces LabPBR 1.3 specular channels", () => {
    const width = 4;
    const height = 4;
    const pixels = Buffer.alloc(width * height * 4);
    for (let i = 0; i < pixels.length; i += 4) {
      pixels[i] = 0x7e;
      pixels[i + 1] = 0x81;
      pixels[i + 2] = 0x87;
      pixels[i + 3] = 255;
    }

    const specMap = generateSpecularMap("stone", pixels, width, height, { encode: true });
    assert(Buffer.isBuffer(specMap));
    assert.deepEqual(specMap.subarray(0, 8), PNG_HEADER);
    assert(specMap.pixels instanceof Buffer);
    // Stone specular: smoothness=35, f0=10, porosity=5, emission=0
    assert.equal(specMap.pixels[0], 35);
    assert.equal(specMap.pixels[1], 10);
    assert.equal(specMap.pixels[2], 5);
    assert.equal(specMap.pixels[3], 0);
  });

  test("generatePbrMaps produces both companion maps", () => {
    const width = 4;
    const height = 4;
    const pixels = Buffer.alloc(width * height * 4, 255);
    const result = generatePbrMaps("stone", pixels, width, height);

    assert(Buffer.isBuffer(result.normalMap));
    assert(Buffer.isBuffer(result.specularMap));
    assert.deepEqual(result.normalMap.subarray(0, 8), PNG_HEADER);
    assert.deepEqual(result.specularMap.subarray(0, 8), PNG_HEADER);
  });
});

describe("getPbrTexture Helper", () => {
  before(() => {
    clearPbrCache();
  });

  test("generates normal map from SVG string with valid PNG signature", async () => {
    const png = await getPbrTexture("stone", "normal", { svg: SAMPLE_SVG, resolution: 16 });
    assert(Buffer.isBuffer(png));
    assert.deepEqual(png.subarray(0, 8), PNG_HEADER);
  });

  test("generates specular map from SVG string with valid PNG signature", async () => {
    const png = await getPbrTexture("stone", "specular", { svg: SAMPLE_SVG, resolution: 16 });
    assert(Buffer.isBuffer(png));
    assert.deepEqual(png.subarray(0, 8), PNG_HEADER);
  });

  test("supports shorthand mapType 'n' and 's'", async () => {
    const normalPng = await getPbrTexture("stone", "n", { svg: SAMPLE_SVG, resolution: 16 });
    const specPng = await getPbrTexture("stone", "s", { svg: SAMPLE_SVG, resolution: 16 });
    assert.deepEqual(normalPng.subarray(0, 8), PNG_HEADER);
    assert.deepEqual(specPng.subarray(0, 8), PNG_HEADER);
  });

  test("throws TypeError for invalid mapType", async () => {
    await assert.rejects(
      async () => getPbrTexture("stone", "invalid_map"),
      /Invalid mapType "invalid_map"/
    );
  });

  test("throws TypeError for missing blockId", async () => {
    await assert.rejects(
      async () => getPbrTexture("", "normal"),
      /blockId must be a non-empty string/
    );
  });

  test("returns null for non-existent block texture without fallback options", async () => {
    const png = await getPbrTexture("completely_nonexistent_block_9999", "normal", {
      texturesDir: "/nonexistent/folder/123"
    });
    assert.equal(png, null);
  });

  test("normalizes mapType strings", () => {
    assert.equal(normalizeMapType("normal"), "normal");
    assert.equal(normalizeMapType("NORMAL"), "normal");
    assert.equal(normalizeMapType("n"), "normal");
    assert.equal(normalizeMapType("_n"), "normal");
    assert.equal(normalizeMapType("specular"), "specular");
    assert.equal(normalizeMapType("s"), "specular");
    assert.equal(normalizeMapType("_s"), "specular");
    assert.equal(normalizeMapType("diffuse"), null);
    assert.equal(normalizeMapType(""), null);
    assert.equal(normalizeMapType(null), null);
  });

  test("serves cached result on repeated calls", async () => {
    const png1 = await getPbrTexture("stone_cached_test", "normal", { svg: SAMPLE_SVG, resolution: 16 });
    const png2 = await getPbrTexture("stone_cached_test", "normal", { svg: SAMPLE_SVG, resolution: 16 });
    assert.equal(png1, png2);
  });
});

describe("handlePbrRequest HTTP Route Handler", () => {
  let server;
  let baseUrl;

  before(async () => {
    clearPbrCache();
    server = http.createServer(async (req, res) => {
      // Mock route hook
      if (req.url.startsWith("/api/pbr/")) {
        const handled = await handlePbrRequest(req, res, {
          // Provide sample SVG fallback for stone in tests
          svg: SAMPLE_SVG,
          resolution: 32
        });
        if (handled) return;
      }

      res.writeHead(404, { "Content-Type": "text/plain" });
      res.end("Not Found");
    });

    await new Promise((resolve) => {
      server.listen(0, "127.0.0.1", () => {
        const address = server.address();
        baseUrl = `http://127.0.0.1:${address.port}`;
        resolve();
      });
    });
  });

  after(async () => {
    await new Promise((resolve) => server.close(resolve));
  });

  test("GET /api/pbr/:blockId/normal returns 200, image/png, Cache-Control, and valid PNG", async () => {
    const res = await fetch(`${baseUrl}/api/pbr/stone/normal`);
    assert.equal(res.status, 200);
    assert.equal(res.headers.get("content-type"), "image/png");
    assert(res.headers.get("cache-control")?.includes("max-age="));

    const buffer = Buffer.from(await res.arrayBuffer());
    assert(buffer.length > 8);
    assert.deepEqual(buffer.subarray(0, 8), PNG_HEADER);
  });

  test("GET /api/pbr/:blockId/specular returns 200, image/png, and valid PNG", async () => {
    const res = await fetch(`${baseUrl}/api/pbr/stone/specular`);
    assert.equal(res.status, 200);
    assert.equal(res.headers.get("content-type"), "image/png");

    const buffer = Buffer.from(await res.arrayBuffer());
    assert.deepEqual(buffer.subarray(0, 8), PNG_HEADER);
  });

  test("GET /api/pbr/:blockId/n and /s shorthand routes succeed", async () => {
    const resNormal = await fetch(`${baseUrl}/api/pbr/stone/n`);
    assert.equal(resNormal.status, 200);

    const resSpec = await fetch(`${baseUrl}/api/pbr/stone/s`);
    assert.equal(resSpec.status, 200);
  });

  test("HEAD request returns headers without body", async () => {
    const res = await fetch(`${baseUrl}/api/pbr/stone/normal`, { method: "HEAD" });
    assert.equal(res.status, 200);
    assert.equal(res.headers.get("content-type"), "image/png");
    const text = await res.text();
    assert.equal(text, "");
  });

  test("GET with invalid mapType returns 400 Bad Request", async () => {
    const res = await fetch(`${baseUrl}/api/pbr/stone/unknown_map_type`);
    assert.equal(res.status, 400);
    const text = await res.text();
    assert(text.includes("Invalid mapType"));
  });

  test("GET with incomplete path returns 400 Bad Request", async () => {
    const res = await fetch(`${baseUrl}/api/pbr/only_one_part`);
    assert.equal(res.status, 400);
    const text = await res.text();
    assert(text.includes("Bad Request"));
  });

  test("GET for missing block returns 404 Not Found", async () => {
    // Override handler to not inject fallback SVG
    const missingServer = http.createServer(async (req, res) => {
      await handlePbrRequest(req, res, { texturesDir: "/nonexistent/test/dir" });
    });

    await new Promise((resolve) => missingServer.listen(0, "127.0.0.1", resolve));
    const port = missingServer.address().port;

    try {
      const res = await fetch(`http://127.0.0.1:${port}/api/pbr/non_existent_block/normal`);
      assert.equal(res.status, 404);
      const text = await res.text();
      assert(text.includes("Texture not found"));
    } finally {
      await new Promise((resolve) => missingServer.close(resolve));
    }
  });

  test("POST method returns 405 Method Not Allowed", async () => {
    const res = await fetch(`${baseUrl}/api/pbr/stone/normal`, { method: "POST" });
    assert.equal(res.status, 405);
    assert.equal(res.headers.get("allow"), "GET, HEAD");
  });
});
