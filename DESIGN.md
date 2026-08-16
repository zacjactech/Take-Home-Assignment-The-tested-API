# PATCH /tasks/:id/assign

## Behavior

Assigns a task to a named person. Finds the task by id, stores the assignee string on the task object, and returns the updated task. Returns 404 if the task does not exist. Returns 400 if the assignee value is invalid.

## Validation

`assignee` must be a non-empty, non-whitespace string. The following are all rejected with HTTP 400:

- missing field (`{}`)
- `null`
- non-string types (e.g. `123`, `true`)
- empty string (`""`)
- whitespace-only string (`"   "`)

This matches the existing validation convention used for `title` in `validateCreateTask`. The validator returns an error string or `null`; the route checks for the error and returns `{ error }` with status 400 — identical to how `POST /tasks` and `PUT /tasks/:id` handle validation failures.

Whitespace handling: a whitespace-only string (`"   "`) is rejected with 400. A meaningful string with surrounding whitespace (e.g. `" Alice "`) is accepted and stored exactly as provided — no trimming or normalization is applied. This follows the existing validator convention: validate that meaningful content is present, but do not silently transform user input.

## Reassignment

Reassignment is allowed. A second `PATCH /tasks/:id/assign` with a different name simply overwrites the current assignee. This is consistent with standard PATCH semantics — the endpoint updates a field, not manages a workflow state. Blocking reassignment would require a specification requirement that does not exist.

## Data model

`assignee: null` is added as a default field in `create()`, alongside the existing `completedAt: null`. This makes the task shape predictable: every task has an `assignee` field from creation, with `null` representing an unassigned state. The alternative — only adding the field after the first assignment — would produce an inconsistent object shape across the API.

## Tradeoffs

There is no User model or user lookup. The assignment asks only for an assignee string. Introducing a user entity would add scope, a new data store, and referential integrity concerns that are not required. The assignee is treated as an opaque label, not a foreign key.

The `assignTask` service method follows the same `findById` + spread + index-update pattern used by `completeTask`. No new abstraction was introduced.

---

## Final Notes

### What I would test next

- Concurrent updates to the same task (last-write-wins vs. conflict detection) — relevant once the in-memory store is replaced with a real database
- Persistence and data integrity across restarts with a persistent store
- Combined `?status=` and pagination query semantics, if those are ever required to compose
- Stronger assignee validation (format, existence) if assignees become references to real users
- API contract tests against a persistent implementation to catch shape regressions across deployments

### What surprised me

Three bugs were present that looked plausible at a glance but were wrong under testing:

- **Pagination** used `page * limit` as the offset. With the route defaulting to `page=1`, this skipped the entire first page on every request. It only became visible when a test asserted the actual contents of page 1 rather than just checking that something was returned.
- **Status filtering** used `String.prototype.includes` instead of `===`. Since the valid statuses share common substrings (`'o'` appears in all three), a partial query could silently return unintended results. Visual inspection of the line looks almost correct — the bug only surfaces with a targeted test.
- **Completing a task** unconditionally overwrote `priority` with `'medium'`. There was no specification justification for this. It would be invisible in any test that didn't check priority after completion.

All three were discovered through tests that asserted specific expected values, not through visual inspection alone.

### Questions before production

- Should assignees reference real users rather than opaque strings? If so, what validation, lookup, and referential integrity are required?
- Should `PUT /tasks/:id` protect system-managed fields (`id`, `createdAt`) from being overwritten by the request body?
- Should `?status=` and `?page=`/`?limit=` compose, or remain mutually exclusive? The current behavior (status takes precedence) is undocumented in the API contract.
- Should an invalid `?status=` value return 400 or an empty result? Currently it returns 200 with `[]`.
- What persistence and concurrency guarantees are required? The in-memory store resets on restart and has no locking.
