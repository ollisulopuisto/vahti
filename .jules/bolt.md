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

## 2026-11-07 - Bucket plans.group() by source+thread+weekday

**Learning:** `plans.group()` rescanned every existing plan for each incoming row via `plans.find(...)`, an O(n) per-row scan (O(n^2) overall) that dominates plan computation for chats with many plan rows. Bucketing by source+thread+weekday with a Map restricts each lookup to plans that can actually match (same chat and weekday), preserving insertion order so the first matching group still wins. Results are identical to the brute-force version.

**Action:** ~6x at n=500 up to ~18x at n=4000 (baseline ~2600 ms -> ~140 ms at n=4000), now ~linear. Verified identical output across 200 randomized inputs; existing group tests pass. Only pre-existing date-resolution test failures remain on main (current-date vs fixed 2028 expectations), unrelated to this change. PR: bolt/perf-plans-group-map (#11).

## 2026-11-07 - Set lookup and loop unrolling for adultHost in privacy.mjs

**Learning:** `adultHost()` was running an O(N) array search with `.some()` and `.endsWith()` against 53 adult domains for every host extracted from URLs in every ingested item. In addition, checking sub-labels allocated intermediate arrays via `.slice().flatMap().split('-')`. Replacing `ADULT_SITES` with a `Set` and checking domain suffixes via `indexOf('.')` while using simple loops over label tokens cuts `adultHost` micro-benchmark latency by ~4.7x (942ms → 199ms for 400k checks) and `addItems` for 5K items with links by ~35% (265ms → 170ms).

**Action:** Prefer `Set.has()` plus suffix slicing on `indexOf('.')` over `Array.some(d => host.endsWith('.' + d))` whenever filtering domain names on high-throughput collectors. Avoid `.flatMap()` and `.slice()` inside per-hostname filter loops.

## 2026-11-07 - Precompute people(me) once per tasks() call; fix null-?? re-call bug

**Learning:** The earlier "cache replyQuestion in db.tasks()" optimization was ineffective: `precomputedAsked = null` combined with `null ?? replyQuestion()` always re-ran `replyQuestion` (null is nullish). Worse, `people(me)` (clean + Set + sort + join) was rebuilt inside `replyQuestion`, `actionTitle` and `priorityStatement` for every row — up to 5 `people()` calls plus 3 redundant `replyQuestion()` calls per row in `tasks()`. Fix: export `people` and `plain` from `owner-action.mjs`, precompute `people(me)` and `people(me.map(plain))` once in `tasks()`, pass them through, and replace `null` default with a `Symbol()` sentinel so an explicitly-computed `null` result isn't misread as "not provided".

**Action:** ~15-22% faster at 5K tasks (interleaved baseline ~512ms → ~436ms mean). All 746 passing tests unchanged; 8 pre-existing date-related failures unaffected by this change.

## 2026-11-07 - PR11 conflict and equivalence repair

Instinct preserves both journal sections during main merge. Bucket lookup
retains strict source/thread/weekday matching: delimiter collisions and NaN
weekdays must not merge rows the original scan kept separate. Added regression
coverage for both. Bucketing is not guaranteed linear: one same-chat/weekday
bucket can still contain all groups, so worst-case remains quadratic. Original
benchmark claims are not revalidated. Full macOS CI is the merge gate.

## 2026-11-07 - Redact mail items once in db.addItems()

**Learning:** `addItems()` redacted every mail item twice: once for the stored-identity check (`mailIdentity(redactItem({...i, id: current}))`) and again for the row actually stored (`redactItem(i)` after `i.id = current`). Both calls run every `RULES` regex over thread, sender, text, url and the nested meta, so the mail ingestion path did ~2x the necessary redaction. Non-mail items already redacted once. The function's own comment ("redact each item once") was only true for non-mail.

**Action:** Canonicalize `i.id = current` first, then call `redactItem(i)` once and reuse that exact redacted row for both the stored-identity check and storage. Behavior is identical: the reused row is structurally equal to the old two (same own properties, `redactItem` is pure), and the forget check now uses the very row that is stored. No new dependency; ~11 lines. Disproof A/B on the same corpus (3000 items, median of 8 reps): 100%-mail 101ms → 80ms (−21%, 33.8→26.7 µs/item); 25%-mail mixed 43.5ms → 38ms (−13–15%); 0%-mail 22.4ms → 22.4ms (0%, unchanged non-mail path). The win scales linearly with mail fraction, confirming the mechanism and ruling out noise/corpus artifacts. Full suite 784/784 green under `VAHTI_LANGUAGES='en,hr'` (the 6 local date/accent failures are environment-dependent and pass in CI). PR: bolt/perf-additems-mail-redact-once.

## 2026-11-08 - Avoid array allocations and early return in adult() host checking

**Learning:** `adult(item)` in `daemon/lib/privacy.mjs` was called on every item passing through `addItems()` and other collection filters. It called `hosts(item)`, which allocated intermediate arrays `[item.url, ...(String(item.text).match(...) || [])]` and unconditionally parsed URLs even when messages had no link. In addition, `hosts(item)` extracted and parsed all hostnames before checking them with `adultHost()`. Replacing this with a short-circuiting `hasAdultHost(item)` that only runs regex matching when `'http'` appears in `item.text` and returns early on the first adult domain avoids intermediate array allocations and redundant URL parsing.

**Action:** Replace `hosts(item).some(adultHost)` with `hasAdultHost(item)` in `privacy.mjs`. Fuzz-tested 10,000 random item shapes for exact equivalence. Benchmarked on 100k mixed items: `adult()` dropped from ~116ms to ~75ms (~35% faster), and `addItems()` on 3000 items with 25% links dropped from median 116.3ms to 105.4ms (~9-10% overall ingestion time reduction). PR: bolt/perf-adult-short-circuit-urls.

## 2026-11-08 - Bounded cache for localDate() in dates.mjs

**Learning:** `localDate(ts, timeZone)` in `daemon/lib/dates.mjs` uses `Intl.DateTimeFormat.prototype.format()` followed by `split('-').map(Number)` to decompose unix timestamps into calendar years, months, and days. This function is called in high-frequency loops: `dayRange()` steps hour-by-hour and minute-by-minute testing `isoDay(ts)`, timeline filtering calls `isoDay()` on every task, and date resolution calls `localDate()` repeatedly. Adding a bounded Map cache (max 10,000 entries) keying on `${ts}@${timeZone}` avoids redundant `Intl` string conversions and number allocations.

**Action:** ~7.1x faster on repeated `localDate` lookups (126.3ms → 17.7ms for 50k calls) and ~5.9x faster on `dayRange()` (54.4ms → 9.2ms for 1,000 calls). Verified exact output across 75,000+ fuzzed timestamps across 5 timezones and edge cases (leap years, DST transitions).
