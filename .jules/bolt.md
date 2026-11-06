## 2026-11-06 - Single-pass redaction in db.addItems()

**Learning:** `db.addItems()` redacted every item twice: once inside `keep(redactItem(i), gone)` in the filter, and again in `.map(redactItem)`. Restructuring to a single pass (redact once, check both original and redacted forms, store the redacted row) removes one `redactItem()` call per item. The object-spread overhead of caching the redacted copy on the item outweighs the savings — the win comes from eliminating the second full `redactItem()` invocation, not from avoiding object creation.

**Action:** ~15-21% faster at 2K-5K items (20→17 µs/item). Benchmark with varied item counts and mail/non-mail mixes. Don't cache redacted results on items as properties — the spread overhead cancels the gain.

## 2026-11-06 - Min-heap top-k selection in meaning.nearest()

**Learning:** `meaning.nearest()` scored every vector in the vault, sorted all n results, then sliced the top k. For a vault with tens of thousands of quantized embedding vectors this is O(n log n) time and O(n) memory when only the top k (10-100) are needed. Replacing the full sort with a min-heap of size k reduces selection to O(n log k) time, O(k) memory, with identical results.

**Action:** When search performance is being measured, benchmark `nearest()` with mocked `ready`/`embed` and realistic vector counts (5K-40K). The heap change is ~2x faster for the selection phase alone and ~20% faster end-to-end at 10K-20K vectors. Do not introduce new formatting tools (prettier) that reformat unrelated code — match the existing file style.

## 2026-11-06 - Cache replyQuestion result in db.tasks()

**Learning:** `db.tasks()` called `replyQuestion(r)` 2-3 times per row: once inside `actionTitle()` (which calls it internally), once directly at `if (replyQuestion(r))`, and once inside `actionCard()` when card is 'appointment'. `owner()` was also called 1-3 times per row via default parameters. Caching `replyQuestion(r)` once per row and passing `me`/`asked` to `actionTitle()`/`actionCard()` eliminates redundant regex matching and `owner()` array operations.

**Action:** ~28% faster at 2K tasks (181→130ms). Export `owner()` from `owner-action.mjs` for use in `tasks.mjs`. Add optional `precomputedAsked` parameter to `actionTitle()` and optional `me`/`precomputedAsked` to `actionCard()` (backwards-compatible). Move `db.prepare('select source from items where id = ?')` outside the per-row loop.

## 2026-11-06 - Stream vectors via .iterate() + min-heap in meaning.nearest() (memory)

**Learning:** `meaning.nearest()` used `.all()` which materializes ALL n vector rows + their 260-byte quantized blobs in memory (O(n)) before selecting top k. At 100K vectors this peaked at ~185 MB heap. Switching to `.iterate()` (streams one row at a time) + a min-heap of size k (O(k) memory held at once) cut peak heap to ~26 MB — an ~86% memory reduction. Time also improves O(n log n)→O(n log k).

**App Nap:** Considered macOS App Nap for background resource throttling, but it's primarily an energy/CPU feature (not memory), requires new native bindings/`osascript` (a dependency + architectural change needing approval), and doesn't address the vector materialization. Skip without owner approval.

**Action:** Benchmark memory with varied vector counts (10K-500K). The heap+iterate change is correct: with deterministic ORDER BY, top-k IDs match `.all().map().sort().slice()` exactly. Without ORDER BY, tie-breaking was already non-deterministic in the original (no ORDER BY), so no correctness regression.

## 2026-11-07 - Precompute people(me) once per tasks() call; fix null-?? re-call bug

**Learning:** The earlier "cache replyQuestion in db.tasks()" optimization was ineffective: `precomputedAsked = null` combined with `null ?? replyQuestion()` always re-ran `replyQuestion` (null is nullish). Worse, `people(me)` (clean + Set + sort + join) was rebuilt inside `replyQuestion`, `actionTitle` and `priorityStatement` for every row — up to 5 `people()` calls plus 3 redundant `replyQuestion()` calls per row in `tasks()`. Fix: export `people` and `plain` from `owner-action.mjs`, precompute `people(me)` and `people(me.map(plain))` once in `tasks()`, pass them through, and replace `null` default with a `Symbol()` sentinel so an explicitly-computed `null` result isn't misread as "not provided".

**Action:** ~15-22% faster at 5K tasks (interleaved baseline ~512ms → ~436ms mean). All 746 passing tests unchanged; 8 pre-existing date-related failures unaffected by this change.
