import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import {
  parseBlockModel,
  createBlockModelGeometry,
  parseBlockModelGeometry,
  getDefaultFaceUV,
  resolveFaceUV,
  getFaceVertices,
  rotateElementVertex,
  computeTriangleNormal,
  computeTriangleTangent,
  calculateTangent,
  resolveTextureVariable,
  FACE_NAMES,
  FACE_DIRECTIONS
} from "../../src/modules/block-model.js";

const EPSILON = 1e-4;

function assertClose(actual, expected, message) {
  assert.ok(
    Math.abs(actual - expected) < EPSILON,
    `${message || "Value mismatch"}: expected ${expected}, got ${actual}`
  );
}

test("FACE_NAMES and FACE_DIRECTIONS expose standard Minecraft face metadata", () => {
  assert.deepEqual(FACE_NAMES, ["down", "up", "north", "south", "west", "east"]);
  assert.deepEqual(FACE_DIRECTIONS.down, [0, -1, 0]);
  assert.deepEqual(FACE_DIRECTIONS.up, [0, 1, 0]);
  assert.deepEqual(FACE_DIRECTIONS.north, [0, 0, -1]);
  assert.deepEqual(FACE_DIRECTIONS.south, [0, 0, 1]);
  assert.deepEqual(FACE_DIRECTIONS.west, [-1, 0, 0]);
  assert.deepEqual(FACE_DIRECTIONS.east, [1, 0, 0]);
});

test("parseBlockModel parses standard 1x1x1 cube block model (vanilla cube.json)", () => {
  const cubeModel = {
    textures: {
      particle: "block/dirt",
      bottom: "block/dirt",
      top: "block/grass_block_top",
      side: "block/grass_block_side"
    },
    elements: [
      {
        from: [0, 0, 0],
        to: [16, 16, 16],
        faces: {
          down: { uv: [0, 0, 16, 16], texture: "#bottom", cullface: "down" },
          up: { uv: [0, 0, 16, 16], texture: "#top", cullface: "up" },
          north: { uv: [0, 0, 16, 16], texture: "#side", cullface: "north" },
          south: { uv: [0, 0, 16, 16], texture: "#side", cullface: "south" },
          west: { uv: [0, 0, 16, 16], texture: "#side", cullface: "west" },
          east: { uv: [0, 0, 16, 16], texture: "#side", cullface: "east" }
        }
      }
    ]
  };

  const geo = parseBlockModel(cubeModel);
  assert.ok(geo instanceof THREE.BufferGeometry);

  const posAttr = geo.getAttribute("position");
  const normAttr = geo.getAttribute("normal");
  const uvAttr = geo.getAttribute("uv");
  const tanAttr = geo.getAttribute("tangent");

  // 6 faces * 6 vertices per face (2 triangles) = 36 vertices
  assert.equal(posAttr.count, 36);
  assert.equal(normAttr.count, 36);
  assert.equal(uvAttr.count, 36);
  assert.equal(tanAttr.count, 36);
  assert.equal(tanAttr.itemSize, 4);

  // Bounds should be standard [0, 1]^3
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

  assertClose(minX, 0.0, "Cube minX");
  assertClose(maxX, 1.0, "Cube maxX");
  assertClose(minY, 0.0, "Cube minY");
  assertClose(maxY, 1.0, "Cube maxY");
  assertClose(minZ, 0.0, "Cube minZ");
  assertClose(maxZ, 1.0, "Cube maxZ");

  // Groups: 6 face groups
  assert.equal(geo.groups.length, 6);
  for (let g = 0; g < geo.groups.length; g++) {
    assert.equal(geo.groups[g].start, g * 6);
    assert.equal(geo.groups[g].count, 6);
  }

  // Aliases produce identical valid geometries
  const aliasGeo1 = createBlockModelGeometry(cubeModel);
  const aliasGeo2 = parseBlockModelGeometry(cubeModel);
  assert.equal(aliasGeo1.getAttribute("position").count, 36);
  assert.equal(aliasGeo2.getAttribute("position").count, 36);
});

