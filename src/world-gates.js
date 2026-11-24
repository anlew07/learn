const MAX_WORLD_SLOTS = 3;

const WORLD_GATE_THEMES = Object.freeze({
  lingzai: { glyph: "✦", kind: "lingzai", label: "灵灾界" },
  zombie: { glyph: "☣", kind: "zombie", label: "废土界" },
  beast: { glyph: "♜", kind: "beast", label: "兽潮界" },
});

const clampPercent = (value) =>
  Math.max(0, Math.min(100, Number.isFinite(value) ? value : 0));

const safeNumber = (value, fallback = 0) =>
  Number.isFinite(value) ? value : fallback;

const worldSlotId = (world, index) =>
  Number.isInteger(world?.slotId) && world.slotId > 0 ? world.slotId : index + 1;

const worldNumber = (world, fallback) =>
  Number.isInteger(world?.worldNumber) && world.worldNumber > 0
    ? world.worldNumber
    : fallback;

const statusLabel = (status) => (status === "saved" ? "已救援" : "已失守");

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[character]);
}

/**
 * Read-only projection of the actual three persistent world slots.
 * It never advances the simulation, draws RNG, or mutates RunState.
 */
export function getWorldGateView(run, selectedWorldId) {
  const worlds = Array.isArray(run?.worlds) ? run.worlds : [];
  const running = worlds.filter((world) => world?.status === "running");
  const maxObservedSlot = worlds.reduce(
    (maximum, world, index) =>
      Math.max(maximum, world?.status === "running" ? worldSlotId(world, index) : 0),
    0,
  );
  const unlockedSlots = Math.min(
    MAX_WORLD_SLOTS,
    Math.max(1, safeNumber(run?.worldSlots, 1), maxObservedSlot),
  );

  const activeBySlot = new Map();
  const latestBySlot = new Map();
  worlds.forEach((world, index) => {
    const slotId = worldSlotId(world, index);
    if (slotId > MAX_WORLD_SLOTS) return;
    if (world?.status === "running" && !activeBySlot.has(slotId)) {
      activeBySlot.set(slotId, world);
    }
    if (world?.status !== "running") {
      const previous = latestBySlot.get(slotId);
      if (!previous || worldNumber(world, 0) > worldNumber(previous, 0)) {
        latestBySlot.set(slotId, world);
      }
    }
  });

  const slots = Array.from({ length: MAX_WORLD_SLOTS }, (_, index) => {
    const slotId = index + 1;
    const world = activeBySlot.get(slotId);
    if (slotId > unlockedSlots) {
      const needed = slotId - unlockedSlots;
      return {
        slotId,
        state: "locked",
        lockHint: `再成功救援 ${needed} 个世界后开启`,
      };
    }

    if (!world) {
      const latest = latestBySlot.get(slotId);
      return {
        slotId,
        state: "empty",
        title: latest?.name || "通道暂时中断",
        emptyHint:
          latest?.status === "failed"
            ? "该名额已失守，当前没有运行中的世界"
            : "该名额当前没有运行中的世界",
        latestStatus: latest?.status || "",
      };
    }

    const theme = WORLD_GATE_THEMES[world.id] || {
      glyph: "◇",
      kind: "unknown",
      label: "异界",
    };
    const danger = clampPercent(world.d);
    const rescue = clampPercent(world.p);
    const risk =
      danger >= 75 ? "critical" : danger >= 40 ? "warning" : "stable";

    return {
      slotId,
      state: "active",
      worldId: world.id,
      worldNumber: worldNumber(world, slotId),
      title: world.name || theme.label,
      kind: theme.kind,
      glyph: theme.glyph,
      rescue,
      danger,
      risk,
      riskLabel: risk === "critical" ? "危急" : risk === "warning" ? "警戒" : "稳定",
      level: Math.max(1, safeNumber(world.level, 1)),
      selected: world.id === selectedWorldId,
    };
  });

  const history = worlds
    .filter((world) => world?.status !== "running")
    .sort((left, right) => worldNumber(right, 0) - worldNumber(left, 0))
    .slice(0, 3)
    .map((world) => ({
      worldNumber: worldNumber(world, 0),
      title: world.name || world.id || "未知世界",
      status: world.status,
      statusLabel: statusLabel(world.status),
      endDay: Math.max(0, safeNumber(world.endDay, 0)),
    }));

  return {
    activeCount: running.length,
    unlockedSlots,
    visitedCount: Math.max(
      0,
      safeNumber(run?.worldsVisitedThisRun, worlds.length),
    ),
    savedCount: Math.max(0, safeNumber(run?.worldsSavedThisRun, 0)),
    slots,
    history,
    nextHint:
      unlockedSlots < MAX_WORLD_SLOTS
        ? "成功救援会逐步开启下一道界门；每道门都代表一个并行世界名额。"
        : "三道界门已全部开启。后续救援会在获救名额接入新世界，其他世界继续演化。",
  };
}

