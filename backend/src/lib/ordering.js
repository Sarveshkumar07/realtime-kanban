// Fractional indexing: every item has a numeric `position`. Inserting between two
// neighbours takes the midpoint, so a move touches exactly ONE document (O(1)),
// instead of renumbering the whole column. If midpoints get too close we renumber once.
export const GAP = 1024;

async function rebalance(Model, scope) {
  const docs = await Model.find(scope).sort({ position: 1, _id: 1 }).select('_id');
  if (!docs.length) return;
  await Model.bulkWrite(docs.map((d, i) => ({ updateOne: { filter: { _id: d._id }, update: { $set: { position: (i + 1) * GAP } } } })));
}

/**
 * Position is derived from NEIGHBOURS ("after X" / "before Y"), never from a stale index.
 * That is what makes concurrent drag & drop safe: if the neighbour moved or vanished in
 * the meantime we still land next to it (or at the end), and nothing is overwritten.
 */
export async function computePosition(Model, scope, { afterId, beforeId, excludeId } = {}, depth = 0) {
  const base = excludeId ? { ...scope, _id: { $ne: excludeId } } : { ...scope };
  const edge = (extra, dir) => Model.findOne({ ...base, ...extra }).sort({ position: dir });
  let prev = null;
  let next = null;

  if (afterId) {
    prev = await Model.findOne({ ...base, _id: afterId });
    if (prev) next = await edge({ position: { $gt: prev.position } }, 1);
  }
  if (!prev && beforeId) {
    next = await Model.findOne({ ...base, _id: beforeId });
    if (next) prev = await edge({ position: { $lt: next.position } }, -1);
  }
  if (!prev && !next) prev = await edge({}, -1); // default: append to the end

  if (prev && next) {
    if (next.position - prev.position < 1e-6 && depth === 0) {
      await rebalance(Model, scope);
      const again = await computePosition(Model, scope, { afterId, beforeId, excludeId }, 1);
      return { ...again, rebalanced: true };
    }
    return { position: (prev.position + next.position) / 2, rebalanced: false };
  }
  if (prev) return { position: prev.position + GAP, rebalanced: false };
  if (next) return { position: next.position - GAP, rebalanced: false };
  return { position: GAP, rebalanced: false };
}
