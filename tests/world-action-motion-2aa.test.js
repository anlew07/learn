import { describe, expect, it } from "vitest";
import { getWorldActionMotion } from "../src/ui/world-action-motion.js";

describe("truthful autonomous world-action reenactment", () => {
  it("approaches, interacts and returns for gathering, exploration and rescue", () => {
    expect(getWorldActionMotion("gathering", 24)).toMatchObject({
      offsetX: -12, flipX: true, phase: "interact", interacting: true, pulse: true,
    });
    expect(getWorldActionMotion("exploring", 30)).toMatchObject({
      offsetX: 22, phase: "interact", interacting: true,
    });
    expect(getWorldActionMotion("rescuing", 30)).toMatchObject({
      offsetX: 12, offsetY: -2, phase: "interact", interacting: true,
    });
    expect(getWorldActionMotion("exploring", 80).phase).toBe("rest");
  });

  it("syncs the sword lunge with a real settled encounter only", () => {
    const combat = getWorldActionMotion("defending", 15, false, true);
    const patrol = getWorldActionMotion("defending", 15, false, false);
    expect(combat).toMatchObject({
      offsetX: 22, phase: "strike", strike: true, interacting: true,
    });
    expect(patrol).toMatchObject({
      phase: "patrol", interacting: false, strike: false,
    });
    expect(Math.abs(patrol.offsetX)).toBeLessThanOrEqual(4);
  });

  it("gives training a stationary energy pulse instead of walking", () => {
    expect(getWorldActionMotion("training", 10)).toMatchObject({
      offsetX: 0, offsetY: -2, bob: 1, phase: "channel", pulse: true,
    });
  });

  it("freezes every action pose when paused or motion is unavailable", () => {
    for (const activity of ["training", "gathering", "exploring", "defending", "rescuing"]) {
      const first = getWorldActionMotion(activity, 0, true, true);
      const later = getWorldActionMotion(activity, 91, true, true);
      expect(later).toEqual(first);
      expect(first).toMatchObject({
        offsetX: 0, offsetY: 0, bob: 0, phase: "paused",
        interacting: false, pulse: false, strike: false, paused: true,
      });
    }
  });

  it("wraps deterministically and never mutates caller state", () => {
    const state = Object.freeze({ activity: "exploring", frame: 30 });
    const first = getWorldActionMotion(state.activity, state.frame);
    expect(getWorldActionMotion(state.activity, state.frame + 120)).toEqual(first);
    expect(getWorldActionMotion("unknown", -3)).toMatchObject({
      phase: "observing", offsetX: 0, strike: false,
    });
    expect(state).toEqual({ activity: "exploring", frame: 30 });
  });
});
