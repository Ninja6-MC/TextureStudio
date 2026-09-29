import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { discoverActivePack } from "../server.mjs";

describe("Pack Auto-Discovery & Block Subfolder Support", () => {
  let tempDir;

  before(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "ts-pack-discovery-"));
  });

  after(() => {
    if (tempDir && fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  test("returns empty blocks array if target directory does not exist", () => {
    const nonExistent = path.join(tempDir, "does-not-exist");
    const pack = discoverActivePack(nonExistent);
    assert.equal(pack.id, "pack-active");
    assert.deepEqual(pack.blocks, []);
  });

  test("discovers flat textures directly in root directory", () => {
    const flatDir = path.join(tempDir, "flat-pack");
    fs.mkdirSync(flatDir, { recursive: true });
    fs.writeFileSync(path.join(flatDir, "stone.svg"), "<svg></svg>");

    const pack = discoverActivePack(flatDir);
    assert.equal(pack.blocks.length, 1);
    assert.equal(pack.blocks[0].id, "stone");
    assert.equal(pack.blocks[0].textures.all, "textures/stone.svg");
  });

  test("discovers textures placed in standard textures/block subdirectory", () => {
    const packDir = path.join(tempDir, "mc-pack");
    const blockDir = path.join(packDir, "block");
    fs.mkdirSync(blockDir, { recursive: true });

    fs.writeFileSync(path.join(blockDir, "stone.svg"), "<svg></svg>");
    fs.writeFileSync(path.join(blockDir, "dirt.svg"), "<svg></svg>");
    fs.writeFileSync(path.join(blockDir, "grass_block_top.svg"), "<svg></svg>");
    fs.writeFileSync(path.join(blockDir, "grass_block_side.svg"), "<svg></svg>");
    fs.writeFileSync(path.join(blockDir, "grass_block_side_overlay.svg"), "<svg></svg>");

    const pack = discoverActivePack(packDir);
    const blockMap = new Map(pack.blocks.map((b) => [b.id, b]));

    assert(blockMap.has("stone"), "Discovers stone block in block/ subfolder");
    assert.equal(blockMap.get("stone").textures.all, "textures/block/stone.svg");

    assert(blockMap.has("grass_block"), "Discovers grass_block multipart in block/ subfolder");
    const grass = blockMap.get("grass_block");
    assert.equal(grass.textures.top, "textures/block/grass_block_top.svg");
    assert.equal(grass.textures.side, "textures/block/grass_block_side.svg");
    assert.equal(grass.textures.side_overlay, "textures/block/grass_block_side_overlay.svg");
    assert.equal(grass.textures.bottom, "textures/block/dirt.svg", "Falls back to block/dirt.svg for bottom");
  });
});
