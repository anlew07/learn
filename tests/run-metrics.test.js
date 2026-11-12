import { describe, expect, it } from "vitest";
import Engine from "../src/engine.js";
import {
  getWorldMetrics, recordWorldAction, recordWaveOutcome, recordBuildChoice,
} from "../src/systems/run-metrics.js";

describe("recorded game actions never grant extra rewards", () => {
  it("captures one main action per active world and does not invent wave rewards", () => {
    const state=Engine.fresh("metrics-plain",1,false);
    Engine.step(state);
    for (const world of state.worlds) {
      const metrics=getWorldMetrics(world);
      expect(Object.values(metrics.actions).reduce((a,b)=>a+b,0)).toBe(1);
      expect(metrics.waveCombats).toBe(0);
      expect(metrics.extraXp).toBe(0);
    }
  });

  it("records actual per-wave improvements without a second main action", () => {
    const state=Engine.fresh("metrics-waves",1,true);
    const world=Engine.byId(state,"zombie");
    world.level=2;
    world.strategy="clear";
    world.threat={id:"test-nest",status:"active",progress:0,retryDay:1};
    world.build.attack=[{id:"blades",lv:1}];
    world.build.support=[{id:"armor",lv:1}];
    world.build.evolved=true;
    world.build.evolutionName="钢雨防线";
    Engine.step(state);
    const m=getWorldMetrics(world);
    expect(m.actions.fight).toBe(1);
    expect(m.waveCombats).toBe(1);
    expect(m.extraXp).toBe(world.lastCombat.bonus.xp);
    expect(m.extraDoomReduction).toBe(world.lastCombat.bonus.doomReduced);
    expect(Object.values(m.actions).reduce((a,b)=>a+b,0)).toBe(1);
    expect(world.threat.progress).toBe(1);
  });

  it("tracks a manual evolution only after valid build selection", () => {
    const state=Engine.fresh("metrics-build",1,true),world=Engine.byId(state,"zombie");
    world.build.attack=[{id:"blades",lv:1}];world.build.count=1;
    world.build.pending={id:"choice",reason:"test",options:["armor"],due:3};
    expect(Engine.chooseBuild(state,"zombie","armor",false).ok).toBe(true);
    expect(world.build.evolved).toBe(true);
    expect(world.metrics.manualBuilds).toBe(1);
    expect(world.metrics.evolutions).toBe(1);
    expect(Engine.chooseBuild(state,"zombie","armor",false).ok).toBe(false);
    expect(world.metrics.manualBuilds).toBe(1);
  });

  it("recreates optional metrics for a same-version older test save", () => {
    const state=Engine.fresh("metrics-legacy",1,false);
    state.worlds.forEach(w=>{delete w.metrics;});
    Engine.step(state);
    expect(getWorldMetrics(state.worlds[0]).actions.growth).toBe(1);
    expect(getWorldMetrics(state.worlds[0]).waveCombats).toBe(0);
  });

  it("aggregators are pure counters and do not change world combat state", () => {
    const world={resource:7,xp:14,d:25};
    const before={resource:world.resource,xp:world.xp,d:world.d};
    recordWorldAction(world,"fight");
    recordWaveOutcome(world,{xp:0.5,resource:0.25,doomReduced:0.1});
    recordBuildChoice(world,true,true);
    expect([world.resource,world.xp,world.d]).toEqual([before.resource,before.xp,before.d]);
    expect(world.metrics.actions.fight).toBe(1);
    expect(world.metrics.automaticBuilds).toBe(1);
    expect(world.metrics.evolutions).toBe(1);
  });
});