test("parseBlockModel supports { center: true } option [-0.5, 0.5]^3", () => {
  const cubeModel = {
    elements: [
      {
        from: [0, 0, 0],
        to: [16, 16, 16],
        faces: {
          up: { texture: "#top" },
          down: { texture: "#bottom" },
          north: { texture: "#side" },
          south: { texture: "#side" },
          west: { texture: "#side" },
          east: { texture: "#side" }
        }
      }
    ]
  };

  const geo = parseBlockModel(cubeModel, { center: true });
  const posAttr = geo.getAttribute("position");

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

  assertClose(minX, -0.5, "Centered minX");
  assertClose(maxX, 0.5, "Centered maxX");
  assertClose(minY, -0.5, "Centered minY");
  assertClose(maxY, 0.5, "Centered maxY");
  assertClose(minZ, -0.5, "Centered minZ");
  assertClose(maxZ, 0.5, "Centered maxZ");
  assert.equal(geo.userData.centered, true);
});

test("parseBlockModel handles partial elements: slab (0..8 height)", () => {
  const slabModel = {
    elements: [
      {
        from: [0, 0, 0],
        to: [16, 8, 16],
        faces: {
          down: { texture: "#bottom" },
          up: { texture: "#top" },
          north: { texture: "#side" },
          south: { texture: "#side" },
          west: { texture: "#side" },
          east: { texture: "#side" }
        }
      }
    ]
  };

  const geo = parseBlockModel(slabModel);
  const posAttr = geo.getAttribute("position");

  let maxY = -Infinity;
  for (let i = 0; i < posAttr.count; i++) {
    maxY = Math.max(maxY, posAttr.getY(i));
  }
  assertClose(maxY, 0.5, "Slab height must be 0.5");

  // Inferred UVs on side faces must use bottom half: v in [0, 0.5]
  const sideMeta = geo.userData.faceMetadata.find((m) => m.face === "north");
  assert.ok(sideMeta);
  const uvAttr = geo.getAttribute("uv");
  for (let i = sideMeta.startVertex; i < sideMeta.startVertex + sideMeta.vertexCount; i++) {
    const v = uvAttr.getY(i);
    assert.ok(v >= 0.0 - EPSILON && v <= 0.5 + EPSILON, `Side UV v out of bounds: ${v}`);
  }
});

test("parseBlockModel handles partial elements: stair steps", () => {
  const stairsModel = {
    elements: [
      {
        from: [0, 0, 0],
        to: [16, 8, 16],
        faces: {
          down: { texture: "#bottom" },
          up: { texture: "#top" },
          north: { texture: "#side" },
          south: { texture: "#side" },
          west: { texture: "#side" },
          east: { texture: "#side" }
        }
      },
      {
        from: [0, 8, 8],
        to: [16, 16, 16],
        faces: {
          up: { texture: "#top" },
          north: { texture: "#side" },
          south: { texture: "#side" },
          west: { texture: "#side" },
          east: { texture: "#side" }
        }
      }
    ]
  };

  const geo = parseBlockModel(stairsModel);
  // Total faces: 6 + 5 = 11 faces -> 66 vertices
  assert.equal(geo.getAttribute("position").count, 66);
  assert.equal(geo.groups.length, 11);
  assert.equal(geo.userData.elementsCount, 2);
});

test("parseBlockModel handles partial elements: thin post (fence)", () => {
  const postModel = {
    elements: [
      {
        from: [6, 0, 6],
        to: [10, 16, 10],
        faces: {
          down: { texture: "#post" },
          up: { texture: "#post" },
          north: { texture: "#post" },
          south: { texture: "#post" },
          west: { texture: "#post" },
          east: { texture: "#post" }
        }
      }
    ]
  };

  const geo = parseBlockModel(postModel);
  const posAttr = geo.getAttribute("position");

  let minX = Infinity, maxX = -Infinity;
  let minZ = Infinity, maxZ = -Infinity;
  let minY = Infinity, maxY = -Infinity;

  for (let i = 0; i < posAttr.count; i++) {
    minX = Math.min(minX, posAttr.getX(i));
    maxX = Math.max(maxX, posAttr.getX(i));
    minY = Math.min(minY, posAttr.getY(i));
    maxY = Math.max(maxY, posAttr.getY(i));
    minZ = Math.min(minZ, posAttr.getZ(i));
    maxZ = Math.max(maxZ, posAttr.getZ(i));
  }

  assertClose(minX, 6 / 16, "Post minX");
  assertClose(maxX, 10 / 16, "Post maxX");
  assertClose(minY, 0.0, "Post minY");
  assertClose(maxY, 1.0, "Post maxY");
  assertClose(minZ, 6 / 16, "Post minZ");
  assertClose(maxZ, 10 / 16, "Post maxZ");
});

