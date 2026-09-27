/**
 * Minecraft Java Edition JSON Block Model Parser.
 *
 * Parses Minecraft block model JSON definitions (elements, from, to, faces, uv, rotation)
 * and constructs normalized Three.js BufferGeometry with authentic UV mappings,
 * normals, 4-component tangent vectors, and multi-material geometry groups.
 */

import * as ThreeDefault from "three";

const THREE = (typeof globalThis !== "undefined" && globalThis.THREE) || ThreeDefault;

export const FACE_NAMES = Object.freeze(["down", "up", "north", "south", "west", "east"]);

export const FACE_DIRECTIONS = Object.freeze({
  down: Object.freeze([0, -1, 0]),
  up: Object.freeze([0, 1, 0]),
  north: Object.freeze([0, 0, -1]),
  south: Object.freeze([0, 0, 1]),
  west: Object.freeze([-1, 0, 0]),
  east: Object.freeze([1, 0, 0])
});

/**
 * Returns the 4 corner vertices (in Minecraft 0..16 coordinates) for a given face.
 * Vertex order aligns with Minecraft Java FaceBakery:
 * Quad vertices: v0, v1, v2, v3
 * Triangulation: (v0, v1, v2) and (v0, v2, v3) with CCW front-facing winding.
 *
 * @param {string} faceName - One of 'down', 'up', 'north', 'south', 'west', 'east'
 * @param {number[]} from - [x1, y1, z1]
 * @param {number[]} to - [x2, y2, z2]
 * @returns {number[][]} Array of 4 3D points [v0, v1, v2, v3]
 */
export function getFaceVertices(faceName, from, to) {
  const x1 = Math.min(from[0], to[0]);
  const y1 = Math.min(from[1], to[1]);
  const z1 = Math.min(from[2], to[2]);
  const x2 = Math.max(from[0], to[0]);
  const y2 = Math.max(from[1], to[1]);
  const z2 = Math.max(from[2], to[2]);

  switch (faceName.toLowerCase()) {
    case "down":
      return [
        [x1, y1, z2],
        [x1, y1, z1],
        [x2, y1, z1],
        [x2, y1, z2]
      ];
    case "up":
      return [
        [x1, y2, z1],
        [x1, y2, z2],
        [x2, y2, z2],
        [x2, y2, z1]
      ];
    case "north":
      return [
        [x2, y2, z1],
        [x2, y1, z1],
        [x1, y1, z1],
        [x1, y2, z1]
      ];
    case "south":
      return [
        [x1, y2, z2],
        [x1, y1, z2],
        [x2, y1, z2],
        [x2, y2, z2]
      ];
    case "west":
      return [
        [x1, y2, z1],
        [x1, y1, z1],
        [x1, y1, z2],
        [x1, y2, z2]
      ];
    case "east":
      return [
        [x2, y2, z2],
        [x2, y1, z2],
        [x2, y1, z1],
        [x2, y2, z1]
      ];
    default:
      throw new Error(`Unknown face name: "${faceName}"`);
  }
}

/**
 * Computes default Minecraft UV coordinates [u1, v1, u2, v2] (0..16 scale)
 * inferred from the element's from/to coordinates when face.uv is omitted.
 * Matches Minecraft Java Edition FaceBakery logic.
 *
 * @param {string} faceName - Direction name
 * @param {number[]} from - [x1, y1, z1]
 * @param {number[]} to - [x2, y2, z2]
 * @returns {number[]} [u1, v1, u2, v2]
 */
export function getDefaultFaceUV(faceName, from, to) {
  const x1 = Math.min(from[0], to[0]);
  const y1 = Math.min(from[1], to[1]);
  const z1 = Math.min(from[2], to[2]);
  const x2 = Math.max(from[0], to[0]);
  const y2 = Math.max(from[1], to[1]);
  const z2 = Math.max(from[2], to[2]);

  switch (faceName.toLowerCase()) {
    case "down":
      return [x1, 16.0 - z2, x2, 16.0 - z1];
    case "up":
      return [x1, z1, x2, z2];
    case "north":
      return [16.0 - x2, 16.0 - y2, 16.0 - x1, 16.0 - y1];
    case "south":
      return [x1, 16.0 - y2, x2, 16.0 - y1];
    case "west":
      return [z1, 16.0 - y2, z2, 16.0 - y1];
    case "east":
      return [16.0 - z2, 16.0 - y2, 16.0 - z1, 16.0 - y1];
    default:
      return [0, 0, 16, 16];
  }
}

