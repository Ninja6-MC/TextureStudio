/**
 * Ninja6 Texture Studio — Generation Sets & Comparison Registry
 * Official Minecraft Cinematic Trailer Vector Pack
 */

export function formatTitleFromId(id) {
  if (!id) return "";
  return id
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
}

// Native Generated Vector Sets (Distinguished by ✨ [Keyframe])
export const INTERNAL_VECTOR_SETS = [
  {
    id: "set-trailer-batch-1",
    name: "✨ [Keyframe] Trailer Batch 1: Plains & Forest",
    description: "Official Minecraft Cinematic Trailer style vector textures.",
    isVector: true,
    blocks: [
      {
        id: "grass_block",
        name: formatTitleFromId("grass_block"),
        type: "Terrain Block",
        textures: {
          top: "textures/grass_block_top.svg",
          bottom: "textures/dirt.svg",
          side: "textures/grass_block_side.svg"
        },
        tiling: "Toroidal Seamless"
      },
      {
        id: "dirt",
        name: formatTitleFromId("dirt"),
        type: "Terrain Block",
        textures: {
          all: "textures/dirt.svg"
        },
        tiling: "Toroidal Seamless"
      },
      {
        id: "dirt_path",
        name: formatTitleFromId("dirt_path"),
        type: "Terrain Block",
        textures: {
          top: "textures/dirt_path_top.svg",
          bottom: "textures/dirt.svg",
          side: "textures/dirt_path_side.svg"
        },
        tiling: "Toroidal Seamless"
      },
      {
        id: "oak_log",
        name: formatTitleFromId("oak_log"),
        type: "Wood Log",
        textures: {
          side: "textures/oak_log.svg",
          top: "textures/oak_log_top.svg",
          bottom: "textures/oak_log_top.svg"
        },
        tiling: "Cylindrical Tiling"
      },
      {
        id: "oak_planks",
        name: formatTitleFromId("oak_planks"),
        type: "Wood Planks",
        textures: {
          all: "textures/oak_planks.svg"
        },
        tiling: "Toroidal Seamless"
      },
      {
        id: "stone",
        name: formatTitleFromId("stone"),
        type: "Terrain Block",
        textures: {
          all: "textures/stone.svg"
        },
        tiling: "Toroidal Seamless"
      },
      {
        id: "cobblestone",
        name: formatTitleFromId("cobblestone"),
        type: "Terrain Block",
        textures: {
          all: "textures/cobblestone.svg"
        },
        tiling: "Toroidal Seamless"
      },
      {
        id: "sand",
        name: formatTitleFromId("sand"),
        type: "Terrain Block",
        textures: {
          all: "textures/sand.svg"
        },
        tiling: "Toroidal Seamless"
      },
      {
        id: "diamond_ore",
        name: formatTitleFromId("diamond_ore"),
        type: "Ore Block",
        textures: {
          all: "textures/diamond_ore.svg"
        },
        tiling: "Toroidal Seamless"
      }
    ],
    multiblocks: [
      {
        id: "plains_cliff_3x3",
        name: "Plains Meadow Cliff (3×3×2)",
        description: "Lush grass blocks resting on rich soil dirt foundation.",
        gridSize: [3, 3, 2],
        blocks: [
          // Top Grass Layer
          { blockId: "grass_block", pos: [-1, 0, -1] },
          { blockId: "grass_block", pos: [0, 0, -1] },
          { blockId: "grass_block", pos: [1, 0, -1] },
          { blockId: "grass_block", pos: [-1, 0, 0] },
          { blockId: "grass_block", pos: [0, 0, 0] },
          { blockId: "grass_block", pos: [1, 0, 0] },
          { blockId: "grass_block", pos: [-1, 0, 1] },
          { blockId: "grass_block", pos: [0, 0, 1] },
          { blockId: "grass_block", pos: [1, 0, 1] },

          // Lower Dirt Foundation Layer
          { blockId: "dirt", pos: [-1, -1, -1] },
          { blockId: "dirt", pos: [0, -1, -1] },
          { blockId: "dirt", pos: [1, -1, -1] },
          { blockId: "dirt", pos: [-1, -1, 0] },
          { blockId: "dirt", pos: [0, -1, 0] },
          { blockId: "dirt", pos: [1, -1, 0] },
          { blockId: "dirt", pos: [-1, -1, 1] },
          { blockId: "dirt", pos: [0, -1, 1] },
          { blockId: "dirt", pos: [1, -1, 1] }
        ]
      },
      {
        id: "plains_with_dirt_path",
        name: "Plains Meadow & Dirt Trail (5×3)",
        description: "A dirt path cutting through green grass meadow with dirt foundation.",
        gridSize: [5, 3, 2],
        blocks: [
          // Top Layer: Grass - Path - Grass
          { blockId: "grass_block", pos: [-2, 0, -1] },
          { blockId: "grass_block", pos: [-1, 0, -1] },
          { blockId: "dirt_path", pos: [0, 0, -1] },
          { blockId: "grass_block", pos: [1, 0, -1] },
          { blockId: "grass_block", pos: [2, 0, -1] },

          { blockId: "grass_block", pos: [-2, 0, 0] },
          { blockId: "grass_block", pos: [-1, 0, 0] },
          { blockId: "dirt_path", pos: [0, 0, 0] },
          { blockId: "grass_block", pos: [1, 0, 0] },
          { blockId: "grass_block", pos: [2, 0, 0] },

          { blockId: "grass_block", pos: [-2, 0, 1] },
          { blockId: "grass_block", pos: [-1, 0, 1] },
          { blockId: "dirt_path", pos: [0, 0, 1] },
          { blockId: "grass_block", pos: [1, 0, 1] },
          { blockId: "grass_block", pos: [2, 0, 1] },

          // Lower Layer: Full Dirt Foundation
          { blockId: "dirt", pos: [-2, -1, -1] },
          { blockId: "dirt", pos: [-1, -1, -1] },
          { blockId: "dirt", pos: [0, -1, -1] },
          { blockId: "dirt", pos: [1, -1, -1] },
          { blockId: "dirt", pos: [2, -1, -1] },

          { blockId: "dirt", pos: [-2, -1, 0] },
          { blockId: "dirt", pos: [-1, -1, 0] },
          { blockId: "dirt", pos: [0, -1, 0] },
          { blockId: "dirt", pos: [1, -1, 0] },
          { blockId: "dirt", pos: [2, -1, 0] },

          { blockId: "dirt", pos: [-2, -1, 1] },
          { blockId: "dirt", pos: [-1, -1, 1] },
          { blockId: "dirt", pos: [0, -1, 1] },
          { blockId: "dirt", pos: [1, -1, 1] },
          { blockId: "dirt", pos: [2, -1, 1] }
        ]
      },
      {
        id: "oak_tree_stand",
        name: "Oak Tree Stand on Meadow (3×3×4)",
        description: "A 3-block tall oak wood trunk rising from the grass meadow.",
        gridSize: [3, 3, 4],
        blocks: [
          // Ground Grass Layer (Y = 0)
          { blockId: "grass_block", pos: [-1, 0, -1] },
          { blockId: "grass_block", pos: [0, 0, -1] },
          { blockId: "grass_block", pos: [1, 0, -1] },
          { blockId: "grass_block", pos: [-1, 0, 0] },
          { blockId: "grass_block", pos: [0, 0, 0] },
          { blockId: "grass_block", pos: [1, 0, 0] },
          { blockId: "grass_block", pos: [-1, 0, 1] },
          { blockId: "grass_block", pos: [0, 0, 1] },
          { blockId: "grass_block", pos: [1, 0, 1] },

          // Oak Trunk (Y = 1, 2, 3)
          { blockId: "oak_log", pos: [0, 1, 0] },
          { blockId: "oak_log", pos: [0, 2, 0] },
          { blockId: "oak_log", pos: [0, 3, 0] },

          // Lower Dirt (Y = -1)
          { blockId: "dirt", pos: [0, -1, 0] }
        ]
      },
      {
        id: "starter_cabin_wall",
        name: "Starter House Wall (Log Pillars & Planks)",
        description: "A classic starter cabin wall with oak log corner pillars and oak planks infill.",
        gridSize: [3, 3, 3],
        blocks: [
          // Floor / Foundation (Y = 0)
          { blockId: "oak_log", pos: [-1, 0, 0] },
          { blockId: "oak_planks", pos: [0, 0, 0] },
          { blockId: "oak_log", pos: [1, 0, 0] },

          // Middle Wall (Y = 1)
          { blockId: "oak_log", pos: [-1, 1, 0] },
          { blockId: "oak_planks", pos: [0, 1, 0] },
          { blockId: "oak_log", pos: [1, 1, 0] },

          // Top Wall (Y = 2)
          { blockId: "oak_log", pos: [-1, 2, 0] },
          { blockId: "oak_planks", pos: [0, 2, 0] },
          { blockId: "oak_log", pos: [1, 2, 0] }
        ]
      },
      {
        id: "plains_stone_cliff_3x3",
        name: "Plains Meadow & Stone Cliff (3×3×3)",
        description: "Lush grass top with soil transition and deep stone base.",
        gridSize: [3, 3, 3],
        blocks: [
          // Top Grass Layer (Y = 0)
          { blockId: "grass_block", pos: [-1, 0, -1] },
          { blockId: "grass_block", pos: [0, 0, -1] },
          { blockId: "grass_block", pos: [1, 0, -1] },
          { blockId: "grass_block", pos: [-1, 0, 0] },
          { blockId: "grass_block", pos: [0, 0, 0] },
          { blockId: "grass_block", pos: [1, 0, 0] },
          { blockId: "grass_block", pos: [-1, 0, 1] },
          { blockId: "grass_block", pos: [0, 0, 1] },
          { blockId: "grass_block", pos: [1, 0, 1] },

          // Middle Dirt Subsoil Layer (Y = -1)
          { blockId: "dirt", pos: [-1, -1, -1] },
          { blockId: "dirt", pos: [0, -1, -1] },
          { blockId: "dirt", pos: [1, -1, -1] },
          { blockId: "dirt", pos: [-1, -1, 0] },
          { blockId: "dirt", pos: [0, -1, 0] },
          { blockId: "dirt", pos: [1, -1, 0] },
          { blockId: "dirt", pos: [-1, -1, 1] },
          { blockId: "dirt", pos: [0, -1, 1] },
          { blockId: "dirt", pos: [1, -1, 1] },

          // Base Stone Bedrock Layer (Y = -2)
          { blockId: "stone", pos: [-1, -2, -1] },
          { blockId: "stone", pos: [0, -2, -1] },
          { blockId: "stone", pos: [1, -2, -1] },
          { blockId: "stone", pos: [-1, -2, 0] },
          { blockId: "stone", pos: [0, -2, 0] },
          { blockId: "stone", pos: [1, -2, 0] },
          { blockId: "stone", pos: [-1, -2, 1] },
          { blockId: "stone", pos: [0, -2, 1] },
          { blockId: "stone", pos: [1, -2, 1] }
        ]
      },
      {
        id: "beach_shoreline_3x3",
        name: "Riverbank Beach Shoreline (3×3×2)",
        description: "Golden sand beach bank meeting grass meadow on dirt and stone bedrock.",
        gridSize: [3, 3, 2],
        blocks: [
          // Top Layer: Grass -> Sand Transition (Y = 0)
          { blockId: "grass_block", pos: [-1, 0, -1] },
          { blockId: "grass_block", pos: [-1, 0, 0] },
          { blockId: "grass_block", pos: [-1, 0, 1] },

          { blockId: "sand", pos: [0, 0, -1] },
          { blockId: "sand", pos: [0, 0, 0] },
          { blockId: "sand", pos: [0, 0, 1] },

          { blockId: "sand", pos: [1, 0, -1] },
          { blockId: "sand", pos: [1, 0, 0] },
          { blockId: "sand", pos: [1, 0, 1] },

          // Foundation Layer (Y = -1)
          { blockId: "dirt", pos: [-1, -1, -1] },
          { blockId: "dirt", pos: [-1, -1, 0] },
          { blockId: "dirt", pos: [-1, -1, 1] },

          { blockId: "sand", pos: [0, -1, -1] },
          { blockId: "sand", pos: [0, -1, 0] },
          { blockId: "sand", pos: [0, -1, 1] },

          { blockId: "stone", pos: [1, -1, -1] },
          { blockId: "stone", pos: [1, -1, 0] },
          { blockId: "stone", pos: [1, -1, 1] }
        ]
      },
      {
        id: "diamond_vein_3x3",
        name: "Diamond Ore Mining Vein (3×3×2)",
        description: "Valuable diamond ore deposits embedded deep within stone bedrock.",
        gridSize: [3, 3, 2],
        blocks: [
          // Upper Layer (Y = 0)
          { blockId: "stone", pos: [-1, 0, -1] },
          { blockId: "diamond_ore", pos: [0, 0, -1] },
          { blockId: "stone", pos: [1, 0, -1] },

          { blockId: "stone", pos: [-1, 0, 0] },
          { blockId: "diamond_ore", pos: [0, 0, 0] },
          { blockId: "diamond_ore", pos: [1, 0, 0] },

          { blockId: "stone", pos: [-1, 0, 1] },
          { blockId: "stone", pos: [0, 0, 1] },
          { blockId: "stone", pos: [1, 0, 1] },

          // Lower Layer (Y = -1)
          { blockId: "stone", pos: [-1, -1, -1] },
          { blockId: "stone", pos: [0, -1, -1] },
          { blockId: "stone", pos: [1, -1, -1] },

          { blockId: "stone", pos: [-1, -1, 0] },
          { blockId: "diamond_ore", pos: [0, -1, 0] },
          { blockId: "stone", pos: [1, -1, 0] },

          { blockId: "stone", pos: [-1, -1, 1] },
          { blockId: "stone", pos: [0, -1, 1] },
          { blockId: "stone", pos: [1, -1, 1] }
        ]
      }
    ]
  }
];

