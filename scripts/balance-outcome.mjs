/**
 * Capture a terminal snapshot when a world first ends. The in-game log keeps
 * only 180 entries, so run-end log scanning can lose early world outcomes.
 */
export function readWorldTerminal(world, logs, day) {
  if (world.status === "running") return null;
  if (world.status === "saved") return { day, reason: null };

  const terminal = logs.findLast(
    (entry) =>
      entry.world === world.id &&
      (entry.text.startsWith("救援未完成：") ||
        entry.text.startsWith("末日降临：") ||
        entry.text.includes("灵魂支援耗尽") ||
        entry.text.includes("灵魂归零")),
  );
  const loggedReason = terminal?.text.match(/^(?:救援未完成：|末日降临：)([^。]+)/u)?.[1];
  const reason =
    loggedReason ??
    (world.action === "灵魂坍塌" || terminal?.text.includes("灵魂")
      ? "灵魂坍塌"
      : world.d >= 100
        ? "危机进度达到100%"
        : day >= world.deadline
          ? "到达灾变截止日"
          : "未知原因");
  return { day, reason };
}
