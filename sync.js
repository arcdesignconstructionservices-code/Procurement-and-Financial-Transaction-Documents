/* ============================================================
   ARC Inventory — three-way merge for multi-device sync
   When two devices change the data at the same time, the server
   refuses the second save (version conflict) and sends back its
   copy. The app then merges:
     base   = the copy this device last synced with the database
     local  = this device's current data
     remote = the database's current data
   Rules: whatever only one side changed is kept; things changed on
   both sides go field by field, and where the very same field was
   changed on both sides this device's value wins. Lists of records
   (items, categories, people, log entries …) are matched by id, so
   items added, edited or removed on either device all survive.
   ============================================================ */
function syncEq(a, b) {
  if (a === b) return true;
  if (a === null || b === null || typeof a !== 'object' || typeof b !== 'object') return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a)) { if (a.length !== b.length) return false; for (let i = 0; i < a.length; i++) if (!syncEq(a[i], b[i])) return false; return true; }
  const ka = Object.keys(a).filter(k => a[k] !== undefined), kb = Object.keys(b).filter(k => b[k] !== undefined);
  if (ka.length !== kb.length) return false;
  for (const k of ka) if (!syncEq(a[k], b[k])) return false;
  return true;
}
const syncIsObj = v => v !== null && typeof v === 'object' && !Array.isArray(v);
/* The field that identifies records in a list: 'id' (items, groups, people, log) or 'k' (columns). */
function syncKeyOf(...lists) {
  const all = lists.filter(Array.isArray).flat();
  if (!all.length) return null;
  for (const key of ['id', 'k']) if (all.every(x => syncIsObj(x) && (typeof x[key] === 'string' || typeof x[key] === 'number'))) return key;
  return null;
}

function syncMerge(base, local, remote) {
  if (syncEq(local, remote)) return local;
  if (syncEq(local, base)) return remote;      // only the database changed
  if (syncEq(remote, base)) return local;      // only this device changed
  if (syncIsObj(local) && syncIsObj(remote)) return syncMergeObj(syncIsObj(base) ? base : {}, local, remote);
  if (Array.isArray(local) && Array.isArray(remote)) {
    const b = Array.isArray(base) ? base : [];
    const key = syncKeyOf(b, local, remote);
    if (key) return syncMergeList(key, b, local, remote);
    if ([...b, ...local, ...remote].every(x => typeof x === 'string')) return syncMergeSet(b, local, remote);
  }
  return local;                                // same value changed on both sides: this device wins
}
function syncMergeObj(base, local, remote) {
  const out = {};
  new Set([...Object.keys(remote), ...Object.keys(local)]).forEach(k => {
    const v = syncMerge(base[k], local[k], remote[k]);
    if (v !== undefined) out[k] = v;           // undefined = removed
  });
  return out;
}
/* Lists of records: keep the database's order, drop what either side removed, add what either side added. */
function syncMergeList(key, base, local, remote) {
  const B = new Map(base.map(x => [x[key], x])), L = new Map(local.map(x => [x[key], x])), R = new Map(remote.map(x => [x[key], x]));
  const out = [], seen = new Set();
  const take = id => {
    if (seen.has(id)) return; seen.add(id);
    const b = B.get(id), l = L.get(id), r = R.get(id);
    if (b !== undefined && l === undefined && r !== undefined && syncEq(r, b)) return;   // removed here, untouched there
    if (b !== undefined && r === undefined && l !== undefined && syncEq(l, b)) return;   // removed there, untouched here
    const v = r === undefined ? l : l === undefined ? r : syncMerge(b, l, r);
    if (v !== undefined) out.push(v);
  };
  remote.forEach(x => take(x[key]));
  local.forEach(x => take(x[key]));
  if (out.length && out.every(x => typeof x.ts === 'number')) out.sort((a, b) => b.ts - a.ts);   // logs: newest first
  return out;
}
/* Plain text lists (statuses, locations). */
function syncMergeSet(base, local, remote) {
  const removed = new Set([...base.filter(x => !local.includes(x)), ...base.filter(x => !remote.includes(x))]);
  const out = [];
  [...remote, ...local].forEach(x => { if (!removed.has(x) && !out.includes(x)) out.push(x); });
  return out;
}
if (typeof module !== 'undefined') module.exports = { syncMerge, syncEq };
