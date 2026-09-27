import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import {
  createCrossQuadGeometry,
  isPlantOrCrossBlock,
  isCrossModel,
  isSolidBlock,
  normalizeBlockId,
  cullMultiblockFaces,
  filterCulledFaces,
  buildCulledMultiblockGeometry,
  createMultiblockGeometry,
  getBlockCoordinates,
  CROSS_PLANT_BLOCK_IDS,
  NON_SOLID_BLOCK_IDS,
  FACE_NAMES,
  FACE_DIRECTIONS,
  DIRECTION_OFFSETS,
  OPPOSITE_DIRECTIONS
} from "../../src/modules/block-culling.js";

const EPSILON = 1e-4;

function assertClose(actual, expected, message) {
  assert.ok(
    Math.abs(actual - expected) < EPSILON,
    `${message || "Value mismatch"}: expected ${expected}, got ${actual}`
  );
}

test("directional metadata and offsets expose Minecraft Java face conventions", () => {
  assert.deepEqual(FACE_NAMES, ["down", "up", "north", "south", "west", "east"]);
  assert.deepEqual(DIRECTION_OFFSETS.down, [0, -1, 0]);
  assert.deepEqual(DIRECTION_OFFSETS.up, [0, 1, 0]);
  assert.deepEqual(DIRECTION_OFFSETS.north, [0, 0, -1]);
  assert.deepEqual(DIRECTION_OFFSETS.south, [0, 0, 1]);
  assert.deepEqual(DIRECTION_OFFSETS.west, [-1, 0, 0]);
  assert.deepEqual(DIRECTION_OFFSETS.east, [1, 0, 0]);

  assert.equal(OPPOSITE_DIRECTIONS.down, "up");
  assert.equal(OPPOSITE_DIRECTIONS.up, "down");
  assert.equal(OPPOSITE_DIRECTIONS.north, "south");
  assert.equal(OPPOSITE_DIRECTIONS.south, "north");
  assert.equal(OPPOSITE_DIRECTIONS.west, "east");
  assert.equal(OPPOSITE_DIRECTIONS.east, "west");
});