/**
 * Resolves 4 WebGL UV pairs [u, v] for the 4 quad vertices (0..1 range with v-flip).
 * Handles explicit UVs, default inferred UVs, and UV rotation (0, 90, 180, 270 deg).
 *
 * @param {object} faceDef - Face definition object
 * @param {string} faceName - Direction name
 * @param {number[]} from - [x1, y1, z1]
 * @param {number[]} to - [x2, y2, z2]
 * @returns {number[][]} Array of 4 UV pairs [[u0, v0], [u1, v1], [u2, v2], [u3, v3]]
 */
export function resolveFaceUV(faceDef, faceName, from, to) {
  const uvArray = Array.isArray(faceDef?.uv) && faceDef.uv.length === 4
    ? faceDef.uv
    : getDefaultFaceUV(faceName, from, to);

  const rawRotation = typeof faceDef?.rotation === "number" ? faceDef.rotation : 0;
  const normalizedRotation = ((rawRotation % 360) + 360) % 360;
  const rotStep = Math.floor(normalizedRotation / 90) % 4;

  const result = [];
  for (let j = 0; j < 4; j++) {
    const idx = (j + rotStep) % 4;
    const uMc = (idx !== 0 && idx !== 1) ? uvArray[2] : uvArray[0];
    const vMc = (idx !== 0 && idx !== 3) ? uvArray[3] : uvArray[1];

    // Convert from Minecraft [0..16, origin top-left] to WebGL [0..1, origin bottom-left]
    const uWebGL = uMc / 16.0;
    const vWebGL = 1.0 - (vMc / 16.0);
    result.push([uWebGL, vWebGL]);
  }

  return result;
}

/**
 * Applies element rotation and optional rescale compensation around origin.
 *
 * @param {number[]} vertex - 3D point in 0..16 space [x, y, z]
 * @param {object|null|undefined} rotationDef - Element rotation definition
 * @returns {number[]} Transformed 3D point [x, y, z]
 */
export function rotateElementVertex(vertex, rotationDef) {
  if (!rotationDef || typeof rotationDef !== "object" || !rotationDef.angle) {
    return [vertex[0], vertex[1], vertex[2]];
  }

  const origin = Array.isArray(rotationDef.origin) && rotationDef.origin.length === 3
    ? rotationDef.origin
    : [8, 8, 8];

  const axis = typeof rotationDef.axis === "string" ? rotationDef.axis.toLowerCase() : "y";
  const angle = Number(rotationDef.angle) || 0;
  const rescale = Boolean(rotationDef.rescale);

  if (angle === 0) {
    return [vertex[0], vertex[1], vertex[2]];
  }

  const rad = angle * (Math.PI / 180.0);
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);

  // Translate relative to pivot
  let vx = vertex[0] - origin[0];
  let vy = vertex[1] - origin[1];
  let vz = vertex[2] - origin[2];

  // Rescale compensation on the two non-rotation axes: scale = 1 / cos(angle)
  if (rescale && Math.abs(cos) > 1e-6) {
    const scale = 1.0 / cos;
    if (axis === "x") {
      vy *= scale;
      vz *= scale;
    } else if (axis === "y") {
      vx *= scale;
      vz *= scale;
    } else if (axis === "z") {
      vx *= scale;
      vy *= scale;
    }
  }

  // Rotate around axis
  let rx = vx;
  let ry = vy;
  let rz = vz;

  if (axis === "x") {
    ry = vy * cos - vz * sin;
    rz = vy * sin + vz * cos;
  } else if (axis === "y") {
    rx = vx * cos + vz * sin;
    rz = -vx * sin + vz * cos;
  } else if (axis === "z") {
    rx = vx * cos - vy * sin;
    ry = vx * sin + vy * cos;
  }

  return [rx + origin[0], ry + origin[1], rz + origin[2]];
}

/**
 * Computes face normal for a triangle (v0, v1, v2).
 *
 * @param {number[]} v0
 * @param {number[]} v1
 * @param {number[]} v2
 * @returns {number[]} Normalized normal [nx, ny, nz]
 */
