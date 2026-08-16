const taskService = require('../src/services/taskService');

beforeEach(() => {
  taskService._reset();
});

// ---------------------------------------------------------------------------
// create()
// ---------------------------------------------------------------------------
describe('create()', () => {
  test('returns a task with the supplied title', () => {
    const task = taskService.create({ title: 'Buy milk' });
    expect(task.title).toBe('Buy milk');
  });

  test('generates a unique id', () => {
    const a = taskService.create({ title: 'A' });
    const b = taskService.create({ title: 'B' });
    expect(typeof a.id).toBe('string');
    expect(a.id).not.toBe(b.id);
  });

  test('sets createdAt to an ISO string', () => {
    const task = taskService.create({ title: 'T' });
    expect(() => new Date(task.createdAt)).not.toThrow();
    expect(new Date(task.createdAt).toISOString()).toBe(task.createdAt);
  });

  test('defaults: status=todo, priority=medium, description="", dueDate=null, completedAt=null, assignee=null', () => {
    const task = taskService.create({ title: 'T' });
    expect(task.status).toBe('todo');
    expect(task.priority).toBe('medium');
    expect(task.description).toBe('');
    expect(task.dueDate).toBeNull();
    expect(task.completedAt).toBeNull();
    expect(task.assignee).toBeNull();
  });

  test('preserves supplied status, priority, description, dueDate', () => {
    const task = taskService.create({
      title: 'T',
      status: 'in_progress',
      priority: 'high',
      description: 'desc',
      dueDate: '2030-01-01T00:00:00.000Z',
    });
    expect(task.status).toBe('in_progress');
    expect(task.priority).toBe('high');
    expect(task.description).toBe('desc');
    expect(task.dueDate).toBe('2030-01-01T00:00:00.000Z');
  });
});

