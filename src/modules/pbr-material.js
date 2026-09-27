import * as THREE_DEFAULT from "three";
import { configureTextureColorSpace } from "./color-space.js";

/**
 * LabPBR 1.3 Conductor threshold for F0 reflectance.
 * Dielectric: F0 < 230 (or < 230/255 ≈ 0.90196) -> metalness 0.0
 * Conductor:  F0 >= 230 (or >= 230/255)         -> metalness 1.0
 */
export const F0_CONDUCTOR_THRESHOLD = 230 / 255;
export const F0_CONDUCTOR_BYTE_THRESHOLD = 230;

/**
 * Determines whether an F0 reflectance value designates a conductor (metal).
 * Supports normalized float range [0.0..1.0] and byte integer range [0..255].
 *
 * @param {number|string} f0 - Reflectance sample (0..1 float or 0..255 byte)
 * @returns {boolean} True if conductor (metal), false if dielectric
 */
export function isConductor(f0) {
  let val = f0;
  if (typeof val !== "number") {
    val = Number(val);
    if (typeof f0 !== "string" || Number.isNaN(val) || f0.trim() === "") {
      return false;
    }
  }

  if (Number.isNaN(val)) {
    return false;
  }

  if (val > 1.0) {
    return val >= F0_CONDUCTOR_BYTE_THRESHOLD;
  }

  return val >= (F0_CONDUCTOR_THRESHOLD - 1e-5);
}

/**
 * Swizzles a normal sample from DirectX convention (Y- pointing down)
 * to OpenGL convention (Y+ pointing up).
 *
 * @param {object|Array|number} normalSample - Normal vector sample or Red/X component
 * @param {number} [gIn] - Green/Y component if passed as positional argument
 * @param {number} [bIn] - Blue/Z component if passed as positional argument
 * @returns {object} Swizzled normal representation with x/y/z, r/g/b and array indexing
 */
export function swizzleNormalVector(normalSample, gIn, bIn) {
  let x = 0.5;
  let y = 0.5;
  let z = 1.0;

  if (typeof normalSample === "number" && typeof gIn === "number") {
    x = normalSample;
    y = gIn;
    z = typeof bIn === "number" ? bIn : (x > 1.0 || y > 1.0 ? 255 : 1.0);
  } else if (Array.isArray(normalSample)) {
    x = normalSample[0] ?? 0.5;
    y = normalSample[1] ?? 0.5;
    z = normalSample[2] ?? (x > 1.0 || y > 1.0 ? 255 : 1.0);
  } else if (typeof normalSample === "object" && normalSample !== null) {
    x = normalSample.x ?? normalSample.r ?? 0.5;
    y = normalSample.y ?? normalSample.g ?? 0.5;
    z = normalSample.z ?? normalSample.b ?? (x > 1.0 || y > 1.0 ? 255 : 1.0);
  }

  const isSigned = x < 0 || y < 0;
  const isByte = !isSigned && (x > 1.0 || y > 1.0 || z > 1.0);

  let swizzledY;
  if (isSigned) {
    // Tangent vector space [-1..1]: DirectX (-Y) to OpenGL (+Y)
    swizzledY = -y;
  } else if (isByte) {
    // Byte space [0..255]: DirectX top-down to OpenGL bottom-up
    swizzledY = 255 - y;
  } else {
    // Normalized color space [0..1]: 1.0 - Y
    swizzledY = 1.0 - y;
  }

  return {
    x,
    y: swizzledY,
    z,
    r: x,
    g: swizzledY,
    b: z,
    [0]: x,
    [1]: swizzledY,
    [2]: z,
    length: 3,
    [Symbol.iterator]() {
      return [x, swizzledY, z][Symbol.iterator]();
    },
    toArray() {
      return [x, swizzledY, z];
    }
  };
}