export function computeTriangleNormal(v0, v1, v2) {
  const ax = v1[0] - v0[0];
  const ay = v1[1] - v0[1];
  const az = v1[2] - v0[2];

  const bx = v2[0] - v0[0];
  const by = v2[1] - v0[1];
  const bz = v2[2] - v0[2];

  let nx = ay * bz - az * by;
  let ny = az * bx - ax * bz;
  let nz = ax * by - ay * bx;

  const len = Math.hypot(nx, ny, nz);
  if (len > 1e-7) {
    return [nx / len, ny / len, nz / len];
  }
  return [0, 1, 0];
}

/**
 * Computes 4-component tangent vector [tx, ty, tz, w] for a triangle.
 *
 * @param {number[]} v0
 * @param {number[]} v1
 * @param {number[]} v2
 * @param {number[]} uv0 - [u, v]
 * @param {number[]} uv1 - [u, v]
 * @param {number[]} uv2 - [u, v]
 * @param {number[]} normal - [nx, ny, nz]
 * @returns {number[]} 4-component tangent [tx, ty, tz, w]
 */
export function computeTriangleTangent(v0, v1, v2, uv0, uv1, uv2, normal) {
  const dp1x = v1[0] - v0[0];
  const dp1y = v1[1] - v0[1];
  const dp1z = v1[2] - v0[2];

  const dp2x = v2[0] - v0[0];
  const dp2y = v2[1] - v0[1];
  const dp2z = v2[2] - v0[2];

  const du1 = uv1[0] - uv0[0];
  const dv1 = uv1[1] - uv0[1];
  const du2 = uv2[0] - uv0[0];
  const dv2 = uv2[1] - uv0[1];

  const r = du1 * dv2 - du2 * dv1;

  if (Math.abs(r) < 1e-7) {
    let tx = 0;
    let ty = 0;
    let tz = 0;
    if (Math.abs(normal[1]) < 0.999) {
      tx = -normal[2];
      tz = normal[0];
    } else {
      ty = normal[2];
      tz = -normal[1];
    }
    const len = Math.hypot(tx, ty, tz) || 1.0;
    return [tx / len, ty / len, tz / len, 1.0];
  }

  const invR = 1.0 / r;
  const tx = (dp1x * dv2 - dp2x * dv1) * invR;
  const ty = (dp1y * dv2 - dp2y * dv1) * invR;
  const tz = (dp1z * dv2 - dp2z * dv1) * invR;

  const bx = (dp2x * du1 - dp1x * du2) * invR;
  const by = (dp2y * du1 - dp1y * du2) * invR;
  const bz = (dp2z * du1 - dp1z * du2) * invR;

  // Gram-Schmidt orthogonalize
  const dotNT = normal[0] * tx + normal[1] * ty + normal[2] * tz;
  let ox = tx - normal[0] * dotNT;
  let oy = ty - normal[1] * dotNT;
  let oz = tz - normal[2] * dotNT;
  const len = Math.hypot(ox, oy, oz);

  if (len > 1e-7) {
    ox /= len;
    oy /= len;
    oz /= len;
  } else {
    ox = 1.0;
    oy = 0.0;
    oz = 0.0;
  }

  // Handedness: cross(N, T) . B
  const crossNBx = normal[1] * oz - normal[2] * oy;
  const crossNBy = normal[2] * ox - normal[0] * oz;
  const crossNBz = normal[0] * oy - normal[1] * ox;
  const dotB = crossNBx * bx + crossNBy * by + crossNBz * bz;
  const w = dotB < 0 ? -1.0 : 1.0;

  return [ox, oy, oz, w];
}

export const calculateTangent = computeTriangleTangent;

/**
 * Resolves texture reference string against the model's textures registry.
 * Resolves recursive references (e.g. #side -> #all -> block/stone) up to max depth.
 *
 * @param {object} textures - Textures object from model
 * @param {string} textureRef - Reference string like '#side' or 'block/stone'
 * @param {number} [maxDepth=10]
 * @returns {string} Resolved texture resource path or original reference
 */
