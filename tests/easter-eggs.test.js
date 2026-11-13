import { describe, expect, it } from "vitest";
import Engine from "../src/engine.js";
import { EASTER_EGGS, previewEasterEgg, discoverEasterEgg } from "../src/systems/easter-eggs.js";

function eligible(id) {
  const state = Engine.fresh("secret-" + id, 3, false);
  const world = Engine.byId(state, id);
  state.day = EASTER_EGGS[id].minDay;
  if (id === "lingzai") {
    world.level = 2;
    world.strategy = "growth";
  } else if (id === "zombie") {
    world.level = 2;
    world.resource = 8;
  } else {
    world.suppression = 1;
  }
  return { state, world };
}

describe("deterministic cosmetic discoveries", () => {
  it("provides one unique secret per world and keeps previews pure", () => {
    const ids = ["lingzai", "zombie", "beast"];
    expect(new Set(ids.map((id) => EASTER_EGGS[id].id)).size).toBe(3);
    for (const id of ids) {
      const { state, world } = eligible(id);
      const snapshot = JSON.stringify(state);
      const preview = previewEasterEgg(state, world);
      expect(preview.id).toBe(EASTER_EGGS[id].id);
      expect(preview.message).toContain("彩蛋");
      expect(JSON.stringify(state)).toBe(snapshot);
      expect(discoverEasterEgg(state, world)).toEqual(preview);
      expect(discoverEasterEgg(state, world)).toBeNull();
      expect(world.flags.easterEggs).toEqual([preview.id]);
      const saved = JSON.parse(JSON.stringify(state));
      expect(previewEasterEgg(saved, Engine.byId(saved, id))).toBeNull();
    }
  });

  it("does not trigger early, without requirements, or after the world ends", () => {
    for (const id of ["lingzai", "zombie", "beast"]) {
      const { state, world } = eligible(id);
      state.day--;
      expect(previewEasterEgg(state, world)).toBeNull();
      state.day++;
      if (id === "lingzai") world.strategy = "rescue";
      else if (id === "zombie") world.resource = 0;
      else world.suppression = 0;
      expect(previewEasterEgg(state, world)).toBeNull();
      world.status = "saved";
      expect(previewEasterEgg(state, world)).toBeNull();
    }
  });

  it("discovery consumes no AP, soul, resources, event slot or random stream", () => {
    const { state, world } = eligible("zombie");
    world.pendingEvent = {
      id: "boss/1", type: "boss", title: "首领", state: "queued",
      startDay: state.day + 1, expiresDay: state.day + 3,
    };
    const before = {
      ap: state.ap, soul: state.soul, resource: world.resource,
      rng: JSON.stringify(world.rng), buildRng: JSON.stringify(world.buildRng),
      pendingEvent: JSON.stringify(world.pendingEvent),
    };
    expect(discoverEasterEgg(state, world)?.id).toBe("zombie/expired-coffee");
    expect({
      ap: state.ap, soul: state.soul, resource: world.resource,
      rng: JSON.stringify(world.rng), buildRng: JSON.stringify(world.buildRng),
      pendingEvent: JSON.stringify(world.pendingEvent),
    }).toEqual(before);
  });

  it("integrates discovery with actual day logs, exactly once", () => {
    const state = Engine.fresh("secret-step", 3, false);
    const world = Engine.byId(state, "lingzai");
    state.day = 7;
    world.level = 2;
    world.strategy = "growth";
    Engine.step(state);
    const messages = state.logs.filter((entry) => entry.text.includes("修仙也要摸鱼"));
    expect(messages).toHaveLength(1);
    Engine.step(state);
    expect(state.logs.filter((entry) => entry.text.includes("修仙也要摸鱼"))).toHaveLength(1);
  });
});

describe("run-local discovery collection", () => {
  it("reveals found details but keeps unknown entries concealed and ignores locked worlds", async () => {
    const { summarizeEasterEggCollection } = await import("../src/systems/easter-eggs.js");
    const state = Engine.fresh("collection-view", 1, false);
    const before = JSON.stringify(state);
    const initial = summarizeEasterEggCollection(state);
    expect(initial).toMatchObject({ found: 0, total: 2, complete: false });
    expect(initial.entries.every((entry) => entry.title === "？？？")).toBe(true);
    expect(JSON.stringify(state)).toBe(before);
    Engine.byId(state, "lingzai").flags.easterEggs = ["lingzai/tea-break"];
    const found = summarizeEasterEggCollection(state);
    expect(found.found).toBe(1);
    expect(found.entries[0].title).toBe("修仙也要摸鱼");
    expect(found.entries[1].detail).not.toContain("末日便利店");
    const restored = JSON.parse(JSON.stringify(state));
    expect(summarizeEasterEggCollection(restored)).toEqual(found);
  });

  it("grants cosmetic three-world title only after all three are found", async () => {
    const { summarizeEasterEggCollection } = await import("../src/systems/easter-eggs.js");
    const state = Engine.fresh("all-three", 3, false);
    for (const world of state.worlds) {
      world.flags.easterEggs = [EASTER_EGGS[world.id].id];
    }
    const collection = summarizeEasterEggCollection(state);
    expect(collection).toMatchObject({ found: 3, total: 3, complete: true });
    expect(state.ap).toBe(2);
    expect(state.soul).toBe(8);
  });
});
