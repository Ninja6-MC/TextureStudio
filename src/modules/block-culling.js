/**
 * Cross-Quad Plant Geometry & Multiblock Face Culling.
 *
 * Generates diagonal cross-quad geometries (minecraft:block/cross) for plants,
 * flowers, and saplings, and provides multiblock interior face culling (cullface)
 * for voxel terrain and platform rendering in Three.js.
 */

import * as ThreeDefault from "three";
import {
  FACE_NAMES,
  FACE_DIRECTIONS,
  computeTriangleNormal,
  computeTriangleTangent,
  getFaceVertices,
  resolveFaceUV
} from "./block-model.js";

const THREE = (typeof globalThis !== "undefined" && globalThis.THREE) || ThreeDefault;

export { FACE_NAMES, FACE_DIRECTIONS };

export const DIRECTION_OFFSETS = Object.freeze({
  down: Object.freeze([0, -1, 0]),
  up: Object.freeze([0, 1, 0]),
  north: Object.freeze([0, 0, -1]),
  south: Object.freeze([0, 0, 1]),
  west: Object.freeze([-1, 0, 0]),
  east: Object.freeze([1, 0, 0])
});

export const OPPOSITE_DIRECTIONS = Object.freeze({
  down: "up",
  up: "down",
  north: "south",
  south: "north",
  west: "east",
  east: "west"
});

/**
 * Minecraft plant and cross-quad block identifiers.
 */
export const CROSS_PLANT_BLOCK_IDS = Object.freeze(new Set([
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
  "mangrove_propagule",
  "pale_oak_sapling",
  "bamboo_sapling",
  "sugar_cane",
  "brown_mushroom",
  "red_mushroom",
  "crimson_fungus",
  "warped_fungus",
  "crimson_roots",
  "warped_roots",
  "nether_sprouts",
  "weeping_vines",
  "twisting_vines",
  "sweet_berry_bush",
  "cave_vines",
  "small_dripleaf",
  "hanging_roots",
  "pitcher_plant",
  "torchflower"
]));

/**
 * Non-solid or transparent blocks that do not cull adjacent solid faces.
 */
export const NON_SOLID_BLOCK_IDS = Object.freeze(new Set([
  "air",
  "cave_air",
  "void_air",
  "glass",
  "white_stained_glass",
  "orange_stained_glass",
  "magenta_stained_glass",
  "light_blue_stained_glass",
  "yellow_stained_glass",
  "lime_stained_glass",
  "pink_stained_glass",
  "gray_stained_glass",
  "light_gray_stained_glass",
  "cyan_stained_glass",
  "purple_stained_glass",
  "blue_stained_glass",
  "brown_stained_glass",
  "green_stained_glass",
  "red_stained_glass",
  "black_stained_glass",
  "tinted_glass",
  "water",
  "lava",
  "tripwire",
  "fire",
  "soul_fire"
]));

/**
 * Normalizes a block identifier by removing namespaces and blockstate brackets.
 *
 * @param {string} blockId - Raw block identifier
 * @returns {string} Clean normalized block identifier
 */
export function normalizeBlockId(blockId) {
  if (typeof blockId !== "string") {
    return "";
  }
  let id = blockId.trim().toLowerCase();
  if (id.startsWith("minecraft:")) {
    id = id.slice(10);
  }
  const bracketIndex = id.indexOf("[");
  if (bracketIndex !== -1) {
    id = id.slice(0, bracketIndex);
  }
  return id;
}

/**
 * Checks whether a block identifier corresponds to a plant or cross-quad model.
 *
 * @param {string} blockId - Block identifier
 * @returns {boolean} True if the block is a plant or cross-quad model
 */
export function isPlantOrCrossBlock(blockId) {
  if (typeof blockId !== "string") {
    return false;
  }
  const id = normalizeBlockId(blockId);
  if (!id) {
    return false;
  }
  if (CROSS_PLANT_BLOCK_IDS.has(id)) {
    return true;
  }
  if (id.endsWith("_sapling") || id.endsWith("_tulip") || id.endsWith("_roots")) {
    return true;
  }
  return false;
}

export const isCrossModel = isPlantOrCrossBlock;

/**
 * Evaluates whether a block is solid/opaque for face culling.
 * Non-solid blocks (e.g. cross-quad plants, glass, air) do not cull adjacent faces.
 *
 * @param {object|string} blockOrId - Block object or block identifier
 * @param {object} [options={}] - Options
 * @param {boolean} [options.treatGlassAsSolid=false] - When true, treats glass as solid
 * @returns {boolean} True if solid
 */
