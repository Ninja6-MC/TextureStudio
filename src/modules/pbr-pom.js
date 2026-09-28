import * as THREE_DEFAULT from "three";

/**
 * Parallax Occlusion Mapping (POM) Shader Extension for TextureStudio
 *
 * Implements steep parallax occlusion mapping raymarching with linear height interpolation
 * using the height displacement channel (Alpha channel of LabPBR 1.3 normal map `_n`).
 *
 * Provides:
 * - Dynamic sample count scaling based on view angle (8-32 samples)
 * - View vector transformation into tangent space via TBN matrix
 * - Raymarching along height layers with sub-layer linear interpolation
 * - UV offset boundary clamping [0.0, 1.0] to prevent quad seam leakage
 * - Runtime toggle (uPomEnabled) and depth scale slider (uPomDepthScale in [0.0, 0.2])
 * - Decoupled mathematical simulation functions for testing and headless computations
 * - Clean integration with Three.js onBeforeCompile pipeline and LabPBR 1.3 materials
 */

export const POM_MIN_DEPTH_SCALE = 0.0;
export const POM_MAX_DEPTH_SCALE = 0.2;
export const POM_DEFAULT_DEPTH_SCALE = 0.05;
export const POM_DEFAULT_MIN_SAMPLES = 8.0;
export const POM_DEFAULT_MAX_SAMPLES = 32.0;

/**
 * Clamps a depth scale value to the allowed [0.0, 0.2] range.
 * Defaults to POM_DEFAULT_DEPTH_SCALE (0.05) if undefined, null, or NaN.
 *
 * @param {number|string} [scale] - Input depth scale value
 * @returns {number} Clamped depth scale in [0.0, 0.2]
 */
export function clampDepthScale(scale) {
  if (scale === undefined || scale === null) {
    return POM_DEFAULT_DEPTH_SCALE;
  }
  const num = typeof scale === "number" ? scale : Number(scale);
  if (Number.isNaN(num)) {
    return POM_DEFAULT_DEPTH_SCALE;
  }
  return Math.max(POM_MIN_DEPTH_SCALE, Math.min(POM_MAX_DEPTH_SCALE, num));
}

/**
 * Calculates the number of POM raymarch sampling layers scaled by view angle.
 * Perpendicular view (viewZ = 1.0): minSamples (default 8.0)
 * Grazing angle view (viewZ = 0.0): maxSamples (default 32.0)
 *
 * @param {number} viewZ - Z component of normalized tangent-space view vector (0.0 to 1.0)
 * @param {number} [minSamples=POM_DEFAULT_MIN_SAMPLES] - Sample count at perpendicular angle
 * @param {number} [maxSamples=POM_DEFAULT_MAX_SAMPLES] - Sample count at grazing angle
 * @returns {number} Scaled sample layer count
 */
export function calculatePomSamples(
  viewZ,
  minSamples = POM_DEFAULT_MIN_SAMPLES,
  maxSamples = POM_DEFAULT_MAX_SAMPLES
) {
  const minS = Math.max(1.0, Number(minSamples) || POM_DEFAULT_MIN_SAMPLES);
  const maxS = Math.max(minS, Number(maxSamples) || POM_DEFAULT_MAX_SAMPLES);
  const z = typeof viewZ === "number" ? Math.min(1.0, Math.max(0.0, Math.abs(viewZ))) : 1.0;
  return minS + (maxS - minS) * (1.0 - z);
}

/**
 * Clamps UV coordinates to [0.0, 1.0] to prevent quad seam leakage and texture wrapping artifacts.
 * Supports array [u, v] and object { x, y } / { u, v } representations.
 *
 * @param {Array<number>|object} uv - UV coordinates
 * @returns {object} Clamped UV object supporting array destructuring, {x, y}, and {u, v}
 */