export function resolveTextureVariable(textures, textureRef, maxDepth = 10) {
  if (typeof textureRef !== "string") {
    return "";
  }
  let current = textureRef.trim();
  let depth = 0;
  while (current.startsWith("#") && textures && depth < maxDepth) {
    const key = current.slice(1);
    if (typeof textures[key] === "string") {
      current = textures[key].trim();
      depth++;
    } else {
      break;
    }
  }
  return current;
}

/**
 * Parses a Minecraft Java block model JSON definition and constructs a Three.js BufferGeometry.
 *
 * @param {object|string} model - Block model definition object or JSON string
 * @param {object} [options={}] - Parser options
 * @param {boolean} [options.center=false] - When true, centers geometry in [-0.5, 0.5]^3; when false, [0, 1]^3
 * @param {object} [options.three] - Optional custom Three.js instance
 * @param {Map|object} [options.textureIndexMap] - Optional texture-to-materialIndex mapping
 * @param {boolean} [options.allowEmpty=false] - When true, returns empty geometry instead of throwing on empty model
 * @param {boolean} [options.computeTangents=true] - When true, computes 4-component tangent attributes
 * @returns {THREE.BufferGeometry} Constructed BufferGeometry with metadata
 */
export function parseBlockModel(model, options = {}) {
  let modelJson = model;
  if (typeof modelJson === "string") {
    try {
      modelJson = JSON.parse(modelJson);
    } catch (err) {
      throw new TypeError(`Invalid block model JSON string: ${err.message}`);
    }
  }

  if (!modelJson || typeof modelJson !== "object") {
    throw new TypeError("Invalid block model: expected a model object or JSON string");
  }

  const threeInstance = options.three || THREE;
  const allowEmpty = Boolean(options.allowEmpty);
  const isCentered = Boolean(options.center);
  const elements = modelJson.elements;

  if (!Array.isArray(elements) || elements.length === 0) {
    if (allowEmpty) {
      const emptyGeo = new threeInstance.BufferGeometry();
      emptyGeo.geometry = emptyGeo;
      emptyGeo.textures = modelJson.textures || {};
      emptyGeo.userData = {
        textures: modelJson.textures || {},
        faceMetadata: [],
        elementsCount: 0,
        centered: isCentered
      };
      return emptyGeo;
    }
    throw new Error("Invalid block model: 'elements' array must be non-empty");
  }

  const positions = [];
  const normals = [];
  const uvs = [];
  const tangents = [];
  const faceMetadata = [];

  const textures = modelJson.textures || {};
  const textureMaterialMap = new Map();
  let nextMaterialIndex = 0;

  let vertexCount = 0;

  for (let elIdx = 0; elIdx < elements.length; elIdx++) {
    const el = elements[elIdx];
    if (!el || typeof el !== "object") {
      throw new Error(`Invalid block model element at index ${elIdx}: must be an object`);
    }

    if (!Array.isArray(el.from) || el.from.length !== 3 || !Array.isArray(el.to) || el.to.length !== 3) {
      throw new Error(`Invalid block model element at index ${elIdx}: missing or invalid 'from' or 'to' coordinates`);
    }

    if (!el.faces || typeof el.faces !== "object") {
      throw new Error(`Invalid block model element at index ${elIdx}: missing 'faces' definition`);
    }

    const from = el.from.map(Number);
    const to = el.to.map(Number);
    const rotationDef = el.rotation;

    for (const faceKey of FACE_NAMES) {
      const faceDef = el.faces[faceKey];
      if (!faceDef || typeof faceDef !== "object") {
        continue;
      }

      // 1. Get face corner vertices in 0..16 space
      const baseCorners = getFaceVertices(faceKey, from, to);

      // 2. Apply element rotation and rescale
      const rotatedCorners = baseCorners.map((pt) => rotateElementVertex(pt, rotationDef));

      // 3. Normalize coordinates to [0, 1]^3 and optional centering
      const normCorners = rotatedCorners.map((pt) => {
        let x = pt[0] / 16.0;
        let y = pt[1] / 16.0;
        let z = pt[2] / 16.0;
        if (isCentered) {
          x -= 0.5;
          y -= 0.5;
          z -= 0.5;
        }
        return [x, y, z];
      });

      // 4. Resolve UVs for the 4 corners
      const faceUvs = resolveFaceUV(faceDef, faceKey, from, to);

      // 5. Triangulate quad: Tri 1 (0, 1, 2) and Tri 2 (0, 2, 3)
      const v0 = normCorners[0];
      const v1 = normCorners[1];
      const v2 = normCorners[2];
      const v3 = normCorners[3];

      const uv0 = faceUvs[0];
      const uv1 = faceUvs[1];
      const uv2 = faceUvs[2];
      const uv3 = faceUvs[3];

      const tri1Normal = computeTriangleNormal(v0, v1, v2);
      const tri2Normal = computeTriangleNormal(v0, v2, v3);

      const tri1Tangent = computeTriangleTangent(v0, v1, v2, uv0, uv1, uv2, tri1Normal);
      const tri2Tangent = computeTriangleTangent(v0, v2, v3, uv0, uv2, uv3, tri2Normal);

      // Tri 1 vertices
      positions.push(...v0, ...v1, ...v2);
      normals.push(...tri1Normal, ...tri1Normal, ...tri1Normal);
      uvs.push(...uv0, ...uv1, ...uv2);
      tangents.push(...tri1Tangent, ...tri1Tangent, ...tri1Tangent);

      // Tri 2 vertices
      positions.push(...v0, ...v2, ...v3);
      normals.push(...tri2Normal, ...tri2Normal, ...tri2Normal);
      uvs.push(...uv0, ...uv2, ...uv3);
      tangents.push(...tri2Tangent, ...tri2Tangent, ...tri2Tangent);

      // 6. Material group handling
      const rawTexture = typeof faceDef.texture === "string" ? faceDef.texture : "";
      const resolvedTexture = resolveTextureVariable(textures, rawTexture);

      let materialIndex = 0;
      if (options.textureIndexMap instanceof Map) {
        if (options.textureIndexMap.has(rawTexture)) {
          materialIndex = options.textureIndexMap.get(rawTexture);
        } else if (options.textureIndexMap.has(resolvedTexture)) {
          materialIndex = options.textureIndexMap.get(resolvedTexture);
        }
      } else if (typeof options.textureIndexMap === "object" && options.textureIndexMap !== null) {
        if (rawTexture in options.textureIndexMap) {
          materialIndex = options.textureIndexMap[rawTexture];
        } else if (resolvedTexture in options.textureIndexMap) {
          materialIndex = options.textureIndexMap[resolvedTexture];
        }
      } else {
        const lookupKey = rawTexture || resolvedTexture || `mat_${nextMaterialIndex}`;
        if (!textureMaterialMap.has(lookupKey)) {
          textureMaterialMap.set(lookupKey, nextMaterialIndex++);
        }
        materialIndex = textureMaterialMap.get(lookupKey);
      }

      faceMetadata.push({
        elementIndex: elIdx,
        face: faceKey,
        texture: rawTexture,
        resolvedTexture,
        cullface: typeof faceDef.cullface === "string" ? faceDef.cullface : null,
        tintindex: typeof faceDef.tintindex === "number" ? faceDef.tintindex : -1,
        rotation: typeof faceDef.rotation === "number" ? faceDef.rotation : 0,
        materialIndex,
        startVertex: vertexCount,
        vertexCount: 6
      });

      vertexCount += 6;
    }
  }

  if (vertexCount === 0 && !allowEmpty) {
    throw new Error("Invalid block model: no renderable faces found in elements");
  }

  const geometry = new threeInstance.BufferGeometry();
  geometry.setAttribute("position", new threeInstance.BufferAttribute(new Float32Array(positions), 3));
  geometry.setAttribute("normal", new threeInstance.BufferAttribute(new Float32Array(normals), 3));
  geometry.setAttribute("uv", new threeInstance.BufferAttribute(new Float32Array(uvs), 2));
  geometry.setAttribute("tangent", new threeInstance.BufferAttribute(new Float32Array(tangents), 4));

  // Add geometry groups
  for (const meta of faceMetadata) {
    geometry.addGroup(meta.startVertex, meta.vertexCount, meta.materialIndex);
  }

  // Attach metadata and convenience accessors
  geometry.geometry = geometry;
  geometry.textures = textures;
  geometry.userData = {
    textures,
    faceMetadata,
    elementsCount: elements.length,
    centered: isCentered
  };

  return geometry;
}

export const createBlockModelGeometry = parseBlockModel;
export const parseBlockModelGeometry = parseBlockModel;