function activeGateHtml(slot, canSwitch) {
  const disabled = !canSwitch;
  const action = disabled
    ? "入门后可切换"
    : slot.selected
      ? "正在查看"
      : "切换查看";
  const actionAttribute = disabled
    ? " disabled"
    : ` data-action="scene-world" data-world="${escapeHtml(slot.worldId)}"`;
  const currentClass = slot.selected ? " is-current" : "";
  const label =
    `查看第${slot.worldNumber}界 ${slot.title}，救援准备${slot.rescue}%，危机压力${slot.danger}%`;

  return `<button type="button" class="world-gate-card world-gate-${slot.kind}${currentClass}" data-gate-state="active" data-gate-slot="${slot.slotId}" aria-label="${escapeHtml(label)}" aria-pressed="${slot.selected ? "true" : "false"}"${actionAttribute}>
    <span class="world-gate-number">第 ${slot.worldNumber} 界</span>
    <span class="world-gate-portal" aria-hidden="true"><i>${slot.glyph}</i></span>
    <strong>${escapeHtml(slot.title)}</strong>
    <span class="world-gate-risk is-${slot.risk}"><i></i>${slot.riskLabel} · ${Math.round(slot.danger)}%</span>
    <span class="world-gate-metric">救援准备 ${Math.round(slot.rescue)}%</span>
    <span class="world-gate-track"><i style="width:${slot.rescue}%"></i></span>
    <span class="world-gate-level">分身 Lv${slot.level}</span>
    <span class="world-gate-action">${action}</span>
  </button>`;
}

function lockedGateHtml(slot) {
  return `<article class="world-gate-card is-locked" data-gate-state="locked" data-gate-slot="${slot.slotId}" aria-label="第${slot.slotId}道界门尚未开启">
    <span class="world-gate-number">界门 ${slot.slotId}</span>
    <span class="world-gate-portal" aria-hidden="true"><i>◇</i></span>
    <strong>尚未开启</strong>
    <span class="world-gate-lock-hint">${slot.lockHint}</span>
    <span class="world-gate-seal">封印中</span>
  </article>`;
}

function emptyGateHtml(slot) {
  return `<article class="world-gate-card is-empty" data-gate-state="empty" data-gate-slot="${slot.slotId}" aria-label="第${slot.slotId}个世界名额当前空置">
    <span class="world-gate-number">名额 ${slot.slotId}</span>
    <span class="world-gate-portal" aria-hidden="true"><i>×</i></span>
    <strong>${escapeHtml(slot.title)}</strong>
    <span class="world-gate-lock-hint">${slot.emptyHint}</span>
    <span class="world-gate-seal">通道中断</span>
  </article>`;
}

export function worldGatePanelHtml(view, { canSwitch = true } = {}) {
  if (!view) {
    return '<p class="hint">暂时无法读取跨界航路。</p>';
  }

  const cards = view.slots
    .map((slot) => {
      if (slot.state === "active") return activeGateHtml(slot, canSwitch);
      if (slot.state === "locked") return lockedGateHtml(slot);
      return emptyGateHtml(slot);
    })
    .join("");

  const history = view.history.length
    ? `<ol class="world-gate-history-list">${view.history
        .map(
          (item) =>
            `<li><span>第 ${item.worldNumber} 界 · ${escapeHtml(item.title)}</span><b class="is-${item.status}">${item.statusLabel}</b></li>`,
        )
        .join("")}</ol>`
    : '<p class="world-gate-history-empty">完成首次救援后，这里会留下穿越记录。</p>';

  const switchHint = canSwitch
    ? "点击已开启的界门切换查看；不会消耗资源或推进时间。"
    : "当前处于新手聚焦阶段；完成入门后即可切换查看其他世界。";

  return `<section class="world-gate-panel" aria-label="跨界航路：${view.activeCount}/3 个世界正在运行">
    <header class="world-gate-heading">
      <div><small>WORLD NEXUS</small><h3>跨界航路</h3></div>
      <div class="world-gate-count"><strong>${view.activeCount}/3</strong><span>并行世界</span><small>本局已穿越 ${view.visitedCount} 个世界</small></div>
    </header>
    <p class="world-gate-description">${switchHint}</p>
    <div class="world-gate-hub"><span>✦ 界枢</span><small>已连接 ${view.unlockedSlots}/3 道界门</small></div>
    <div class="world-gate-grid">${cards}</div>
    <p class="world-gate-next-hint">${view.nextHint}</p>
    <section class="world-gate-history"><h4>穿越记录 · 已救援 ${view.savedCount} 个</h4>${history}</section>
  </section>`;
}
