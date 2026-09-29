import * as THREE_DEFAULT from "three";

/**
 * Normalizes a hex string or number to a standard '#rrggbb' hex string.
 *
 * @param {string|number} color - Hex number (e.g. 0xffb366) or string (e.g. '#ffb366' or 'ffb366')
 * @returns {string} Lowercase '#rrggbb' hex string
 */
export function normalizeHexColor(color) {
  if (typeof color === "number") {
    return "#" + (color & 0xffffff).toString(16).padStart(6, "0").toLowerCase();
  }
  if (typeof color === "string") {
    const clean = color.trim().replace(/^#/, "");
    if (/^[0-9a-fA-F]{6}$/.test(clean)) {
      return "#" + clean.toLowerCase();
    }
  }
  return "#ffffff";
}

/**
 * Converts a hex string or number to an integer number (e.g. 0xffb366).
 *
 * @param {string|number} color
 * @returns {number} Integer color value
 */
export function hexToNumber(color) {
  if (typeof color === "number") {
    return color & 0xffffff;
  }
  if (typeof color === "string") {
    const clean = color.trim().replace(/^#/, "");
    const parsed = parseInt(clean, 16);
    if (!Number.isNaN(parsed)) {
      return parsed & 0xffffff;
    }
  }
  return 0xffffff;
}

/**
 * Normalizes an identifier or preset name into a canonical kebab-case string.
 *
 * @param {string} id - Raw preset identifier or user input
 * @returns {string} Normalized canonical identifier
 */
export function normalizePresetId(id) {
  if (typeof id !== "string") return "";
  return id
    .trim()
    .toLowerCase()
    .replace(/[_\s]+/g, "-");
}

/**
 * Canonical registry of lighting presets for TextureStudio.
 */
export const LIGHTING_PRESETS = Object.freeze({
  "trailer-golden-hour": Object.freeze({
    id: "trailer-golden-hour",
    name: "Trailer Golden Hour",
    description: "Cinematic warm amber sunlight with cool blue ambient fill replicating official Minecraft trailers.",
    sun: Object.freeze({
      color: "#ffb366",
      colorHex: 0xffb366,
      hex: "#ffb366",
      intensity: 1.2,
      azimuth: 55,
      elevation: 28,
      distance: 50,
      castShadow: true
    }),
    ambient: Object.freeze({
      color: "#8ca0ba",
      colorHex: 0x8ca0ba,
      hex: "#8ca0ba",
      intensity: 0.4
    }),
    fill: null,
    rim: null,
    extraLights: Object.freeze([])
  }),

  "noon-clear": Object.freeze({
    id: "noon-clear",
    name: "Noon Clear",
    description: "Neutral high-elevation direct sunlight with balanced ambient fill for clear surface inspection.",
    sun: Object.freeze({
      color: "#ffffff",
      colorHex: 0xffffff,
      hex: "#ffffff",
      intensity: 1.5,
      azimuth: 45,
      elevation: 85,
      distance: 50,
      castShadow: true
    }),
    ambient: Object.freeze({
      color: "#ffffff",
      colorHex: 0xffffff,
      hex: "#ffffff",
      intensity: 0.8
    }),
    fill: null,
    rim: null,
    extraLights: Object.freeze([])
  }),

  "studio-neutral": Object.freeze({
    id: "studio-neutral",
    name: "Studio Neutral",
    description: "Multi-angle diffuse 3-point lighting setup with neutral key, fill, bounce, and ambient illumination calibrated for accurate texture inspection.",
    sun: Object.freeze({
      color: "#ffffff",
      colorHex: 0xffffff,
      hex: "#ffffff",
      intensity: 1.0,
      azimuth: 35.54,
      elevation: 49.3,
      distance: 13.19,
      position: Object.freeze([5, 10, 7]),
      castShadow: true
    }),
    ambient: Object.freeze({
      color: "#ffffff",
      colorHex: 0xffffff,
      hex: "#ffffff",
      intensity: 0.4
    }),
    fill: Object.freeze({
      color: "#ffffff",
      colorHex: 0xffffff,
      hex: "#ffffff",
      intensity: 0.3,
      position: Object.freeze([-5, 2, -5])
    }),
    rim: Object.freeze({
      color: "#ffffff",
      colorHex: 0xffffff,
      hex: "#ffffff",
      intensity: 0.2,
      position: Object.freeze([0, -8, 0])
    }),
    extraLights: Object.freeze([
      Object.freeze({
        id: "fill",
        type: "directional",
        color: "#ffffff",
        colorHex: 0xffffff,
        hex: "#ffffff",
        intensity: 0.3,
        position: Object.freeze([-5, 2, -5])
      }),
      Object.freeze({
        id: "rim",
        type: "directional",
        color: "#ffffff",
        colorHex: 0xffffff,
        hex: "#ffffff",
        intensity: 0.2,
        position: Object.freeze([0, -8, 0])
      })
    ])
  })
});

export const DEFAULT_LIGHTING_PRESET = "studio-neutral";

export const DEFAULT_TONE_MAPPING = THREE_DEFAULT.ACESFilmicToneMapping;
export const DEFAULT_TONE_MAPPING_EXPOSURE = 1.0;

/**
 * Configures ACES Filmic or AgX tone mapping and exposure on a Three.js WebGLRenderer.
 *
 * @param {object} renderer - WebGLRenderer instance
 * @param {object} [options={}] - Options (toneMapping, exposure, THREE)
 * @returns {object} The configured renderer
 */
export function configureToneMapping(renderer, options = {}) {
  if (!renderer) {
    throw new TypeError("configureToneMapping requires a valid WebGLRenderer instance");
  }
  const THREE = options?.THREE || (typeof globalThis !== "undefined" && globalThis.THREE) || THREE_DEFAULT;
  const toneMapping = options.toneMapping ?? THREE.ACESFilmicToneMapping;
  const exposure = typeof options.exposure === "number" ? options.exposure : (options.toneMappingExposure ?? DEFAULT_TONE_MAPPING_EXPOSURE);

  renderer.toneMapping = toneMapping;
  renderer.toneMappingExposure = exposure;
  return renderer;
}

/**
 * Internal registry lookup map including aliases.
 */
const PRESET_ALIASES = new Map([
  ["trailer-golden-hour", "trailer-golden-hour"],
  ["trailer_golden_hour", "trailer-golden-hour"],
  ["golden-hour", "trailer-golden-hour"],
  ["golden_hour", "trailer-golden-hour"],
  ["goldenhour", "trailer-golden-hour"],
  ["trailer", "trailer-golden-hour"],
  ["golden", "trailer-golden-hour"],

  ["noon-clear", "noon-clear"],
  ["noon_clear", "noon-clear"],
  ["clear-noon", "noon-clear"],
  ["clear_noon", "noon-clear"],
  ["noon", "noon-clear"],
  ["clear", "noon-clear"],
  ["day", "noon-clear"],
  ["daylight", "noon-clear"],

  ["studio-neutral", "studio-neutral"],
  ["studio_neutral", "studio-neutral"],
  ["neutral-studio", "studio-neutral"],
  ["studio", "studio-neutral"],
  ["neutral", "studio-neutral"],
  ["three-point", "studio-neutral"],
  ["3-point", "studio-neutral"],
  ["3point", "studio-neutral"]
]);

const CUSTOM_PRESETS = new Map();

/**
 * Retrieves a lighting preset by its ID or alias (case- and whitespace-tolerant).
 *
 * @param {string|object} idOrConfig - Preset ID string, alias, or preset configuration object
 * @returns {object|null} Matched lighting preset object, or null if not found
 */
export function getLightingPreset(idOrConfig) {
  if (typeof idOrConfig === "object" && idOrConfig !== null) {
    if (idOrConfig.sun && idOrConfig.ambient) {
      return idOrConfig;
    }
    if (idOrConfig.id) {
      return getLightingPreset(idOrConfig.id);
    }
  }

  const normalized = normalizePresetId(idOrConfig);
  if (!normalized) return null;

  if (CUSTOM_PRESETS.has(normalized)) {
    return CUSTOM_PRESETS.get(normalized);
  }

  const canonicalId = PRESET_ALIASES.get(normalized) || normalized;
  if (LIGHTING_PRESETS[canonicalId]) {
    return LIGHTING_PRESETS[canonicalId];
  }

  return null;
}

/**
 * Registers or updates a custom lighting preset in the runtime registry.
 *
 * @param {object} preset - Preset configuration object
 * @returns {object} The registered preset
 */
export function registerLightingPreset(preset) {
  if (!preset || typeof preset !== "object") {
    throw new TypeError("Preset must be an object with sun and ambient configurations");
  }
  const id = normalizePresetId(preset.id || preset.name);
  if (!id) {
    throw new Error("Preset must have a non-empty id or name");
  }

  const normalizedPreset = {
    ...preset,
    id,
    name: preset.name || id,
    sun: {
      ...preset.sun,
      color: normalizeHexColor(preset.sun?.color ?? "#ffffff"),
      colorHex: hexToNumber(preset.sun?.color ?? 0xffffff),
      intensity: Number(preset.sun?.intensity ?? 1.0)
    },
    ambient: {
      ...preset.ambient,
      color: normalizeHexColor(preset.ambient?.color ?? "#ffffff"),
      colorHex: hexToNumber(preset.ambient?.color ?? 0xffffff),
      intensity: Number(preset.ambient?.intensity ?? 0.5)
    }
  };

  CUSTOM_PRESETS.set(id, Object.freeze(normalizedPreset));
  return normalizedPreset;
}

/**
 * Computes 3D Cartesian coordinates and normalized direction vectors from sun azimuth,
 * elevation, and distance.
 *
 * Follows Three.js standard conventions:
 * - Y is Up (vertical height).
 * - Ground plane is X-Z.
 * - Elevation 0 deg is at the horizon; 90 deg is zenith (+Y); -90 deg is nadir (-Y).
 * - Azimuth 0 deg is +Z (front); 90 deg is +X (right); 180 deg is -Z (back); 270 deg is -X (left).
 *
 * @param {number|object} [azimuthOrOptions=45] - Azimuth angle in degrees/radians, or options object
 * @param {number} [elevationArg=30] - Elevation angle in degrees/radians
 * @param {number} [distanceArg=50] - Distance from origin to the light source
 * @param {object} [optionsArg={}] - Optional configuration (degrees, radians, THREE)
 * @returns {object} Cartesian coordinates { x, y, z }, position, direction, and rayDirection
 */
export function calculateSunPosition(azimuthOrOptions = {}, elevationArg, distanceArg, optionsArg = {}) {
  let azimuth;
  let elevation;
  let distance;
  let degrees = true;
  let radians = false;
  let customThree = null;

  if (typeof azimuthOrOptions === "object" && azimuthOrOptions !== null) {
    azimuth = azimuthOrOptions.azimuth ?? 45;
    elevation = azimuthOrOptions.elevation ?? 30;
    distance = azimuthOrOptions.distance ?? 50;
    degrees = azimuthOrOptions.degrees ?? (azimuthOrOptions.radians ? false : true);
    radians = azimuthOrOptions.radians ?? false;
    customThree = azimuthOrOptions.THREE || null;
  } else {
    azimuth = azimuthOrOptions ?? 45;
    elevation = elevationArg ?? 30;
    distance = distanceArg ?? 50;
    const opts = (typeof optionsArg === "object" && optionsArg !== null) ? optionsArg : {};
    degrees = opts.degrees ?? (opts.radians ? false : true);
    radians = opts.radians ?? false;
    customThree = opts.THREE || null;
  }

  let azRad;
  let elRad;
  let azDeg;
  let elDeg;

  if (radians || !degrees) {
    azRad = Number(azimuth) || 0;
    elRad = Number(elevation) || 0;
    azDeg = (azRad * 180) / Math.PI;
    elDeg = (elRad * 180) / Math.PI;
  } else {
    azDeg = Number(azimuth) || 0;
    elDeg = Number(elevation) || 0;
    azRad = (azDeg * Math.PI) / 180;
    elRad = (elDeg * Math.PI) / 180;
  }

  const dist = Number(distance);
  const validDist = Number.isNaN(dist) ? 50 : dist;

  const cosEl = Math.cos(elRad);
  const sinEl = Math.sin(elRad);
  const sinAz = Math.sin(azRad);
  const cosAz = Math.cos(azRad);

  let x = validDist * cosEl * sinAz;
  let y = validDist * sinEl;
  let z = validDist * cosEl * cosAz;

  // Clean floating-point precision artifacts near zero
  if (Math.abs(x) < 1e-12) x = 0;
  if (Math.abs(y) < 1e-12) y = 0;
  if (Math.abs(z) < 1e-12) z = 0;

  // Normalized direction vector from origin towards the sun
  let dirX = cosEl * sinAz;
  let dirY = sinEl;
  let dirZ = cosEl * cosAz;
  if (Math.abs(dirX) < 1e-12) dirX = 0;
  if (Math.abs(dirY) < 1e-12) dirY = 0;
  if (Math.abs(dirZ) < 1e-12) dirZ = 0;

  const THREE = customThree || (typeof globalThis !== "undefined" && globalThis.THREE) || THREE_DEFAULT;

  const posVec = THREE?.Vector3 ? new THREE.Vector3(x, y, z) : { x, y, z };
  const dirVec = THREE?.Vector3 ? new THREE.Vector3(dirX, dirY, dirZ) : { x: dirX, y: dirY, z: dirZ };
  const rayVec = THREE?.Vector3 ? new THREE.Vector3(-dirX, -dirY, -dirZ) : { x: -dirX, y: -dirY, z: -dirZ };

  return {
    x,
    y,
    z,
    position: posVec,
    direction: dirVec,
    normal: dirVec,
    rayDirection: rayVec,
    lightDirection: rayVec,
    azimuth: azDeg,
    elevation: elDeg,
    azimuthRad: azRad,
    elevationRad: elRad,
    distance: validDist
  };
}

/**
 * Computes spherical azimuth and elevation angles from 3D Cartesian coordinates (X, Y, Z).
 *
 * @param {number|object|Array} posOrX - X coordinate, {x, y, z} object, or [x, y, z] array
 * @param {number} [yArg] - Y coordinate
 * @param {number} [zArg] - Z coordinate
 * @returns {object} Calculated azimuth, elevation, and distance
 */
export function calculateSunAngles(posOrX, yArg, zArg) {
  let x;
  let y;
  let z;

  if (typeof posOrX === "object" && posOrX !== null) {
    if (Array.isArray(posOrX)) {
      x = posOrX[0];
      y = posOrX[1];
      z = posOrX[2];
    } else {
      x = posOrX.x;
      y = posOrX.y;
      z = posOrX.z;
    }
  } else {
    x = posOrX;
    y = yArg;
    z = zArg;
  }

  x = Number(x) || 0;
  y = Number(y) || 0;
  z = Number(z) || 0;

  const distance = Math.sqrt(x * x + y * y + z * z);
  if (distance === 0) {
    return {
      azimuth: 0,
      elevation: 90,
      azimuthRad: 0,
      elevationRad: Math.PI / 2,
      distance: 0
    };
  }

  const elevationRad = Math.asin(Math.max(-1, Math.min(1, y / distance)));
  let azimuthRad = Math.atan2(x, z);
  if (azimuthRad < 0) {
    azimuthRad += 2 * Math.PI;
  }

  const elevation = (elevationRad * 180) / Math.PI;
  const azimuth = (azimuthRad * 180) / Math.PI;

  return {
    azimuth,
    elevation,
    azimuthRad,
    elevationRad,
    distance
  };
}

/**
 * Sets the sun position on a DirectionalLight or LightingRig based on azimuth and elevation.
 *
 * @param {object} lightOrRig - DirectionalLight instance or LightingRig manager
 * @param {number|object} azimuthOrOptions - Azimuth angle in degrees or options object
 * @param {number} [elevation] - Elevation angle in degrees
 * @param {number} [distance] - Distance from target/origin
 * @param {object} [options] - Additional options
 * @returns {object} Calculated sun position object
 */
export function setSunAngle(lightOrRig, azimuthOrOptions, elevation, distance, options) {
  if (!lightOrRig) {
    throw new TypeError("setSunAngle requires a target light or LightingRig instance");
  }

  if (typeof lightOrRig.setSunAngle === "function") {
    return lightOrRig.setSunAngle(azimuthOrOptions, elevation, distance, options);
  }

  const pos = calculateSunPosition(azimuthOrOptions, elevation, distance, options);

  if (lightOrRig.position && typeof lightOrRig.position.set === "function") {
    lightOrRig.position.set(pos.x, pos.y, pos.z);
  } else if (lightOrRig.position) {
    lightOrRig.position.x = pos.x;
    lightOrRig.position.y = pos.y;
    lightOrRig.position.z = pos.z;
  }

  if (lightOrRig.target && typeof lightOrRig.target.updateMatrixWorld === "function") {
    lightOrRig.target.updateMatrixWorld();
  }

  if (lightOrRig.userData) {
    lightOrRig.userData.azimuth = pos.azimuth;
    lightOrRig.userData.elevation = pos.elevation;
    lightOrRig.userData.distance = pos.distance;
  }

  return pos;
}

/**
 * Manager class for scene lighting rigs, orchestrating sun position, ambient fill,
 * secondary 3-point lights, and shadow maps.
 */
export class LightingRig {
  /**
   * @param {object} [sceneOrGroup=null] - Three.js Scene or Group to attach lights to
   * @param {object} [options={}] - Rig configuration options
   */
  constructor(sceneOrGroup = null, options = {}) {
    const THREE = options?.THREE || (typeof globalThis !== "undefined" && globalThis.THREE) || THREE_DEFAULT;
    this.THREE = THREE;
    this.scene = sceneOrGroup;
    this.options = { ...options };

    this.group = new THREE.Group();
    this.group.name = options.name || "LightingRig";

    // Primary directional sunlight / key light
    this.sunLight = new THREE.DirectionalLight(0xffffff, 1.0);
    this.sunLight.name = "SunLight";

    this.sunTarget = new THREE.Object3D();
    this.sunTarget.name = "SunTarget";
    this.sunTarget.position.set(0, 0, 0);
    this.sunLight.target = this.sunTarget;

    // Shadow configuration
    const enableShadows = options.shadows !== false;
    this.sunLight.castShadow = enableShadows;
    const shadowMapSize = options.shadowMapSize || 2048;
    this.sunLight.shadow.mapSize.width = shadowMapSize;
    this.sunLight.shadow.mapSize.height = shadowMapSize;
    this.sunLight.shadow.camera.near = options.shadowNear || 0.5;
    this.sunLight.shadow.camera.far = options.shadowFar || 150;
    this.sunLight.shadow.bias = options.shadowBias || -0.0005;

    // Ambient light
    this.ambientLight = new THREE.AmbientLight(0xffffff, 0.4);
    this.ambientLight.name = "AmbientLight";

    // Secondary lights (used in 3-point lighting presets like Studio Neutral)
    this.fillLight = new THREE.DirectionalLight(0xffffff, 0.0);
    this.fillLight.name = "FillLight";
    this.fillLight.visible = false;

    this.rimLight = new THREE.DirectionalLight(0xffffff, 0.0);
    this.rimLight.name = "RimLight";
    this.rimLight.visible = false;

    this.group.add(this.sunLight);
    this.group.add(this.sunTarget);
    this.group.add(this.ambientLight);
    this.group.add(this.fillLight);
    this.group.add(this.rimLight);

    if (this.scene && typeof this.scene.add === "function") {
      this.scene.add(this.group);
    }

    this.azimuth = 35.54;
    this.elevation = 49.3;
    this.distance = 13.19;
    this.currentPresetId = null;
    this.currentPreset = null;

    const initialPreset = options.preset || DEFAULT_LIGHTING_PRESET;
    this.setPreset(initialPreset);

    if (options.renderer) {
      configureToneMapping(options.renderer, options);
    }
  }

  /**
   * Alias for sunLight to support 3-point studio lighting terminology.
   * @returns {object} Directional key light
   */
  get keyLight() {
    return this.sunLight;
  }

  /**
   * Returns list of all active lights managed by this rig.
   * @returns {Array<object>}
   */
  get lights() {
    return [this.sunLight, this.ambientLight, this.fillLight, this.rimLight];
  }

  /**
   * Applies a lighting preset dynamically without re-instantiating lights.
   *
   * @param {string|object} presetIdOrConfig - Preset identifier or configuration object
   * @returns {LightingRig} this
   */
  setPreset(presetIdOrConfig) {
    const preset = getLightingPreset(presetIdOrConfig);
    if (!preset) {
      throw new Error(`Unknown lighting preset: "${presetIdOrConfig}"`);
    }

    this.currentPresetId = preset.id || null;
    this.currentPreset = preset;

    // 1. Update Sun / Key Light
    if (preset.sun) {
      this.sunLight.color.set(preset.sun.color);
      if (typeof preset.sun.intensity === "number") {
        this.sunLight.intensity = preset.sun.intensity;
      }
      if (preset.sun.castShadow !== undefined) {
        this.sunLight.castShadow = preset.sun.castShadow;
      }

      if (Array.isArray(preset.sun.position)) {
        this.sunLight.position.set(preset.sun.position[0], preset.sun.position[1], preset.sun.position[2]);
        const angles = calculateSunAngles(preset.sun.position[0], preset.sun.position[1], preset.sun.position[2]);
        this.azimuth = angles.azimuth;
        this.elevation = angles.elevation;
        this.distance = angles.distance;
      } else {
        const az = preset.sun.azimuth ?? this.azimuth;
        const el = preset.sun.elevation ?? this.elevation;
        const dist = preset.sun.distance ?? this.distance;
        this.setSunAngle(az, el, dist);
      }
    }

    // 2. Update Ambient Light
    if (preset.ambient) {
      this.ambientLight.color.set(preset.ambient.color);
      if (typeof preset.ambient.intensity === "number") {
        this.ambientLight.intensity = preset.ambient.intensity;
      }
    }

    // 3. Update Fill Light (studio 3-point)
    if (preset.fill && preset.fill.intensity > 0) {
      this.fillLight.visible = true;
      this.fillLight.color.set(preset.fill.color);
      this.fillLight.intensity = preset.fill.intensity;
      if (Array.isArray(preset.fill.position)) {
        this.fillLight.position.set(preset.fill.position[0], preset.fill.position[1], preset.fill.position[2]);
      }
    } else {
      this.fillLight.visible = false;
      this.fillLight.intensity = 0;
    }

    // 4. Update Rim / Bottom Bounce Light (studio 3-point)
    if (preset.rim && preset.rim.intensity > 0) {
      this.rimLight.visible = true;
      this.rimLight.color.set(preset.rim.color);
      this.rimLight.intensity = preset.rim.intensity;
      if (Array.isArray(preset.rim.position)) {
        this.rimLight.position.set(preset.rim.position[0], preset.rim.position[1], preset.rim.position[2]);
      }
    } else {
      this.rimLight.visible = false;
      this.rimLight.intensity = 0;
    }

    return this;
  }

  /**
   * Updates sun angle in real time.
   *
   * @param {number|object} azimuthOrOptions - Azimuth angle in degrees or options object
   * @param {number} [elevation] - Elevation angle in degrees
   * @param {number} [distance] - Distance from target/origin
   * @param {object} [options={}] - Calculation options
   * @returns {object} Calculated sun position
   */
  setSunAngle(azimuthOrOptions, elevation, distance, options = {}) {
    if (typeof azimuthOrOptions === "object" && azimuthOrOptions !== null) {
      const opts = azimuthOrOptions;
      return this.setSunAngle(opts.azimuth, opts.elevation, opts.distance, opts);
    }

    if (azimuthOrOptions !== undefined && azimuthOrOptions !== null) {
      this.azimuth = Number(azimuthOrOptions);
    }
    if (elevation !== undefined && elevation !== null) {
      this.elevation = Number(elevation);
    }
    if (distance !== undefined && distance !== null) {
      this.distance = Number(distance);
    }

    const pos = calculateSunPosition({
      azimuth: this.azimuth,
      elevation: this.elevation,
      distance: this.distance,
      degrees: options.degrees ?? true,
      radians: options.radians ?? false,
      THREE: this.THREE
    });

    this.sunLight.position.set(pos.x, pos.y, pos.z);
    if (this.sunLight.target && typeof this.sunLight.target.updateMatrixWorld === "function") {
      this.sunLight.target.position.set(0, 0, 0);
      this.sunLight.target.updateMatrixWorld();
    }

    return pos;
  }

  /**
   * Sets sun light color and optional intensity.
   *
   * @param {string|number} color - Hex color or number
   * @param {number} [intensity] - Light intensity
   * @returns {LightingRig} this
   */
  setSunColor(color, intensity) {
    if (color !== undefined && color !== null) {
      this.sunLight.color.set(color);
    }
    if (typeof intensity === "number") {
      this.sunLight.intensity = intensity;
    }
    return this;
  }

  /**
   * Sets ambient light color and optional intensity.
   *
   * @param {string|number} color - Hex color or number
   * @param {number} [intensity] - Ambient intensity
   * @returns {LightingRig} this
   */
  setAmbientColor(color, intensity) {
    if (color !== undefined && color !== null) {
      this.ambientLight.color.set(color);
    }
    if (typeof intensity === "number") {
      this.ambientLight.intensity = intensity;
    }
    return this;
  }

  /**
   * Toggles shadow casting and configures shadow map resolution.
   *
   * @param {boolean} enabled - Whether shadows are enabled
   * @param {number} [mapSize=2048] - Shadow map resolution width and height
   * @returns {LightingRig} this
   */
  setShadows(enabled, mapSize = 2048) {
    this.sunLight.castShadow = Boolean(enabled);
    if (mapSize) {
      this.sunLight.shadow.mapSize.width = mapSize;
      this.sunLight.shadow.mapSize.height = mapSize;
    }
    return this;
  }

  /**
   * Retrieves the current 3D position of the sun light.
   *
   * @returns {{x: number, y: number, z: number}}
   */
  getSunPosition() {
    return {
      x: this.sunLight.position.x,
      y: this.sunLight.position.y,
      z: this.sunLight.position.z
    };
  }

  /**
   * Returns the currently applied preset configuration object.
   *
   * @returns {object|null}
   */
  getPreset() {
    return this.currentPreset;
  }

  /**
   * Cleans up lights and removes the rig container group from the parent scene.
   */
  dispose() {
    if (this.scene && typeof this.scene.remove === "function") {
      this.scene.remove(this.group);
    }
    if (this.sunLight?.shadow?.map?.dispose) {
      this.sunLight.shadow.map.dispose();
    }
    if (typeof this.group.clear === "function") {
      this.group.clear();
    }
  }
}

/**
 * Factory helper to instantiate and attach a LightingRig to a scene or group.
 *
 * @param {object} [sceneOrGroup=null] - Three.js Scene or Group
 * @param {object} [options={}] - Lighting rig configuration options
 * @returns {LightingRig} Instantiated lighting rig
 */
export function createLightingRig(sceneOrGroup = null, options = {}) {
  return new LightingRig(sceneOrGroup, options);
}

/**
 * Applies a lighting preset dynamically to an existing target (LightingRig, THREE.Scene,
 * THREE.Group, or custom lights dictionary).
 *
 * Prevents light duplication and memory leaks by reusing existing light instances.
 *
 * @param {object} target - Target rig, scene, group, or lights dictionary
 * @param {string|object} presetIdOrConfig - Preset identifier or configuration
 * @param {object} [options={}] - Optional rig initialization options if creating on a scene
 * @returns {object} The configured rig or target
 */
export function applyLightingPreset(target, presetIdOrConfig, options = {}) {
  if (!target) {
    throw new TypeError("applyLightingPreset requires a valid target (LightingRig, THREE.Scene, or lighting object)");
  }

  if (options.renderer) {
    configureToneMapping(options.renderer, options);
  }

  if (target instanceof LightingRig || typeof target.setPreset === "function") {
    return target.setPreset(presetIdOrConfig);
  }

  if (target.__lightingRig) {
    return target.__lightingRig.setPreset(presetIdOrConfig);
  }

  if (typeof target.add === "function") {
    const rig = createLightingRig(target, { ...options, preset: presetIdOrConfig });
    target.__lightingRig = rig;
    return rig;
  }

  const preset = getLightingPreset(presetIdOrConfig);
  if (!preset) {
    throw new Error(`Unknown lighting preset: "${presetIdOrConfig}"`);
  }

  if (target.sunLight) {
    target.sunLight.color?.set?.(preset.sun.color);
    if (preset.sun.intensity !== undefined) {
      target.sunLight.intensity = preset.sun.intensity;
    }
    if (Array.isArray(preset.sun.position)) {
      target.sunLight.position?.set?.(preset.sun.position[0], preset.sun.position[1], preset.sun.position[2]);
    } else {
      const pos = calculateSunPosition({
        azimuth: preset.sun.azimuth,
        elevation: preset.sun.elevation,
        distance: preset.sun.distance
      });
      target.sunLight.position?.set?.(pos.x, pos.y, pos.z);
    }
  }

  if (target.ambientLight) {
    target.ambientLight.color?.set?.(preset.ambient.color);
    if (preset.ambient.intensity !== undefined) {
      target.ambientLight.intensity = preset.ambient.intensity;
    }
  }

  if (target.fillLight) {
    if (preset.fill && preset.fill.intensity > 0) {
      target.fillLight.visible = true;
      target.fillLight.color?.set?.(preset.fill.color);
      target.fillLight.intensity = preset.fill.intensity;
      if (Array.isArray(preset.fill.position)) {
        target.fillLight.position?.set?.(preset.fill.position[0], preset.fill.position[1], preset.fill.position[2]);
      }
    } else {
      target.fillLight.visible = false;
      target.fillLight.intensity = 0;
    }
  }

  if (target.rimLight) {
    if (preset.rim && preset.rim.intensity > 0) {
      target.rimLight.visible = true;
      target.rimLight.color?.set?.(preset.rim.color);
      target.rimLight.intensity = preset.rim.intensity;
      if (Array.isArray(preset.rim.position)) {
        target.rimLight.position?.set?.(preset.rim.position[0], preset.rim.position[1], preset.rim.position[2]);
      }
    } else {
      target.rimLight.visible = false;
      target.rimLight.intensity = 0;
    }
  }

  return target;
}