test("createCrossQuadGeometry generates standard vertical diagonal quads (minecraft:block/cross)", () => {
  const geo = createCrossQuadGeometry();
  assert.ok(geo instanceof THREE.BufferGeometry);

  const posAttr = geo.getAttribute("position");
  const normAttr = geo.getAttribute("normal");
  const uvAttr = geo.getAttribute("uv");
  const tanAttr = geo.getAttribute("tangent");

  // 2 diagonal quads * 6 vertices (2 triangles per quad) = 12 vertices
  assert.equal(posAttr.count, 12);
  assert.equal(normAttr.count, 12);
  assert.equal(uvAttr.count, 12);
  assert.equal(tanAttr.count, 12);
  assert.equal(tanAttr.itemSize, 4);

  // Bounds should be [0, 1]^3 for uncentered
  let minX = Infinity, maxX = -Infinity;
  let minY = Infinity, maxY = -Infinity;
  let minZ = Infinity, maxZ = -Infinity;

  for (let i = 0; i < posAttr.count; i++) {
    const x = posAttr.getX(i);
    const y = posAttr.getY(i);
    const z = posAttr.getZ(i);
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
    minY = Math.min(minY, y);
    maxY = Math.max(maxY, y);
    minZ = Math.min(minZ, z);
    maxZ = Math.max(maxZ, z);
  }

  assertClose(minX, 0.0, "minX");
  assertClose(maxX, 1.0, "maxX");
  assertClose(minY, 0.0, "minY");
  assertClose(maxY, 1.0, "maxY");
  assertClose(minZ, 0.0, "minZ");
  assertClose(maxZ, 1.0, "maxZ");

  // Quad 1 (vertices 0..5): diagonal from (0, 0, 0) to (1, 1, 1)
  // Normal must be perpendicular to plane x = z: (-1/sqrt(2), 0, 1/sqrt(2))
  const invSqrt2 = 1.0 / Math.SQRT2;
  for (let i = 0; i < 6; i++) {
    const nx = normAttr.getX(i);
    const ny = normAttr.getY(i);
    const nz = normAttr.getZ(i);
    const len = Math.hypot(nx, ny, nz);
    assertClose(len, 1.0, `Quad 1 normal length at ${i}`);
    assertClose(ny, 0.0, `Quad 1 normal ny at ${i}`);
    assertClose(Math.abs(nx), invSqrt2, `Quad 1 normal |nx| at ${i}`);
    assertClose(Math.abs(nz), invSqrt2, `Quad 1 normal |nz| at ${i}`);
    // Check perpendicularity to plane direction (1, 0, 1)
    assertClose(nx * 1.0 + nz * 1.0, 0.0, `Quad 1 dot with plane direction at ${i}`);
  }

  // Quad 2 (vertices 6..11): diagonal from (0, 0, 1) to (1, 1, 0)
  // Normal must be perpendicular to plane x + z = 1: (1/sqrt(2), 0, 1/sqrt(2))
  for (let i = 6; i < 12; i++) {
    const nx = normAttr.getX(i);
    const ny = normAttr.getY(i);
    const nz = normAttr.getZ(i);
    const len = Math.hypot(nx, ny, nz);
    assertClose(len, 1.0, `Quad 2 normal length at ${i}`);
    assertClose(ny, 0.0, `Quad 2 normal ny at ${i}`);
    assertClose(Math.abs(nx), invSqrt2, `Quad 2 normal |nx| at ${i}`);
    assertClose(Math.abs(nz), invSqrt2, `Quad 2 normal |nz| at ${i}`);
    // Check perpendicularity to plane direction (1, 0, -1)
    assertClose(nx * 1.0 + nz * -1.0, 0.0, `Quad 2 dot with plane direction at ${i}`);
  }

  // UV coordinates: all in [0, 1]^2
  for (let i = 0; i < uvAttr.count; i++) {
    const u = uvAttr.getX(i);
    const v = uvAttr.getY(i);
    assert.ok(u >= 0.0 && u <= 1.0, `UV u at ${i} should be in [0, 1]`);
    assert.ok(v >= 0.0 && v <= 1.0, `UV v at ${i} should be in [0, 1]`);
  }

  // Tangents: 4 components, orthogonal to normals, w component = 1.0
  for (let i = 0; i < tanAttr.count; i++) {
    const tx = tanAttr.getX(i);
    const ty = tanAttr.getY(i);
    const tz = tanAttr.getZ(i);
    const tw = tanAttr.getW(i);
    const len = Math.hypot(tx, ty, tz);
    assertClose(len, 1.0, `Tangent length at ${i}`);
    assert.equal(tw, 1.0, `Tangent w component at ${i}`);

    const nx = normAttr.getX(i);
    const ny = normAttr.getY(i);
    const nz = normAttr.getZ(i);
    const dotNT = nx * tx + ny * ty + nz * tz;
    assertClose(dotNT, 0.0, `Tangent and normal orthogonality at ${i}`);
  }

  // Double-sided rendering configuration
  assert.equal(geo.userData.doubleSided, true);
  assert.equal(geo.userData.side, THREE.DoubleSide);
  assert.equal(geo.side, THREE.DoubleSide);
});

test("createCrossQuadGeometry supports { center: true } and width/height scaling", () => {
  const geoCentered = createCrossQuadGeometry({ center: true, width: 2.0, height: 3.0 });
  const posAttr = geoCentered.getAttribute("position");

  let minX = Infinity, maxX = -Infinity;
  let minY = Infinity, maxY = -Infinity;
  let minZ = Infinity, maxZ = -Infinity;

  for (let i = 0; i < posAttr.count; i++) {
    minX = Math.min(minX, posAttr.getX(i));
    maxX = Math.max(maxX, posAttr.getX(i));
    minY = Math.min(minY, posAttr.getY(i));
    maxY = Math.max(maxY, posAttr.getY(i));
    minZ = Math.min(minZ, posAttr.getZ(i));
    maxZ = Math.max(maxZ, posAttr.getZ(i));
  }

  assertClose(minX, -1.0, "Centered scaled minX");
  assertClose(maxX, 1.0, "Centered scaled maxX");
  assertClose(minY, -1.5, "Centered scaled minY");
  assertClose(maxY, 1.5, "Centered scaled maxY");
  assertClose(minZ, -1.0, "Centered scaled minZ");
  assertClose(maxZ, 1.0, "Centered scaled maxZ");
  assert.equal(geoCentered.userData.centered, true);
});

