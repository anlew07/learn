import { EASTER_EGGS, CROSSWORLD_SECRETS } from "./easter-eggs.js";

/**
 * Account-level cosmetic archive. No gameplay effects and no migration:
 * an old profile without secretArchive is treated as empty.
 *
 * Stable IDs from the existing game state are the only accepted entries.
 */
const DISCOVERIES = Object.freeze([
  ...Object.values(EASTER_EGGS).map((item) => ({
    id: item.id,
    title: item.title,
    type: "world",
  })),
  ...CROSSWORLD_SECRETS.map((item) => ({
    id: item.id,
    title: item.title,
    type: "crossworld",
  })),
]);
const KNOWN_IDS = new Set(DISCOVERIES.map((item) => item.id));

export function mergeProfileSecrets(profile, run) {
  const existing = Array.isArray(profile?.secretArchive)
    ? profile.secretArchive.filter((id) => KNOWN_IDS.has(id))
    : [];
  const ids = new Set(existing);
  for (const world of run?.worlds || []) {
    const definition = EASTER_EGGS[world.id];
    if (definition && world.flags?.easterEggs?.includes(definition.id)) {
      ids.add(definition.id);
    }
  }
  for (const id of run?.crossworldSecrets || []) {
    if (KNOWN_IDS.has(id)) ids.add(id);
  }
  return { ...(profile || {}), secretArchive: DISCOVERIES.map((item) => item.id).filter((id) => ids.has(id)) };
}

export function summarizeProfileSecrets(profile) {
  const foundIds = new Set(Array.isArray(profile?.secretArchive) ? profile.secretArchive : []);
  const entries = DISCOVERIES.map((item) => {
    const found = foundIds.has(item.id);
    return {
      id: item.id,
      type: item.type,
      found,
      title: found ? item.title : "？？？",
    };
  });
  const found = entries.filter((entry) => entry.found).length;
  return {
    found,
    total: entries.length,
    complete: found === entries.length,
    entries,
  };
}