test("getDefaultFaceUV computes authentic Minecraft default UV coordinates", () => {
  const from = [2, 4, 6];
  const to = [14, 12, 10];

  assert.deepEqual(getDefaultFaceUV("down", from, to), [2, 16 - 10, 14, 16 - 6]);
  assert.deepEqual(getDefaultFaceUV("up", from, to), [2, 6, 14, 10]);
  assert.deepEqual(getDefaultFaceUV("north", from, to), [16 - 14, 16 - 12, 16 - 2, 16 - 4]);
  assert.deepEqual(getDefaultFaceUV("south", from, to), [2, 16 - 12, 14, 16 - 4]);
  assert.deepEqual(getDefaultFaceUV("west", from, to), [6, 16 - 12, 10, 16 - 4]);
  assert.deepEqual(getDefaultFaceUV("east", from, to), [16 - 10, 16 - 12, 16 - 6, 16 - 4]);
});

test("resolveFaceUV correctly handles explicit UVs with v-flip", () => {
  const explicitFace = { uv: [4, 2, 12, 14] };
  const uvs = resolveFaceUV(explicitFace, "north", [0, 0, 0], [16, 16, 16]);

  // v0 (u0, v1): [4/16, 1 - 2/16] = [0.25, 0.875]
  // v1 (u0, v3): [4/16, 1 - 14/16] = [0.25, 0.125]
  // v2 (u2, v3): [12/16, 1 - 14/16] = [0.75, 0.125]
  // v3 (u2, v1): [12/16, 1 - 2/16] = [0.75, 0.875]
  assertClose(uvs[0][0], 0.25);
  assertClose(uvs[0][1], 0.875);
  assertClose(uvs[1][0], 0.25);
  assertClose(uvs[1][1], 0.125);
  assertClose(uvs[2][0], 0.75);
  assertClose(uvs[2][1], 0.125);
  assertClose(uvs[3][0], 0.75);
  assertClose(uvs[3][1], 0.875);
});

test("resolveFaceUV correctly handles UV rotations: 0, 90, 180, 270", () => {
  const base = { uv: [0, 0, 16, 16] };

  const rot0 = resolveFaceUV({ ...base, rotation: 0 }, "up", [0, 0, 0], [16, 16, 16]);
  assert.deepEqual(rot0, [
    [0, 1],
    [0, 0],
    [1, 0],
    [1, 1]
  ]);

  const rot90 = resolveFaceUV({ ...base, rotation: 90 }, "up", [0, 0, 0], [16, 16, 16]);
  assert.deepEqual(rot90, [
    [0, 0],
    [1, 0],
    [1, 1],
    [0, 1]
  ]);

  const rot180 = resolveFaceUV({ ...base, rotation: 180 }, "up", [0, 0, 0], [16, 16, 16]);
  assert.deepEqual(rot180, [
    [1, 0],
    [1, 1],
    [0, 1],
    [0, 0]
  ]);

  const rot270 = resolveFaceUV({ ...base, rotation: 270 }, "up", [0, 0, 0], [16, 16, 16]);
  assert.deepEqual(rot270, [
    [1, 1],
    [0, 1],
    [0, 0],
    [1, 0]
  ]);
});