export function isSolidBlock(blockOrId, options = {}) {
  if (blockOrId === null || blockOrId === undefined) {
    return false;
  }
  if (typeof blockOrId === "object") {
    if (typeof blockOrId.solid === "boolean") {
      return blockOrId.solid;
    }
    if (blockOrId.transparent === true || blockOrId.isTransparent === true) {
      return false;
    }
    const id = blockOrId.id || blockOrId.type || blockOrId.name || blockOrId.blockId;
    return isSolidBlock(id, options);
  }
  if (typeof blockOrId !== "string") {
    return false;
  }
  const id = normalizeBlockId(blockOrId);
  if (!id) {
    return false;
  }
  if (isPlantOrCrossBlock(id)) {
    return false;
  }
  if (NON_SOLID_BLOCK_IDS.has(id)) {
    if (options.treatGlassAsSolid && id.includes("glass")) {
      return true;
    }
    return false;
  }
  if (id.endsWith("_stained_glass") || id.endsWith("_glass_pane")) {
    return false;
  }
  return true;
}

/**
 * Generates Three.js BufferGeometry for minecraft:block/cross (diagonal X-shaped quads).
 * Constructs 2 vertical diagonal quads intersecting at the center:
 *   - Quad 1: (0, 0, 0) to (1, 1, 1)
 *   - Quad 2: (0, 0, 1) to (1, 1, 0)
 *
 * @param {object} [options={}] - Geometry options
 * @param {boolean} [options.center=false] - Centered in [-0.5, 0.5]^3 when true; [0, 1]^3 when false
 * @param {number} [options.width=1.0] - Quad width
 * @param {number} [options.height=1.0] - Quad height
 * @param {number} [options.depth] - Quad depth (defaults to width)
 * @param {number} [options.scale=1.0] - Uniform scale factor
 * @param {number} [options.materialIndex=0] - Material index for geometry group
 * @param {object} [options.three] - Optional Three.js instance
 * @returns {THREE.BufferGeometry} BufferGeometry configured with DoubleSide
 */
export function createCrossQuadGeometry(options = {}) {
  const threeInstance = options.three || THREE;
  const isCentered = Boolean(options.center);
  const width = typeof options.width === "number" ? options.width : (typeof options.scale === "number" ? options.scale : 1.0);
  const height = typeof options.height === "number" ? options.height : (typeof options.scale === "number" ? options.scale : 1.0);
  const depth = typeof options.depth === "number" ? options.depth : width;

  let x0 = 0.0;
  let x1 = width;
  let y0 = 0.0;
  let y1 = height;
  let z0 = 0.0;
  let z1 = depth;

  if (isCentered) {
    x0 = -width * 0.5;
    x1 = width * 0.5;
    y0 = -height * 0.5;
    y1 = height * 0.5;
    z0 = -depth * 0.5;
    z1 = depth * 0.5;
  }

  // Quad 1: along diagonal (x0, y0, z0) to (x1, y1, z1)
  const q1v0 = [x0, y1, z0];
  const q1v1 = [x0, y0, z0];
  const q1v2 = [x1, y0, z1];
  const q1v3 = [x1, y1, z1];

  // Quad 2: along diagonal (x0, y0, z1) to (x1, y1, z0)
  const q2v0 = [x0, y1, z1];
  const q2v1 = [x0, y0, z1];
  const q2v2 = [x1, y0, z0];
  const q2v3 = [x1, y1, z0];

  const uv0 = [0.0, 1.0];
  const uv1 = [0.0, 0.0];
  const uv2 = [1.0, 0.0];
  const uv3 = [1.0, 1.0];

  const positions = [];
  const normals = [];
  const uvs = [];
  const tangents = [];

  function appendQuad(v0, v1, v2, v3) {
    const n1 = computeTriangleNormal(v0, v1, v2);
    const n2 = computeTriangleNormal(v0, v2, v3);

    const t1 = computeTriangleTangent(v0, v1, v2, uv0, uv1, uv2, n1);
    const t2 = computeTriangleTangent(v0, v2, v3, uv0, uv2, uv3, n2);

    // Tri 1: v0, v1, v2
    positions.push(...v0, ...v1, ...v2);
    normals.push(...n1, ...n1, ...n1);
    uvs.push(...uv0, ...uv1, ...uv2);
    tangents.push(...t1, ...t1, ...t1);

    // Tri 2: v0, v2, v3
    positions.push(...v0, ...v2, ...v3);
    normals.push(...n2, ...n2, ...n2);
    uvs.push(...uv0, ...uv2, ...uv3);
    tangents.push(...t2, ...t2, ...t2);
  }

  appendQuad(q1v0, q1v1, q1v2, q1v3);
  appendQuad(q2v0, q2v1, q2v2, q2v3);

  const geometry = new threeInstance.BufferGeometry();
  geometry.setAttribute("position", new threeInstance.BufferAttribute(new Float32Array(positions), 3));
  geometry.setAttribute("normal", new threeInstance.BufferAttribute(new Float32Array(normals), 3));
  geometry.setAttribute("uv", new threeInstance.BufferAttribute(new Float32Array(uvs), 2));
  geometry.setAttribute("tangent", new threeInstance.BufferAttribute(new Float32Array(tangents), 4));

  geometry.addGroup(0, 12, options.materialIndex ?? 0);

  const doubleSide = threeInstance.DoubleSide !== undefined ? threeInstance.DoubleSide : 2;

  geometry.userData = {
    type: "cross",
    isCross: true,
    doubleSided: true,
    side: doubleSide,
    centered: isCentered,
    width,
    height,
    depth,
    quadsCount: 2
  };
  geometry.side = doubleSide;

  return geometry;
}