/**
 * Unpacks LabPBR 1.3 Normal Map channels:
 * - Red (R): Normal vector X
 * - Green (G): Normal vector Y (DirectX Y- inverted -> flipped to OpenGL: 1.0 - G)
 * - Blue (B): Material Ambient Occlusion (AO: 0 = occluded, 1 = open)
 * - Alpha (A): POM Height / displacement depth
 *
 * @param {number|object|Array} r - Red channel [0..1] / [0..255] or color object/array
 * @param {number} [g] - Green channel
 * @param {number} [b] - Blue channel
 * @param {number} [a] - Alpha channel
 * @returns {object} Unpacked channel values and reconstructed tangent normal vector
 */
export function unpackLabPBRNormal(r, g, b, a) {
  let inR = r;
  let inG = g;
  let inB = b;
  let inA = a;

  if (typeof r === "object" && r !== null) {
    if (Array.isArray(r)) {
      [inR, inG, inB, inA] = r;
    } else {
      inR = r.r ?? r.x;
      inG = r.g ?? r.y;
      inB = r.b ?? r.z;
      inA = r.a ?? r.w;
    }
  }

  const normR = inR !== undefined ? (inR > 1.0 ? inR / 255 : inR) : 0.5;
  const normG = inG !== undefined ? (inG > 1.0 ? inG / 255 : inG) : 0.5;
  const normB = inB !== undefined ? (inB > 1.0 ? inB / 255 : inB) : 1.0;
  const normA = inA !== undefined ? (inA > 1.0 ? inA / 255 : inA) : 1.0;

  const normalX = normR;
  const normalY = 1.0 - normG; // DirectX to OpenGL Y-flip
  const ao = normB;
  const height = normA;

  // Reconstruct tangent space normal vector [-1..1]
  const nx = normalX * 2.0 - 1.0;
  const ny = normalY * 2.0 - 1.0;
  const nz = Math.sqrt(Math.max(0.0, 1.0 - (nx * nx + ny * ny)));

  return {
    normalX,
    normalY,
    ao,
    height,
    x: normalX,
    y: normalY,
    z: (nz + 1.0) * 0.5,
    normalVector: { x: nx, y: ny, z: nz },
    normalXByte: Math.round(normalX * 255),
    normalYByte: Math.round(normalY * 255),
    aoByte: Math.round(ao * 255),
    heightByte: Math.round(height * 255),
    raw: { r: inR, g: inG, b: inB, a: inA }
  };
}

/**
 * Unpacks LabPBR 1.3 Specular Map channels:
 * - Red (R): Perceptual Smoothness -> Roughness = 1.0 - SpecularTex.r
 * - Green (G): Linear F0 Reflectance -> Metalness (dielectric < 230/255 -> 0.0, conductor >= 230/255 -> 1.0)
 * - Blue (B): Porosity (0..64) or Subsurface Scattering (65..255)
 * - Alpha (A): Linear Emission (0..254)
 *
 * @param {number|object|Array} r - Red channel [0..1] / [0..255] or color object/array
 * @param {number} [g] - Green channel
 * @param {number} [b] - Blue channel
 * @param {number} [a] - Alpha channel
 * @returns {object} Unpacked roughness, metalness, emission, and metadata
 */
export function unpackLabPBRSpecular(r, g, b, a) {
  let inR = r;
  let inG = g;
  let inB = b;
  let inA = a;

  if (typeof r === "object" && r !== null) {
    if (Array.isArray(r)) {
      [inR, inG, inB, inA] = r;
    } else {
      inR = r.r ?? r.x;
      inG = r.g ?? r.y;
      inB = r.b ?? r.z;
      inA = r.a ?? r.w;
    }
  }

  const normR = inR !== undefined ? (inR > 1.0 ? inR / 255 : inR) : 0.0;
  const normG = inG !== undefined ? (inG > 1.0 ? inG / 255 : inG) : 0.0;
  const normB = inB !== undefined ? (inB > 1.0 ? inB / 255 : inB) : 0.0;
  const normA = inA !== undefined ? (inA > 1.0 ? inA / 255 : inA) : 0.0;

  const roughness = 1.0 - normR; // Smoothness inversion
  const conductor = isConductor(normG);
  const metalness = conductor ? 1.0 : 0.0;
  const emission = normA;

  return {
    roughness,
    metalness,
    emission,
    smoothness: normR,
    f0: normG,
    porosity: normB,
    isConductor: conductor,
    emissive: emission,
    subsurface: normB,
    raw: { r: inR, g: inG, b: inB, a: inA }
  };
}

