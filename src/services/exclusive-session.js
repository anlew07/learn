/**
 * A single authoritative writer per browser origin.
 *
 * navigator.locks is a native browser API; no timers, localStorage heartbeat,
 * or custom cross-tab leader election is necessary. Without Web Locks, the
 * game is read-only rather than risking conflicting saves.
 */
export const GAME_SESSION_LOCK = "simultaneous-apocalypse-active-session-v1";

export function createExclusiveSession({
  locks = globalThis.navigator?.locks,
  onLost = () => {},
} = {}) {
  let held = false;
  let acquiring = null;
  let releaseHold = null;
  let lockTask = null;

  function acquire() {
    if (held) return Promise.resolve(true);
    if (acquiring) return acquiring;
    if (!locks?.request) return Promise.resolve(false);

    let announce;
    const outcome = new Promise((resolve) => {
      announce = resolve;
    });

    lockTask = Promise.resolve()
      .then(() =>
        locks.request(GAME_SESSION_LOCK, { mode: "exclusive", ifAvailable: true }, async (lock) => {
          if (!lock) {
            announce(false);
            return;
          }

          held = true;
          const lifetime = new Promise((resolve) => {
            releaseHold = resolve;
          });
          announce(true);
          try {
            await lifetime;
          } finally {
            held = false;
            releaseHold = null;
            onLost();
          }
        }),
      )
      .catch(() => {
        if (held) {
          held = false;
          releaseHold = null;
          onLost();
        }
        announce(false);
      });

    acquiring = outcome.finally(() => {
      acquiring = null;
    });
    return acquiring;
  }

  async function release() {
    if (!held || !releaseHold) return;
    releaseHold();
    await lockTask;
  }

  return {
    acquire,
    release,
    get isOwner() {
      return held;
    },
    get supported() {
      return Boolean(locks?.request);
    },
  };
}