export function clampPomUv(uv) {
  let u = 0.0;
  let v = 0.0;

  if (Array.isArray(uv)) {
    u = uv[0] ?? 0.0;
    v = uv[1] ?? 0.0;
  } else if (typeof uv === "object" && uv !== null) {
    u = uv.x ?? uv.u ?? 0.0;
    v = uv.y ?? uv.v ?? 0.0;
  } else if (typeof uv === "number") {
    u = uv;
    v = uv;
  }

  const clampedU = Math.max(0.0, Math.min(1.0, u));
  const clampedV = Math.max(0.0, Math.min(1.0, v));

  return {
    x: clampedU,
    y: clampedV,
    u: clampedU,
    v: clampedV,
    [0]: clampedU,
    [1]: clampedV,
    length: 2,
    [Symbol.iterator]() {
      return [clampedU, clampedV][Symbol.iterator]();
    },
    toArray() {
      return [clampedU, clampedV];
    }
  };
}

/**
 * Simulates steep Parallax Occlusion Mapping raymarching with linear height interpolation
 * on CPU / synthetic heightfields.
 *
 * Supports multiple call signatures:
 * - simulatePomRaymarch(heightSampler, uv, viewDirTangent, depthScale, options)
 * - simulatePomRaymarch({ sampleHeight, uv, viewVector, depthScale, minSamples, maxSamples, clamp })
 * - simulatePomRaymarch(uv, viewDirTangent, heightSampler, depthScale, minSamples, maxSamples)
 *
 * @returns {object} Raymarch result with displaced uv, offset, depth, samples taken, and height
 */
