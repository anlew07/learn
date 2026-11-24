import { describe, expect, it } from "vitest";
import Engine from "../src/engine.js";
import {
  PLAYER_GLOSSARY,
  getOpeningBrief,
  getWorldGuidance,
  getRunOverview,
  getDecisionGuidance,
  getTutorialGuidance,
  getOutcomeGuidance,
  getPlayerGuidance,
} from "../src/presentation/player-guidance.js";

describe("player guidance: first-time learning", () => {
  it("describes the real autonomous loop and delayed three-world unlock without claiming a villain", () => {
    expect(getOpeningBrief({ runCount: 0 }).genre).toContain("多世界自动");
    const start = getPlayerGuidance(null, { runCount: 0 }, Engine);
    expect(start.opening.genre).toContain("多世界自动");
    expect(start.opening.automatic).toContain("自主");
    expect(start.opening.playerRole).toContain("当前已开放");
    expect(start.opening.playerRole).not.toContain("借力");
    expect(start.opening.stageHint).toContain("分身自动行动");
    expect(start.opening.continuation).toContain("最多同时守护三个世界");
    expect(start.opening.shardNote).toContain("文明传承");
    expect(start.overview).toBeNull();
    expect(start.choices.events).toEqual([]);
    expect(start.tutorial.current.id).toBe("arrival");
    expect(start.tutorial.current.title).toBe("为什么会穿越到新世界？");
    expect(start.tutorial.current.text).toContain("成功救援后");
    expect(start.outcome).toBeNull();
    expect(PLAYER_GLOSSARY.map((term) => term.id)).toEqual([
      "p", "d", "ap", "level", "resource", "aid", "fusion", "build", "elite",
    ]);
  });

  it("shows first-day observation without treating decisions as mandatory clicks", () => {
    const state = Engine.fresh("guidance-day1", 1, true, "", 0);
    const tutorial = getTutorialGuidance(state, { seenIds: ["arrival"] });
    expect(tutorial.current.id).toBe("first-day");
    expect(tutorial.current.text).toContain("自主");
    const overview = getRunOverview(state, Engine);
    expect(overview.total).toBe(1);
    expect(overview.ongoing).toBe(1);
    expect(overview.freeInterventionPoints).toBe(2);
    expect(overview.dailyFlow.automatic).toContain("一次主要行动");
    expect(overview.worlds.map((world) => world.worldId)).toEqual(["lingzai"]);
    expect(overview.worlds.every((world) => world.lastDecision === null)).toBe(true);

    Engine.step(state);
    const after = getRunOverview(state, Engine);
    expect(after.worlds.every((world) => world.lastDecision?.reason)).toBe(true);
  });

  it("teaches the first rescue as the point where parallel-world slots expand", () => {
    const state = Engine.fresh("guidance-first-rescue", 1, true, "", 0);
    state.worldsSavedThisRun = 1;
    state.worldsSavedCount = 1;
    state.worldSlots = 2;
    const tutorial = getTutorialGuidance(state, {
      seenIds: ["arrival", "first-day"],
    });
    expect(tutorial.current.id).toBe("first-rescue");
    expect(tutorial.current.text).toContain("已成功救援1个世界");
    expect(tutorial.current.text).toContain("已开放2个并行名额");
    expect(tutorial.current.text).toContain("下一次成功救援将继续解锁");
    expect(tutorial.current.actionHint).toContain("其他世界不会重置");
  });

  it("allows skipping and reviewing every stage without modifying a saved run", () => {
    const state = Engine.fresh("guidance-skip", 1, false);
    const before = JSON.stringify(state);
    const ignored = getTutorialGuidance(state, { skipped: true });
    expect(ignored.current).toBeNull();
    expect(ignored.canReview).toBe(true);
    expect(ignored.steps.length).toBe(6);
    expect(ignored.steps.find((card) => card.id === "first-battle").available).toBe(false);
    expect(ignored.steps.find((card) => card.id === "first-rescue").available).toBe(false);
    const reviewed = getTutorialGuidance(state, { seenIds: ["arrival", "first-day"] });
    expect(reviewed.steps[0].seen).toBe(true);
    expect(reviewed.current).toBeNull();
    expect(JSON.stringify(state)).toBe(before);
  });

  it("teaches a crisis or battle only after the actual state unlocks it", () => {
    const state = Engine.fresh("guidance-crisis", 1, true);
    const zombie = Engine.byId(state, "zombie");
    zombie.d = 71;
    let tutorial = getTutorialGuidance(state, { seenIds: ["arrival", "first-day"] });
    expect(tutorial.current.id).toBe("first-crisis");
    expect(tutorial.current.text).toContain("71");
    zombie.lastCombat = { day: state.day };
    tutorial = getTutorialGuidance(state, { seenIds: ["arrival", "first-day", "first-crisis"] });
    expect(tutorial.current.id).toBe("first-battle");
    expect(tutorial.current.text).toContain("有上限");
    state.waves = false;
    expect(getTutorialGuidance(state).steps.find((card) => card.id === "first-battle").text)
      .toContain("未开启");
  });
});

