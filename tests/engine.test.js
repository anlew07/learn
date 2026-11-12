import { describe, expect, it } from "vitest";
import Engine from "../src/engine.js";

function simulate(seed, runNumber=1, waves=false, days=35) {
  const s=Engine.fresh(seed,runNumber,waves);
  for(let i=0;i<days&&s.active;i++) Engine.step(s);
  return s;
}

describe("multiworld simulation baseline",()=>{
  it("opens 2 worlds on the first run and 3 on the third",()=>{
    expect(Engine.fresh("a",1,false).worlds.map(w=>w.id)).toEqual(["lingzai","zombie"]);
    expect(Engine.fresh("a",3,false).worlds.map(w=>w.id)).toEqual(["lingzai","zombie","beast"]);
  });
  it("is reproducible from a seed with saved independent random streams",()=>{
    const a=simulate("determinism",3,true,45),b=simulate("determinism",3,true,45);
    expect(a).toEqual(b);
    expect(JSON.parse(JSON.stringify(a))).toEqual(a);
    expect(a.worlds[0].rng).not.toEqual(a.worlds[1].rng);
  });
  it("does not add another main action merely by enabling wave rendering",()=>{
    const a=simulate("wave-off-on",1,false,1),b=simulate("wave-off-on",1,true,1);
    for(let i=0;i<2;i++){
      const w=a.worlds[i],z=b.worlds[i];
      expect([w.level,w.xp,w.resource,w.p,w.d]).toEqual([z.level,z.xp,z.resource,z.p,z.d]);
      expect(w.action).toEqual(z.action);
    }
  });
  it("gives capped build benefits only once per combat action",()=>{
    const base=Engine.fresh("combat-bonus",1,false);
    const variant=Engine.fresh("combat-bonus",1,true);
    for(const s of [base,variant]){
      const w=Engine.byId(s,"zombie");
      w.level=2;w.resource=12;w.p=10;w.d=22;w.strategy="clear";
      w.build.attack=[{id:"blades",lv:2},{id:"arc",lv:1}];
      w.build.support=[{id:"armor",lv:2}];
      w.build.evolved=true;
      w.threat={id:"same",status:"active",progress:0,retryDay:1};
    }
    Engine.step(base);Engine.step(variant);
    const a=Engine.byId(base,"zombie"),b=Engine.byId(variant,"zombie");
    expect(a.threat.progress).toBe(1);
    expect(b.threat.progress).toBe(1);
    expect(b.xp-a.xp).toBeGreaterThan(0);
    expect(b.xp-a.xp).toBeLessThanOrEqual(0.5);
    expect(b.resource-a.resource).toBeGreaterThan(0);
    expect(b.resource-a.resource).toBeLessThanOrEqual(0.25);
    expect(a.d-b.d).toBeGreaterThan(0);
    expect(a.d-b.d).toBeLessThanOrEqual(0.25);
  });
  it("still reaches a legitimate end when nobody intervenes",()=>{
    for(let i=0;i<10;i++){
      const s=Engine.fresh("auto-"+i,3,i%2===0);
      for(let d=0;d<150&&s.active;d++)Engine.step(s);
      expect(s.active).toBe(false);
      expect(s.result).toBeDefined();
      expect(s.worlds.every(w=>w.status!=="running")).toBe(true);
    }
  });
  it("filters illegal worlds and rejects strategy actions that have no meaning",()=>{
    const s=Engine.fresh("strategy",1,false);
    expect(Engine.setStrategy(s,"missing","growth").ok).toBe(false);
    expect(Engine.setStrategy(s,"lingzai","bad").ok).toBe(false);
    expect(Engine.setStrategy(s,"lingzai","growth").ok).toBe(true);
  });
});