test("plant identification helper recognizes all vanilla plant IDs and saplings", () => {
  const requiredPlantIds = [
    "short_grass",
    "grass",
    "tall_grass",
    "dandelion",
    "poppy",
    "blue_orchid",
    "allium",
    "azure_bluet",
    "red_tulip",
    "orange_tulip",
    "white_tulip",
    "pink_tulip",
    "oxeye_daisy",
    "cornflower",
    "lily_of_the_valley",
    "wither_rose",
    "sunflower",
    "lilac",
    "rose_bush",
    "peony",
    "fern",
    "large_fern",
    "dead_bush",
    "oak_sapling",
    "spruce_sapling",
    "birch_sapling",
    "jungle_sapling",
    "acacia_sapling",
    "dark_oak_sapling",
    "cherry_sapling",
    "mangrove_propagule"
  ];

  for (const id of requiredPlantIds) {
    assert.equal(isPlantOrCrossBlock(id), true, `Expected "${id}" to be recognized as plant`);
    assert.equal(isCrossModel(id), true, `Expected "${id}" to match isCrossModel`);
    assert.equal(isPlantOrCrossBlock(`minecraft:${id}`), true, `Expected "minecraft:${id}" to be recognized`);
  }

  // Blockstate annotations
  assert.equal(isPlantOrCrossBlock("minecraft:tall_grass[half=lower]"), true);
  assert.equal(isPlantOrCrossBlock("sunflower[half=upper]"), true);
  assert.equal(isPlantOrCrossBlock("pale_oak_sapling"), true);

  // Non-plants must return false
  const nonPlantIds = [
    "stone",
    "dirt",
    "grass_block",
    "oak_planks",
    "cobblestone",
    "glass",
    "sand",
    "deepslate",
    "diamond_block",
    "obsidian"
  ];

  for (const id of nonPlantIds) {
    assert.equal(isPlantOrCrossBlock(id), false, `Expected "${id}" to NOT be recognized as plant`);
    assert.equal(isCrossModel(id), false, `Expected "${id}" to NOT match isCrossModel`);
  }

  // Edge cases and invalid inputs
  assert.equal(isPlantOrCrossBlock(null), false);
  assert.equal(isPlantOrCrossBlock(undefined), false);
  assert.equal(isPlantOrCrossBlock(""), false);
  assert.equal(isPlantOrCrossBlock(123), false);
  assert.equal(isPlantOrCrossBlock({}), false);
});

test("isSolidBlock helper identifies solid vs non-solid blocks correctly", () => {
  assert.equal(isSolidBlock("stone"), true);
  assert.equal(isSolidBlock("dirt"), true);
  assert.equal(isSolidBlock("grass_block"), true);
  assert.equal(isSolidBlock("oak_planks"), true);

  // Non-solid blocks
  assert.equal(isSolidBlock("short_grass"), false);
  assert.equal(isSolidBlock("poppy"), false);
  assert.equal(isSolidBlock("glass"), false);
  assert.equal(isSolidBlock("white_stained_glass"), false);
  assert.equal(isSolidBlock("air"), false);

  // Explicit solid override on block object
  assert.equal(isSolidBlock({ id: "stone", solid: false }), false);
  assert.equal(isSolidBlock({ id: "glass", solid: true }), true);
  assert.equal(isSolidBlock({ id: "stone", transparent: true }), false);
  assert.equal(isSolidBlock(null), false);
});

test("isolated block: 0 faces culled (all 6 faces retained)", () => {
  const blocks = [
    { id: "stone", x: 0, y: 0, z: 0 }
  ];

  const result = cullMultiblockFaces(blocks);

  assert.equal(result.culledCount, 0, "Culled count should be 0");
  assert.equal(result.retainedCount, 6, "Retained count should be 6");
  assert.equal(result.facesCulled, 0);
  assert.equal(result.facesRetained, 6);
  assert.equal(result.length, 6);

  const retainedNames = result.map((f) => f.face).sort();
  assert.deepEqual(retainedNames, ["down", "east", "north", "south", "up", "west"]);
});

