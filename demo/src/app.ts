import {
  type AnalysisResult,
  type BasicBlock,
  type ControlFlowGraph,
  analyzeSource,
  serializeAnalysisResult,
} from "../../src";
import { DEMO_EXAMPLES } from "./examples";

interface BlockPosition {
  x: number;
  y: number;
  width: number;
  height: number;
}

const SVG_NS = "http://www.w3.org/2000/svg";

export function initDemoApp(): void {
  // DOM Elements
  const exampleSelect = document.getElementById("example-select") as HTMLSelectElement;
  const sourceInput = document.getElementById("source-input") as HTMLTextAreaElement;
  const analyzeBtn = document.getElementById("analyze-btn") as HTMLButtonElement;
  const resetBtn = document.getElementById("reset-btn") as HTMLButtonElement;
  const copyJsonBtn = document.getElementById("copy-json-btn") as HTMLButtonElement;
  const fileLabel = document.getElementById("file-label") as HTMLElement;

  const errorBanner = document.getElementById("error-banner") as HTMLElement;
  const errorMessage = document.getElementById("error-message") as HTMLElement;
  const unsupportedBanner = document.getElementById("unsupported-banner") as HTMLElement;

  const statState = document.getElementById("stat-state") as HTMLElement;
  const statBlocks = document.getElementById("stat-blocks") as HTMLElement;
  const statEdges = document.getElementById("stat-edges") as HTMLElement;
  const statUnreachable = document.getElementById("stat-unreachable") as HTMLElement;

  const scopeControls = document.getElementById("scope-controls") as HTMLElement;
  const scopeSelect = document.getElementById("scope-select") as HTMLSelectElement;

  const visualGraphContainer = document.getElementById("visual-graph-container") as HTMLElement;
  const blockInspector = document.getElementById("block-inspector") as HTMLElement;
  const inspectorContent = document.getElementById("inspector-content") as HTMLElement;
  const jsonOutput = document.getElementById("json-output") as HTMLElement;

  let currentResult: AnalysisResult | null = null;
  let currentScopeIndex = 0;
  let selectedBlockId: string | null = null;

  // Populate examples dropdown
  for (const ex of DEMO_EXAMPLES) {
    const opt = document.createElement("option");
    opt.value = ex.id;
    opt.textContent = ex.name;
    exampleSelect.appendChild(opt);
  }

  // Set default example (sample.ts)
  const defaultEx = DEMO_EXAMPLES[0] ?? {
    id: "basic",
    name: "1. Basic (sample.ts)",
    description: "",
    code: "",
  };
  sourceInput.value = defaultEx.code;
  fileLabel.textContent = defaultEx.id === "basic" ? "sample.ts" : `examples/${defaultEx.id}.ts`;

  // Example Selection Event
  exampleSelect.addEventListener("change", () => {
    const selected = DEMO_EXAMPLES.find((e) => e.id === exampleSelect.value);
    if (selected) {
      sourceInput.value = selected.code;
      fileLabel.textContent = selected.id === "basic" ? "sample.ts" : `examples/${selected.id}.ts`;
      selectedBlockId = null;
      if (blockInspector) blockInspector.style.display = "none";
      runAnalysis();
    }
  });

  // Reset Button Event
  resetBtn.addEventListener("click", () => {
    const selected = DEMO_EXAMPLES.find((e) => e.id === exampleSelect.value) ?? defaultEx;
    sourceInput.value = selected.code;
    fileLabel.textContent = selected.id === "basic" ? "sample.ts" : `examples/${selected.id}.ts`;
    selectedBlockId = null;
    if (blockInspector) blockInspector.style.display = "none";
    runAnalysis();
  });

  // Analyze Button Event
  analyzeBtn.addEventListener("click", () => {
    runAnalysis();
  });

  // Keyboard shortcut: Ctrl+Enter / Cmd+Enter in source editor
  sourceInput.addEventListener("keydown", (e: KeyboardEvent) => {
    if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
      e.preventDefault();
      runAnalysis();
    }
  });

  // Copy JSON Button Event
  copyJsonBtn.addEventListener("click", async () => {
    if (!currentResult) return;
    const jsonText = serializeAnalysisResult(currentResult);
    try {
      await navigator.clipboard.writeText(jsonText);
      const origText = copyJsonBtn.textContent;
      copyJsonBtn.textContent = "✓ Copied!";
      setTimeout(() => {
        copyJsonBtn.textContent = origText;
      }, 1500);
    } catch {
      copyJsonBtn.textContent = "Error copying";
      setTimeout(() => {
        copyJsonBtn.textContent = "Copy JSON";
      }, 1500);
    }
  });

  // Scope Selector Event
  scopeSelect.addEventListener("change", () => {
    currentScopeIndex = Number.parseInt(scopeSelect.value, 10) || 0;
    selectedBlockId = null;
    if (blockInspector) blockInspector.style.display = "none";
    updateScopeViews();
  });

  function runAnalysis(): void {
    const code = sourceInput.value;
    const currentFile = fileLabel.textContent ?? "sample.ts";

    // Clear previous error state
    errorBanner.style.display = "none";
    errorMessage.textContent = "";

    try {
      const result: AnalysisResult = analyzeSource(code, { filePath: currentFile });
      currentResult = result;

      // Update Global Stats
      statState.textContent = result.state;
      statState.style.color =
        result.state === "RESOLVED" ? "var(--accent-emerald)" : "var(--accent-amber)";
      statBlocks.textContent = String(result.summary.totalBlocks);
      statEdges.textContent = String(result.summary.totalEdges);
      statUnreachable.textContent = String(result.summary.totalUnreachableBlocks);
      statUnreachable.style.color =
        result.summary.totalUnreachableBlocks > 0 ? "var(--accent-rose)" : "var(--text-main)";

      // Unsupported Banner Visibility
      unsupportedBanner.style.display = result.state === "UNSUPPORTED" ? "block" : "none";

      // Populate Scope Selector and handle visibility
      populateScopeSelector(result);

      // Render Selected Scope
      updateScopeViews();

      // Render Raw JSON
      jsonOutput.textContent = serializeAnalysisResult(result);
    } catch (err) {
      currentResult = null;
      statState.textContent = "SYNTAX ERROR";
      statState.style.color = "var(--accent-rose)";
      statBlocks.textContent = "0";
      statEdges.textContent = "0";
      statUnreachable.textContent = "0";
      unsupportedBanner.style.display = "none";
      if (scopeControls) scopeControls.style.display = "none";
      if (blockInspector) blockInspector.style.display = "none";

      const errText = err instanceof Error ? err.message : String(err);
      errorMessage.textContent = errText;
      errorBanner.style.display = "block";

      visualGraphContainer.replaceChildren();
      const errEl = document.createElement("div");
      errEl.style.color = "var(--accent-rose)";
      errEl.style.fontFamily = "var(--font-mono)";
      errEl.style.padding = "1rem";
      errEl.textContent = `Parse Error: ${errText}`;
      visualGraphContainer.appendChild(errEl);

      jsonOutput.textContent = `// Parse Error: ${errText}`;
    }
  }

  function populateScopeSelector(result: AnalysisResult): void {
    scopeSelect.replaceChildren();

    // Default to first function scope with logic, otherwise module
    let defaultIndex = 0;
    for (let i = 0; i < result.controlFlowGraphs.length; i++) {
      const g = result.controlFlowGraphs[i];
      if (g && g.scopeName !== "module" && g.blocks.length > 2) {
        defaultIndex = i;
        break;
      }
    }
    currentScopeIndex = defaultIndex;

    // Show scope controls only if there are multiple non-trivial scopes
    const interestingScopes = result.controlFlowGraphs.filter(
      (g) => g.scopeName !== "module" || result.controlFlowGraphs.length === 1
    );

    if (scopeControls) {
      scopeControls.style.display = interestingScopes.length > 1 ? "flex" : "none";
    }

    for (let i = 0; i < result.controlFlowGraphs.length; i++) {
      const cfg = result.controlFlowGraphs[i];
      if (!cfg) continue;
      const opt = document.createElement("option");
      opt.value = String(i);
      opt.textContent = `${cfg.scopeName} [${cfg.state}]`;
      if (i === currentScopeIndex) {
        opt.selected = true;
      }
      scopeSelect.appendChild(opt);
    }
  }

  function updateScopeViews(): void {
    if (!currentResult || currentResult.controlFlowGraphs.length === 0) return;

    const cfg =
      currentResult.controlFlowGraphs[currentScopeIndex] ?? currentResult.controlFlowGraphs[0];
    if (!cfg) return;

    // Render Visual Graph
    renderVisualGraph(cfg);

    // Update Block Inspector if a block is selected
    if (selectedBlockId) {
      if (blockInspector) blockInspector.style.display = "block";
      renderBlockInspector(cfg, selectedBlockId);
    } else {
      if (blockInspector) blockInspector.style.display = "none";
    }
  }

  function renderVisualGraph(cfg: ControlFlowGraph): void {
    visualGraphContainer.replaceChildren();

    const BW = 160;
    const BH = 54;
    const rowHeight = 90;
    const colSpacing = 180;

    const unreachableSet = new Set(cfg.unreachableBlockIds);
    const reachableBlocks = cfg.blocks.filter((b) => !unreachableSet.has(b.id));
    const unreachableBlocks = cfg.blocks.filter((b) => unreachableSet.has(b.id));

    // Layering for reachable blocks (DAG relaxation skipping loop-back)
    const depth = new Map<string, number>();
    depth.set(cfg.entryBlockId, 0);

    for (let iter = 0; iter < reachableBlocks.length; iter++) {
      for (const edge of cfg.edges) {
        if (edge.kind === "loop-back" && depth.has(edge.toBlockId)) {
          continue;
        }
        if (!unreachableSet.has(edge.fromBlockId) && !unreachableSet.has(edge.toBlockId)) {
          const fDepth = depth.get(edge.fromBlockId);
          if (fDepth !== undefined && edge.toBlockId !== cfg.exitBlockId) {
            const cur = depth.get(edge.toBlockId) ?? 0;
            depth.set(edge.toBlockId, Math.max(cur, fDepth + 1));
          }
        }
      }
    }

    let maxIntermediate = 0;
    for (const b of reachableBlocks) {
      if (b.id !== cfg.exitBlockId) {
        maxIntermediate = Math.max(maxIntermediate, depth.get(b.id) ?? 0);
      }
    }
    depth.set(cfg.exitBlockId, maxIntermediate + 1);

    for (const b of reachableBlocks) {
      if (!depth.has(b.id)) depth.set(b.id, 1);
    }

    const reachableLayers = new Map<number, BasicBlock[]>();
    for (const b of reachableBlocks) {
      const d = depth.get(b.id) ?? 0;
      const list = reachableLayers.get(d) ?? [];
      list.push(b);
      reachableLayers.set(d, list);
    }

    // Layering for unreachable blocks
    const unreachDepth = new Map<string, number>();
    for (const b of unreachableBlocks) unreachDepth.set(b.id, 0);

    for (let iter = 0; iter < unreachableBlocks.length; iter++) {
      for (const edge of cfg.edges) {
        if (unreachableSet.has(edge.fromBlockId) && unreachableSet.has(edge.toBlockId)) {
          const f = unreachDepth.get(edge.fromBlockId) ?? 0;
          const c = unreachDepth.get(edge.toBlockId) ?? 0;
          unreachDepth.set(edge.toBlockId, Math.max(c, f + 1));
        }
      }
    }

    const unreachLayers = new Map<number, BasicBlock[]>();
    for (const b of unreachableBlocks) {
      const ud = unreachDepth.get(b.id) ?? 0;
      const list = unreachLayers.get(ud) ?? [];
      list.push(b);
      unreachLayers.set(ud, list);
    }

    // Calculate layout coordinates
    const positions = new Map<string, BlockPosition>();
    const hasUnreachable = unreachableBlocks.length > 0;
    const maxReachableCols =
      reachableLayers.size > 0
        ? Math.max(...Array.from(reachableLayers.values()).map((l) => l.length))
        : 1;

    const svgWidth = hasUnreachable
      ? Math.max(760, maxReachableCols * colSpacing + 380)
      : Math.max(520, maxReachableCols * colSpacing + 80);

    const reachableCenterX = hasUnreachable ? 240 : svgWidth / 2;
    const unreachableCenterX = svgWidth - 170;

    for (const [d, blocks] of reachableLayers.entries()) {
      blocks.sort((a, b) => a.id.localeCompare(b.id));
      for (let j = 0; j < blocks.length; j++) {
        const blk = blocks[j];
        if (!blk) continue;
        const x =
          reachableCenterX - ((blocks.length - 1) * colSpacing) / 2 + j * colSpacing - BW / 2;
        const y = 35 + d * rowHeight;
        positions.set(blk.id, { x, y, width: BW, height: BH });
      }
    }

    for (const [ud, blocks] of unreachLayers.entries()) {
      blocks.sort((a, b) => a.id.localeCompare(b.id));
      for (let j = 0; j < blocks.length; j++) {
        const blk = blocks[j];
        if (!blk) continue;
        const x =
          unreachableCenterX - ((blocks.length - 1) * colSpacing) / 2 + j * colSpacing - BW / 2;
        const y = 35 + ud * rowHeight;
        positions.set(blk.id, { x, y, width: BW, height: BH });
      }
    }

    const allDepths = [...Array.from(depth.values()), ...Array.from(unreachDepth.values()), 0];
    const maxDepth = Math.max(...allDepths);
    const svgHeight = 35 + (maxDepth + 1) * rowHeight + 35;

    // Create SVG element safely via DOM API
    const svg = document.createElementNS(SVG_NS, "svg");
    svg.setAttribute("class", "cfg-svg");
    svg.setAttribute("viewBox", `0 0 ${svgWidth} ${svgHeight}`);
    svg.setAttribute("width", String(svgWidth));
    svg.setAttribute("height", String(svgHeight));

    // Defs & Markers
    const defs = document.createElementNS(SVG_NS, "defs");
    defs.appendChild(createSvgMarker("arr-true", "#34d399"));
    defs.appendChild(createSvgMarker("arr-false", "#fbbf24"));
    defs.appendChild(createSvgMarker("arr-loop", "#38bdf8"));
    defs.appendChild(createSvgMarker("arr-seq", "#94a3b8"));
    defs.appendChild(createSvgMarker("arr-return", "#818cf8"));
    svg.appendChild(defs);

    // Dead code boundary box
    if (hasUnreachable) {
      const deadRect = document.createElementNS(SVG_NS, "rect");
      deadRect.setAttribute("x", String(unreachableCenterX - 110));
      deadRect.setAttribute("y", "16");
      deadRect.setAttribute("width", "220");
      deadRect.setAttribute("height", String(svgHeight - 32));
      deadRect.setAttribute("rx", "8");
      deadRect.setAttribute("fill", "rgba(248,113,113,0.04)");
      deadRect.setAttribute("stroke", "rgba(248,113,113,0.25)");
      deadRect.setAttribute("stroke-dasharray", "6 4");
      svg.appendChild(deadRect);

      const deadText = document.createElementNS(SVG_NS, "text");
      deadText.setAttribute("x", String(unreachableCenterX - 95));
      deadText.setAttribute("y", "32");
      deadText.setAttribute("fill", "#f87171");
      deadText.setAttribute("font-size", "9.5");
      deadText.setAttribute("font-weight", "700");
      deadText.setAttribute("font-family", "monospace");
      deadText.textContent = "DEAD CODE / UNREACHABLE";
      svg.appendChild(deadText);
    }

    // Render Edges
    for (const edge of cfg.edges) {
      const fromPos = positions.get(edge.fromBlockId);
      const toPos = positions.get(edge.toBlockId);
      if (!fromPos || !toPos) continue;

      let strokeColor = "#94a3b8";
      let markerUrl = "url(#arr-seq)";
      let labelText = "next";

      switch (edge.kind) {
        case "true":
          strokeColor = "#34d399";
          markerUrl = "url(#arr-true)";
          labelText = "true";
          break;
        case "false":
          strokeColor = "#fbbf24";
          markerUrl = "url(#arr-false)";
          labelText = "false";
          break;
        case "loop-back":
          strokeColor = "#38bdf8";
          markerUrl = "url(#arr-loop)";
          labelText = "loop";
          break;
        case "return":
          strokeColor = "#818cf8";
          markerUrl = "url(#arr-return)";
          labelText = "return";
          break;
      }

      let pathD = "";
      let labelX = 0;
      let labelY = 0;

      const isBackEdge = toPos.y <= fromPos.y;
      const isLayerSkip =
        toPos.y - fromPos.y > rowHeight + 10 && Math.abs(fromPos.x - toPos.x) < 30;

      if (isBackEdge) {
        const fx = fromPos.x;
        const fy = fromPos.y + BH / 2;
        const tx = toPos.x;
        const ty = toPos.y + BH / 2;
        const cpX = Math.min(fx, tx) - 52;
        pathD = `M ${fx} ${fy} C ${cpX} ${fy}, ${cpX} ${ty}, ${tx} ${ty}`;
        labelX = cpX + 16;
        labelY = (fy + ty) / 2;
      } else if (isLayerSkip) {
        const fx = fromPos.x + BW;
        const fy = fromPos.y + BH / 2;
        const tx = toPos.x + BW;
        const ty = toPos.y + BH / 2;
        const cpX = Math.max(fx, tx) + 55;
        pathD = `M ${fx} ${fy} C ${cpX} ${fy}, ${cpX} ${ty}, ${tx} ${ty}`;
        labelX = cpX - 16;
        labelY = (fy + ty) / 2;
      } else {
        const fx = fromPos.x + BW / 2;
        const fy = fromPos.y + BH;
        const tx = toPos.x + BW / 2;
        const ty = toPos.y;

        if (Math.abs(fx - tx) < 5) {
          pathD = `M ${fx} ${fy} L ${tx} ${ty}`;
          labelX = fx + 16;
          labelY = (fy + ty) / 2;
        } else {
          const cy1 = fy + (ty - fy) * 0.45;
          const cy2 = ty - (ty - fy) * 0.45;
          pathD = `M ${fx} ${fy} C ${fx} ${cy1}, ${tx} ${cy2}, ${tx} ${ty}`;
          labelX = (fx + tx) / 2 + 10;
          labelY = (fy + ty) / 2;
        }
      }

      const pathEl = document.createElementNS(SVG_NS, "path");
      pathEl.setAttribute("class", "cfg-edge-path");
      pathEl.setAttribute("d", pathD);
      pathEl.setAttribute("fill", "none");
      pathEl.setAttribute("stroke", strokeColor);
      pathEl.setAttribute("stroke-width", "1.8");
      pathEl.setAttribute("marker-end", markerUrl);
      svg.appendChild(pathEl);

      const pill = document.createElementNS(SVG_NS, "rect");
      pill.setAttribute("class", "edge-pill");
      pill.setAttribute("x", String(labelX - 18));
      pill.setAttribute("y", String(labelY - 7));
      pill.setAttribute("width", "36");
      pill.setAttribute("height", "14");
      pill.setAttribute("rx", "3");
      pill.setAttribute("fill", "#0f172a");
      pill.setAttribute("stroke", strokeColor);
      pill.setAttribute("stroke-width", "0.8");
      pill.setAttribute("opacity", "0.95");
      svg.appendChild(pill);

      const labelEl = document.createElementNS(SVG_NS, "text");
      labelEl.setAttribute("class", "edge-label");
      labelEl.setAttribute("x", String(labelX));
      labelEl.setAttribute("y", String(labelY + 3.5));
      labelEl.setAttribute("text-anchor", "middle");
      labelEl.setAttribute("fill", strokeColor);
      labelEl.setAttribute("font-size", "8.5");
      labelEl.setAttribute("font-family", "monospace");
      labelEl.setAttribute("font-weight", "700");
      labelEl.textContent = labelText;
      svg.appendChild(labelEl);
    }

    // Render Basic Blocks
    for (const b of cfg.blocks) {
      const pos = positions.get(b.id);
      if (!pos) continue;

      const isEntry = b.id === cfg.entryBlockId;
      const isExit = b.id === cfg.exitBlockId;
      const isUnreachable = unreachableSet.has(b.id);

      let stroke = "#475569";
      let fill = "rgba(30, 41, 59, 0.95)";
      let strokeWidth = "1.5";
      let badge = "REACH";
      let badgeColor = "#94a3b8";

      if (isEntry) {
        stroke = "#34d399";
        fill = "rgba(52, 211, 153, 0.15)";
        strokeWidth = "2";
        badge = "ENTRY";
        badgeColor = "#34d399";
      } else if (isExit) {
        stroke = "#38bdf8";
        fill = "rgba(56, 189, 248, 0.15)";
        strokeWidth = "2";
        badge = "EXIT";
        badgeColor = "#38bdf8";
      } else if (isUnreachable) {
        stroke = "#f87171";
        fill = "rgba(248, 113, 113, 0.12)";
        strokeWidth = "1.8";
        badge = "DEAD";
        badgeColor = "#f87171";
      }

      const shortId = b.id.includes(":") ? (b.id.split(":").pop() ?? b.id) : b.id;
      const stmtsRaw =
        b.statements.map((s) => s.type.replace("Statement", "")).join(", ") || "(synthetic)";
      const stmtsText = stmtsRaw.length > 18 ? `${stmtsRaw.slice(0, 17)}…` : stmtsRaw;

      const group = document.createElementNS(SVG_NS, "g");
      const deadClass = isUnreachable ? "dead" : "";
      const selectedClass = selectedBlockId === b.id ? "selected" : "";
      group.setAttribute("class", `cfg-block-group ${deadClass} ${selectedClass}`.trim());
      group.setAttribute("data-block-id", b.id);
      group.setAttribute("tabindex", "0");
      group.setAttribute("role", "button");
      group.setAttribute("aria-label", `Block ${b.id}, ${badge}`);

      const rect = document.createElementNS(SVG_NS, "rect");
      rect.setAttribute("class", "cfg-block-rect");
      rect.setAttribute("x", String(pos.x));
      rect.setAttribute("y", String(pos.y));
      rect.setAttribute("width", String(BW));
      rect.setAttribute("height", String(BH));
      rect.setAttribute("rx", "6");
      rect.setAttribute("fill", fill);
      rect.setAttribute("stroke", stroke);
      rect.setAttribute("stroke-width", strokeWidth);
      if (isUnreachable) {
        rect.setAttribute("stroke-dasharray", "5 3");
      }
      group.appendChild(rect);

      const titleText = document.createElementNS(SVG_NS, "text");
      titleText.setAttribute("x", String(pos.x + 8));
      titleText.setAttribute("y", String(pos.y + 18));
      titleText.setAttribute("fill", "#f8fafc");
      titleText.setAttribute("font-size", "11");
      titleText.setAttribute("font-weight", "700");
      titleText.setAttribute("font-family", "monospace");
      titleText.textContent = shortId;
      group.appendChild(titleText);

      const badgeText = document.createElementNS(SVG_NS, "text");
      badgeText.setAttribute("x", String(pos.x + BW - 8));
      badgeText.setAttribute("y", String(pos.y + 18));
      badgeText.setAttribute("text-anchor", "end");
      badgeText.setAttribute("fill", badgeColor);
      badgeText.setAttribute("font-size", "8.5");
      badgeText.setAttribute("font-weight", "700");
      badgeText.setAttribute("font-family", "monospace");
      badgeText.textContent = badge;
      group.appendChild(badgeText);

      const stmtsEl = document.createElementNS(SVG_NS, "text");
      stmtsEl.setAttribute("x", String(pos.x + 8));
      stmtsEl.setAttribute("y", String(pos.y + 36));
      stmtsEl.setAttribute("fill", "#94a3b8");
      stmtsEl.setAttribute("font-size", "9");
      stmtsEl.setAttribute("font-family", "monospace");
      stmtsEl.textContent = stmtsText;
      group.appendChild(stmtsEl);

      // Block Click & Keyboard Selection
      const onSelect = () => {
        selectedBlockId = b.id;
        const allGroups = svg.querySelectorAll(".cfg-block-group");
        for (const g of allGroups) {
          g.classList.remove("selected");
        }
        group.classList.add("selected");
        if (blockInspector) blockInspector.style.display = "block";
        renderBlockInspector(cfg, b.id);
      };

      group.addEventListener("click", onSelect);
      group.addEventListener("keydown", (e: KeyboardEvent) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSelect();
        }
      });

      svg.appendChild(group);
    }

    visualGraphContainer.appendChild(svg);
  }

  function createSvgMarker(id: string, color: string): SVGMarkerElement {
    const marker = document.createElementNS(SVG_NS, "marker");
    marker.setAttribute("id", id);
    marker.setAttribute("viewBox", "0 0 10 10");
    marker.setAttribute("refX", "9");
    marker.setAttribute("refY", "5");
    marker.setAttribute("markerWidth", "6");
    marker.setAttribute("markerHeight", "6");
    marker.setAttribute("orient", "auto-start-reverse");

    const path = document.createElementNS(SVG_NS, "path");
    path.setAttribute("d", "M 0 1 L 10 5 L 0 9 z");
    path.setAttribute("fill", color);
    marker.appendChild(path);

    return marker;
  }

  function renderBlockInspector(cfg: ControlFlowGraph, blockId: string | null): void {
    inspectorContent.replaceChildren();

    if (!blockId) {
      if (blockInspector) blockInspector.style.display = "none";
      return;
    }

    const block = cfg.blocks.find((b) => b.id === blockId);
    if (!block) return;

    const isUnreachable = cfg.unreachableBlockIds.includes(block.id);
    const grid = document.createElement("div");
    grid.className = "inspector-grid";

    // Row: Block ID
    grid.appendChild(createInspectorRow("Block ID:", block.id));

    // Row: Status
    const statusVal = isUnreachable ? "UNREACHABLE (Dead Code)" : "REACHABLE";
    grid.appendChild(createInspectorRow("Status:", statusVal));

    // Row: Statements
    const stmtsText =
      block.statements.length > 0
        ? block.statements
            .map((s) =>
              s.location ? `${s.type} [${s.location.line}:${s.location.column}]` : s.type
            )
            .join(", ")
        : "(empty / synthetic entry/exit)";
    grid.appendChild(createInspectorRow("Statements:", stmtsText));

    // Row: Predecessors
    const predsText =
      block.predecessorIds.length > 0 ? `[${block.predecessorIds.join(", ")}]` : "[] (Entry block)";
    grid.appendChild(createInspectorRow("Predecessors:", predsText));

    // Row: Successors
    const succsText =
      block.successorIds.length > 0 ? `[${block.successorIds.join(", ")}]` : "[] (Exit block)";
    grid.appendChild(createInspectorRow("Successors:", succsText));

    // Row: Terminator if present
    if (block.terminator) {
      grid.appendChild(createInspectorRow("Terminator:", block.terminator));
    }

    inspectorContent.appendChild(grid);
  }

  function createInspectorRow(label: string, value: string): DocumentFragment {
    const frag = document.createDocumentFragment();
    const lblEl = document.createElement("div");
    lblEl.className = "inspector-label";
    lblEl.textContent = label;

    const valEl = document.createElement("div");
    valEl.className = "inspector-val";
    valEl.textContent = value;

    frag.appendChild(lblEl);
    frag.appendChild(valEl);
    return frag;
  }

  // Initial analysis trigger
  runAnalysis();
}
