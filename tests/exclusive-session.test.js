import { describe, expect, it } from "vitest";
import { createExclusiveSession } from "../src/services/exclusive-session.js";

function mockLockManager() {
  let occupied = false;
  return {
    async request(name, options, callback) {
      expect(options.ifAvailable).toBe(true);
      if (occupied) return callback(null);
      occupied = true;
      try {
        return await callback({ name });
      } finally {
        occupied = false;
      }
    },
  };
}

describe("single-writer session ownership", () => {
  it("only allows one tab to hold the write lock", async () => {
    const locks = mockLockManager();
    const first = createExclusiveSession({ locks });
    const second = createExclusiveSession({ locks });

    expect(await first.acquire()).toBe(true);
    expect(first.isOwner).toBe(true);
    expect(await second.acquire()).toBe(false);
    expect(second.isOwner).toBe(false);

    await first.release();
    expect(first.isOwner).toBe(false);
    expect(await second.acquire()).toBe(true);
    await second.release();
  });

  it("deduplicates concurrent requests and reclaims after closing the old tab", async () => {
    const locks = mockLockManager();
    const first = createExclusiveSession({ locks });
    const attempts = await Promise.all([first.acquire(), first.acquire(), first.acquire()]);
    expect(attempts).toEqual([true, true, true]);
    expect(first.isOwner).toBe(true);
    await first.release();
    expect(await first.acquire()).toBe(true);
    await first.release();
  });

  it("fails closed when Web Locks is unavailable", async () => {
    const unsupported = createExclusiveSession({ locks: null });
    expect(unsupported.supported).toBe(false);
    expect(await unsupported.acquire()).toBe(false);
    expect(unsupported.isOwner).toBe(false);
  });

  it("notifies the caller when the owner releases its lock", async () => {
    let lost = 0;
    const session = createExclusiveSession({
      locks: mockLockManager(),
      onLost: () => {
        lost++;
      },
    });
    expect(await session.acquire()).toBe(true);
    await session.release();
    expect(lost).toBe(1);
  });
});