test("rotateElementVertex supports 45 deg, 22.5 deg on X, Y, Z axes around pivot", () => {
  // Test Y-axis 45 deg around center [8, 8, 8]
  const rotY45 = { origin: [8, 8, 8], axis: "y", angle: 45, rescale: false };
  const v1 = rotateElementVertex([8, 8, 0], rotY45);
  assertClose(v1[0], 8 - 8 * Math.sin(Math.PI / 4), "Rotated X");
  assertClose(v1[1], 8, "Y untouched on Y axis");
  assertClose(v1[2], 8 - 8 * Math.cos(Math.PI / 4), "Rotated Z");

  // Test X-axis 45 deg around center [8, 8, 8]
  const rotX45 = { origin: [8, 8, 8], axis: "x", angle: 45, rescale: false };
  const vX = rotateElementVertex([8, 16, 8], rotX45);
  assertClose(vX[0], 8, "X untouched on X axis");
  assertClose(vX[1], 8 + 8 * Math.cos(Math.PI / 4), "Rotated Y");
  assertClose(vX[2], 8 + 8 * Math.sin(Math.PI / 4), "Rotated Z");

  // Test Z-axis 22.5 deg around custom origin [4, 4, 4]
  const rotZ225 = { origin: [4, 4, 4], axis: "z", angle: 22.5, rescale: false };
  const vZ = rotateElementVertex([12, 4, 4], rotZ225);
  const rad225 = 22.5 * (Math.PI / 180);
  assertClose(vZ[0], 4 + 8 * Math.cos(rad225), "Rotated X");
  assertClose(vZ[1], 4 + 8 * Math.sin(rad225), "Rotated Y");
  assertClose(vZ[2], 4, "Z untouched on Z axis");
});

test("rotateElementVertex supports rescale: true compensation (scale by 1/cos(angle))", () => {
  // Diagonal plane from (0, 0, 8) to (16, 16, 8) rotated 45 deg with rescale
  const rotRescale45 = { origin: [8, 8, 8], axis: "y", angle: 45, rescale: true };

  const pLeft = rotateElementVertex([0, 0, 8], rotRescale45);
  const pRight = rotateElementVertex([16, 0, 8], rotRescale45);

  // Scaled by 1/cos(45) = sqrt(2): relative x = -8 * sqrt(2), rotates exactly to corners
  assertClose(pLeft[0], 0.0, "Rescaled corner X1");
  assertClose(pLeft[2], 16.0, "Rescaled corner Z1");
  assertClose(pRight[0], 16.0, "Rescaled corner X2");
  assertClose(pRight[2], 0.0, "Rescaled corner Z2");

  // Also test 22.5 deg with rescale: true
  const rotRescale225 = { origin: [8, 8, 8], axis: "y", angle: 22.5, rescale: true };
  const p225 = rotateElementVertex([16, 8, 8], rotRescale225);
  const scale225 = 1.0 / Math.cos(22.5 * Math.PI / 180);
  const relX = 8 * scale225;
  const expX = 8 + relX * Math.cos(22.5 * Math.PI / 180);
  assertClose(p225[0], expX, "Rescaled 22.5 deg X touches 16");
});

test("parseBlockModel computes accurate face normals and orthogonal tangents", () => {
  const model = {
    elements: [
      {
        from: [0, 0, 0],
        to: [16, 16, 16],
        faces: {
          down: { texture: "#all" },
          up: { texture: "#all" },
          north: { texture: "#all" },
          south: { texture: "#all" },
          west: { texture: "#all" },
          east: { texture: "#all" }
        }
      }
    ]
  };

  const geo = parseBlockModel(model);
  const normAttr = geo.getAttribute("normal");
  const tanAttr = geo.getAttribute("tangent");

  assert.equal(normAttr.count, 36);
  assert.equal(tanAttr.count, 36);

  for (let i = 0; i < 36; i++) {
    const nx = normAttr.getX(i);
    const ny = normAttr.getY(i);
    const nz = normAttr.getZ(i);
    const normLen = Math.hypot(nx, ny, nz);
    assertClose(normLen, 1.0, `Normal ${i} must be unit length`);

    const tx = tanAttr.getX(i);
    const ty = tanAttr.getY(i);
    const tz = tanAttr.getZ(i);
    const tw = tanAttr.getW(i);
    const tanLen = Math.hypot(tx, ty, tz);
    assertClose(tanLen, 1.0, `Tangent ${i} xyz must be unit length`);
    assert.ok(tw === 1.0 || tw === -1.0, `Tangent ${i} w must be +/-1.0`);

    // Tangent must be orthogonal to normal: dot(N, T) == 0
    const dot = nx * tx + ny * ty + nz * tz;
    assertClose(dot, 0.0, `Tangent ${i} must be orthogonal to normal`);
  }
});

