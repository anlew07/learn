import { describe, expect, it } from "vitest";
import Engine from "../src/engine.js";
import { previewMajorEvent, CLUE_DETAILS } from "../src/systems/event-contract.js";

function fixture(kind="clue",id="lingzai",run=1,level=2) {
  const state=Engine.fresh("event-preview",run,false),world=Engine.byId(state,id);
  world.level=level;
  world.pendingEvent={id:id+"/event/1",type:kind,title:kind==="boss"?"巢群首领":"古老线索",state:"active",expiresDay:state.day+2};
  if(kind==="boss")world.threat={id:"nest",status:"awaiting_alpha",progress:2,retryDay:1};
  return {state,world};
}

describe("major event choice contract",()=>{
  it("shows exact rewards and risk without advancing RNG",()=>{
    const {state,world}=fixture(),before=JSON.stringify(state);
    const preview=previewMajorEvent(state,world);
    expect(preview.defaultOutcome).toContain("P+2");
    expect(preview.options.find(x=>x.id==="push").summary).toContain("65%");
    expect(preview.options.find(x=>x.id==="push").summary).toContain("35%");
    expect(JSON.stringify(state)).toBe(before);
  });
  it("rejects actions without unreserved AP and does not mutate state",()=>{
    const {state,world}=fixture();
    state.ap=1;state.apReserved=1;
    expect(previewMajorEvent(state,world).options.find(x=>x.id==="push").available).toBe(false);
    const before=JSON.stringify(state);
    expect(Engine.resolveEvent(state,world.id,"push").ok).toBe(false);
    expect(JSON.stringify(state)).toBe(before);
  });
  it("has world-specific guaranteed safe options with readable success bonuses",()=>{
    for(const id of ["lingzai","zombie","beast"]){
      const {state,world}=fixture("clue",id,3);
      expect(previewMajorEvent(state,world).options[1].summary).toContain(CLUE_DETAILS[id].success);
      expect(Engine.resolveEvent(state,id,"safe").ok).toBe(true);
      expect(world.p).toBe(2);
      expect(world.pendingEvent).toBeNull();
    }
  });
  it("rejects invalid boss choices but permits a legal free fight",()=>{
    const {state,world}=fixture("boss","zombie",1,3);
    const before=JSON.stringify(state);
    expect(Engine.resolveEvent(state,world.id,"safe").ok).toBe(false);
    expect(JSON.stringify(state)).toBe(before);
    expect(Engine.resolveEvent(state,world.id,"fight").ok).toBe(true);
    expect(world.threat.status).toBe("cleared");
  });
  it("rejects boost when injured effective level is too low",()=>{
    const {state,world}=fixture("boss","lingzai",1,2);
    world.injuryUntil=state.day+3;world.resource=10;
    const before=JSON.stringify(state);
    expect(previewMajorEvent(state,world).options.find(x=>x.id==="boost").available).toBe(false);
    expect(Engine.resolveEvent(state,world.id,"boost").ok).toBe(false);
    expect(JSON.stringify(state)).toBe(before);
  });
  it("charges only once for a successful paid boost",()=>{
    const {state,world}=fixture("boss","lingzai",1,2);
    world.resource=5;
    expect(Engine.resolveEvent(state,world.id,"boost").ok).toBe(true);
    expect(world.resource).toBe(4);
    expect(state.ap).toBe(1);
    expect(Engine.resolveEvent(state,world.id,"boost").ok).toBe(false);
  });
  it("requeues the boss after retreat and allows a later Lv3 challenge",()=>{
    const {state,world}=fixture("boss","lingzai",1,2);
    expect(Engine.resolveEvent(state,world.id,"retreat").ok).toBe(true);
    const retry=world.threat.retryDay;
    for(let i=0;i<10&&state.active;i++){
      if(state.day===retry)world.level=3;
      Engine.step(state);
    }
    expect(world.flags.bossDefeated).toBe(true);
    expect(world.threat.status).toBe("cleared");
  });
  it("makes a successful risky investigation produce a world-specific benefit",()=>{
    for(const id of ["lingzai","zombie","beast"]){
      let success=false;
      for(let i=0;i<60&&!success;i++){
        const state=Engine.fresh("investigate-success-"+i,3,false);
        const world=Engine.byId(state,id);
        world.pendingEvent={id:"clue",type:"clue",title:"线索",state:"active",expiresDay:4};
        const beforeResources=world.resource;
        const beforeAP=state.ap;
        expect(Engine.resolveEvent(state,id,"push").ok).toBe(true);
        expect(state.ap).toBe(beforeAP-1);
        if(world.p!==5)continue;
        success=true;
        if(id==="lingzai"){
          expect(world.flags.ancientSeal).toBe(true);
          expect(world.resource).toBe(beforeResources+2);
        }else if(id==="zombie")expect(world.flags.weakness).toBe(true);
        else expect(world.suppression).toBe(1);
      }
      expect(success).toBe(true);
    }
  });

  it("automatically uses the safe clue default at expiry",()=>{
    const {state,world}=fixture();
    world.pendingEvent.expiresDay=state.day;
    world.flags.sideFound=true;
    Engine.step(state);
    expect(world.flags.sideResolved).toBe(true);
    expect(world.pendingEvent).toBeNull();
    expect(world.p).toBeGreaterThanOrEqual(2);
    expect(state.ap).toBe(2);
  });

  it("allows legitimate second-run fusion via the event option",()=>{
    const {state,world}=fixture("boss","zombie",2,2);
    Engine.byId(state,"lingzai").level=2;
    expect(previewMajorEvent(state,world).options.find(x=>x.id==="fusion").available).toBe(true);
    expect(Engine.resolveEvent(state,world.id,"fusion").ok).toBe(true);
    expect(world.threat.status).toBe("cleared");
  });
});