test("2 adjacent full blocks: verifies exactly 2 touching faces culled, 10 outer faces retained", () => {
  // Block 0 at (0, 0, 0), Block 1 at (1, 0, 0)
  const blocks = [
    { id: "stone", x: 0, y: 0, z: 0 },
    { id: "stone", x: 1, y: 0, z: 0 }
  ];

  const result = cullMultiblockFaces(blocks);

  assert.equal(result.culledCount, 2, "Exactly 2 touching faces culled");
  assert.equal(result.retainedCount, 10, "Exactly 10 outer faces retained");
  assert.equal(result.facesCulled, 2);
  assert.equal(result.facesRetained, 10);
  assert.equal(result.length, 10);

  // Block 0 touching Block 1: east face culled
  const b0Report = result.blocks[0];
  assert.deepEqual(b0Report.culledFaces, ["east"]);
  assert.equal(b0Report.culledCount, 1);
  assert.equal(b0Report.retainedCount, 5);

  // Block 1 touching Block 0: west face culled
  const b1Report = result.blocks[1];
  assert.deepEqual(b1Report.culledFaces, ["west"]);
  assert.equal(b1Report.culledCount, 1);
  assert.equal(b1Report.retainedCount, 5);

  // Verify culled faces metadata
  assert.equal(result.culledFaces.length, 2);
  assert.equal(result.culledFaces[0].face, "east");
  assert.deepEqual(result.culledFaces[0].position, [0, 0, 0]);
  assert.equal(result.culledFaces[1].face, "west");
  assert.deepEqual(result.culledFaces[1].position, [1, 0, 0]);
});

test("3x3 flat platform (9 blocks): verifies exactly 24 internal faces culled and 30 outer faces retained", () => {
  const blocks = [];
  for (let x = 0; x < 3; x++) {
    for (let z = 0; z < 3; z++) {
      blocks.push({ id: "stone", x, y: 0, z });
    }
  }

  assert.equal(blocks.length, 9);

  const result = cullMultiblockFaces(blocks);

  // Total faces: 9 * 6 = 54
  // Internal touching pairs: 6 along X + 6 along Z = 12 pairs = 24 culled faces
  // Retained: 54 - 24 = 30 outer boundary faces
  assert.equal(result.culledCount, 24, "Platform culled faces must be exactly 24");
  assert.equal(result.retainedCount, 30, "Platform retained faces must be exactly 30");
  assert.equal(result.facesCulled, 24);
  assert.equal(result.facesRetained, 30);
  assert.equal(result.length, 30);

  // Breakdown of retained boundary faces:
  // 9 top (+Y), 9 bottom (-Y), 3 north (-Z), 3 south (+Z), 3 east (+X), 3 west (-X)
  const faceCounts = {
    up: 0,
    down: 0,
    north: 0,
    south: 0,
    west: 0,
    east: 0
  };

  for (const face of result) {
    faceCounts[face.face]++;
  }

  assert.equal(faceCounts.up, 9, "9 top faces retained");
  assert.equal(faceCounts.down, 9, "9 bottom faces retained");
  assert.equal(faceCounts.north, 3, "3 north outer faces retained");
  assert.equal(faceCounts.south, 3, "3 south outer faces retained");
  assert.equal(faceCounts.west, 3, "3 west outer faces retained");
  assert.equal(faceCounts.east, 3, "3 east outer faces retained");

  // Center block at (1, 0, 1) has all 4 horizontal faces culled, only up and down retained
  const centerBlock = result.blocks.find(
    (b) => b.position[0] === 1 && b.position[1] === 0 && b.position[2] === 1
  );
  assert.ok(centerBlock);
  assert.equal(centerBlock.culledCount, 4);
  assert.equal(centerBlock.retainedCount, 2);
  assert.deepEqual(centerBlock.retainedFaces.sort(), ["down", "up"]);

  // Corner block at (0, 0, 0) has 2 faces culled (east, south) and 4 retained
  const cornerBlock = result.blocks.find(
    (b) => b.position[0] === 0 && b.position[1] === 0 && b.position[2] === 0
  );
  assert.ok(cornerBlock);
  assert.equal(cornerBlock.culledCount, 2);
  assert.equal(cornerBlock.retainedCount, 4);
  assert.deepEqual(cornerBlock.culledFaces.sort(), ["east", "south"]);
});

