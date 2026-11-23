import { describe, expect, it } from "vitest";
import Engine from "../src/engine.js";
import { getStageView } from "../src/presentation/stage-view.js";
import {
  TACTICAL_ASSIST,
  previewTacticalAssist,
  tacticalAssistImpact,
} from "../src/systems/tactical-assist.js";

const chooseClear = (run) =>
  Engine.applyCommand(run, {
    operationId: "choose-clear",
    type: "strategy",
    args: ["lingzai", "clear"],
  });

const arm = (run, id = "prepare-focus") =>
  Engine.applyCommand(run, {
    operationId: id,
    type: "tactic",
    args: ["lingzai"],
  });

describe("2X one-use authoritative tactical intervention", () => {
  it("spends real AP once, survives JSON reload, rejects stacking and duplicate gestures", () => {
    const run = Engine.fresh("2x-command-persist", 1, true);
    const normal = JSON.stringify(run);
    expect(Engine.previewTactic(run, "lingzai")).toMatchObject({
      available: true, armed: false, apCost: 1,
    });
    expect(JSON.stringify(run)).toBe(normal);
    const ap = run.ap;
    expect(arm(run)).toMatchObject({ ok: true });
    expect(run.ap).toBe(ap - 1);
    expect(run.worlds[0].tacticalAssist).toMatchObject({
      kind: "focus", issuedDay: 1,
    });
    expect(getStageView(run, "lingzai").tacticArmed).toBe(true);
    expect(arm(run)).toMatchObject({ ok: true, replayed: true });
    expect(run.ap).toBe(ap - 1);
    expect(arm(run, "different-operation")).toMatchObject({ ok: false });
    expect(run.ap).toBe(ap - 1);
    const restored = JSON.parse(JSON.stringify(run));
    expect(Engine.previewTactic(restored, "lingzai")).toMatchObject({
      available: false, armed: true,
    });
    expect(arm(restored)).toMatchObject({ ok: true, replayed: true });
    expect(restored.ap).toBe(ap - 1);
  });

  it("refuses unavailable worlds, disabled wave rules and insufficient AP", () => {
    const off = Engine.fresh("2x-off", 1, false);
    expect(Engine.previewTactic(off, "lingzai").available).toBe(false);
    expect(arm(off).ok).toBe(false);
    expect(off.ap).toBe(2);
    const run = Engine.fresh("2x-ineligible", 1, true);
    expect(arm(run, "x")).toMatchObject({ ok: true });
    expect(Engine.applyCommand(run, {
      operationId: "other-world", type: "tactic", args: ["not-a-world"],
    }).ok).toBe(false);
    run.ap = 0;
    expect(Engine.previewTactic(run, "zombie")).toMatchObject({ available: false });
    expect(Engine.applyCommand(run, {
      operationId: "no-ap", type: "tactic", args: ["zombie"],
    }).ok).toBe(false);
    expect(previewTacticalAssist({active:false,waves:true},null,1).available).toBe(false);
  });

  it("never promises mitigation without genuine extra defeats", () => {
    expect(tacticalAssistImpact({defeated:20},{defeated:20})).toMatchObject({
      extraDefeated:0,dangerRelief:0,kind:TACTICAL_ASSIST.id,
    });
    expect(tacticalAssistImpact({defeated:0},{defeated:99}).dangerRelief)
      .toBe(TACTICAL_ASSIST.dangerCap);
  });

  it("settles a true fight with exact extra defeats and once-only danger relief", () => {
    const ordinary = Engine.fresh("2x-true-combat",1,true);
    const supported = Engine.fresh("2x-true-combat",1,true);
    expect(chooseClear(ordinary).ok).toBe(true);
    expect(chooseClear(supported).ok).toBe(true);
    const beforeAP = supported.ap;
    expect(arm(supported).ok).toBe(true);
    expect(supported.ap).toBe(beforeAP - 1);
    // Default resource pressure can cause gathering first. Keep the genuine
    // autonomous policy instead of forcing a fake fight on the first day.
    let fought = false;
    for(let day=0;day<30 && ordinary.active && supported.active;day++){
      expect(Engine.step(ordinary).ok).toBe(true);
      expect(Engine.step(supported).ok).toBe(true);
      if(Engine.byId(supported,"lingzai").lastCombat?.tactic){
        fought = true;
        break;
      }
    }
    expect(fought).toBe(true);
    const base = Engine.byId(ordinary, "lingzai");
    const focus = Engine.byId(supported, "lingzai");
    expect(base.lastCombat.day).toBe(focus.lastCombat.day);
    expect(base.lastDecision.actionId).toBe("fight");
    expect(focus.lastDecision.actionId).toBe("fight");
    expect(focus.lastCombat.tactic).toBeTruthy();
    expect(base.lastCombat.tactic).toBeUndefined();
    expect(focus.lastCombat.tactic.extraDefeated).toBe(
      focus.lastCombat.spectacle.defeated-base.lastCombat.spectacle.defeated,
    );
    expect(focus.lastCombat.tactic.extraDefeated).toBeGreaterThan(0);
    expect(focus.lastCombat.tactic.dangerRelief).toBeGreaterThanOrEqual(0);
    expect(focus.lastCombat.tactic.dangerRelief).toBeLessThanOrEqual(2.5);
    expect(focus.d).toBeLessThanOrEqual(base.d);
    expect(focus.lastCombat.bonus.doomReduced).toBeGreaterThanOrEqual(
      base.lastCombat.bonus.doomReduced,
    );
    expect(focus.metrics.waveCombats).toBe(1);
    expect(ordinary.worlds[0].metrics.waveCombats).toBe(1);
    expect(focus.tacticalAssist).toBeNull();
    expect(getStageView(supported,"lingzai").tacticResult)
      .toMatchObject({extraDefeated:focus.lastCombat.tactic.extraDefeated});
    const snapshot=JSON.stringify(supported);
    for(let i=0;i<10;i++)getStageView(supported,"lingzai");
    expect(JSON.stringify(supported)).toBe(snapshot);
    // Future fights do not reapply an already consumed order.
    for(let i=0;i<20 && supported.active;i++){
      Engine.step(supported);
      const w=Engine.byId(supported,"lingzai");
      if(w.lastCombat?.day===supported.day-1){
        expect(w.lastCombat.tactic).toBeUndefined();
        break;
      }
    }
  });

  it("holds one main action and bounded combat effects across 40 fixed seeds", () => {
    let improved = 0;
    for (let index=0;index<40;index++) {
      const seed="2x-paired-"+index;
      const normal=Engine.fresh(seed,1,true);
      const focus=Engine.fresh(seed,1,true);
      expect(chooseClear(normal).ok).toBe(true);
      expect(chooseClear(focus).ok).toBe(true);
      expect(arm(focus).ok).toBe(true);
      let encounter = false;
      for(let day=0;day<30 && normal.active && focus.active;day++){
        Engine.step(normal);
        Engine.step(focus);
        if(Engine.byId(focus,"lingzai").lastCombat?.tactic){
          encounter = true;
          break;
        }
      }
      expect(encounter).toBe(true);
      const a=Engine.byId(normal,"lingzai"), b=Engine.byId(focus,"lingzai");
      expect(a.lastCombat.day).toBe(b.lastCombat.day);
      expect(a.lastDecision.actionId).toBe("fight");
      expect(b.lastDecision.actionId).toBe("fight");
      expect(a.metrics.actions.fight).toBe(1);
      expect(b.metrics.actions.fight).toBe(1);
      expect(b.metrics.waveCombats).toBe(1);
      expect(b.lastCombat.tactic.extraDefeated).toBeGreaterThanOrEqual(0);
      expect(b.lastCombat.tactic.extraDefeated).toBeLessThanOrEqual(12);
      expect(b.lastCombat.spectacle.defeated).toBeGreaterThanOrEqual(
        a.lastCombat.spectacle.defeated,
      );
      expect(b.d).toBeLessThanOrEqual(a.d);
      expect(focus.day).toBe(normal.day);
      if(b.lastCombat.tactic.extraDefeated>0)improved++;
    }
    expect(improved).toBeGreaterThan(0);
  });
});