test("parseBlockModel manages face groups and resolves recursive texture variables", () => {
  const model = {
    textures: {
      particle: "block/stone",
      base: "block/stone",
      all: "#base",
      top: "#all",
      side: "block/cobblestone"
    },
    elements: [
      {
        from: [0, 0, 0],
        to: [16, 16, 16],
        faces: {
          up: { texture: "#top" },
          down: { texture: "#base" },
          north: { texture: "#side" },
          south: { texture: "#side" }
        }
      }
    ]
  };

  assert.equal(resolveTextureVariable(model.textures, "#top"), "block/stone");
  assert.equal(resolveTextureVariable(model.textures, "#all"), "block/stone");
  assert.equal(resolveTextureVariable(model.textures, "#side"), "block/cobblestone");

  const geo = parseBlockModel(model);
  assert.equal(geo.groups.length, 4);

  const topFaceMeta = geo.userData.faceMetadata.find((m) => m.face === "up");
  assert.equal(topFaceMeta.texture, "#top");
  assert.equal(topFaceMeta.resolvedTexture, "block/stone");

  // Custom texture index map
  const customMap = new Map([
    ["#top", 5],
    ["#base", 2],
    ["#side", 9]
  ]);
  const geoWithCustomMap = parseBlockModel(model, { textureIndexMap: customMap });
  const customTop = geoWithCustomMap.userData.faceMetadata.find((m) => m.face === "up");
  assert.equal(customTop.materialIndex, 5);
});

test("error handling: invalid or empty model JSON", () => {
  // Non-objects and null
  assert.throws(() => parseBlockModel(null), TypeError);
  assert.throws(() => parseBlockModel(undefined), TypeError);
  assert.throws(() => parseBlockModel(123), TypeError);
  assert.throws(() => parseBlockModel(true), TypeError);
  assert.throws(() => parseBlockModel("invalid json string {"), TypeError);

  // Missing elements array
  assert.throws(() => parseBlockModel({}), {
    message: /'elements' array must be non-empty/
  });
  assert.throws(() => parseBlockModel({ elements: [] }), {
    message: /'elements' array must be non-empty/
  });
  assert.throws(() => parseBlockModel({ elements: "not-an-array" }), {
    message: /'elements' array must be non-empty/
  });

  // Invalid element inside elements
  assert.throws(() => parseBlockModel({ elements: [null] }), {
    message: /must be an object/
  });
  assert.throws(() => parseBlockModel({ elements: [{ from: [0, 0] }] }), {
    message: /missing or invalid 'from' or 'to'/
  });
  assert.throws(() => parseBlockModel({ elements: [{ from: [0, 0, 0], to: [16, 16] }] }), {
    message: /missing or invalid 'from' or 'to'/
  });
});

test("error handling: missing faces definition", () => {
  // Element missing faces property
  assert.throws(
    () => parseBlockModel({ elements: [{ from: [0, 0, 0], to: [16, 16, 16] }] }),
    { message: /missing 'faces' definition/ }
  );

  // Element with empty faces object
  assert.throws(
    () => parseBlockModel({ elements: [{ from: [0, 0, 0], to: [16, 16, 16], faces: {} }] }),
    { message: /no renderable faces found/ }
  );

  // Single valid face works without throwing
  const singleFace = parseBlockModel({
    elements: [
      {
        from: [0, 0, 0],
        to: [16, 16, 16],
        faces: {
          up: { texture: "#top" }
        }
      }
    ]
  });
  assert.equal(singleFace.getAttribute("position").count, 6);
});

test("allowEmpty option returns empty BufferGeometry safely", () => {
  const empty1 = parseBlockModel({}, { allowEmpty: true });
  assert.equal(empty1.getAttribute("position"), undefined);
  assert.equal(empty1.userData.elementsCount, 0);

  const empty2 = parseBlockModel({ elements: [] }, { allowEmpty: true });
  assert.equal(empty2.userData.elementsCount, 0);

  const empty3 = parseBlockModel(
    { elements: [{ from: [0, 0, 0], to: [16, 16, 16], faces: {} }] },
    { allowEmpty: true }
  );
  assert.equal(empty3.getAttribute("position").count, 0);
});