test("3x3 vertical wall (9 blocks): verifies internal faces culled properly", () => {
  // Vertical wall in XY plane (z = 0, x in 0..2, y in 0..2)
  const blocks = [];
  for (let x = 0; x < 3; x++) {
    for (let y = 0; y < 3; y++) {
      blocks.push({ id: "stone", x, y, z: 0 });
    }
  }

  assert.equal(blocks.length, 9);

  const result = cullMultiblockFaces(blocks);

  assert.equal(result.culledCount, 24, "Wall culled faces must be exactly 24");
  assert.equal(result.retainedCount, 30, "Wall retained faces must be exactly 30");

  const faceCounts = {
    up: 0,
    down: 0,
    north: 0,
    south: 0,
    west: 0,
    east: 0
  };

  for (const face of result) {
    faceCounts[face.face]++;
  }

  // All 9 blocks expose north (-Z) and south (+Z) faces
  assert.equal(faceCounts.north, 9, "9 north faces retained");
  assert.equal(faceCounts.south, 9, "9 south faces retained");
  assert.equal(faceCounts.up, 3, "3 top faces retained");
  assert.equal(faceCounts.down, 3, "3 bottom faces retained");
  assert.equal(faceCounts.west, 3, "3 west faces retained");
  assert.equal(faceCounts.east, 3, "3 east faces retained");
});

test("non-solid and plant neighbors: plant on top of grass block does not cull grass top face", () => {
  const blocks = [
    { id: "grass_block", x: 0, y: 0, z: 0 },
    { id: "short_grass", x: 0, y: 1, z: 0 }
  ];

  const result = cullMultiblockFaces(blocks);

  // Grass block top face must NOT be culled by plant
  const grassBlockReport = result.blocks[0];
  assert.equal(grassBlockReport.culledCount, 0, "Grass block must have 0 culled faces");
  assert.equal(grassBlockReport.retainedCount, 6, "Grass block retains all 6 faces");
  assert.ok(grassBlockReport.retainedFaces.includes("up"), "Top face of grass block retained");

  // Plant block report has 0 cubical faces culled
  const plantReport = result.blocks[1];
  assert.equal(plantReport.isPlant, true);
  assert.equal(plantReport.culledCount, 0);

  // Overall counts: grass block (6 retained, 0 culled)
  assert.equal(result.culledCount, 0);
  assert.equal(result.retainedCount, 6);
});

test("transparent glass neighbor does not cull adjacent solid face unless specified", () => {
  const blocks = [
    { id: "stone", x: 0, y: 0, z: 0 },
    { id: "glass", x: 1, y: 0, z: 0 }
  ];

  const result = cullMultiblockFaces(blocks);

  // Stone east face should NOT be culled because glass is non-solid/transparent
  const stoneReport = result.blocks[0];
  assert.ok(stoneReport.retainedFaces.includes("east"), "Stone east face retained next to glass");
  assert.equal(stoneReport.culledCount, 0);

  // When treatGlassAsSolid option is passed, glass culls the touching face
  const resultWithGlassSolid = cullMultiblockFaces(blocks, { treatGlassAsSolid: true });
  const stoneReportSolid = resultWithGlassSolid.blocks[0];
  assert.ok(stoneReportSolid.culledFaces.includes("east"), "Stone east face culled when glass treated as solid");
  assert.equal(stoneReportSolid.culledCount, 1);
  assert.equal(resultWithGlassSolid.culledCount, 2);
});