/**
 * Extracts 3D voxel coordinates [x, y, z] from a block object or array.
 *
 * @param {object|number[]} block - Block specification
 * @returns {number[]} [x, y, z] integer coordinates
 */
export function getBlockCoordinates(block) {
  if (Array.isArray(block)) {
    return [Number(block[0]) || 0, Number(block[1]) || 0, Number(block[2]) || 0];
  }
  if (block && typeof block === "object") {
    if (Array.isArray(block.position) && block.position.length >= 3) {
      return [Number(block.position[0]) || 0, Number(block.position[1]) || 0, Number(block.position[2]) || 0];
    }
    if (Array.isArray(block.pos) && block.pos.length >= 3) {
      return [Number(block.pos[0]) || 0, Number(block.pos[1]) || 0, Number(block.pos[2]) || 0];
    }
    if (block.position && typeof block.position === "object") {
      return [Number(block.position.x) || 0, Number(block.position.y) || 0, Number(block.position.z) || 0];
    }
    const x = typeof block.x === "number" ? block.x : Number(block.x) || 0;
    const y = typeof block.y === "number" ? block.y : Number(block.y) || 0;
    const z = typeof block.z === "number" ? block.z : Number(block.z) || 0;
    return [x, y, z];
  }
  return [0, 0, 0];
}

/**
 * Performs multiblock face culling across an array of blocks.
 * Omit interior touching faces between adjacent solid blocks based on neighbor
 * adjacency and Minecraft cullface rules.
 *
 * @param {Array<object>} blocks - Array of block definitions
 * @param {object} [options={}] - Culling options
 * @param {boolean} [options.treatGlassAsSolid=false] - Treat glass as solid for culling
 * @param {boolean} [options.ignoreCullface=false] - Force cull touching faces even without cullface
 * @returns {Array<object>} Rich array of retained faces with culled metadata attached
 */
