# Bug Report

Three confirmed bugs were found through code inspection and failing tests.
Each bug was reproduced by a test that asserted the expected behavior,
observed the actual behavior, and confirmed the discrepancy.

---

## BUG-1 — Pagination skips the first page

**Location:** `src/services/taskService.js` → `getPaginated()`

**Expected behavior:**
`GET /tasks?page=1&limit=10` returns the first 10 tasks.
`GET /tasks?page=2&limit=10` returns tasks 11–20.
Page numbering is 1-based, consistent with the route handler's default of `pageNum = parseInt(page) || 1`.

**Actual behavior:**
`GET /tasks?page=1&limit=10` returns tasks 11–20 (skips the first page entirely).
`GET /tasks?page=1&limit=100` with fewer than 100 tasks returns an empty array.
Page 0 would be required to see the first page, but the route defaults to page 1.

**How it was discovered:**
Unit test `page 1 returns the first page of results` failed.
The test called `getPaginated(1, 2)` on a 5-task store and received `['Task 3', 'Task 4']` instead of `['Task 1', 'Task 2']`.

**Root cause:**
```js
// Before fix
const offset = page * limit;
// page=1, limit=2 → offset=2 → skips first 2 items
```
The formula is correct only for 0-based page numbering.
The route handler establishes 1-based intent with `parseInt(page) || 1`,
making the formula inconsistent with the calling convention.

**Regression tests:**
- `taskService.test.js` → `getPaginated() › page 1 returns the first page of results`
- `taskService.test.js` → `getPaginated() › page 2 returns the second page of results`
- `taskService.test.js` → `getPaginated() › last page returns remaining items when fewer than limit`
- `taskService.test.js` → `getPaginated() › limit larger than total returns all tasks on page 1`
- `tasks.routes.test.js` → `GET /tasks › ?page=1&limit=2 returns the first two tasks`
- `tasks.routes.test.js` → `GET /tasks › ?page=2&limit=2 returns the second page`
- `tasks.routes.test.js` → `GET /tasks › ?page=1&limit=10 with fewer than 10 tasks returns all tasks`

**Fix applied:**
```js
// After fix
const offset = (page - 1) * limit;
```

**Why this fix:**
Single expression change. Converts 1-based page number to a 0-based array offset,
which is the standard formula for 1-based pagination. No other logic was changed.

---

## BUG-2 — Status filter matches substrings instead of exact values

**Location:** `src/services/taskService.js` → `getByStatus()`

**Expected behavior:**
`GET /tasks?status=todo` returns only tasks with `status === 'todo'`.
`GET /tasks?status=in` returns no tasks — `'in'` is not a valid status value.

**Actual behavior:**
`GET /tasks?status=in` returns all `in_progress` tasks because `'in_progress'.includes('in')` is `true`.
`GET /tasks?status=o` returns tasks with status `todo`, `in_progress`, and `done`
because all three contain the character `'o'`.

**How it was discovered:**
Unit test `does NOT return tasks when given a partial status substring` failed.
`getByStatus('in')` returned the `in_progress` task instead of an empty array.
`getByStatus('o')` returned all three tasks in the store.

**Root cause:**
```js
// Before fix
const getByStatus = (status) => tasks.filter((t) => t.status.includes(status));
```
`String.prototype.includes` performs a substring search, not equality comparison.
Any query value that appears as a substring of a valid status will produce false matches.

**Regression tests:**
- `taskService.test.js` → `getByStatus() › does NOT return tasks when given a partial status substring`
- `taskService.test.js` → `getByStatus() › does NOT return tasks when given a single-character partial match`
- `tasks.routes.test.js` → `GET /tasks › ?status= partial substring does NOT match tasks with different statuses`

**Fix applied:**
```js
// After fix
const getByStatus = (status) => tasks.filter((t) => t.status === status);
```

**Why this fix:**
Single operator change (`===` instead of `.includes()`).
Strict equality is the correct semantic for filtering by a discrete enum value.
No validation change was needed — returning an empty array for an unknown status
value is acceptable REST behavior (empty collection, not an error).

---

## BUG-3 — Completing a task silently resets its priority to 'medium'

**Location:** `src/services/taskService.js` → `completeTask()`

**Expected behavior:**
`PATCH /tasks/:id/complete` marks the task as done by setting `status: 'done'`
and `completedAt` to the current timestamp. All other fields, including `priority`,
are preserved unchanged.

**Actual behavior:**
Any task completed via this endpoint has its `priority` overwritten with `'medium'`,
regardless of its original value. A `priority: 'high'` task becomes `priority: 'medium'`
after completion.

**How it was discovered:**
Unit test `preserves the original priority after completion` failed.
A task created with `priority: 'high'` was completed and the returned task had `priority: 'medium'`.

**Root cause:**
```js
// Before fix
const updated = {
  ...task,
  priority: 'medium',   // unconditional overwrite
  status: 'done',
  completedAt: new Date().toISOString(),
};
```
The `priority: 'medium'` line was included with no specification justification.
Because it appears after the spread, it overwrites whatever priority the task had.

**Regression tests:**
- `taskService.test.js` → `completeTask() › preserves the original priority after completion`
- `taskService.test.js` → `completeTask() › preserves the original priority of low-priority task after completion`
- `tasks.routes.test.js` → `PATCH /tasks/:id/complete › does NOT change priority when completing a high-priority task`
- `tasks.routes.test.js` → `PATCH /tasks/:id/complete › does NOT change priority when completing a low-priority task`

**Fix applied:**
```js
// After fix
const updated = {
  ...task,
  status: 'done',
  completedAt: new Date().toISOString(),
};
```

**Why this fix:**
Removing the single `priority: 'medium'` line is sufficient.
The spread `...task` already carries the original priority.
No other behavior in `completeTask()` was changed.
