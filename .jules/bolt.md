## 2026-11-06 - Single-pass redaction in db.addItems()

**Learning:** `db.addItems()` redacted every item twice: once inside `keep(redactItem(i), gone)` in the filter, and again in `.map(redactItem)`. Restructuring to a single pass (redact once, check both original and redacted forms, store the redacted row) removes one `redactItem()` call per item. The object-spread overhead of caching the redacted copy on the item outweighs the savings — the win comes from eliminating the second full `redactItem()` invocation, not from avoiding object creation.

**Action:** ~15-21% faster at 2K-5K items (20→17 µs/item). Benchmark with varied item counts and mail/non-mail mixes. Don't cache redacted results on items as properties — the spread overhead cancels the gain.

## 2026-11-06 - Min-heap top-k selection in meaning.nearest()

**Learning:** `meaning.nearest()` scored every vector in the vault, sorted all n results, then sliced the top k. For a vault with tens of thousands of quantized embedding vectors this is O(n log n) time and O(n) memory when only the top k (10-100) are needed. Replacing the full sort with a min-heap of size k reduces selection to O(n log k) time and O(k) memory, with identical results.

**Action:** When search performance is being measured, benchmark `nearest()` with mocked `ready`/`embed` and realistic vector counts (5K-40K). The heap change is ~2x faster for the selection phase alone and ~20% faster end-to-end at 10K-20K vectors. Do not introduce new formatting tools (prettier) that reformat unrelated code — match the existing file style.