export function cullMultiblockFaces(blocks, options = {}) {
  const blockList = Array.isArray(blocks) ? blocks : (blocks?.blocks || []);
  const grid = new Map();

  // 1. Build spatial index
  for (let i = 0; i < blockList.length; i++) {
    const b = blockList[i];
    const [x, y, z] = getBlockCoordinates(b);
    const key = `${x},${y},${z}`;
    grid.set(key, { block: b, index: i, x, y, z });
  }

  const culledFaces = [];
  const retainedFaces = [];
  const blocksReport = [];
  let totalFacesCount = 0;

  // 2. Process each block
  for (let i = 0; i < blockList.length; i++) {
    const b = blockList[i];
    const [x, y, z] = getBlockCoordinates(b);
    const blockId = b.id || b.type || b.name || b.blockId || (typeof b === "string" ? b : "stone");
    const isPlant = isPlantOrCrossBlock(blockId);
    const isSolid = isSolidBlock(b, options);

    const blockCulledFaces = [];
    const blockRetainedFaces = [];

    // Plants/cross-quad blocks do not have cubical outer faces and are not culled by solid neighbors
    if (isPlant) {
      blocksReport.push({
        block: b,
        index: i,
        id: blockId,
        position: [x, y, z],
        coords: [x, y, z],
        isSolid: false,
        isPlant: true,
        culledFaces: [],
        retainedFaces: [],
        culledCount: 0,
        retainedCount: 0,
        totalFaces: 0,
        visibleFaces: []
      });
      continue;
    }

    // Resolve faces to test for this block
    const facesToTest = [];

    if (b.model && Array.isArray(b.model.elements)) {
      // Model definition with elements
      for (let elIdx = 0; elIdx < b.model.elements.length; elIdx++) {
        const el = b.model.elements[elIdx];
        if (!el || !el.faces) continue;
        for (const faceKey of FACE_NAMES) {
          const faceDef = el.faces[faceKey];
          if (!faceDef) continue;
          facesToTest.push({
            face: faceKey,
            cullface: typeof faceDef.cullface === "string" ? faceDef.cullface.toLowerCase() : null,
            elementIndex: elIdx,
            faceDef
          });
        }
      }
    } else if (b.geometry?.userData?.faceMetadata) {
      // Three.js BufferGeometry with faceMetadata
      for (const meta of b.geometry.userData.faceMetadata) {
        facesToTest.push({
          face: meta.face,
          cullface: typeof meta.cullface === "string" ? meta.cullface.toLowerCase() : null,
          elementIndex: meta.elementIndex,
          materialIndex: meta.materialIndex,
          startVertex: meta.startVertex,
          vertexCount: meta.vertexCount
        });
      }
    } else if (Array.isArray(b.faces)) {
      // Explicit faces array: ["up", "down", ...] or [{ face: "up", cullface: "up" }]
      for (const f of b.faces) {
        if (typeof f === "string") {
          facesToTest.push({ face: f.toLowerCase(), cullface: f.toLowerCase() });
        } else if (f && typeof f === "object") {
          facesToTest.push({
            face: f.face.toLowerCase(),
            cullface: typeof f.cullface === "string" ? f.cullface.toLowerCase() : f.face.toLowerCase()
          });
        }
      }
    } else if (b.faces && typeof b.faces === "object") {
      // Explicit faces object: { up: { cullface: "up" } }
      for (const [faceKey, faceDef] of Object.entries(b.faces)) {
        facesToTest.push({
          face: faceKey.toLowerCase(),
          cullface: typeof faceDef?.cullface === "string" ? faceDef.cullface.toLowerCase() : faceKey.toLowerCase()
        });
      }
    } else {
      // Standard full block: all 6 canonical faces with cullface matching face direction
      for (const name of FACE_NAMES) {
        facesToTest.push({ face: name, cullface: name });
      }
    }

    totalFacesCount += facesToTest.length;

    // Check each face against neighbor
    for (const faceInfo of facesToTest) {
      const cullDir = faceInfo.cullface;
      let shouldCull = false;
      let neighborBlock = null;
      let neighborCoords = null;

      if (cullDir && DIRECTION_OFFSETS[cullDir]) {
        const offset = DIRECTION_OFFSETS[cullDir];
        const nx = x + offset[0];
        const ny = y + offset[1];
        const nz = z + offset[2];
        neighborCoords = [nx, ny, nz];

        const neighborEntry = grid.get(`${nx},${ny},${nz}`);
        if (neighborEntry) {
          neighborBlock = neighborEntry.block;
          const neighborSolid = isSolidBlock(neighborBlock, options);
          if (neighborSolid) {
            shouldCull = true;
          }
        }
      } else if (options.ignoreCullface && faceInfo.face && DIRECTION_OFFSETS[faceInfo.face]) {
        const offset = DIRECTION_OFFSETS[faceInfo.face];
        const nx = x + offset[0];
        const ny = y + offset[1];
        const nz = z + offset[2];
        neighborCoords = [nx, ny, nz];

        const neighborEntry = grid.get(`${nx},${ny},${nz}`);
        if (neighborEntry && isSolidBlock(neighborEntry.block, options)) {
          shouldCull = true;
          neighborBlock = neighborEntry.block;
        }
      }

      const faceRecord = {
        blockIndex: i,
        block: b,
        position: [x, y, z],
        face: faceInfo.face,
        cullface: faceInfo.cullface,
        elementIndex: faceInfo.elementIndex ?? 0,
        neighbor: neighborBlock,
        neighborPosition: neighborCoords
      };

      if (shouldCull) {
        culledFaces.push(faceRecord);
        blockCulledFaces.push(faceInfo.face);
      } else {
        retainedFaces.push(faceRecord);
        blockRetainedFaces.push(faceInfo.face);
      }
    }

    blocksReport.push({
      block: b,
      index: i,
      id: blockId,
      position: [x, y, z],
      coords: [x, y, z],
      isSolid,
      isPlant: false,
      culledFaces: blockCulledFaces,
      retainedFaces: blockRetainedFaces,
      culledCount: blockCulledFaces.length,
      retainedCount: blockRetainedFaces.length,
      totalFaces: facesToTest.length,
      visibleFaces: blockRetainedFaces
    });
  }

  const result = [...retainedFaces];
  result.culledFaces = culledFaces;
  result.retainedFaces = retainedFaces;
  result.culledCount = culledFaces.length;
  result.retainedCount = retainedFaces.length;
  result.facesCulled = culledFaces.length;
  result.facesRetained = retainedFaces.length;
  result.totalFaces = totalFacesCount;
  result.totalCount = totalFacesCount;
  result.blocks = blocksReport;

  return result;
}