/**
 * Applies LabPBR 1.3 channel unpacking hooks to a Three.js material's onBeforeCompile pipeline.
 *
 * @param {object} material - Three.js MeshStandardMaterial or MeshPhysicalMaterial instance
 * @param {object} [options={}] - Optional configuration
 * @returns {object} The modified material instance
 */
export function applyLabPBRShader(material, options = {}) {
  const existingOnBeforeCompile = material.onBeforeCompile;
  const existingCacheKey = material.customProgramCacheKey;

  material.defines = material.defines || {};
  if (material.specularMap || options.specularMap) {
    material.defines.USE_LABPBR_SPECULAR = "1";
  }
  if (material.normalMap || options.normalMap) {
    material.defines.USE_LABPBR_NORMAL = "1";
  }

  material.onBeforeCompile = function (shader, renderer) {
    // Inject custom LabPBR uniforms
    shader.uniforms.specularMap = {
      get value() {
        return material.specularMap || options.specularMap || null;
      }
    };

    shader.uniforms.labpbrAoIntensity = {
      get value() {
        return material.userData?.aoIntensity ?? options.aoIntensity ?? 1.0;
      }
    };

    shader.uniforms.labpbrEmissiveIntensity = {
      get value() {
        return material.userData?.emissiveIntensity ?? options.emissiveIntensity ?? 1.0;
      }
    };

    // 1. Declare specularMap, labpbrEmissiveIntensity, and aoIntensity uniforms in fragment shader
    if (!shader.fragmentShader.includes("uniform sampler2D specularMap;")) {
      shader.fragmentShader = shader.fragmentShader.replace(
        "#include <roughnessmap_pars_fragment>",
        `#include <roughnessmap_pars_fragment>
#ifdef USE_LABPBR_SPECULAR
uniform sampler2D specularMap;
uniform float labpbrEmissiveIntensity;
#endif
uniform float labpbrAoIntensity;
`
      );
    }

    // 2. Normal Map channel unpacking:
    //    Normal X = NormalTex.r
    //    Normal Y = 1.0 - NormalTex.g (DirectX to OpenGL Y-flip)
    //    AO = NormalTex.b
    //    Height = NormalTex.a
    if (shader.fragmentShader.includes("#include <normal_fragment_maps>")) {
      shader.fragmentShader = shader.fragmentShader.replace(
        "#include <normal_fragment_maps>",
        `vec4 labpbrNormalTex = vec4(0.5, 0.5, 1.0, 1.0);
#ifdef USE_NORMALMAP_OBJECTSPACE
	normal = texture2D( normalMap, vNormalMapUv ).xyz * 2.0 - 1.0;
	#ifdef FLIP_SIDED
		normal = - normal;
	#endif
	#ifdef DOUBLE_SIDED
		normal = normal * faceDirection;
	#endif
	normal = normalize( normalMatrix * normal );
#elif defined( USE_NORMALMAP_TANGENTSPACE )
	labpbrNormalTex = texture2D( normalMap, vNormalMapUv );
	// LabPBR 1.3: Normal X = r, Normal Y = 1.0 - g (DirectX to OpenGL Y-flip)
	vec2 labpbrNormalXY = vec2( labpbrNormalTex.r * 2.0 - 1.0, ( 1.0 - labpbrNormalTex.g ) * 2.0 - 1.0 );
	labpbrNormalXY *= normalScale;
	float labpbrNormalZ = sqrt( max( 0.0, 1.0 - dot( labpbrNormalXY, labpbrNormalXY ) ) );
	vec3 mapN = vec3( labpbrNormalXY, labpbrNormalZ );
	normal = normalize( tbn * mapN );
#elif defined( USE_BUMPMAP )
	normal = perturbNormalArb( - vViewPosition, normal, dHdxy_fwd(), faceDirection );
#endif`
      );
    }

    // 3. Specular Map: Roughness unpacking:
    //    Roughness = 1.0 - SpecularTex.r (Smoothness inversion)
    if (shader.fragmentShader.includes("#include <roughnessmap_fragment>")) {
      shader.fragmentShader = shader.fragmentShader.replace(
        "#include <roughnessmap_fragment>",
        `#ifdef USE_LABPBR_SPECULAR
	#if defined( USE_UV )
		vec2 labpbrSpecUv = vUv;
	#elif defined( USE_MAP )
		vec2 labpbrSpecUv = vMapUv;
	#elif defined( USE_NORMALMAP )
		vec2 labpbrSpecUv = vNormalMapUv;
	#else
		vec2 labpbrSpecUv = vec2( 0.0 );
	#endif
	vec4 labpbrSpecularTex = texture2D( specularMap, labpbrSpecUv );
	// LabPBR 1.3: Roughness = 1.0 - SpecularTex.r (Smoothness inversion)
	float roughnessFactor = ( 1.0 - labpbrSpecularTex.r ) * roughness;
#else
	#include <roughnessmap_fragment>
#endif`
      );
    }

    // 4. Specular Map: Metalness unpacking:
    //    Metalness = SpecularTex.g (F0 threshold mapping: dielectric < 230/255 -> 0.0, conductor >= 230/255 -> 1.0)
    if (shader.fragmentShader.includes("#include <metalnessmap_fragment>")) {
      shader.fragmentShader = shader.fragmentShader.replace(
        "#include <metalnessmap_fragment>",
        `#ifdef USE_LABPBR_SPECULAR
	// LabPBR 1.3: F0 threshold mapping (dielectric < 230/255 -> 0.0, conductor >= 230/255 -> 1.0)
	float labpbrMetalness = step( 229.5 / 255.0, labpbrSpecularTex.g );
	float metalnessFactor = labpbrMetalness * metalness;
#else
	#include <metalnessmap_fragment>
#endif`
      );
    }

    // 5. Specular Map: Emission unpacking:
    //    Emission = SpecularTex.a
    if (shader.fragmentShader.includes("#include <emissivemap_fragment>")) {
      shader.fragmentShader = shader.fragmentShader.replace(
        "#include <emissivemap_fragment>",
        `#include <emissivemap_fragment>
#ifdef USE_LABPBR_SPECULAR
	// LabPBR 1.3: Emission = SpecularTex.a (albedo modulated emission)
	vec3 labpbrEmissiveColor = length( emissive ) > 0.0 ? emissive : diffuseColor.rgb;
	totalEmissiveRadiance += labpbrEmissiveColor * ( labpbrSpecularTex.a * labpbrEmissiveIntensity );
#endif`
      );
    }

    // 6. Normal Map: Ambient Occlusion unpacking:
    //    AO = NormalTex.b
    if (shader.fragmentShader.includes("#include <aomap_fragment>")) {
      shader.fragmentShader = shader.fragmentShader.replace(
        "#include <aomap_fragment>",
        `#include <aomap_fragment>
#if defined( USE_NORMALMAP_TANGENTSPACE ) || defined( USE_NORMALMAP )
	// LabPBR 1.3: AO = NormalTex.b
	reflectedLight.indirectDiffuse *= mix( 1.0, labpbrNormalTex.b, labpbrAoIntensity );
#endif`
      );
    }

    // Chain previous onBeforeCompile callback if present
    if (typeof existingOnBeforeCompile === "function") {
      existingOnBeforeCompile.call(this, shader, renderer);
    }
  };

  material.customProgramCacheKey = function () {
    const parentKey = typeof existingCacheKey === "function" ? existingCacheKey.call(this) : "";
    const labpbrKey = [
      "labpbr",
      Boolean(this.normalMap || options.normalMap),
      Boolean(this.specularMap || options.specularMap),
      this.version || 0
    ].join("_");
    return parentKey ? `${parentKey}|${labpbrKey}` : labpbrKey;
  };

  return material;
}