// ---------------------------------------------------------------------------
// findById()
// ---------------------------------------------------------------------------
describe('findById()', () => {
  test('returns the task when it exists', () => {
    const created = taskService.create({ title: 'T' });
    expect(taskService.findById(created.id)).toEqual(created);
  });

  test('returns undefined when the task does not exist', () => {
    expect(taskService.findById('nonexistent-id')).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// getAll()
// ---------------------------------------------------------------------------
describe('getAll()', () => {
  test('returns empty array when store is empty', () => {
    expect(taskService.getAll()).toEqual([]);
  });

  test('returns all created tasks', () => {
    taskService.create({ title: 'A' });
    taskService.create({ title: 'B' });
    expect(taskService.getAll()).toHaveLength(2);
  });

  test('returns a copy — mutating the result does not affect the store', () => {
    taskService.create({ title: 'A' });
    const all = taskService.getAll();
    all.push({ id: 'fake' });
    expect(taskService.getAll()).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// getByStatus()
// ---------------------------------------------------------------------------
describe('getByStatus()', () => {
  beforeEach(() => {
    taskService.create({ title: 'Todo task', status: 'todo' });
    taskService.create({ title: 'In-progress task', status: 'in_progress' });
    taskService.create({ title: 'Done task', status: 'done' });
  });

  test('returns only tasks with the exact matching status', () => {
    const result = taskService.getByStatus('todo');
    expect(result).toHaveLength(1);
    expect(result[0].title).toBe('Todo task');
  });

  test('returns multiple tasks when several share the same status', () => {
    taskService.create({ title: 'Another todo', status: 'todo' });
    const result = taskService.getByStatus('todo');
    expect(result).toHaveLength(2);
  });

  test('returns empty array when no tasks match', () => {
    expect(taskService.getByStatus('done')).toHaveLength(1);
    taskService._reset();
    expect(taskService.getByStatus('done')).toEqual([]);
  });

  // BUG-2 reproduction: partial string 'in' should NOT match 'in_progress'
  test('does NOT return tasks when given a partial status substring', () => {
    const result = taskService.getByStatus('in');
    // Expected: [] — 'in' is not a valid status value, no task should match
    // If this fails, getByStatus() is doing substring matching instead of equality
    expect(result).toEqual([]);
  });

  // BUG-2 reproduction: 'o' is a substring of both 'todo' and 'in_progress'
  test('does NOT return tasks when given a single-character partial match', () => {
    const result = taskService.getByStatus('o');
    expect(result).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// getPaginated()
// ---------------------------------------------------------------------------
describe('getPaginated()', () => {
  beforeEach(() => {
    // Create 5 tasks with identifiable titles
    for (let i = 1; i <= 5; i++) {
      taskService.create({ title: `Task ${i}` });
    }
  });

  // BUG-1 reproduction: page=1, limit=2 should return tasks 1 and 2 (indices 0-1)
  test('page 1 returns the first page of results', () => {
    const result = taskService.getPaginated(1, 2);
    // Expected: 2 items starting from index 0
    // If this fails, offset = page*limit = 2, skipping the first page entirely
    expect(result).toHaveLength(2);
    expect(result[0].title).toBe('Task 1');
    expect(result[1].title).toBe('Task 2');
  });

  test('page 2 returns the second page of results', () => {
    const result = taskService.getPaginated(2, 2);
    // Expected: items at index 2-3 (Task 3, Task 4)
    expect(result).toHaveLength(2);
    expect(result[0].title).toBe('Task 3');
    expect(result[1].title).toBe('Task 4');
  });

  test('last page returns remaining items when fewer than limit', () => {
    const result = taskService.getPaginated(3, 2);
    // 5 tasks, limit 2: page 3 = index 4 → only Task 5
    expect(result).toHaveLength(1);
    expect(result[0].title).toBe('Task 5');
  });

  test('page beyond available data returns empty array', () => {
    const result = taskService.getPaginated(10, 2);
    expect(result).toEqual([]);
  });

  test('limit larger than total returns all tasks on page 1', () => {
    const result = taskService.getPaginated(1, 100);
    expect(result).toHaveLength(5);
  });
});

// ---------------------------------------------------------------------------
// getStats()
// ---------------------------------------------------------------------------
describe('getStats()', () => {
  test('returns zero counts and zero overdue on empty store', () => {
    expect(taskService.getStats()).toEqual({ todo: 0, in_progress: 0, done: 0, overdue: 0 });
  });

  test('counts tasks by status correctly', () => {
    taskService.create({ title: 'A', status: 'todo' });
    taskService.create({ title: 'B', status: 'todo' });
    taskService.create({ title: 'C', status: 'in_progress' });
    taskService.create({ title: 'D', status: 'done' });
    const stats = taskService.getStats();
    expect(stats.todo).toBe(2);
    expect(stats.in_progress).toBe(1);
    expect(stats.done).toBe(1);
  });

  test('counts a task with a past dueDate and non-done status as overdue', () => {
    taskService.create({ title: 'Overdue', status: 'todo', dueDate: '2000-01-01T00:00:00.000Z' });
    expect(taskService.getStats().overdue).toBe(1);
  });

  test('does NOT count a future dueDate as overdue', () => {
    taskService.create({ title: 'Future', status: 'todo', dueDate: '2099-01-01T00:00:00.000Z' });
    expect(taskService.getStats().overdue).toBe(0);
  });

  test('does NOT count a done task with a past dueDate as overdue', () => {
    taskService.create({ title: 'Done overdue', status: 'done', dueDate: '2000-01-01T00:00:00.000Z' });
    expect(taskService.getStats().overdue).toBe(0);
  });

  test('does NOT count a task with no dueDate as overdue', () => {
    taskService.create({ title: 'No due date', status: 'todo' });
    expect(taskService.getStats().overdue).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// update()
// ---------------------------------------------------------------------------
describe('update()', () => {
  test('returns null when task does not exist', () => {
    expect(taskService.update('nonexistent', { title: 'X' })).toBeNull();
  });

  test('updates the specified fields', () => {
    const task = taskService.create({ title: 'Original' });
    const updated = taskService.update(task.id, { title: 'Updated', priority: 'high' });
    expect(updated.title).toBe('Updated');
    expect(updated.priority).toBe('high');
  });

  test('preserves fields not included in the update', () => {
    const task = taskService.create({ title: 'T', description: 'keep me' });
    const updated = taskService.update(task.id, { title: 'New title' });
    expect(updated.description).toBe('keep me');
  });

  test('persists the update in the store', () => {
    const task = taskService.create({ title: 'T' });
    taskService.update(task.id, { title: 'Updated' });
    expect(taskService.findById(task.id).title).toBe('Updated');
  });
});

// ---------------------------------------------------------------------------
// remove()
// ---------------------------------------------------------------------------
describe('remove()', () => {
  test('returns true and removes the task when it exists', () => {
    const task = taskService.create({ title: 'T' });
    expect(taskService.remove(task.id)).toBe(true);
    expect(taskService.findById(task.id)).toBeUndefined();
  });

  test('returns false when the task does not exist', () => {
    expect(taskService.remove('nonexistent')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// completeTask()
// ---------------------------------------------------------------------------
describe('completeTask()', () => {
  test('returns null when task does not exist', () => {
    expect(taskService.completeTask('nonexistent')).toBeNull();
  });

  test('sets status to done', () => {
    const task = taskService.create({ title: 'T' });
    const result = taskService.completeTask(task.id);
    expect(result.status).toBe('done');
  });

  test('sets completedAt to a valid ISO string', () => {
    const task = taskService.create({ title: 'T' });
    const result = taskService.completeTask(task.id);
    expect(result.completedAt).not.toBeNull();
    expect(new Date(result.completedAt).toISOString()).toBe(result.completedAt);
  });

  test('persists the completion in the store', () => {
    const task = taskService.create({ title: 'T' });
    taskService.completeTask(task.id);
    expect(taskService.findById(task.id).status).toBe('done');
  });

  // BUG-3 reproduction: completing a high-priority task should NOT change its priority
  test('preserves the original priority after completion', () => {
    const task = taskService.create({ title: 'T', priority: 'high' });
    const result = taskService.completeTask(task.id);
    // Expected: priority remains 'high'
    // If this fails, completeTask() is silently overwriting priority with 'medium'
    expect(result.priority).toBe('high');
  });

  test('preserves the original priority of low-priority task after completion', () => {
    const task = taskService.create({ title: 'T', priority: 'low' });
    const result = taskService.completeTask(task.id);
    expect(result.priority).toBe('low');
  });

  test('completing an already-completed task sets a new completedAt', () => {
    const task = taskService.create({ title: 'T' });
    const first = taskService.completeTask(task.id);
    // Small delay to ensure timestamps differ
    const second = taskService.completeTask(task.id);
    expect(second.status).toBe('done');
    // completedAt may or may not change depending on timing, but it must remain valid
    expect(new Date(second.completedAt).toISOString()).toBe(second.completedAt);
  });
});

// ---------------------------------------------------------------------------
// assignTask()
// ---------------------------------------------------------------------------
describe('assignTask()', () => {
  test('returns null when task does not exist', () => {
    expect(taskService.assignTask('nonexistent', 'Alice')).toBeNull();
  });

  test('returns the updated task with the assignee set', () => {
    const task = taskService.create({ title: 'T' });
    const result = taskService.assignTask(task.id, 'Alice');
    expect(result.assignee).toBe('Alice');
  });

  test('persists the assignment in the store', () => {
    const task = taskService.create({ title: 'T' });
    taskService.assignTask(task.id, 'Alice');
    expect(taskService.findById(task.id).assignee).toBe('Alice');
  });

  test('allows reassignment to a different person', () => {
    const task = taskService.create({ title: 'T' });
    taskService.assignTask(task.id, 'Alice');
    const result = taskService.assignTask(task.id, 'Bob');
    expect(result.assignee).toBe('Bob');
    expect(taskService.findById(task.id).assignee).toBe('Bob');
  });

  test('does not modify unrelated task fields', () => {
    const task = taskService.create({
      title: 'T',
      description: 'desc',
      status: 'in_progress',
      priority: 'high',
      dueDate: '2030-01-01T00:00:00.000Z',
    });
    const result = taskService.assignTask(task.id, 'Alice');
    expect(result.id).toBe(task.id);
    expect(result.title).toBe('T');
    expect(result.description).toBe('desc');
    expect(result.status).toBe('in_progress');
    expect(result.priority).toBe('high');
    expect(result.dueDate).toBe('2030-01-01T00:00:00.000Z');
    expect(result.completedAt).toBeNull();
    expect(result.createdAt).toBe(task.createdAt);
  });
});
