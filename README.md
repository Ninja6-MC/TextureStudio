# Texture Studio

<p align="center">
  <b>Resolution-independent 3D vector texture studio and multi-resolution Minecraft resource pack compiler.</b>
</p>

<p align="center">
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-GPLv3-blue.svg" alt="License: GPL v3" /></a>
  <img src="https://img.shields.io/badge/Node.js-%3E%3D18.0.0-green.svg" alt="Node.js: >=18" />
  <img src="https://img.shields.io/badge/Minecraft-1.20%20--%201.21.4%2B-brightgreen.svg" alt="Minecraft: 1.20 - 1.21.4+" />
</p>

Part of the [Ninja6-MC](https://github.com/Ninja6-MC) tool suite.

---

## Status

🚧 **Under Development** — *Work in progress tool & compiler. Not yet formally released.*

---

## What it does

Texture Studio is a local web application and CLI compiler built for authoring, inspecting, and compiling native SVG vector textures into production-ready Minecraft resource packs.

### Key Features

* **4-Way Synced 3D Viewport**: Compare vector textures side-by-side against Vanilla, Bare Bones, and Faithful in real-time with 360° orbital motion synchronization.
* **Single & Multiblock 3D Inspector**: Inspect single cubes with exact 6-face UV wrapping, or multi-block structures (cliffs, dirt trails, standing trees, cabin walls) to verify seamless 3D tiling.
* **Multi-Layer Compositing**: Renders dynamic Minecraft biome colormapping, grass overhang overlays, and custom $15/16\text{ths}$ block heights.
* **Rust-Speed Vector Compilation**: Powered by `@resvg/resvg-js` to rasterize SVGs into crisp, ultra-high-definition PNGs at any target resolution ($512\times512$, $256$, $128$, $64$, $32$).
* **1-Click Auto-Deploy**: Automatically packages valid `.zip` archives with POSIX-compliant paths and syncs directly into your local `.minecraft/resourcepacks/` directory.

---

## Getting Started

### Prerequisites
* [Node.js](https://nodejs.org/) (version 18.0.0 or higher)

### Installation

```bash
# Clone the repository
git clone https://github.com/Ninja6-MC/TextureStudio.git
cd TextureStudio

# Install dependencies
npm install
```

### Launch the 3D Studio

```bash
npm start
```

Then open **`http://localhost:3000`** in your browser.

---

## Compiling Resource Packs

Texture Studio includes built-in scripts to compile SVG vector files located in `textures/` into Minecraft-ready `.zip` resource packs:

```bash
# Compile 512x Ultra HD Resource Pack (Default)
npm run build

# Compile All Resolutions (512x, 256x, 128x, 64x, 32x)
npm run build:all

# Compile Specific Resolution Tiers
npm run build:256
npm run build:128
npm run build:64
npm run build:32
```

Compiled archives are saved to `dist/` and automatically deployed to `.minecraft/resourcepacks/` if a local Minecraft installation is detected.

---

## 3D Comparison with External Packs

To compare your textures in 3D against existing Minecraft packs:
1. Drop any standard Minecraft resource pack `.zip` (e.g. `Faithful_512x.zip`, `Bare_Bones.zip`) into the `cache/packs/` directory (or pass `--packs <path>` to the server).
2. Click **`🔄 Reload Textures`** in the studio toolbar.
3. Select the external pack in any of the 4 viewports.

---

## Contributing & Standards

Contributions are welcome! Please ensure:
* Commits follow [Conventional Commits](https://www.conventionalcommits.org/).
* Every commit is signed off (`git commit -s`) per the [Developer Certificate of Origin (DCO)](https://developercertificate.org/).
* Follow the [Ninja6-MC Contributing Guidelines](https://github.com/Ninja6-MC/.github/blob/main/CONTRIBUTING.md).

---

## License

[GNU General Public License v3.0](LICENSE).
