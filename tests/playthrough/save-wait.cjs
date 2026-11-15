'use strict';
// Issue #32 A: "the autosave is done" means the COMMITTED IndexedDB record of this village (S2Runtime.engine.read)
// carries the change we made, in a revision newer than the one committed before the change. A gold value alone
// is not enough: an older autosave already had it. Pure helpers, so the decision can be unit-tested
// (save-wait.test.cjs) and the browser only reads the record.

// What a committed autosave record says, in the terms the playthrough checks.
function committedSummary(record) {
  if (!record || !record.snapshot || !record.snapshot.payload) return null;
  const run = record.snapshot.payload.run || {};
  const workers = Array.isArray(run.characters) ? run.characters : [];
  return {
    villageId: record.id,
    revision: record.revision,
    saveVersion: record.snapshot.payload.saveVersion,
    gold: run.gold,
    workers: workers.length,
    assignments: workers.map(w => w.resource),
  };
}

// want: { villageId, afterRevision, gold, workers, assignments }. Returns { ready, reasons, committed } so a
// timeout shows exactly which part of the committed record was still missing.
function commitReady(record, want) {
  const c = committedSummary(record), reasons = [];
  if (!c) return { ready: false, reasons: ['저장 레코드 없음'], committed: null };
  if (c.villageId !== want.villageId) reasons.push(`다른 마을 ${c.villageId}`);
  if (!(c.revision > want.afterRevision)) reasons.push(`revision ${c.revision} ≤ 기준 ${want.afterRevision} (변경 이후 커밋 아님)`);
  if (c.gold !== want.gold) reasons.push(`골드 ${c.gold} ≠ ${want.gold}`);
  if (c.workers !== want.workers) reasons.push(`인부 ${c.workers} ≠ ${want.workers}`);
  if (JSON.stringify(c.assignments) !== JSON.stringify(want.assignments)) reasons.push(`배치 ${JSON.stringify(c.assignments)} ≠ ${JSON.stringify(want.assignments)}`);
  return { ready: reasons.length === 0, reasons, committed: c };
}

module.exports = { committedSummary, commitReady };
