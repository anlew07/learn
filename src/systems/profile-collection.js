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

/** Cosmetic titles are equipped independently of run state. */
export const ARCHIVE_TITLES = Object.freeze([
  Object.freeze({
    id: "title/tea-coffee",
    label: "末日茶咖联络员",
    required: Object.freeze(["crossworld/tea-and-coffee"]),
  }),
  Object.freeze({
    id: "title/beast-night",
    label: "兽潮夜游人",
    required: Object.freeze(["beast/dancing-beasts"]),
  }),
  Object.freeze({
    id: "title/holiday-chair",
    label: "末日休假协会会长",
    required: Object.freeze(DISCOVERIES.map((item) => item.id)),
  }),
]);

export function availableArchiveTitles(profile) {
  const ids = new Set(Array.isArray(profile?.secretArchive) ? profile.secretArchive : []);
  return ARCHIVE_TITLES.map((title) => ({
    id: title.id,
    label: title.label,
    available: title.required.every((id) => ids.has(id)),
  }));
}

export function previewEquipArchiveTitle(profile, titleId) {
  if (titleId === "") return { ok: true, titleId: "" };
  const choice = availableArchiveTitles(profile).find((title) => title.id === titleId);
  if (!choice) return { ok: false, reason: "未知纪念称号" };
  if (!choice.available) return { ok: false, reason: "尚未解锁这个纪念称号" };
  return { ok: true, titleId };
}

export function equipArchiveTitle(profile, titleId) {
  const preview = previewEquipArchiveTitle(profile, titleId);
  if (!preview.ok) return { ok: false, reason: preview.reason, profile };
  return { ok: true, profile: { ...profile, selectedTitle: titleId } };
}

export function selectedArchiveTitle(profile) {
  const title = availableArchiveTitles(profile).find(
    (item) => item.id === profile?.selectedTitle && item.available,
  );
  return title?.label || "";
}
