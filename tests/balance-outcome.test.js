import { describe, expect, it } from "vitest";
import { readWorldTerminal } from "../scripts/balance-outcome.mjs";

describe("balance report terminal accounting", () => {
  const failed = {
    id: "beast",
    status: "failed",
    action: "救援未完成",
    d: 100,
    deadline: 94,
  };

  it("recognizes new failure wording without discarding the actual day", () => {
    const logs = [{ world: "beast", text: "救援未完成：危机进度达到100%。灵魂强度-2。" }];
    expect(readWorldTerminal(failed, logs, 45)).toEqual({
      day: 45,
      reason: "危机进度达到100%",
    });
  });

  it("still recognizes old save logs", () => {
    const logs = [{ world: "beast", text: "末日降临：毁灭进度达到100%。灵魂强度-2。" }];
    expect(readWorldTerminal(failed, logs, 45)).toEqual({
      day: 45,
      reason: "毁灭进度达到100%",
    });
  });

  it("falls back to saved state if log history has been trimmed", () => {
    expect(readWorldTerminal(failed, [], 45)).toEqual({
      day: 45,
      reason: "危机进度达到100%",
    });
    expect(readWorldTerminal({ ...failed, d: 20, action: "灵魂坍塌" }, [], 45)).toEqual({
      day: 45,
      reason: "灵魂坍塌",
    });
    expect(readWorldTerminal({ ...failed, status: "saved" }, [], 33)).toEqual({
      day: 33,
      reason: null,
    });
    expect(readWorldTerminal({ ...failed, status: "running" }, [], 1)).toBe(null);
  });
});