export const filterCulledFaces = cullMultiblockFaces;

/**
 * Builds a single unified Three.js BufferGeometry for a multiblock structure,
 * containing only the retained (uncullable and non-culled) faces and cross-quad plants.
 *
 * @param {Array<object>} blocks - Array of block definitions
 * @param {object} [options={}] - Options passed to culling and geometry builders
 * @returns {THREE.BufferGeometry} Combined BufferGeometry for the multiblock
 */
export function buildCulledMultiblockGeometry(blocks, options = {}) {
  const threeInstance = options.three || THREE;
  const cullingResult = cullMultiblockFaces(blocks, options);

  const positions = [];
  const normals = [];
  const uvs = [];
  const tangents = [];

  for (const bReport of cullingResult.blocks) {
    const [bx, by, bz] = bReport.position;

    if (bReport.isPlant) {
      // Append cross-quad plant geometry translated to block position
      const plantGeo = createCrossQuadGeometry({ ...options, three: threeInstance });
      const posAttr = plantGeo.getAttribute("position");
      const normAttr = plantGeo.getAttribute("normal");
      const uvAttr = plantGeo.getAttribute("uv");
      const tanAttr = plantGeo.getAttribute("tangent");

      for (let v = 0; v < posAttr.count; v++) {
        positions.push(posAttr.getX(v) + bx, posAttr.getY(v) + by, posAttr.getZ(v) + bz);
        normals.push(normAttr.getX(v), normAttr.getY(v), normAttr.getZ(v));
        uvs.push(uvAttr.getX(v), uvAttr.getY(v));
        tangents.push(tanAttr.getX(v), tanAttr.getY(v), tanAttr.getZ(v), tanAttr.getW(v));
      }
      continue;
    }

    // Append retained faces
    for (const faceKey of bReport.retainedFaces) {
      const baseCorners = getFaceVertices(faceKey, [0, 0, 0], [16, 16, 16]);
      const normCorners = baseCorners.map(([cx, cy, cz]) => [
        (cx / 16.0) + bx,
        (cy / 16.0) + by,
        (cz / 16.0) + bz
      ]);

      const faceUvs = resolveFaceUV({ uv: [0, 0, 16, 16] }, faceKey, [0, 0, 0], [16, 16, 16]);

      const v0 = normCorners[0];
      const v1 = normCorners[1];
      const v2 = normCorners[2];
      const v3 = normCorners[3];

      const uv0 = faceUvs[0];
      const uv1 = faceUvs[1];
      const uv2 = faceUvs[2];
      const uv3 = faceUvs[3];

      const n1 = computeTriangleNormal(v0, v1, v2);
      const n2 = computeTriangleNormal(v0, v2, v3);

      const t1 = computeTriangleTangent(v0, v1, v2, uv0, uv1, uv2, n1);
      const t2 = computeTriangleTangent(v0, v2, v3, uv0, uv2, uv3, n2);

      // Tri 1: v0, v1, v2
      positions.push(...v0, ...v1, ...v2);
      normals.push(...n1, ...n1, ...n1);
      uvs.push(...uv0, ...uv1, ...uv2);
      tangents.push(...t1, ...t1, ...t1);

      // Tri 2: v0, v2, v3
      positions.push(...v0, ...v2, ...v3);
      normals.push(...n2, ...n2, ...n2);
      uvs.push(...uv0, ...uv2, ...uv3);
      tangents.push(...t2, ...t2, ...t2);
    }
  }

  const geometry = new threeInstance.BufferGeometry();
  geometry.setAttribute("position", new threeInstance.BufferAttribute(new Float32Array(positions), 3));
  geometry.setAttribute("normal", new threeInstance.BufferAttribute(new Float32Array(normals), 3));
  geometry.setAttribute("uv", new threeInstance.BufferAttribute(new Float32Array(uvs), 2));
  geometry.setAttribute("tangent", new threeInstance.BufferAttribute(new Float32Array(tangents), 4));

  geometry.userData = {
    culling: {
      culledCount: cullingResult.culledCount,
      retainedCount: cullingResult.retainedCount,
      blocksCount: cullingResult.blocks.length
    }
  };

  return geometry;
}

export const createMultiblockGeometry = buildCulledMultiblockGeometry;