describe("player guidance: explanation contract", () => {
  it("uses current strategy previews for free and paid switching", () => {
    const state = Engine.fresh("guidance-strategy", 1, false);
    const first = getDecisionGuidance(state, Engine).strategies;
    const alternative = first.find((item) => item.worldId === "lingzai" && item.choiceId === "clear");
    expect(alternative.available).toBe(true);
    expect(alternative.cost).toContain("免费");
    const current = first.find((item) => item.worldId === "lingzai" && item.choiceId === "growth");
    expect(current.cost).toContain("无需费用");
    expect(current.noAction).toContain("成长优先");

    state.day = 4;
    state.ap = 0;
    expect(getDecisionGuidance(state, Engine).strategies.find((item) =>
      item.worldId === "lingzai" && item.choiceId === "clear"
    ).blockedBy).toContain("行动点");
    state.ap = 2;
    expect(getDecisionGuidance(state, Engine).strategies.find((item) =>
      item.worldId === "lingzai" && item.choiceId === "clear"
    ).cost).toContain("1干预点");
  });

  it("copies event eligibility, default outcome and known costs from the real preview", () => {
    const state = Engine.fresh("guidance-event", 1, false);
    const world = Engine.byId(state, "lingzai");
    world.pendingEvent = {
      id: "lingzai/clue/1", type: "clue", state: "active", title: "雾谷古碑",
      expiresDay: 3,
    };
    const choices = getDecisionGuidance(state, Engine).events.filter((item) =>
      item.worldId === world.id
    );
    expect(choices).toHaveLength(3);
    const preview = Engine.previewMajorEvent(state, world);
    expect(choices.map((item) => item.available)).toEqual(preview.options.map((item) => item.available));
    expect(choices.every((item) => item.noAction === preview.defaultOutcome)).toBe(true);
    expect(choices.find((item) => item.choiceId === "push").cost).toContain("1干预点");
    state.ap = 0;
    expect(getDecisionGuidance(state, Engine).events.find((item) =>
      item.choiceId === "push"
    ).blockedBy).toContain("行动点");
  });

  it("only describes cross-world aid's actual capped effect and source sacrifice", () => {
    const state = Engine.fresh("guidance-aid", 1, false);
    const aid = getDecisionGuidance(state, Engine).aid.find((item) =>
      item.sourceId === "lingzai" && item.worldId === "zombie" && item.choiceId === "p"
    );
    const preview = Engine.previewAid(state, "lingzai", "zombie", "p");
    expect(aid.available).toBe(preview.available);
    expect(aid.potential).toContain(String(preview.actualDelta));
    expect(aid.cost).toContain("4份材料");
    expect(aid.noAction).toContain("自主行动");

    const source = Engine.byId(state, "lingzai");
    source.resource = 10;
    expect(getDecisionGuidance(state, Engine).aid.find((item) =>
      item.sourceId === "lingzai" && item.worldId === "zombie" && item.choiceId === "p"
    ).tradeoff).toContain("终局");
  });

  it("does not promise finishing on P100 and reports every genuine finale blocker", () => {
    const state = Engine.fresh("guidance-finale", 1, false);
    const world = Engine.byId(state, "zombie");
    world.p = 100;
    world.flags.p65 = true;
    world.flags.p100 = true;
    world.level = 2;
    world.resource = 4;
    const data = getWorldGuidance(state, world, Engine);
    expect(data.finale.ready).toBe(false);
    expect(data.finale.missing.map((check) => check.id)).toEqual(
      expect.arrayContaining(["base-level", "materials", "combat"])
    );
    expect(data.recommendation.id).toBe("growth");
    expect(data.headline).toContain("条件");
  });

  it("shows actual build candidates and optional automation rather than invented rewards", () => {
    const state = Engine.fresh("guidance-build", 1, true);
    const world = Engine.byId(state, "lingzai");
    world.build.pending = {
      id: "build", reason: "首次突破Lv2", options: ["thunder", "rune"], due: state.day + 2,
    };
    const choices = getDecisionGuidance(state, Engine).builds;
    expect(choices.map((choice) => choice.choiceId)).toEqual(["thunder", "rune"]);
    expect(choices[0].noAction).toContain("自动");
    expect(choices[0].potential).toContain("实际");
    state.waves = false;
    expect(getDecisionGuidance(state, Engine).builds).toEqual([]);
  });

  it("only offers eligible fusion and clearly separates temporary combat from actual level", () => {
    const state = Engine.fresh("guidance-fusion", 2, false);
    const donor = Engine.byId(state, "lingzai");
    const target = Engine.byId(state, "zombie");
    donor.level = 2;
    target.p = 100;
    target.flags.p65 = true;
    target.flags.p100 = true;
    target.level = 3;
    target.resource = 12;
    const fusion = getDecisionGuidance(state, Engine).fusion.find((item) =>
      item.worldId === "zombie"
    );
    expect(fusion.available).toBe(true);
    expect(fusion.potential).toContain("1级");
    expect(fusion.cost).toContain("未来3日");
    expect(fusion.why).toContain("不提高分身实际等级");
  });

  it("checks retreat and single-use echo without consuming either", () => {
    const state = Engine.fresh("guidance-special", 1, false);
    Engine.byId(state, "lingzai").level = 2;
    state.echoes = [{ id: "lingzai", used: false }];
    const before = JSON.stringify(state);
    const choices = getDecisionGuidance(state, Engine);
    expect(choices.retreats.map((choice) => choice.choiceId)).toEqual(["4", "6"]);
    expect(choices.echoes).toHaveLength(1);
    expect(choices.echoes[0].potential).toContain("10");
    expect(JSON.stringify(state)).toBe(before);
    Engine.retreat(state, "lingzai", 4);
    const retreat = getDecisionGuidance(state, Engine).retreats[0];
    expect(retreat.kind).toBe("exitRetreat");
    expect(retreat.cost).toContain("危机压力增加8");
  });
});