export function createSetFromExternalPack(pack) {
  const base = pack.basePath;

  return {
    id: pack.id,
    name: pack.name,
    description: pack.description || "External Minecraft texture pack",
    isVector: false,
    isExternal: true,
    blocks: [
      {
        id: "grass_block",
        name: formatTitleFromId("grass_block"),
        type: "Terrain Block",
        textures: {
          top: `${base}/block/grass_block_top.png`,
          bottom: `${base}/block/dirt.png`,
          side: `${base}/block/grass_block_side.png`,
          side_overlay: `${base}/block/grass_block_side_overlay.png`
        },
        tiling: "Raster Bitmap"
      },
      {
        id: "dirt",
        name: formatTitleFromId("dirt"),
        type: "Terrain Block",
        textures: {
          all: `${base}/block/dirt.png`
        },
        tiling: "Raster Bitmap"
      },
      {
        id: "dirt_path",
        name: formatTitleFromId("dirt_path"),
        type: "Terrain Block",
        textures: {
          top: `${base}/block/dirt_path_top.png`,
          bottom: `${base}/block/dirt.png`,
          side: `${base}/block/dirt_path_side.png`
        },
        tiling: "Raster Bitmap"
      },
      {
        id: "oak_log",
        name: formatTitleFromId("oak_log"),
        type: "Wood Log",
        textures: {
          side: `${base}/block/oak_log.png`,
          top: `${base}/block/oak_log_top.png`,
          bottom: `${base}/block/oak_log_top.png`
        },
        tiling: "Raster Bitmap"
      },
      {
        id: "oak_planks",
        name: formatTitleFromId("oak_planks"),
        type: "Wood Planks",
        textures: {
          all: `${base}/block/oak_planks.png`
        },
        tiling: "Raster Bitmap"
      },
      {
        id: "stone",
        name: formatTitleFromId("stone"),
        type: "Terrain Block",
        textures: {
          all: `${base}/block/stone.png`
        },
        tiling: "Raster Bitmap"
      },
      {
        id: "cobblestone",
        name: formatTitleFromId("cobblestone"),
        type: "Terrain Block",
        textures: {
          all: `${base}/block/cobblestone.png`
        },
        tiling: "Raster Bitmap"
      },
      {
        id: "sand",
        name: formatTitleFromId("sand"),
        type: "Terrain Block",
        textures: {
          all: `${base}/block/sand.png`
        },
        tiling: "Raster Bitmap"
      },
      {
        id: "diamond_ore",
        name: formatTitleFromId("diamond_ore"),
        type: "Ore Block",
        textures: {
          all: `${base}/block/diamond_ore.png`
        },
        tiling: "Raster Bitmap"
      }
    ],
    multiblocks: INTERNAL_VECTOR_SETS[0].multiblocks
  };
}
