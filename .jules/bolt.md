## 2026-11-06 - Single-pass redaction in db.addItems()

**Learning:** `db.addItems()` redacted every item twice: once inside `keep(redactItem(i), gone)` in the filter, and again in `.map(redactItem)`. Restructuring to a single pass (redact once, check both original and redacted forms, store the redacted row) removes one `redactItem()` call per item. The object-spread overhead of caching the redacted copy on the item outweighs the savings — the win comes from eliminating the second full `redactItem()` invocation, not from avoiding object creation.

**Action:** ~15-21% faster at 2K-5K items (20→17 µs/item). Benchmark with varied item counts and mail/non-mail mixes. Don't cache redacted results on items as properties — the spread overhead cancels the gain.

## 2026-11-06 - Min-heap top-k selection in meaning.nearest()

**Learning:** `meaning.nearest()` scored every vector in the vault, sorted all n results, then sliced the top k. For a vault with tens of thousands of quantized embedding vectors this is O(n log n) time and O(n) memory when only the top k (10-100) are needed. Replacing the full sort with a min-heap of size k reduces selection to O(n log k) time, O(k) memory, with identical results.

**Action:** When search performance is being measured, benchmark `nearest()` with mocked `ready`/`embed` and realistic vector counts (5K-40K). The heap change is ~2x faster for the selection phase alone and ~20% faster end-to-end at 10K-20K vectors. Do not introduce new formatting tools (prettier) that reformat unrelated code — match the existing file style.

## 2026-11-06 - Cache replyQuestion result in db.tasks()

**Learning:** `db.tasks()` called `replyQuestion(r)` 2-3 times per row: once inside `actionTitle()` (which calls it internally), once directly at `if (replyQuestion(r))`, and once inside `actionCard()` when card is 'appointment'. `owner()` was also called 1-3 times per row via default parameters. Caching `replyQuestion(r)` once per row and passing `me`/`asked` to `actionTitle()`/`actionCard()` eliminates redundant regex matching and `owner()` array operations.

**Action:** ~28% faster at 2K tasks (181→130ms). Export `owner()` from `owner-action.mjs` for use in `tasks.mjs`. Add optional `precomputedAsked` parameter to `actionTitle()` and optional `me`/`precomputedAsked` to `actionCard()` (backwards-compatible). Move `db.prepare('select source from items where id = ?')` outside the per-row loop.
