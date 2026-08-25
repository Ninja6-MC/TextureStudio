/**
 * Ninja6 Texture Studio — Example Sets & Comparison Registry Template
 * 
 * Copy this file to `src/sets.js` if you wish to write custom manual sets
 * or custom multiblock scene arrangements.
 * 
 * Note: If `src/sets.js` is not present, Texture Studio automatically discovers
 * all blocks from the loaded texture pack via `/api/pack`.
 */

export function formatTitleFromId(id) {
  if (!id) return "";
  return id
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
}

/**
 * Example Manual Vector Sets Definition
 */
export const INTERNAL_VECTOR_SETS = [
  {
    id: "set-example",
    name: "✨ [Pack] Example Custom Set",
    description: "Manual custom block arrangement template.",
    isVector: true,
    blocks: [
      {
        id: "example_block",
        name: formatTitleFromId("example_block"),
        type: "Terrain Block",
        textures: {
          all: "textures/example_block.svg"
        },
        tiling: "Toroidal Seamless"
      },
      {
        id: "example_column",
        name: formatTitleFromId("example_column"),
        type: "Column Block",
        textures: {
          side: "textures/example_column.svg",
          top: "textures/example_column_top.svg",
          bottom: "textures/example_column_top.svg"
        },
        tiling: "Cylindrical Tiling"
      }
    ],
    multiblocks: [
      {
        id: "example_wall_3x3",
        name: "Example Wall (3×3×1)",
        description: "3×3 wall composition to test seamless horizontal and vertical tiling.",
        gridSize: [3, 3, 1],
        blocks: [
          { blockId: "example_block", pos: [-1, 0, 0] },
          { blockId: "example_block", pos: [0, 0, 0] },
          { blockId: "example_block", pos: [1, 0, 0] },
          { blockId: "example_block", pos: [-1, 1, 0] },
          { blockId: "example_block", pos: [0, 1, 0] },
          { blockId: "example_block", pos: [1, 1, 0] },
          { blockId: "example_block", pos: [-1, 2, 0] },
          { blockId: "example_block", pos: [0, 2, 0] },
          { blockId: "example_block", pos: [1, 2, 0] }
        ]
      }
    ]
  }
];

/**
 * Dynamic External Pack Set Factory
 */
export function createSetFromExternalPack(pack, referenceBlocks = INTERNAL_VECTOR_SETS[0]?.blocks || []) {
  const base = pack.basePath;

  const blocks = referenceBlocks.map((b) => {
    const textures = {};
    for (const [face, texPath] of Object.entries(b.textures)) {
      const stem = texPath.replace(/^textures\//, "").replace(/\.(svg|png)$/, "");
      textures[face] = `${base}/block/${stem}.png`;
    }
    if (b.id === "grass_block") {
      textures.side_overlay = `${base}/block/grass_block_side_overlay.png`;
    }
    return {
      id: b.id,
      name: b.name,
      type: b.type,
      textures,
      tiling: "Raster Bitmap"
    };
  });

  return {
    id: pack.id,
    name: pack.name,
    description: pack.description || "External Minecraft texture pack",
    isVector: false,
    isExternal: true,
    blocks,
    multiblocks: INTERNAL_VECTOR_SETS[0]?.multiblocks || []
  };
}