/**
 * Creates a Three.js PBR material configured for LabPBR 1.3 companion textures.
 * Unpacks Normal X/Y (with DirectX to OpenGL Y-flip), AO, Height, Smoothness, F0 Metalness, and Emission.
 * Configures appropriate color spaces to preserve linear data integrity.
 *
 * @param {object} [options={}] - Material configuration options
 * @param {object} [options.albedoMap] - Base color texture (albedo/diffuse)
 * @param {object} [options.normalMap] - LabPBR normal map (_n)
 * @param {object} [options.specularMap] - LabPBR specular map (_s)
 * @param {object} [options.map] - Alias for albedoMap
 * @param {number} [options.roughness=1.0] - Roughness multiplier
 * @param {number} [options.metalness=1.0] - Metalness multiplier
 * @param {number} [options.aoIntensity=1.0] - Material AO intensity
 * @param {number} [options.emissiveIntensity=1.0] - Emission intensity
 * @param {boolean} [options.usePhysical=false] - Use MeshPhysicalMaterial instead of MeshStandardMaterial
 * @param {object} [options.THREE] - Injected Three.js instance
 * @param {Function} [options.MaterialClass] - Custom material class constructor
 * @returns {object} Configured Three.js material
 */
export function createLabPBRMaterial(options = {}) {
  const {
    albedoMap = null,
    normalMap = null,
    specularMap = null,
    map = null,
    roughness = 1.0,
    metalness = 1.0,
    aoIntensity = 1.0,
    normalScale,
    emissiveIntensity = 1.0,
    usePhysical = false,
    THREE: injectedThree = null,
    MaterialClass: customMaterialClass = null,
    ...restOptions
  } = options;

  const THREE = injectedThree || (typeof globalThis !== "undefined" && globalThis.THREE) || THREE_DEFAULT;

  const MaterialConstructor = customMaterialClass || (
    usePhysical
      ? (THREE?.MeshPhysicalMaterial || THREE_DEFAULT.MeshPhysicalMaterial)
      : (THREE?.MeshStandardMaterial || THREE_DEFAULT.MeshStandardMaterial)
  );

  const baseMap = albedoMap || map || restOptions.map || null;
  const baseNormalMap = normalMap || restOptions.normalMap || null;
  const baseSpecularMap = specularMap || restOptions.specularMap || null;

  // Ensure color spaces follow LabPBR rules (sRGB for albedo, Linear/NoColorSpace for data maps)
  if (baseMap) {
    configureTextureColorSpace(baseMap, "albedo");
  }
  if (baseNormalMap) {
    configureTextureColorSpace(baseNormalMap, "normal");
  }
  if (baseSpecularMap) {
    configureTextureColorSpace(baseSpecularMap, "specular");
  }

  const materialParams = {
    ...restOptions,
    map: baseMap,
    roughness,
    metalness,
    emissiveIntensity
  };

  if (baseNormalMap) {
    materialParams.normalMap = baseNormalMap;
    if (normalScale !== undefined) {
      materialParams.normalScale = normalScale;
    }
  }

  const material = new MaterialConstructor(materialParams);

  material.specularMap = baseSpecularMap;
  material.userData = material.userData || {};
  material.userData.isLabPBR = true;
  material.userData.aoIntensity = aoIntensity;
  material.userData.emissiveIntensity = emissiveIntensity;
  material.userData.specularMap = baseSpecularMap;

  applyLabPBRShader(material, {
    ...options,
    normalMap: baseNormalMap,
    specularMap: baseSpecularMap,
    aoIntensity,
    emissiveIntensity
  });

  return material;
}