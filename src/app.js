import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

const STORAGE_KEY = "ninja6_studio_settings_v1";

// Minecraft Plains Biome Grass Tint Color
const PLAINS_GRASS_TINT = new THREE.Color(0x79c05a);

function createAdaptiveMultiblocks() {
  return [
    {
      id: "adaptive_wall_3x3",
      name: "Selected Block: 3×3 Facade Wall",
      description: "3×3 vertical wall to test seamless horizontal and vertical tiling across 9 blocks.",
      gridSize: [3, 3, 1],
      isAdaptive: true,
      blocks: [
        { blockId: "$SELECTED", pos: [-1, 0, 0] },
        { blockId: "$SELECTED", pos: [0, 0, 0] },
        { blockId: "$SELECTED", pos: [1, 0, 0] },
        { blockId: "$SELECTED", pos: [-1, 1, 0] },
        { blockId: "$SELECTED", pos: [0, 1, 0] },
        { blockId: "$SELECTED", pos: [1, 1, 0] },
        { blockId: "$SELECTED", pos: [-1, 2, 0] },
        { blockId: "$SELECTED", pos: [0, 2, 0] },
        { blockId: "$SELECTED", pos: [1, 2, 0] }
      ]
    },
    {
      id: "adaptive_cliff_3x3",
      name: "Selected Block: 3×3×2 Stepped Cliff",
      description: "Two-layer stepped terrain structure to test horizontal wrapping and edge alignment.",
      gridSize: [3, 3, 2],
      isAdaptive: true,
      blocks: [
        { blockId: "$SELECTED", pos: [-1, 0, -1] },
        { blockId: "$SELECTED", pos: [0, 0, -1] },
        { blockId: "$SELECTED", pos: [1, 0, -1] },
        { blockId: "$SELECTED", pos: [-1, 0, 0] },
        { blockId: "$SELECTED", pos: [0, 0, 0] },
        { blockId: "$SELECTED", pos: [1, 0, 0] },
        { blockId: "$SELECTED", pos: [-1, 1, -1] },
        { blockId: "$SELECTED", pos: [0, 1, -1] },
        { blockId: "$SELECTED", pos: [1, 1, -1] }
      ]
    },
    {
      id: "adaptive_pillar_1x4",
      name: "Selected Block: 1×4 Vertical Column",
      description: "Vertical column to test vertical grain alignment and column continuity.",
      gridSize: [1, 4, 1],
      isAdaptive: true,
      blocks: [
        { blockId: "$SELECTED", pos: [0, 0, 0] },
        { blockId: "$SELECTED", pos: [0, 1, 0] },
        { blockId: "$SELECTED", pos: [0, 2, 0] },
        { blockId: "$SELECTED", pos: [0, 3, 0] }
      ]
    },
    {
      id: "adaptive_platform_3x3",
      name: "Selected Block: 3×3 Flat Platform",
      description: "Horizontal ground platform to test 4-way planar surface tiling.",
      gridSize: [3, 1, 3],
      isAdaptive: true,
      blocks: [
        { blockId: "$SELECTED", pos: [-1, 0, -1] },
        { blockId: "$SELECTED", pos: [0, 0, -1] },
        { blockId: "$SELECTED", pos: [1, 0, -1] },
        { blockId: "$SELECTED", pos: [-1, 0, 0] },
        { blockId: "$SELECTED", pos: [0, 0, 0] },
        { blockId: "$SELECTED", pos: [1, 0, 0] },
        { blockId: "$SELECTED", pos: [-1, 0, 1] },
        { blockId: "$SELECTED", pos: [0, 0, 1] },
        { blockId: "$SELECTED", pos: [1, 0, 1] }
      ]
    }
  ];
}

function buildExternalSet(pack, referenceBlocks = [], multiblocks = []) {
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
    multiblocks
  };
}

class TextureStudioApp {
  constructor() {
    this.allSets = [];
    this.selectedSetIndices = [0, 1];
    this.currentResolution = "512";
    this.currentMode = "single";
    this.isSyncMotion = true;

    this.selectedBlockIndex = 0;
    this.selectedMultiIndex = 0;

    this.isAutoRotating = false;
    this.isWireframe = false;
    this.showOverlays = true;
    this.showGrid = true;
    this.isSyncingEvent = false;

    this.textureCache = new Map();
    this.cacheBustTimestamp = Date.now();
    this.viewports = [];

    this.initDOM();
    this.loadPersistedSettings();

    this.loadAllSets().then(() => {
      this.initAllViewports();
      this.bindEvents();
      this.bindExportEvents();
      this.setupResizeObserver();
      this.updateMultiSelectUI();
      this.applyRestoredSettingsToDOM();
      this.updateViewportLayout();
      this.animate();
    });
  }