export function simulatePomRaymarch(...args) {
  let sampleHeight;
  let initialUv = [0.0, 0.0];
  let viewDir = [0.0, 0.0, 1.0];
  let depthScale = POM_DEFAULT_DEPTH_SCALE;
  let minSamples = POM_DEFAULT_MIN_SAMPLES;
  let maxSamples = POM_DEFAULT_MAX_SAMPLES;
  let clamp = true;

  if (typeof args[0] === "function") {
    // Signature: (heightSampler, uv, viewDirTangent, depthScale, options)
    sampleHeight = args[0];
    if (args[1] !== undefined) initialUv = args[1];
    if (args[2] !== undefined) viewDir = args[2];
    if (args[3] !== undefined) depthScale = args[3];
    if (typeof args[4] === "object" && args[4] !== null) {
      if (args[4].minSamples !== undefined) minSamples = args[4].minSamples;
      if (args[4].maxSamples !== undefined) maxSamples = args[4].maxSamples;
      if (args[4].clamp !== undefined) clamp = args[4].clamp;
    }
  } else if (
    typeof args[0] === "object" &&
    args[0] !== null &&
    !Array.isArray(args[0]) &&
    ("sampleHeight" in args[0] ||
      "heightSampler" in args[0] ||
      "uv" in args[0] ||
      "initialUv" in args[0] ||
      "viewVector" in args[0] ||
      "viewDir" in args[0] ||
      "tangentView" in args[0])
  ) {
    // Signature: ({ sampleHeight, uv, viewVector, depthScale, minSamples, maxSamples, clamp })
    const opts = args[0];
    sampleHeight = opts.sampleHeight ?? opts.heightSampler;
    initialUv = opts.uv ?? opts.initialUv ?? [0.0, 0.0];
    viewDir = opts.viewVector ?? opts.viewDir ?? opts.tangentView ?? [0.0, 0.0, 1.0];
    if (opts.depthScale !== undefined) depthScale = opts.depthScale;
    if (opts.minSamples !== undefined) minSamples = opts.minSamples;
    if (opts.maxSamples !== undefined) maxSamples = opts.maxSamples;
    if (opts.clamp !== undefined) clamp = opts.clamp;
  } else {
    // Signature: (uv, viewDirTangent, heightSampler, depthScale, minSamples, maxSamples)
    if (args[0] !== undefined) initialUv = args[0];
    if (args[1] !== undefined) viewDir = args[1];
    if (args[2] !== undefined) sampleHeight = args[2];
    if (args[3] !== undefined) depthScale = args[3];
    if (args[4] !== undefined) minSamples = args[4];
    if (args[5] !== undefined) maxSamples = args[5];
  }

  const sampler = typeof sampleHeight === "function" ? sampleHeight : () => 1.0;

  const u0 = Array.isArray(initialUv) ? (initialUv[0] ?? 0.0) : (initialUv.x ?? initialUv.u ?? 0.0);
  const v0 = Array.isArray(initialUv) ? (initialUv[1] ?? 0.0) : (initialUv.y ?? initialUv.v ?? 0.0);

  const vx = Array.isArray(viewDir) ? (viewDir[0] ?? 0.0) : (viewDir.x ?? 0.0);
  const vy = Array.isArray(viewDir) ? (viewDir[1] ?? 0.0) : (viewDir.y ?? 0.0);
  const vz = Array.isArray(viewDir) ? (viewDir[2] ?? 1.0) : (viewDir.z ?? 1.0);

  const len = Math.hypot(vx, vy, vz) || 1.0;
  const nx = vx / len;
  const ny = vy / len;
  const nz = vz / len;

  const scale = clampDepthScale(depthScale);

  if (scale <= 0.0) {
    const clampedInit = clamp ? clampPomUv([u0, v0]) : { x: u0, y: v0, u: u0, v: v0 };
    return {
      uv: clampedInit,
      offset: { x: 0.0, y: 0.0, u: 0.0, v: 0.0 },
      samples: 0,
      depth: 0.0,
      height: Number(sampler(u0, v0)) || 1.0
    };
  }

  const viewZ = Math.max(Math.abs(nz), 0.0001);
  const numLayers = calculatePomSamples(viewZ, minSamples, maxSamples);
  const stepCount = Math.max(1, Math.round(numLayers));
  const layerDepth = 1.0 / numLayers;

  const pX = (nx / viewZ) * scale;
  const pY = (ny / viewZ) * scale;
  const deltaU = pX / numLayers;
  const deltaV = pY / numLayers;

  let currentU = u0;
  let currentV = v0;
  let currentLayerDepth = 0.0;
  let currentHeight = Number(sampler(currentU, currentV)) || 0.0;
  let currentMapDepth = 1.0 - currentHeight;

  let prevU = currentU;
  let prevV = currentV;
  let prevLayerDepth = 0.0;
  let prevMapDepth = currentMapDepth;
  let steps = 0;

  for (let i = 0; i < 32; i++) {
    if (i >= stepCount || currentLayerDepth >= currentMapDepth) {
      break;
    }
    prevU = currentU;
    prevV = currentV;
    prevLayerDepth = currentLayerDepth;
    prevMapDepth = currentMapDepth;

    currentU -= deltaU;
    currentV -= deltaV;
    currentLayerDepth += layerDepth;

    currentHeight = Number(sampler(currentU, currentV)) || 0.0;
    currentMapDepth = 1.0 - currentHeight;
    steps++;
  }

  // Linear height interpolation (POM sub-layer depth)
  const afterDepth = currentMapDepth - currentLayerDepth;
  const beforeDepth = prevMapDepth - prevLayerDepth;
  const denom = beforeDepth - afterDepth;
  const weight = Math.abs(denom) > 1e-6 ? Math.max(0.0, Math.min(1.0, beforeDepth / denom)) : 0.0;

  let finalU = prevU + (currentU - prevU) * weight;
  let finalV = prevV + (currentV - prevV) * weight;
  const finalDepth = prevLayerDepth + (currentLayerDepth - prevLayerDepth) * weight;

  if (clamp) {
    finalU = Math.max(0.0, Math.min(1.0, finalU));
    finalV = Math.max(0.0, Math.min(1.0, finalV));
  }

  const offsetU = finalU - u0;
  const offsetV = finalV - v0;
  const sampledH = Number(sampler(finalU, finalV)) || 0.0;

  const uvObj = {
    x: finalU,
    y: finalV,
    u: finalU,
    v: finalV,
    [0]: finalU,
    [1]: finalV,
    length: 2,
    [Symbol.iterator]() {
      return [finalU, finalV][Symbol.iterator]();
    },
    toArray() {
      return [finalU, finalV];
    }
  };

  const offsetObj = {
    x: offsetU,
    y: offsetV,
    u: offsetU,
    v: offsetV,
    [0]: offsetU,
    [1]: offsetV,
    length: 2,
    [Symbol.iterator]() {
      return [offsetU, offsetV][Symbol.iterator]();
    },
    toArray() {
      return [offsetU, offsetV];
    }
  };

  return {
    uv: uvObj,
    offset: offsetObj,
    samples: steps,
    depth: finalDepth,
    height: sampledH
  };
}

