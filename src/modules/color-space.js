/**
 * Texture color space definitions matching Three.js color space constants.
 */
export const COLOR_SPACES = Object.freeze({
  SRGB: (typeof globalThis !== "undefined" && globalThis.THREE?.SRGBColorSpace) || "srgb",
  NO_COLOR: (typeof globalThis !== "undefined" && globalThis.THREE?.NoColorSpace !== undefined)
    ? globalThis.THREE.NoColorSpace
    : "",
  LINEAR_SRGB: (typeof globalThis !== "undefined" && globalThis.THREE?.LinearSRGBColorSpace) || "srgb-linear"
});

/**
 * Resolves the appropriate color space for a given texture role.
 *
 * @param {string} textureRole - Role identifier ('albedo', 'diffuse', 'normal', 'pbr_data', 'specular')
 * @returns {string|null} Resolved color space constant or null if unrecognized
 */
export function getColorSpaceForRole(textureRole) {
  if (typeof textureRole !== "string") {
    return null;
  }

  const normalized = textureRole.trim().toLowerCase();
  switch (normalized) {
    case "albedo":
    case "diffuse":
      return (typeof globalThis !== "undefined" && globalThis.THREE?.SRGBColorSpace) || COLOR_SPACES.SRGB;
    case "normal":
    case "pbr_data":
    case "pbr-data":
    case "specular":
    case "roughness":
      return (typeof globalThis !== "undefined" && globalThis.THREE?.NoColorSpace !== undefined)
        ? globalThis.THREE.NoColorSpace
        : COLOR_SPACES.NO_COLOR;
    case "linear":
    case "linear_srgb":
    case "linear-srgb":
      return (typeof globalThis !== "undefined" && globalThis.THREE?.LinearSRGBColorSpace) || COLOR_SPACES.LINEAR_SRGB;
    default:
      return null;
  }
}

/**
 * Configures the color space on a Three.js texture according to its material role.
 * Ensures albedo/diffuse maps receive sRGB transfer while LabPBR data channels
 * (normals, roughness, specular) retain uncorrupted linear data.
 *
 * @param {object|null|undefined} texture - Three.js texture instance
 * @param {string} textureRole - Role identifier
 * @returns {object|null|undefined} The modified texture instance
 */
export function configureTextureColorSpace(texture, textureRole) {
  if (!texture) {
    return texture;
  }

  const targetColorSpace = getColorSpaceForRole(textureRole);
  if (targetColorSpace !== null) {
    texture.colorSpace = targetColorSpace;
  }

  return texture;
}

/**
 * Converts a normalized sRGB color channel [0.0, 1.0] to Linear-sRGB [0.0, 1.0].
 * Implements the standard IEC 61966-2-1 / Three.js SRGBToLinear transfer function.
 *
 * @param {number} c - sRGB channel value in [0, 1]
 * @returns {number} Linear-sRGB channel value in [0, 1]
 */
export function srgbToLinear(c) {
  return (c < 0.04045) ? c * 0.0773993808 : Math.pow(c * 0.9478672986 + 0.0521327014, 2.4);
}

/**
 * Converts a normalized Linear-sRGB color channel [0.0, 1.0] to sRGB [0.0, 1.0].
 * Implements the standard IEC 61966-2-1 / Three.js LinearToSRGB transfer function.
 *
 * @param {number} c - Linear-sRGB channel value in [0, 1]
 * @returns {number} sRGB channel value in [0, 1]
 */
export function linearToSrgb(c) {
  return (c < 0.0031308) ? c * 12.92 : 1.055 * Math.pow(Math.max(0, c), 0.41666) - 0.055;
}
