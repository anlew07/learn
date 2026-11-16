/**
 * Read-only help and low-frequency local display preferences.
 * These views never call Engine or persistence; no RunState/ProfileState changes.
 */
const TEXT_SIZE_KEY = "learn:text-size";

export function readTextSize() {
  try {
    return localStorage.getItem(TEXT_SIZE_KEY) === "large" ? "large" : "standard";
  } catch {
    return "standard";
  }
}

export function applyTextSize() {
  const size = readTextSize();
  if (typeof document !== "undefined") document.documentElement.dataset.textSize = size;
  return size;
}

export function setTextSize(size) {
  if (size !== "standard" && size !== "large") return false;
  if (typeof document !== "undefined") document.documentElement.dataset.textSize = size;
  try {
    localStorage.setItem(TEXT_SIZE_KEY, size);
    return true;
  } catch {
    // Keeping the current visual preference is still useful in restricted browsers.
    return false;
  }
}

function helpPage() {
  return `<div class="support-grid">
    <section><h2>30 秒学会玩</h2><p><strong>分身自动行动，你负责决定方向。</strong>点击「继续模拟」，分身会每天探索、成长、采集或排险；你可以暂停、加速，也可以调整长期策略。</p></section>
    <section><h2>怎么救援成功？</h2><p>救援准备越高越好，危机压力越低越安全。<strong>准备达到 100（P100）不代表直接胜利</strong>：还需要满足世界自己的等级、物资、主线和威胁等最终条件，详细信息在「策略 / 档案」。</p></section>
    <section><h2>重要数值是什么意思？</h2><p><strong>准备 P</strong>：接近救援目标的程度；<strong>危机 D</strong>：越高越危险，达到 100 可能失守；<strong>干预点 AP</strong>：用于关键支援；<strong>灵魂</strong>：跨世界援助的资源；<strong>等级 Lv</strong>：分身成长进度。</p></section>
    <section><h2>哪里需要我选择？</h2><p>「策略」改变未来的行动倾向，不是手动下一天；「事件」是一次性重大选择，不处理也可能按默认规则结算；「跨界援助」有来源消耗和冷却；「队伍」展示分身与战技构筑。</p></section>
    <section><h2>为什么最初只看见一个世界？</h2><p>推荐新手开局先聚焦灵灾，<strong>废土世界仍在同步运行</strong>。点击「其他世界」即可展开双世界。第三个兽潮世界会在后续局数中解锁。</p></section>
    <section><h2>自动战斗与战报</h2><p>分身按当前战技构筑自动应战。战报记录实际结算与奖励；播放动画或重新查看战报不额外获得奖励，也不增加一天。</p></section>
    <section><h2>存档与常见问题</h2><p>游戏数据自动保存在<strong>当前浏览器</strong>，不会自动同步到其他设备。多标签页通常只有一个能写入；遇到存档失败会暂停并提示重试。刷新后如默认暂停，请主动点击继续。</p></section>
  </div>`;
}

function settingsPage({ textSize, hasRun, readonly, saveFailed }) {
  const option = (size, label) =>
    `<button data-action="text-size" data-value="${size}" aria-pressed="${textSize === size}" class="${textSize === size ? "selected" : ""}">${label}</button>`;
  const save = saveFailed
    ? "当前存档写入失败，游戏已暂停，请返回游戏按提示重试。"
    : hasRun
      ? "此浏览器已有本局数据，系统会自动保存。"
      : "此浏览器还没有正在进行的本局。";
  return `<div class="support-grid">
    <section><h2>显示文字</h2><p>手机文字太小时可以选择较大字号，不影响战斗、存档或游戏数值。</p>
      <div class="support-options" aria-label="显示字号">${option("standard", "标准")}${option("large", "较大")}</div></section>
    <section><h2>游戏帮助</h2><p>忘记规则或想重新了解玩法，不需要删档重开。</p>
      <button data-action="open-help">查看玩法帮助</button></section>
    <section><h2>本地游戏数据</h2><p>${save}</p>
      <p>${readonly ? "此标签页目前只读。关闭另一写入标签后，可从游戏内申请重新控制。" : "当前标签页可操作；存档保护仍由游戏本身负责。"}</p>
      <p>数据留在当前设备与浏览器，没有账号登录和云存档。清除浏览器网站数据可能导致存档丢失。</p></section>
    <section><h2>版本与动效</h2><p>当前为 H5 开发测试版。动画默认尊重设备的「减少动态效果」偏好。</p>
      <p>尚未实现的音乐音量、账号和云同步不会显示为假开关。</p></section>
  </div>`;
}

export function supportPageHtml(kind, options = {}) {
  const title = kind === "settings" ? "设置与本机数据" : "玩法帮助";
  const body = kind === "settings" ? settingsPage(options) : helpPage();
  return `<main class="support-page" data-support-page="${kind}" aria-label="${title}">
    <header class="support-heading"><h1>${title}</h1>
      <button data-action="support-back">返回游戏 / 首页</button></header>
    <p class="support-lead">${kind === "settings" ? "这里仅调整实际可用的显示偏好并查看本机数据说明。" : "分身每天自主行动；你负责策略、关键事件与跨世界救援。"}</p>
    ${body}
    <footer><button data-action="support-back">返回游戏 / 首页</button></footer>
  </main>`;
}