/**
 * Alias for simulatePomRaymarch aligning with task specification.
 */
export const raymarchHeightLayers = simulatePomRaymarch;

/**
 * GLSL snippet for tangent frame reconstruction from screen-space derivatives.
 */
export const POM_TANGENT_FRAME_GLSL = `
#ifndef TANGENT_FRAME_DEFINED
#define TANGENT_FRAME_DEFINED
mat3 pomGetTangentFrame( vec3 eye_pos, vec3 surf_norm, vec2 uv ) {
	vec3 q0 = dFdx( eye_pos );
	vec3 q1 = dFdy( eye_pos );
	vec2 st0 = dFdx( uv );
	vec2 st1 = dFdy( uv );
	vec3 N = surf_norm;
	vec3 q1perp = cross( q1, N );
	vec3 q0perp = cross( N, q0 );
	vec3 T = q1perp * st0.x + q0perp * st1.x;
	vec3 B = q1perp * st0.y + q0perp * st1.y;
	float det = max( dot( T, T ), dot( B, B ) );
	float scale = ( det == 0.0 ) ? 0.0 : inversesqrt( det );
	return mat3( T * scale, B * scale, N );
}
#endif
`;

/**
 * GLSL snippet for steep Parallax Occlusion Mapping raymarching with linear interpolation.
 */
export const POM_RAYMARCH_GLSL = `
#ifndef PARALLAX_OCCLUSION_MAPPING_DEFINED
#define PARALLAX_OCCLUSION_MAPPING_DEFINED

` + POM_TANGENT_FRAME_GLSL + `

vec2 parallaxOcclusionMapping( vec2 initialUv, vec3 viewDirTangent, sampler2D normalTex, float depthScale, float minSamp, float maxSamp ) {
	if ( depthScale <= 0.0 ) return clamp( initialUv, 0.0, 1.0 );

	float vz = max( abs( viewDirTangent.z ), 0.0001 );
	float numLayers = mix( maxSamp, minSamp, clamp( vz, 0.0, 1.0 ) );
	float layerDepth = 1.0 / numLayers;
	float currentLayerDepth = 0.0;

	vec2 p = ( viewDirTangent.xy / vz ) * depthScale;
	vec2 deltaUv = p / numLayers;

	vec2 currentUv = initialUv;
	float currentMapDepth = 1.0 - texture2D( normalTex, currentUv ).a;

	vec2 prevUv = currentUv;
	float prevLayerDepth = 0.0;
	float prevMapDepth = currentMapDepth;

	for ( int i = 0; i < 32; i ++ ) {
		if ( float( i ) >= numLayers || currentLayerDepth >= currentMapDepth ) {
			break;
		}
		prevUv = currentUv;
		prevLayerDepth = currentLayerDepth;
		prevMapDepth = currentMapDepth;
		currentUv -= deltaUv;
		currentLayerDepth += layerDepth;
		currentMapDepth = 1.0 - texture2D( normalTex, currentUv ).a;
	}

	float afterDepth = currentMapDepth - currentLayerDepth;
	float beforeDepth = prevMapDepth - prevLayerDepth;
	float denom = beforeDepth - afterDepth;
	float weight = abs( denom ) > 1e-5 ? clamp( beforeDepth / denom, 0.0, 1.0 ) : 0.0;
	vec2 finalUv = prevUv + ( currentUv - prevUv ) * weight;

	return clamp( finalUv, 0.0, 1.0 );
}
#endif
`;

