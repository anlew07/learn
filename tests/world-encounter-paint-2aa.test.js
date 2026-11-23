import { describe, expect, it } from "vitest";
import { paintRecentEncounter } from "../src/ui/world-encounter-paint.js";

function capture(encounter, frame) {
  const marks = [];
  const ctx = {
    fillStyle: "",
    fillRect(x, y, width, height) {
      marks.push({ color: this.fillStyle, x, y, width, height });
    },
  };
  const foes = [];
  paintRecentEncounter(ctx, encounter, frame, (x, y, width, height) => {
    foes.push({ x, y, width, height });
  });
  return { marks, foes };
}

const encounter = {
  waves: [{ encountered: 10, defeated: 5 }],
};

describe("settled encounter visual hit feedback", () => {
  it("recoils only the silhouettes represented by the real defeat ratio", () => {
    const idle = capture(encounter, 0);
    const impact = capture(encounter, 16);
    expect(idle.foes).toHaveLength(1);
    expect(impact.foes).toHaveLength(1);
    expect(impact.foes[0].x).toBeGreaterThan(idle.foes[0].x);
    expect(impact.marks.some((mark) => mark.color === "#fff0c2")).toBe(true);
  });

  it("does not invent a hit flash or sword trail when the real wave defeated nobody", () => {
    const empty = capture({ waves: [{ encountered: 10, defeated: 0 }] }, 16);
    expect(empty.marks.some((mark) => mark.color === "#fff0c2")).toBe(false);
    expect(empty.marks.some((mark) => mark.color === "#def8e2")).toBe(false);
  });

  it("keeps the encounter result immutable while replaying frames", () => {
    const fixed = Object.freeze({
      waves: Object.freeze([Object.freeze({ encountered: 10, defeated: 5 })]),
    });
    const before = JSON.stringify(fixed);
    for (let frame = 0; frame < 120; frame++) capture(fixed, frame);
    expect(JSON.stringify(fixed)).toBe(before);
  });
});
