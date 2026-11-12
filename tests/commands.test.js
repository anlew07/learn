import { describe, expect, it } from "vitest";
import Engine from "../src/engine.js";

describe("persisted, idempotent player commands",()=>{
  it("applies resource aid exactly once when the same ID is replayed",()=>{
    const state=Engine.fresh("command-aid",2,false);
    const command={operationId:"request-001",type:"aid",args:["lingzai","zombie","p"]};
    const first=Engine.applyCommand(state,command);
    expect(first.ok).toBe(true);
    const snapshot=JSON.stringify(state);
    const repeated=Engine.applyCommand(state,command);
    expect(repeated.ok).toBe(true);
    expect(repeated.replayed).toBe(true);
    expect(JSON.stringify(state)).toBe(snapshot);

    const restored=JSON.parse(snapshot);
    const resumed=Engine.applyCommand(restored,command);
    expect(resumed.ok).toBe(true);
    expect(resumed.replayed).toBe(true);
    expect(JSON.stringify(restored)).toBe(snapshot);
  });

  it("rejects an operation ID being reused for different arguments",()=>{
    const state=Engine.fresh("command-conflict",1,false);
    const first=Engine.applyCommand(state,{
      operationId:"req-2",type:"strategy",args:["lingzai","clear"],
    });
    expect(first.ok).toBe(true);
    const before=JSON.stringify(state);
    const conflicting=Engine.applyCommand(state,{
      operationId:"req-2",type:"strategy",args:["lingzai","rescue"],
    });
    expect(conflicting.ok).toBe(false);
    expect(JSON.stringify(state)).toBe(before);
  });

  it("records failed operations without trying them again after a later upgrade",()=>{
    const state=Engine.fresh("command-denied",1,false);
    const command={operationId:"req-denied",type:"retreat",args:["lingzai",4]};
    expect(Engine.applyCommand(state,command).ok).toBe(false);
    Engine.byId(state,"lingzai").level=2;
    const before=JSON.stringify(state);
    const again=Engine.applyCommand(state,command);
    expect(again.ok).toBe(false);
    expect(again.replayed).toBe(true);
    expect(JSON.stringify(state)).toBe(before);
  });

  it("rejects malformed or unsupported commands without changing the run",()=>{
    const state=Engine.fresh("command-invalid",1,false);
    const before=JSON.stringify(state);
    expect(Engine.applyCommand(state,{operationId:"",type:"aid",args:[]}).ok).toBe(false);
    expect(Engine.applyCommand(state,{operationId:"ok",type:"debug",args:[]}).ok).toBe(false);
    expect(JSON.stringify(state)).toBe(before);
  });
});