/**
 * Applies Parallax Occlusion Mapping (POM) raymarching shader extensions to a Three.js material.
 * Injects tangent-space view vector transformation, steep height layer raymarching loop (8-32 samples),
 * linear sub-layer depth interpolation, boundary UV clamping [0.0, 1.0], and runtime uniforms.
 *
 * @param {object} material - Three.js MeshStandardMaterial or MeshPhysicalMaterial instance
 * @param {object} [options={}] - POM configuration options
 * @param {boolean} [options.pomEnabled=true] - Initial toggle state
 * @param {boolean} [options.enabled] - Alias for pomEnabled
 * @param {number} [options.depthScale=0.05] - Height displacement depth scale (0.0 to 0.2)
 * @param {number} [options.pomDepthScale] - Alias for depthScale
 * @param {number} [options.minSamples=8.0] - Perpendicular view layer sample count
 * @param {number} [options.pomMinSamples] - Alias for minSamples
 * @param {number} [options.maxSamples=32.0] - Grazing view layer sample count
 * @param {number} [options.pomMaxSamples] - Alias for maxSamples
 * @returns {object} The modified material instance
 */
export function applyPOM(material, options = {}) {
  const THREE = options.THREE || (typeof globalThis !== "undefined" && globalThis.THREE) || THREE_DEFAULT;
  const enabled =
    options.pomEnabled ??
    options.enabled ??
    (typeof options.pom === "boolean" ? options.pom : (options.pom?.enabled ?? true));
  const depthScale = clampDepthScale(options.depthScale ?? options.pomDepthScale ?? POM_DEFAULT_DEPTH_SCALE);
  const minSamples = options.minSamples ?? options.pomMinSamples ?? POM_DEFAULT_MIN_SAMPLES;
  const maxSamples = options.maxSamples ?? options.pomMaxSamples ?? POM_DEFAULT_MAX_SAMPLES;

  material.defines = material.defines || {};
  material.defines.USE_POM = "1";

  material.userData = material.userData || {};
  material.userData.pomEnabled = enabled;
  material.userData.pomDepthScale = depthScale;
  material.userData.pomMinSamples = minSamples;
  material.userData.pomMaxSamples = maxSamples;

  const existingOnBeforeCompile = material.onBeforeCompile;
  const existingCacheKey = material.customProgramCacheKey;

  material.onBeforeCompile = function (shader, renderer) {
    // 1. Declare and inject POM uniforms with bidirectional reactivity
    shader.uniforms.uPomEnabled = {
      get value() {
        if (material.userData?.pomEnabled !== undefined) {
          return material.userData.pomEnabled ? 1.0 : 0.0;
        }
        if (material.pomEnabled !== undefined) {
          return material.pomEnabled ? 1.0 : 0.0;
        }
        return this._val ? 1.0 : 0.0;
      },
      set value(v) {
        const b = Boolean(v);
        this._val = b;
        if (material.userData) {
          material.userData.pomEnabled = b;
        }
      },
      _val: enabled
    };

    shader.uniforms.uPomDepthScale = {
      get value() {
        const v = material.userData?.pomDepthScale ?? material.pomDepthScale ?? this._val;
        return clampDepthScale(v);
      },
      set value(v) {
        const clamped = clampDepthScale(v);
        this._val = clamped;
        if (material.userData) {
          material.userData.pomDepthScale = clamped;
        }
      },
      _val: depthScale
    };

    shader.uniforms.uPomMinSamples = {
      get value() {
        const v = material.userData?.pomMinSamples ?? material.pomMinSamples ?? this._val;
        return Math.max(1.0, Number(v) || POM_DEFAULT_MIN_SAMPLES);
      },
      set value(v) {
        const num = Math.max(1.0, Number(v) || POM_DEFAULT_MIN_SAMPLES);
        this._val = num;
        if (material.userData) {
          material.userData.pomMinSamples = num;
        }
      },
      _val: minSamples
    };

    shader.uniforms.uPomMaxSamples = {
      get value() {
        const v = material.userData?.pomMaxSamples ?? material.pomMaxSamples ?? this._val;
        return Math.max(1.0, Number(v) || POM_DEFAULT_MAX_SAMPLES);
      },
      set value(v) {
        const num = Math.max(1.0, Number(v) || POM_DEFAULT_MAX_SAMPLES);
        this._val = num;
        if (material.userData) {
          material.userData.pomMaxSamples = num;
        }
      },
      _val: maxSamples
    };

    // 2. Vertex Shader Injection: Declare and calculate tangent view vector
    if (!shader.vertexShader.includes("varying vec3 vTangentView;")) {
      shader.vertexShader = shader.vertexShader.replace(
        "#include <uv_pars_vertex>",
        `#include <uv_pars_vertex>
#ifdef USE_POM
varying vec3 vTangentView;
#endif`
      );

      shader.vertexShader = shader.vertexShader.replace(
        "#include <project_vertex>",
        `#include <project_vertex>
#ifdef USE_POM
#ifdef USE_TANGENT
	vTangentView = vec3(
		dot( - mvPosition.xyz, normalize( transformedTangent ) ),
		dot( - mvPosition.xyz, normalize( cross( transformedNormal, transformedTangent ) * tangent.w ) ),
		dot( - mvPosition.xyz, normalize( transformedNormal ) )
	);
#else
	vTangentView = - mvPosition.xyz;
#endif
#endif`
      );
    }

    // 3. Fragment Shader Injection: Uniforms, raymarching function, and TBN frame
    if (!shader.fragmentShader.includes("uniform float uPomEnabled;")) {
      shader.fragmentShader = shader.fragmentShader.replace(
        "#include <uv_pars_fragment>",
        `#include <uv_pars_fragment>
#ifdef USE_POM
uniform float uPomEnabled;
uniform float uPomDepthScale;
uniform float uPomMinSamples;
uniform float uPomMaxSamples;
varying vec3 vTangentView;

` + POM_RAYMARCH_GLSL + `
#endif`
      );
    }

    // 4. Fragment Shader Injection: Pre-map POM calculation and displaced map sampling
    if (shader.fragmentShader.includes("#include <map_fragment>") && !shader.fragmentShader.includes("vec2 pomUv =")) {
      shader.fragmentShader = shader.fragmentShader.replace(
        "#include <map_fragment>",
        `#if defined( USE_NORMALMAP )
	vec2 pomBaseUv = vNormalMapUv;
#elif defined( USE_MAP )
	vec2 pomBaseUv = vMapUv;
#elif defined( USE_UV )
	vec2 pomBaseUv = vUv;
#else
	vec2 pomBaseUv = vec2( 0.0 );
#endif
vec2 pomUv = pomBaseUv;
#ifdef USE_POM
if ( uPomEnabled > 0.5 && uPomDepthScale > 0.0 ) {
	#ifdef USE_TANGENT
		vec3 pomViewDir = normalize( vTangentView );
	#else
		vec3 pomEye = normalize( vViewPosition );
		vec3 pomSurfNormal = normalize( vNormal );
		#ifdef DOUBLE_SIDED
			pomSurfNormal *= ( gl_FrontFacing ? 1.0 : - 1.0 );
		#endif
		mat3 pomTbn = pomGetTangentFrame( - vViewPosition, pomSurfNormal, pomBaseUv );
		vec3 pomViewDir = normalize( vec3(
			dot( pomEye, pomTbn[0] ),
			dot( pomEye, pomTbn[1] ),
			dot( pomEye, pomTbn[2] )
		) );
	#endif
	#ifdef USE_NORMALMAP
		pomUv = parallaxOcclusionMapping( pomBaseUv, pomViewDir, normalMap, uPomDepthScale, uPomMinSamples, uPomMaxSamples );
	#endif
}
#endif
#ifdef USE_MAP
	#ifdef USE_POM
		vec4 sampledDiffuseColor = texture2D( map, pomUv );
	#else
		vec4 sampledDiffuseColor = texture2D( map, vMapUv );
	#endif
	#ifdef DECODE_VIDEO_TEXTURE
		sampledDiffuseColor = sRGBTransferEOTF( sampledDiffuseColor );
	#endif
	diffuseColor *= sampledDiffuseColor;
#endif`
      );
    }

    // 5. Replace standard map sampling for standard Three.js materials without LabPBR hook
    const isLabPBR = Boolean(material.userData?.isLabPBR || material.defines?.USE_LABPBR_NORMAL);
    const shaderChunks = THREE?.ShaderChunk || THREE_DEFAULT?.ShaderChunk || {};
    if (!isLabPBR && shader.fragmentShader.includes("#include <normal_fragment_maps>")) {
      const normalChunk = (shaderChunks.normal_fragment_maps || "")
        .replaceAll("vNormalMapUv", "pomUv");
      shader.fragmentShader = shader.fragmentShader.replace(
        "#include <normal_fragment_maps>",
        normalChunk
      );
    } else if (shader.fragmentShader.includes("texture2D( normalMap, vNormalMapUv )") && !shader.fragmentShader.includes("labpbrNormalTex")) {
      shader.fragmentShader = shader.fragmentShader.replaceAll(
        "texture2D( normalMap, vNormalMapUv )",
        "texture2D( normalMap, pomUv )"
      );
    }

    if (!isLabPBR && shader.fragmentShader.includes("#include <roughnessmap_fragment>")) {
      const roughnessChunk = (shaderChunks.roughnessmap_fragment || "")
        .replaceAll("vRoughnessMapUv", "pomUv");
      shader.fragmentShader = shader.fragmentShader.replace(
        "#include <roughnessmap_fragment>",
        roughnessChunk
      );
    } else if (shader.fragmentShader.includes("texture2D( roughnessMap, vRoughnessMapUv )") && !shader.fragmentShader.includes("USE_LABPBR_SPECULAR")) {
      shader.fragmentShader = shader.fragmentShader.replaceAll(
        "texture2D( roughnessMap, vRoughnessMapUv )",
        "texture2D( roughnessMap, pomUv )"
      );
    }

    if (shader.fragmentShader.includes("#include <metalnessmap_fragment>")) {
      const metalnessChunk = (shaderChunks.metalnessmap_fragment || "")
        .replaceAll("vMetalnessMapUv", "pomUv");
      shader.fragmentShader = shader.fragmentShader.replace(
        "#include <metalnessmap_fragment>",
        metalnessChunk
      );
    } else if (shader.fragmentShader.includes("texture2D( metalnessMap, vMetalnessMapUv )") && !shader.fragmentShader.includes("USE_LABPBR_SPECULAR")) {
      shader.fragmentShader = shader.fragmentShader.replaceAll(
        "texture2D( metalnessMap, vMetalnessMapUv )",
        "texture2D( metalnessMap, pomUv )"
      );
    }

    if (shader.fragmentShader.includes("#include <emissivemap_fragment>")) {
      const emissiveChunk = (shaderChunks.emissivemap_fragment || "")
        .replaceAll("vEmissiveMapUv", "pomUv");
      shader.fragmentShader = shader.fragmentShader.replace(
        "#include <emissivemap_fragment>",
        emissiveChunk
      );
    } else if (shader.fragmentShader.includes("texture2D( emissiveMap, vEmissiveMapUv )")) {
      shader.fragmentShader = shader.fragmentShader.replaceAll(
        "texture2D( emissiveMap, vEmissiveMapUv )",
        "texture2D( emissiveMap, pomUv )"
      );
    }

    if (shader.fragmentShader.includes("#include <aomap_fragment>")) {
      const aoChunk = (shaderChunks.aomap_fragment || "")
        .replaceAll("vAoMapUv", "pomUv");
      shader.fragmentShader = shader.fragmentShader.replace(
        "#include <aomap_fragment>",
        aoChunk
      );
    } else if (shader.fragmentShader.includes("texture2D( aoMap, vAoMapUv )")) {
      shader.fragmentShader = shader.fragmentShader.replaceAll(
        "texture2D( aoMap, vAoMapUv )",
        "texture2D( aoMap, pomUv )"
      );
    }

    // Chain previous onBeforeCompile callback
    if (typeof existingOnBeforeCompile === "function") {
      existingOnBeforeCompile.call(this, shader, renderer);
    }
  };

  material.customProgramCacheKey = function () {
    const parentKey = typeof existingCacheKey === "function" ? existingCacheKey.call(this) : "";
    const isPom = Boolean(this.defines?.USE_POM);
    const pomKey = `pom_${isPom ? "1" : "0"}`;
    return parentKey ? `${parentKey}|${pomKey}` : pomKey;
  };

  return material;
}