describe("growth, threats and endings",()=>{
  it("does not finalize the world solely because P reaches 100",()=>{
    const s=Engine.fresh("p100",1,false),w=Engine.byId(s,"zombie");
    w.p=100;w.flags.p65=true;w.flags.p100=true;w.level=2;w.resource=50;
    expect(Engine.canFinal(s,w,0)).toBe(false);
    w.level=4;
    expect(Engine.canFinal(s,w,0)).toBe(true);
  });
  it("allows finishing on the deadline day if it is not destroyed",()=>{
    const s=Engine.fresh("deadline",1,false),w=Engine.byId(s,"lingzai");
    s.day=w.deadline;w.p=100;w.flags.p65=true;w.flags.p100=true;w.level=3;w.resource=10;w.d=30;
    Engine.step(s);
    expect(w.status).toBe("saved");
  });
  it("makes D=100 collapse even when final preparation is ready",()=>{
    const s=Engine.fresh("doom",1,false),w=Engine.byId(s,"lingzai");
    w.p=100;w.flags.p65=true;w.flags.p100=true;w.level=4;w.resource=10;w.d=99.9;
    Engine.step(s);
    expect(w.status).toBe("failed");
  });
  it("supports an independent path through the enraged beast king",()=>{
    const s=Engine.fresh("beast-solo",3,false),w=Engine.byId(s,"beast");
    s.day=71;w.level=4;w.xp=90;w.p=100;w.flags.p65=true;w.flags.p100=true;w.resource=18;w.d=10;
    Engine.step(s);expect(w.suppression).toBe(1);
    Engine.step(s);
    expect(w.status).toBe("saved");
    expect(w.resource).toBe(0);
  });
  it("allows a threatened world to keep acting while the other is in seclusion",()=>{
    const s=Engine.fresh("seclusion",1,false),a=Engine.byId(s,"lingzai"),b=Engine.byId(s,"zombie");
    a.level=2;
    expect(Engine.retreat(s,"lingzai",4).ok).toBe(true);
    const r=b.resource,p=b.p,d=b.d;
    Engine.step(s);
    expect(a.retreat.remaining).toBe(3);
    expect(b.resource!==r||b.p!==p||b.d!==d).toBe(true);
    expect(Engine.availableAP(s)).toBe(s.ap-1);
  });
  it("does not automatically force an impossible fusion during seclusion",()=>{
    const s=Engine.fresh("seclusion-fusion",2,false),a=Engine.byId(s,"lingzai"),b=Engine.byId(s,"zombie");
    a.level=2;
    Engine.retreat(s,"lingzai",4);
    b.p=100;b.flags.p65=true;b.flags.p100=true;b.level=3;b.resource=12;
    expect(Engine.fuse(s,"zombie").ok).toBe(false);
  });
});

describe("soul links and combat build",()=>{
  it("refuses to spend resources and soul for an invalid aid",()=>{
    const s=Engine.fresh("aid-reject",1,false);
    const before=JSON.stringify(s);
    expect(Engine.aid(s,"lingzai","lingzai","p").ok).toBe(false);
    expect(Engine.aid(s,"lingzai","zombie","other").ok).toBe(false);
    expect(JSON.stringify(s)).toBe(before);
  });
  it("uses one target cooldown across both aid modes",()=>{
    const s=Engine.fresh("aid",1,false),from=Engine.byId(s,"lingzai"),to=Engine.byId(s,"zombie");
    expect(Engine.aid(s,from.id,to.id,"p").ok).toBe(true);
    expect(s.aidNext.zombie).toBe(10);
    expect(Engine.aid(s,from.id,to.id,"d").ok).toBe(false);
    s.day=9;s.ap=4;from.resource=20;
    expect(Engine.aid(s,from.id,to.id,"d").ok).toBe(false);
    s.day=10;to.d=12;expect(Engine.aid(s,from.id,to.id,"d").ok).toBe(true);
  });
  it("lets second-run fusion resolve a valid boss once",()=>{
    const s=Engine.fresh("duo",2,false),a=Engine.byId(s,"lingzai"),b=Engine.byId(s,"zombie");
    a.level=2;b.level=3;b.p=100;b.flags.p65=true;b.flags.p100=true;b.resource=12;
    expect(Engine.fuse(s,"zombie").ok).toBe(true);
    expect(b.status).toBe("saved");
    expect(s.fusionNext).toBe(14);
    expect(s.echoes.length).toBe(1);
    expect(Engine.fuse(s,"zombie").ok).toBe(false);
    expect(s.echoes.length).toBe(1);
  });
  it("can use three-person strength but not bypass final base level",()=>{
    const s=Engine.fresh("trio",3,false),b=Engine.byId(s,"beast");
    s.ap=4;s.soul=8;b.p=100;b.flags.p65=true;b.flags.p100=true;b.resource=14;b.level=2;b.phase="狂化";
    expect(Engine.fuse(s,"beast").ok).toBe(false);
    b.level=3;s.worlds.forEach(w=>{if(w.id!=="beast")w.level=2;});
    expect(Engine.fuse(s,"beast").ok).toBe(true);
    expect(b.status).toBe("saved");expect(s.soul).toBe(6);
  });
  it("offers seeded build choices and cannot take the same offer twice",()=>{
    const s=Engine.fresh("build",1,true),w=Engine.byId(s,"lingzai");
    w.xp=14;
    Engine.step(s);
    expect(w.build.pending).not.toBe(null);
    const choice=w.build.pending.options[0];
    expect(Engine.chooseBuild(s,"lingzai",choice,false).ok).toBe(true);
    expect(Engine.chooseBuild(s,"lingzai",choice,false).ok).toBe(false);
  });
});