test("respects Minecraft JSON model element cullface property", () => {
  const modelWithCullface = {
    elements: [
      {
        from: [0, 0, 0],
        to: [16, 16, 16],
        faces: {
          up: { cullface: "up" },
          down: { cullface: "down" },
          east: { cullface: "east" },
          west: { cullface: "west" },
          north: { cullface: "north" },
          south: { cullface: "south" }
        }
      }
    ]
  };

  // Internal element without cullface (like inner face of stair/slab)
  const modelWithInternalFace = {
    elements: [
      {
        from: [0, 0, 0],
        to: [16, 8, 16],
        faces: {
          // 'up' face has NO cullface attribute
          up: {},
          down: { cullface: "down" },
          east: { cullface: "east" },
          west: { cullface: "west" },
          north: { cullface: "north" },
          south: { cullface: "south" }
        }
      }
    ]
  };

  const blocks = [
    { id: "slab", x: 0, y: 0, z: 0, model: modelWithInternalFace },
    { id: "stone", x: 0, y: 1, z: 0, model: modelWithCullface }
  ];

  const result = cullMultiblockFaces(blocks);

  // Slab 'up' face has NO cullface, so it must NOT be culled by block above
  const slabReport = result.blocks[0];
  assert.ok(slabReport.retainedFaces.includes("up"), "Internal face without cullface retained");

  // Stone 'down' face has cullface: 'down', and neighbor below (slab) is solid, so it IS culled
  const stoneReport = result.blocks[1];
  assert.ok(stoneReport.culledFaces.includes("down"), "Face with cullface: down is culled");
});

test("filterCulledFaces alias and buildCulledMultiblockGeometry integration", () => {
  const platform = [];
  for (let x = 0; x < 3; x++) {
    for (let z = 0; z < 3; z++) {
      platform.push({ id: "stone", x, y: 0, z });
    }
  }

  // filterCulledFaces returns identical result
  const filtered = filterCulledFaces(platform);
  assert.equal(filtered.length, 30);
  assert.equal(filtered.culledCount, 24);
  assert.equal(filtered.retainedCount, 30);

  // buildCulledMultiblockGeometry generates combined Three.js BufferGeometry
  const combinedGeo = buildCulledMultiblockGeometry(platform);
  assert.ok(combinedGeo instanceof THREE.BufferGeometry);

  const posAttr = combinedGeo.getAttribute("position");
  const normAttr = combinedGeo.getAttribute("normal");
  const uvAttr = combinedGeo.getAttribute("uv");
  const tanAttr = combinedGeo.getAttribute("tangent");

  // 30 retained faces * 6 vertices per face = 180 vertices
  assert.equal(posAttr.count, 180);
  assert.equal(normAttr.count, 180);
  assert.equal(uvAttr.count, 180);
  assert.equal(tanAttr.count, 180);

  // Alias createMultiblockGeometry produces valid geometry
  const aliasGeo = createMultiblockGeometry(platform);
  assert.equal(aliasGeo.getAttribute("position").count, 180);

  // Mixed structure: grass block + plant on top
  const mixedBlocks = [
    { id: "grass_block", x: 0, y: 0, z: 0 },
    { id: "short_grass", x: 0, y: 1, z: 0 }
  ];
  const mixedGeo = buildCulledMultiblockGeometry(mixedBlocks);
  // Grass block: 6 faces * 6 vertices = 36 vertices
  // Plant block: 2 quads * 6 vertices = 12 vertices
  // Total = 48 vertices
  assert.equal(mixedGeo.getAttribute("position").count, 48);
});

test("getBlockCoordinates supports arrays, objects, and varied position schemas", () => {
  assert.deepEqual(getBlockCoordinates([1, 2, 3]), [1, 2, 3]);
  assert.deepEqual(getBlockCoordinates({ x: 4, y: 5, z: 6 }), [4, 5, 6]);
  assert.deepEqual(getBlockCoordinates({ position: [7, 8, 9] }), [7, 8, 9]);
  assert.deepEqual(getBlockCoordinates({ pos: [10, 11, 12] }), [10, 11, 12]);
  assert.deepEqual(getBlockCoordinates({ position: { x: 13, y: 14, z: 15 } }), [13, 14, 15]);
  assert.deepEqual(getBlockCoordinates(null), [0, 0, 0]);
  assert.deepEqual(getBlockCoordinates("invalid"), [0, 0, 0]);
});