  loadPersistedSettings() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (parsed) {
        if (Array.isArray(parsed.selectedSetIndices) && parsed.selectedSetIndices.length > 0) {
          this.selectedSetIndices = parsed.selectedSetIndices;
        }
        if (parsed.currentResolution) this.currentResolution = parsed.currentResolution;
        if (parsed.currentMode) this.currentMode = parsed.currentMode;
        if (typeof parsed.selectedBlockIndex === "number") this.selectedBlockIndex = parsed.selectedBlockIndex;
        if (typeof parsed.selectedMultiIndex === "number") this.selectedMultiIndex = parsed.selectedMultiIndex;
        if (typeof parsed.isSyncMotion === "boolean") this.isSyncMotion = parsed.isSyncMotion;
        if (typeof parsed.isWireframe === "boolean") this.isWireframe = parsed.isWireframe;
        if (typeof parsed.showOverlays === "boolean") this.showOverlays = parsed.showOverlays;
        else if (typeof parsed.showGrassOverhang === "boolean") this.showOverlays = parsed.showGrassOverhang;
        if (typeof parsed.showGrid === "boolean") this.showGrid = parsed.showGrid;
      }
    } catch (e) {
      console.warn("Could not load persisted settings:", e);
    }
  }

  saveSettings() {
    try {
      const settings = {
        selectedSetIndices: this.selectedSetIndices,
        currentResolution: this.currentResolution,
        currentMode: this.currentMode,
        selectedBlockIndex: this.selectedBlockIndex,
        selectedMultiIndex: this.selectedMultiIndex,
        isSyncMotion: this.isSyncMotion,
        isWireframe: this.isWireframe,
        showOverlays: this.showOverlays,
        showGrid: this.showGrid
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    } catch (e) {
      console.warn("Could not save settings to localStorage:", e);
    }
  }

  applyRestoredSettingsToDOM() {
    if (this.dom.resSelect) this.dom.resSelect.value = this.currentResolution;
    if (this.currentMode === "single") {
      this.dom.modeSingleBtn.classList.add("active");
      this.dom.modeMultiBtn.classList.remove("active");
    } else {
      this.dom.modeMultiBtn.classList.add("active");
      this.dom.modeSingleBtn.classList.remove("active");
    }
    this.dom.btnSyncMotion.classList.toggle("active", this.isSyncMotion);
    this.dom.btnSyncMotion.querySelector("strong").textContent = this.isSyncMotion ? "ON" : "OFF";
    this.dom.helpSyncState.textContent = this.isSyncMotion ? "🔗 Motion Synced" : "🔓 Motion Independent";
    this.dom.btnWireframe.classList.toggle("active", this.isWireframe);
    if (this.dom.btnToggleOverlay) {
      this.dom.btnToggleOverlay.classList.toggle("active", this.showOverlays);
      this.dom.btnToggleOverlay.textContent = this.showOverlays ? "Overlays: ON" : "Overlays: OFF";
    }
    this.dom.btnGrid.classList.toggle("active", this.showGrid);
  }

  async loadAllSets() {
    this.allSets = [];
    let customModule = null;

    // 1. Try loading custom sets.js if present locally
    try {
      customModule = await import("./sets.js");
      if (customModule && Array.isArray(customModule.INTERNAL_VECTOR_SETS) && customModule.INTERNAL_VECTOR_SETS.length > 0) {
        this.allSets.push(...customModule.INTERNAL_VECTOR_SETS);
      }
    } catch {
      // sets.js is not present or failed to import - proceed with dynamic auto-discovery
    }

    // 2. If no custom sets loaded, fetch dynamic pack from /api/pack
    if (this.allSets.length === 0) {
      try {
        const res = await fetch("/api/pack");
        if (res.ok) {
          const pack = await res.json();
          this.allSets.push({
            id: pack.id,
            name: pack.name,
            description: pack.description,
            isVector: true,
            blocks: pack.blocks || [],
            multiblocks: createAdaptiveMultiblocks()
          });
        }
      } catch (e) {
        console.warn("Could not load dynamic /api/pack:", e);
      }
    }

    // Fallback if still empty
    if (this.allSets.length === 0) {
      this.allSets.push({
        id: "pack-default",
        name: "✨ [Pack] Active Pack",
        description: "Empty pack",
        isVector: true,
        blocks: [],
        multiblocks: createAdaptiveMultiblocks()
      });
    }

    const primarySet = this.allSets[0];

    // 3. Load External Comparison Packs
    try {
      const res = await fetch("/api/packs");
      if (res.ok) {
        const packs = await res.json();
        packs.forEach((pack) => {
          if (customModule && typeof customModule.createSetFromExternalPack === "function") {
            this.allSets.push(customModule.createSetFromExternalPack(pack, primarySet.blocks));
          } else {
            this.allSets.push(buildExternalSet(pack, primarySet.blocks, primarySet.multiblocks));
          }
        });
      }
    } catch (e) {
      console.warn("Could not load external packs API:", e);
    }

    if (this.selectedSetIndices && this.selectedSetIndices.length > 0) {
      this.selectedSetIndices = this.selectedSetIndices.filter((idx) => idx < this.allSets.length);
    }
    if (!this.selectedSetIndices || this.selectedSetIndices.length === 0) {
      if (this.allSets.length > 3) {
        this.selectedSetIndices = [0, 3, 1];
      } else if (this.allSets.length > 1) {
        this.selectedSetIndices = [0, 1];
      } else {
        this.selectedSetIndices = [0];
      }
    }
  }

  initDOM() {
    this.dom = {
      multiSelectContainer: document.getElementById("multi-set-dropdown-container"),
      multiSelectTrigger: document.getElementById("multi-select-trigger"),
      multiSelectLabel: document.getElementById("multi-select-label"),
      multiSelectMenu: document.getElementById("multi-select-menu"),
      multiSelectOptions: document.getElementById("multi-select-options"),
      btnSyncMotion: document.getElementById("btn-sync-motion"),
      btnReloadTextures: document.getElementById("btn-reload-textures"),
      resSelect: document.getElementById("res-select"),
      modeSingleBtn: document.getElementById("mode-single"),
      modeMultiBtn: document.getElementById("mode-multi"),
      btnWireframe: document.getElementById("btn-wireframe"),
      btnToggleOverlay: document.getElementById("btn-toggle-overlay"),
      btnAutoRotate: document.getElementById("btn-autorotate"),
      btnGrid: document.getElementById("btn-grid"),
      sidebarTitle: document.getElementById("sidebar-title"),
      itemCountBadge: document.getElementById("item-count"),
      itemList: document.getElementById("item-list"),
      viewportsGrid: document.getElementById("viewports-grid"),
      helpSyncState: document.getElementById("help-sync-state"),
      metaId: document.getElementById("meta-id"),
      metaName: document.getElementById("meta-name"),
      metaType: document.getElementById("meta-type"),
      metaTiling: document.getElementById("meta-tiling"),
      viewportBoxes: [
        document.getElementById("viewport-box-0"),
        document.getElementById("viewport-box-1"),
        document.getElementById("viewport-box-2"),
        document.getElementById("viewport-box-3")
      ],
      canvasWrappers: [
        document.getElementById("canvas-wrapper-0"),
        document.getElementById("canvas-wrapper-1"),
        document.getElementById("canvas-wrapper-2"),
        document.getElementById("canvas-wrapper-3")
      ],
      tags: [
        document.getElementById("tag-viewport-0"),
        document.getElementById("tag-viewport-1"),
        document.getElementById("tag-viewport-2"),
        document.getElementById("tag-viewport-3")
      ],
      hudTargets: [
        document.getElementById("hud-target-0"),
        document.getElementById("hud-target-1"),
        document.getElementById("hud-target-2"),
        document.getElementById("hud-target-3")
      ],
      btnOpenExport: document.getElementById("btn-open-export"),
      exportModal: document.getElementById("export-modal"),
      btnCloseModal: document.getElementById("btn-close-modal"),
      btnCancelExport: document.getElementById("btn-cancel-export"),
      btnDoCompile: document.getElementById("btn-do-compile"),
      exportStatusBox: document.getElementById("export-status-box"),
      statusText: document.getElementById("status-text"),
      statusMeta: document.getElementById("status-meta"),
      outFilename: document.getElementById("out-filename"),
      outFilesize: document.getElementById("out-filesize"),
      outSha1: document.getElementById("out-sha1")
    };
  }

  initAllViewports() {
    const gridColors = [0x00e5a3, 0xffac1c, 0x38bdf8, 0xa855f7];

    for (let i = 0; i < 4; i++) {
      const scene = new THREE.Scene();
      scene.background = new THREE.Color(0x0a0d0f);

      const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
      camera.position.set(3, 2.5, 3.5);

      const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      renderer.shadowMap.enabled = true;
      this.dom.canvasWrappers[i].appendChild(renderer.domElement);

      const controls = new OrbitControls(camera, renderer.domElement);
      controls.enableDamping = true;
      controls.dampingFactor = 0.05;
      controls.maxPolarAngle = Math.PI;
      controls.minPolarAngle = 0;

      const ambientLight = new THREE.AmbientLight(0xffffff, 0.85);
      scene.add(ambientLight);

      const dirLight = new THREE.DirectionalLight(0xfffaf0, 1.6);
      dirLight.position.set(5, 10, 7);
      dirLight.castShadow = true;
      dirLight.shadow.mapSize.width = 2048;
      dirLight.shadow.mapSize.height = 2048;
      scene.add(dirLight);

      const fillLight = new THREE.DirectionalLight(0x7da4c7, 0.4);
      fillLight.position.set(-5, 2, -5);
      scene.add(fillLight);

      const bottomLight = new THREE.DirectionalLight(0xffeedd, 0.6);
      bottomLight.position.set(0, -8, 0);
      scene.add(bottomLight);

      const grid = new THREE.GridHelper(20, 20, gridColors[i], 0x202730);
      grid.position.set(0.5, -0.501, 0.5);
      grid.visible = this.showGrid;
      scene.add(grid);

      const group = new THREE.Group();
      scene.add(group);

      controls.addEventListener("change", () => {
        if (this.isSyncMotion && !this.isSyncingEvent) {
          this.syncAllCamerasFrom(i);
        }
      });

      this.viewports.push({ scene, camera, renderer, controls, group, grid });
    }
  }

  syncAllCamerasFrom(sourceIndex) {
    this.isSyncingEvent = true;
    const src = this.viewports[sourceIndex];

    this.selectedSetIndices.forEach((setIdx, vpIndex) => {
      if (vpIndex !== sourceIndex && vpIndex < this.viewports.length) {
        const target = this.viewports[vpIndex];
        target.camera.position.copy(src.camera.position);
        target.camera.quaternion.copy(src.camera.quaternion);
        target.camera.zoom = src.camera.zoom;
        target.camera.updateProjectionMatrix();
        target.controls.target.copy(src.controls.target);
      }
    });

    this.isSyncingEvent = false;
  }

  setupResizeObserver() {
    const ro = new ResizeObserver(() => {
      this.onResize();
    });
    ro.observe(this.dom.viewportsGrid);
    this.dom.canvasWrappers.forEach((w) => ro.observe(w));
    this.onResize();
  }

  updateMultiSelectUI() {
    this.dom.multiSelectOptions.innerHTML = "";

    this.allSets.forEach((set, index) => {
      const isSelected = this.selectedSetIndices.includes(index);

      const item = document.createElement("label");
      item.className = "menu-item";
      item.innerHTML = `
        <input type="checkbox" value="${index}" ${isSelected ? "checked" : ""}>
        <span class="item-text">${set.name}</span>
      `;

      const checkbox = item.querySelector("input");
      checkbox.addEventListener("change", () => {
        if (checkbox.checked) {
          if (this.selectedSetIndices.length >= 4) {
            alert("Maximum 4 sets can be compared simultaneously.");
            checkbox.checked = false;
            return;
          }
          this.selectedSetIndices.push(index);
        } else {
          if (this.selectedSetIndices.length <= 1) {
            alert("At least 1 set must remain selected.");
            checkbox.checked = true;
            return;
          }
          this.selectedSetIndices = this.selectedSetIndices.filter((i) => i !== index);
        }
        this.saveSettings();
        this.updateViewportLayout();
      });

      this.dom.multiSelectOptions.appendChild(item);
    });

    this.updateLabel();
  }

  updateLabel() {
    const count = this.selectedSetIndices.length;
    if (count === 1) {
      const set = this.allSets[this.selectedSetIndices[0]];
      this.dom.multiSelectLabel.textContent = set ? set.name : "1 Set Selected";
    } else {
      this.dom.multiSelectLabel.textContent = `${count} Sets Selected`;
    }
  }

  updateViewportLayout() {
    const count = this.selectedSetIndices.length;
    this.updateLabel();

    this.dom.viewportsGrid.className = `viewports-grid layout-${count}`;

    for (let i = 0; i < 4; i++) {
      if (i < count) {
        this.dom.viewportBoxes[i].style.display = "flex";
      } else {
        this.dom.viewportBoxes[i].style.display = "none";
      }
    }

    this.onResize();
    this.renderActiveState();
    if (this.isSyncMotion && this.viewports.length > 0) {
      this.syncAllCamerasFrom(0);
    }
  }

  bindEvents() {
    this.dom.multiSelectTrigger.addEventListener("click", (e) => {
      e.stopPropagation();
      this.dom.multiSelectContainer.classList.toggle("open");
    });

    document.addEventListener("click", (e) => {
      if (!this.dom.multiSelectContainer.contains(e.target)) {
        this.dom.multiSelectContainer.classList.remove("open");
      }
    });

    // Reload Textures Button
    this.dom.btnReloadTextures.addEventListener("click", () => {
      this.cacheBustTimestamp = Date.now();
      this.textureCache.clear();
      this.render3DObjects();

      const origText = this.dom.btnReloadTextures.innerHTML;
      this.dom.btnReloadTextures.innerHTML = `<span>✓</span> Reloaded!`;
      setTimeout(() => {
        this.dom.btnReloadTextures.innerHTML = origText;
      }, 1200);
    });

    // Resolution Change
    this.dom.resSelect.addEventListener("change", (e) => {
      this.currentResolution = e.target.value;
      this.saveSettings();
      this.textureCache.clear();
      this.render3DObjects();
    });

    // Mode Toggle
    this.dom.modeSingleBtn.addEventListener("click", () => {
      if (this.currentMode !== "single") {
        this.currentMode = "single";
        this.dom.modeSingleBtn.classList.add("active");
        this.dom.modeMultiBtn.classList.remove("active");
        this.saveSettings();
        this.renderActiveState();
      }
    });

    this.dom.modeMultiBtn.addEventListener("click", () => {
      if (this.currentMode !== "multi") {
        this.currentMode = "multi";
        this.dom.modeMultiBtn.classList.add("active");
        this.dom.modeSingleBtn.classList.remove("active");
        this.saveSettings();
        this.renderActiveState();
      }
    });

    // Sync Motion Button
    this.dom.btnSyncMotion.addEventListener("click", () => {
      this.isSyncMotion = !this.isSyncMotion;
      this.saveSettings();
      this.dom.btnSyncMotion.classList.toggle("active", this.isSyncMotion);
      this.dom.btnSyncMotion.querySelector("strong").textContent = this.isSyncMotion ? "ON" : "OFF";
      this.dom.helpSyncState.textContent = this.isSyncMotion ? "🔗 Motion Synced" : "🔓 Motion Independent";
      this.dom.helpSyncState.style.color = this.isSyncMotion ? "#00E5A3" : "#8E9BA8";
      if (this.isSyncMotion) {
        this.syncAllCamerasFrom(0);
      }
    });

    // Toolbar Buttons
    this.dom.btnAutoRotate.addEventListener("click", () => {
      this.isAutoRotating = !this.isAutoRotating;
      this.dom.btnAutoRotate.classList.toggle("active", this.isAutoRotating);
      this.viewports.forEach((vp) => {
        vp.controls.autoRotate = this.isAutoRotating;
        vp.controls.autoRotateSpeed = 2.0;
      });
    });

    this.dom.btnWireframe.addEventListener("click", () => {
      this.isWireframe = !this.isWireframe;
      this.saveSettings();
      this.dom.btnWireframe.classList.toggle("active", this.isWireframe);
      this.updateWireframe();
    });

    if (this.dom.btnToggleOverlay) {
      this.dom.btnToggleOverlay.addEventListener("click", () => {
        this.showOverlays = !this.showOverlays;
        this.saveSettings();
        this.dom.btnToggleOverlay.classList.toggle("active", this.showOverlays);
        this.dom.btnToggleOverlay.textContent = this.showOverlays ? "Overlays: ON" : "Overlays: OFF";
        this.render3DObjects();
      });
    }

    this.dom.btnGrid.addEventListener("click", () => {
      this.showGrid = !this.showGrid;
      this.saveSettings();
      this.dom.btnGrid.classList.toggle("active", this.showGrid);
      this.viewports.forEach((vp) => (vp.grid.visible = this.showGrid));
    });
  }

  bindExportEvents() {
    this.dom.btnOpenExport.addEventListener("click", () => {
      this.dom.exportModal.style.display = "flex";
      this.dom.exportStatusBox.style.display = "none";
      this.dom.btnDoCompile.disabled = false;
    });

    const closeModal = () => {
      this.dom.exportModal.style.display = "none";
    };
    this.dom.btnCloseModal.addEventListener("click", closeModal);
    this.dom.btnCancelExport.addEventListener("click", closeModal);

    const chips = document.querySelectorAll(".res-chip");
    chips.forEach((chip) => {
      chip.addEventListener("click", () => {
        chips.forEach((c) => c.classList.remove("active"));
        chip.classList.add("active");
        chip.querySelector("input").checked = true;
      });
    });

    this.dom.btnDoCompile.addEventListener("click", async () => {
      const selectedRadio = document.querySelector('input[name="export-res"]:checked');
      const targetRes = selectedRadio ? selectedRadio.value : "512";

      this.dom.exportStatusBox.style.display = "flex";
      this.dom.statusMeta.style.display = "none";
      this.dom.statusText.textContent = `Compiling ${targetRes}×${targetRes} Resource Pack...`;
      this.dom.btnDoCompile.disabled = true;

      try {
        const res = await fetch(`/api/export?res=${targetRes}`);
        if (!res.ok) throw new Error("Compilation server error");
        const data = await res.json();

        this.dom.statusText.textContent = "✓ Pack Built Successfully! Downloading...";
        this.dom.statusMeta.style.display = "flex";
        this.dom.outFilename.textContent = data.fileName;
        this.dom.outFilesize.textContent = `${data.sizeKb} KB`;
        this.dom.outSha1.textContent = data.sha1.substring(0, 16) + "...";

        const downloadLink = document.createElement("a");
        downloadLink.href = data.downloadUrl;
        downloadLink.download = data.fileName;
        document.body.appendChild(downloadLink);
        downloadLink.click();
        document.body.removeChild(downloadLink);

        setTimeout(() => {
          this.dom.btnDoCompile.disabled = false;
        }, 1500);
      } catch (e) {
        this.dom.statusText.textContent = `Error: ${e.message}`;
        this.dom.btnDoCompile.disabled = false;
      }
    });
  }

  onResize() {
    this.selectedSetIndices.forEach((setIdx, vpIndex) => {
      if (vpIndex < this.viewports.length) {
        const vp = this.viewports[vpIndex];
        const wrapper = this.dom.canvasWrappers[vpIndex];
        if (wrapper) {
          const rect = wrapper.getBoundingClientRect();
          if (rect.width > 0 && rect.height > 0) {
            vp.camera.aspect = rect.width / rect.height;
            vp.camera.updateProjectionMatrix();
            vp.renderer.setSize(rect.width, rect.height, false);
          }
        }
      }
    });
  }

  getPrimarySet() {
    return this.allSets[this.selectedSetIndices[0]] || this.allSets[0];
  }

  renderActiveState() {
    const primarySet = this.getPrimarySet();

    if (this.currentMode === "single") {
      this.dom.sidebarTitle.textContent = "Blocks in Set";
      this.dom.itemCountBadge.textContent = primarySet.blocks.length;
      this.renderBlockList(primarySet.blocks);
    } else {
      this.dom.sidebarTitle.textContent = "Multiblock Presets";
      this.dom.itemCountBadge.textContent = primarySet.multiblocks ? primarySet.multiblocks.length : 0;
      this.renderMultiList(primarySet.multiblocks || []);
    }

    this.render3DObjects();
  }

  renderBlockList(blocks) {
    this.dom.itemList.innerHTML = "";
    if (this.selectedBlockIndex >= blocks.length) this.selectedBlockIndex = 0;

    blocks.forEach((block, index) => {
      const card = document.createElement("div");
      card.className = `list-card ${index === this.selectedBlockIndex ? "active" : ""}`;

      const thumbUrl = block.textures.all || block.textures.side || block.textures.top;
      card.innerHTML = `
        <div class="thumb">
          <img src="${thumbUrl}?t=${this.cacheBustTimestamp}" alt="${block.name}">
        </div>
        <div class="card-info">
          <span class="card-title">${block.name}</span>
          <span class="card-sub">${block.type}</span>
        </div>
      `;

      card.addEventListener("click", () => {
        this.selectedBlockIndex = index;
        this.saveSettings();
        document.querySelectorAll(".list-card").forEach((c) => c.classList.remove("active"));
        card.classList.add("active");
        this.render3DObjects();
      });

      this.dom.itemList.appendChild(card);
    });
  }

  renderMultiList(multiblocks) {
    this.dom.itemList.innerHTML = "";
    if (this.selectedMultiIndex >= multiblocks.length) this.selectedMultiIndex = 0;

    multiblocks.forEach((multi, index) => {
      const card = document.createElement("div");
      card.className = `list-card ${index === this.selectedMultiIndex ? "active" : ""}`;

      card.innerHTML = `
        <div class="thumb">
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="#00E5A3" stroke-width="2">
            <rect x="2" y="2" width="8" height="8" rx="1"/>
            <rect x="14" y="2" width="8" height="8" rx="1"/>
            <rect x="2" y="14" width="8" height="8" rx="1"/>
            <rect x="14" y="14" width="8" height="8" rx="1"/>
          </svg>
        </div>
        <div class="card-info">
          <span class="card-title">${multi.name}</span>
          <span class="card-sub">${multi.blocks.length} units (${multi.gridSize.join("×")})</span>
        </div>
      `;

      card.addEventListener("click", () => {
        this.selectedMultiIndex = index;
        this.saveSettings();
        document.querySelectorAll(".list-card").forEach((c) => c.classList.remove("active"));
        card.classList.add("active");
        this.render3DObjects();
      });

      this.dom.itemList.appendChild(card);
    });
  }

  async loadTexture(url) {
    const fullUrl = `${url}?t=${this.cacheBustTimestamp}`;
    const cacheKey = `${fullUrl}_${this.currentResolution}`;
    if (this.textureCache.has(cacheKey)) {
      return this.textureCache.get(cacheKey);
    }

    return new Promise((resolve) => {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.src = fullUrl;

      img.onload = () => {
        let targetSize = this.currentResolution === "vector" ? (img.naturalWidth || 512) : parseInt(this.currentResolution, 10);
        if (!targetSize || isNaN(targetSize)) targetSize = 512;

        const canvas = document.createElement("canvas");
        canvas.width = targetSize;
        canvas.height = targetSize;
        const ctx = canvas.getContext("2d");

        if (targetSize <= 64) {
          ctx.imageSmoothingEnabled = false;
        } else {
          ctx.imageSmoothingEnabled = true;
          ctx.imageSmoothingQuality = "high";
        }

        ctx.drawImage(img, 0, 0, targetSize, targetSize);

        const texture = new THREE.CanvasTexture(canvas);
        texture.magFilter = targetSize <= 64 ? THREE.NearestFilter : THREE.LinearFilter;
        texture.minFilter = THREE.LinearMipmapLinearFilter;
        texture.generateMipmaps = true;
        texture.colorSpace = THREE.SRGBColorSpace;
        texture.wrapS = THREE.RepeatWrapping;
        texture.wrapT = THREE.RepeatWrapping;
        texture.needsUpdate = true;

        this.textureCache.set(cacheKey, texture);
        resolve(texture);
      };

      img.onerror = () => {
        resolve(null);
      };
    });
  }

  async loadCompositedGrassSideTexture(baseSideUrl, overlayUrl) {
    const cacheKey = `comp_${baseSideUrl}_${overlayUrl}_${this.currentResolution}_${this.cacheBustTimestamp}`;
    if (this.textureCache.has(cacheKey)) {
      return this.textureCache.get(cacheKey);
    }

    const baseTex = await this.loadTexture(baseSideUrl);
    if (!overlayUrl) return baseTex;

    return new Promise((resolve) => {
      const overlayImg = new Image();
      overlayImg.crossOrigin = "anonymous";
      overlayImg.src = `${overlayUrl}?t=${this.cacheBustTimestamp}`;

      overlayImg.onload = () => {
        const targetSize = this.currentResolution === "vector" ? (overlayImg.naturalWidth || 512) : parseInt(this.currentResolution, 10) || 512;
        const canvas = document.createElement("canvas");
        canvas.width = targetSize;
        canvas.height = targetSize;
        const ctx = canvas.getContext("2d");

        // 1. Draw base side (dirt)
        if (baseTex && baseTex.image) {
          ctx.drawImage(baseTex.image, 0, 0, targetSize, targetSize);
        }

        // 2. Create tinted overlay canvas with Plains biome color via exact luminance multiplication
        const tintCanvas = document.createElement("canvas");
        tintCanvas.width = targetSize;
        tintCanvas.height = targetSize;
        const tintCtx = tintCanvas.getContext("2d");
        tintCtx.drawImage(overlayImg, 0, 0, targetSize, targetSize);
        const imgData = tintCtx.getImageData(0, 0, targetSize, targetSize);
        const d = imgData.data;
        const tr = 0x79 / 255;
        const tg = 0xc0 / 255;
        const tb = 0x5a / 255;
        for (let i = 0; i < d.length; i += 4) {
          if (d[i + 3] > 0) {
            d[i] = Math.round(d[i] * tr);
            d[i + 1] = Math.round(d[i + 1] * tg);
            d[i + 2] = Math.round(d[i + 2] * tb);
          }
        }
        tintCtx.putImageData(imgData, 0, 0);

        // 3. Composite tinted grass overlay on top of dirt
        ctx.drawImage(tintCanvas, 0, 0, targetSize, targetSize);

        const texture = new THREE.CanvasTexture(canvas);
        texture.magFilter = targetSize <= 64 ? THREE.NearestFilter : THREE.LinearFilter;
        texture.minFilter = THREE.LinearMipmapLinearFilter;
        texture.generateMipmaps = true;
        texture.colorSpace = THREE.SRGBColorSpace;
        texture.wrapS = THREE.RepeatWrapping;
        texture.wrapT = THREE.RepeatWrapping;
        texture.needsUpdate = true;

        this.textureCache.set(cacheKey, texture);
        resolve(texture);
      };

      overlayImg.onerror = () => {
        resolve(baseTex);
      };
    });
  }

  async getMaterialsForBlock(blockDef, isExternal = false) {
    const fallbackTex = blockDef.textures.all || blockDef.textures.side || blockDef.textures.top || blockDef.textures.bottom;
    const isGrassOrPath = blockDef.id === "grass_block" || blockDef.id === "dirt_path";
    const sideTex = (!this.showOverlays && isGrassOrPath)
      ? (blockDef.textures.bottom || "textures/dirt.svg")
      : (blockDef.textures.side || fallbackTex);

    const isGrassBlockWithOverlay = blockDef.id === "grass_block" && isExternal && blockDef.textures.side_overlay && this.showOverlays;

    const sidePromise = isGrassBlockWithOverlay
      ? this.loadCompositedGrassSideTexture(sideTex, blockDef.textures.side_overlay)
      : this.loadTexture(sideTex);

    let loaded = await Promise.all([
      sidePromise,
      sidePromise,
      this.loadTexture(blockDef.textures.top || fallbackTex),
      this.loadTexture(blockDef.textures.bottom || fallbackTex),
      sidePromise,
      sidePromise
    ]);

    // If a side face failed to load, fall back to py (top) or ny (bottom)
    const validTex = loaded.find((t) => t !== null);
    if (!validTex) {
      return null;
    }

    loaded = loaded.map((tex) => tex || validTex);

    const isGrassBlock = blockDef.id === "grass_block";

    return loaded.map((tex, faceIdx) => {
      // In Minecraft Java, face index 2 is Top (+Y).
      // If rendering grass block on Vanilla/Faithful (which is greyscale), apply Plains biome tint!
      const shouldTintTop = isGrassBlock && isExternal && faceIdx === 2;

      return new THREE.MeshStandardMaterial({
        map: tex,
        color: shouldTintTop ? PLAINS_GRASS_TINT : 0xffffff,
        roughness: 0.8,
        metalness: 0.1,
        wireframe: this.isWireframe
      });
    });
  }

  clearGroup(group) {
    while (group.children.length > 0) {
      const obj = group.children[0];
      group.remove(obj);
      if (obj.geometry) obj.geometry.dispose();
      if (Array.isArray(obj.material)) {
        obj.material.forEach((m) => m.dispose());
      } else if (obj.material) {
        obj.material.dispose();
      }
    }
  }

  renderMissingPlaceholder(group, pos = [0, 0, 0]) {
    const geo = new THREE.BoxGeometry(1, 1, 1);
    const wireGeo = new THREE.WireframeGeometry(geo);
    const line = new THREE.LineSegments(wireGeo);
    line.material.color.setHex(0x4a5568);
    line.material.transparent = true;
    line.material.opacity = 0.4;
    line.position.set(pos[0], pos[1], pos[2]);
    group.add(line);
  }

  async render3DObjects() {
    this.viewports.forEach((vp) => this.clearGroup(vp.group));

    const primarySet = this.getPrimarySet();
    const primaryBlock = primarySet.blocks[this.selectedBlockIndex] || primarySet.blocks[0];
    const primaryMulti = primarySet.multiblocks ? primarySet.multiblocks[this.selectedMultiIndex] : null;

    if (this.currentMode === "single") {
      if (!primaryBlock) return;

      this.dom.metaId.textContent = primaryBlock.id;
      this.dom.metaName.textContent = primaryBlock.name;
      this.dom.metaType.textContent = primaryBlock.type;
      this.dom.metaTiling.textContent = primaryBlock.tiling || "OK";

      for (let vpIndex = 0; vpIndex < this.selectedSetIndices.length; vpIndex++) {
        const setIdx = this.selectedSetIndices[vpIndex];
        const currentSet = this.allSets[setIdx];
        if (!currentSet) continue;

        const targetBlock = currentSet.blocks.find((b) => b.id === primaryBlock.id);

        this.dom.tags[vpIndex].textContent = currentSet.name;

        if (targetBlock) {
          this.dom.hudTargets[vpIndex].textContent = targetBlock.name;
          await this.renderSingleBlockToGroup(targetBlock, this.viewports[vpIndex].group, currentSet.isExternal);
        } else {
          this.dom.hudTargets[vpIndex].textContent = `(Not in ${currentSet.name.split(":")[0]})`;
          this.renderMissingPlaceholder(this.viewports[vpIndex].group);
        }

        this.viewports[vpIndex].controls.target.set(0, 0, 0);
      }
    } else {
      if (!primaryMulti) return;

      this.dom.metaId.textContent = primaryMulti.id;
      this.dom.metaName.textContent = primaryMulti.name;
      this.dom.metaType.textContent = `Multiblock (${primaryMulti.blocks.length} units)`;
      this.dom.metaTiling.textContent = "Toroidal Verified";

      for (let vpIndex = 0; vpIndex < this.selectedSetIndices.length; vpIndex++) {
        const setIdx = this.selectedSetIndices[vpIndex];
        const currentSet = this.allSets[setIdx];
        if (!currentSet) continue;

        this.dom.tags[vpIndex].textContent = currentSet.name;
        this.dom.hudTargets[vpIndex].textContent = primaryMulti.name;

        await this.renderMultiblockToGroup(primaryMulti, currentSet, this.viewports[vpIndex].group);

        const box = new THREE.Box3().setFromObject(this.viewports[vpIndex].group);
        const center = new THREE.Vector3();
        box.getCenter(center);
        this.viewports[vpIndex].controls.target.copy(center);
      }
    }

    this.onResize();
  }

  async renderSingleBlockToGroup(blockDef, group, isExternal = false) {
    if (blockDef.isItem) {
      const tex = await this.loadTexture(blockDef.textures.all);
      if (!tex) {
        this.renderMissingPlaceholder(group);
        return;
      }
      const geo = new THREE.PlaneGeometry(1.2, 1.2);
      const mat = new THREE.MeshStandardMaterial({
        map: tex,
        transparent: true,
        side: THREE.DoubleSide,
        alphaTest: 0.1,
        roughness: 0.4
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(0, 0, 0);
      group.add(mesh);
    } else {
      const materials = await this.getMaterialsForBlock(blockDef, isExternal);
      if (!materials) {
        this.renderMissingPlaceholder(group);
        return;
      }
      const isPath = blockDef.id === "dirt_path";
      const height = isPath ? 0.9375 : 1.0;
      const geo = new THREE.BoxGeometry(1, height, 1);
      if (isPath) {
        const uvAttr = geo.attributes.uv;
        for (let i = 0; i < uvAttr.count; i++) {
          const faceIdx = Math.floor(i / 4);
          if (faceIdx !== 2 && faceIdx !== 3) {
            if (uvAttr.getY(i) === 1) uvAttr.setY(i, 0.9375);
          }
        }
        uvAttr.needsUpdate = true;
      }
      const cube = new THREE.Mesh(geo, materials);
      cube.position.set(0, isPath ? -0.03125 : 0, 0);
      cube.castShadow = true;
      cube.receiveShadow = true;
      group.add(cube);
    }
  }

  async renderMultiblockToGroup(multiDef, currentSet, group) {
    const primarySet = this.getPrimarySet();
    const primaryBlock = primarySet.blocks[this.selectedBlockIndex] || primarySet.blocks[0];

    const blockDefsMap = new Map();
    currentSet.blocks.forEach((b) => blockDefsMap.set(b.id, b));
    const boxGeo = new THREE.BoxGeometry(1, 1, 1);
    const pathGeo = new THREE.BoxGeometry(1, 0.9375, 1);
    // Minecraft UV mapping for dirt_path: side faces crop top 1/16th (UV v from 0 to 15/16)
    const uvAttr = pathGeo.attributes.uv;
    // In Three.js BoxGeometry: faces 0, 1 (px, nx), 4, 5 (pz, nz) are the side faces
    // Each quad has 4 vertices (8 UV coordinates). Top vertices have v = 1, adjust to v = 15/16 (0.9375)
    for (let i = 0; i < uvAttr.count; i++) {
      const faceIdx = Math.floor(i / 4);
      if (faceIdx !== 2 && faceIdx !== 3) { // not top (2) and not bottom (3)
        if (uvAttr.getY(i) === 1) {
          uvAttr.setY(i, 0.9375);
        }
      }
    }
    uvAttr.needsUpdate = true;

    for (const item of multiDef.blocks) {
      const targetId = (item.blockId === "$SELECTED" && primaryBlock) ? primaryBlock.id : item.blockId;
      const bDef = blockDefsMap.get(targetId);
      if (!bDef) {
        this.renderMissingPlaceholder(group, item.pos);
        continue;
      }

      if (item.isItem || bDef.isItem) {
        const tex = await this.loadTexture(bDef.textures.all);
        if (!tex) {
          this.renderMissingPlaceholder(group, item.pos);
          continue;
        }
        const geo = new THREE.PlaneGeometry(0.8, 0.8);
        const mat = new THREE.MeshStandardMaterial({
          map: tex,
          transparent: true,
          side: THREE.DoubleSide,
          alphaTest: 0.1
        });
        const mesh = new THREE.Mesh(geo, mat);
        mesh.position.set(item.pos[0], item.pos[1], item.pos[2]);
        group.add(mesh);
      } else {
        const materials = await this.getMaterialsForBlock(bDef, currentSet.isExternal);
        if (!materials) {
          this.renderMissingPlaceholder(group, item.pos);
          continue;
        }
        const isPath = bDef.id === "dirt_path";
        const cube = new THREE.Mesh(isPath ? pathGeo : boxGeo, materials);
        cube.position.set(item.pos[0], isPath ? item.pos[1] - 0.03125 : item.pos[1], item.pos[2]);
        cube.castShadow = true;
        cube.receiveShadow = true;
        group.add(cube);
      }
    }
  }

  updateWireframe() {
    this.viewports.forEach((vp) => {
      vp.group.traverse((child) => {
        if (child.isMesh && child.material) {
          if (Array.isArray(child.material)) {
            child.material.forEach((m) => (m.wireframe = this.isWireframe));
          } else {
            child.material.wireframe = this.isWireframe;
          }
        }
      });
    });
  }

  animate() {
    requestAnimationFrame(() => this.animate());

    this.selectedSetIndices.forEach((setIdx, vpIndex) => {
      if (vpIndex < this.viewports.length) {
        const vp = this.viewports[vpIndex];
        vp.controls.update();
        vp.renderer.render(vp.scene, vp.camera);
      }
    });
  }
}

window.addEventListener("DOMContentLoaded", () => {
  new TextureStudioApp();
});