describe("player guidance: outcomes and robustness", () => {
  it("distinguishes proven crisis failure from end-state preparation and material gaps", () => {
    const state = Engine.fresh("guidance-failed", 1, false);
    const first = Engine.byId(state, "lingzai");
    const second = Engine.byId(state, "zombie");
    first.status = "failed";
    first.p = 100;
    first.flags.p65 = true;
    first.flags.p100 = true;
    first.resource = 0;
    first.d = 100;
    second.status = "saved";
    state.active = false;
    state.result = { saved: 1, failed: 1, shards: 5, endedDay: 66 };
    state.logs.push({ world: "lingzai", text: "救援未完成：危机进度达到100%。灵魂强度-2。" });
    const outcome = getOutcomeGuidance(state, { runCount: 1 }, Engine);
    expect(outcome.rescued).toBe(1);
    expect(outcome.worlds[0].factorId).toBe("danger");
    expect(outcome.worlds[0].observedGaps.join(" ")).toContain("灵石");
    expect(outcome.worlds[1].status).toBe("saved");
    expect(outcome.earnedShards).toBe(5);
    expect(getTutorialGuidance(state).steps.at(-1).available).toBe(true);
  });

  it("does not fabricate a cause when failure logs are missing", () => {
    const state = Engine.fresh("guidance-unknown", 1, false);
    state.active = false;
    state.result = null;
    state.worlds.forEach((world) => { world.status = "failed"; });
    const outcome = getOutcomeGuidance(state, {}, Engine);
    expect(outcome.earnedShards).toBeNull();
    expect(outcome.worlds.every((world) => world.factorId === "unknown")).toBe(true);
    expect(outcome.worlds[0].mainFactor).toContain("没有足够信息");
  });

  it("survives incomplete legacy presentation fields and absent rules without inventing eligibility", () => {
    const state = Engine.fresh("guidance-missing", 1, false);
    state.worlds[0].build = {};
    state.worlds[0].metrics = null;
    state.worlds.push(null, { id: "unexpected", status: "running" });
    const data = getPlayerGuidance(state, null, null);
    expect(data.overview.total).toBe(2);
    expect(data.overview.worlds[0].finale).toBeNull();
    expect(data.choices.strategies).toEqual([]);
    expect(data.choices.events).toEqual([]);
    expect(data.tutorial.canSkip).toBe(true);
  });

  it("is read-only and does not alter RNG streams or seeded world outcomes", () => {
    for (const runNumber of [1, 3]) {
      const reference = Engine.fresh("guidance-stable-" + runNumber, runNumber, true);
      const observed = Engine.fresh("guidance-stable-" + runNumber, runNumber, true);
      for (let day = 0; day < 75 && reference.active; day++) {
        const before = JSON.stringify(observed);
        const first = getPlayerGuidance(observed, { runCount: runNumber - 1 }, Engine, {});
        expect(getPlayerGuidance(observed, { runCount: runNumber - 1 }, Engine, {})).toEqual(first);
        expect(JSON.stringify(observed)).toBe(before);
        Engine.step(reference);
        Engine.step(observed);
      }
      expect(observed).toEqual(reference);
    }
  });
});
