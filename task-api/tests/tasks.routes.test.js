const request = require('supertest');
const app = require('../src/app');
const taskService = require('../src/services/taskService');

beforeEach(() => {
  taskService._reset();
});

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------
async function createTask(fields = {}) {
  const res = await request(app)
    .post('/tasks')
    .send({ title: 'Default task', ...fields });
  return res.body;
}

// ---------------------------------------------------------------------------
// GET /tasks
// ---------------------------------------------------------------------------
describe('GET /tasks', () => {
  test('returns 200 and empty array when no tasks exist', async () => {
    const res = await request(app).get('/tasks');
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  test('returns all tasks', async () => {
    await createTask({ title: 'A' });
    await createTask({ title: 'B' });
    const res = await request(app).get('/tasks');
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(2);
  });

  // --- status filtering ---

  test('?status=todo returns only todo tasks', async () => {
    await createTask({ title: 'Todo', status: 'todo' });
    await createTask({ title: 'Done', status: 'done' });
    const res = await request(app).get('/tasks?status=todo');
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].status).toBe('todo');
  });

  test('?status= with no matching tasks returns empty array', async () => {
    await createTask({ title: 'Todo', status: 'todo' });
    const res = await request(app).get('/tasks?status=done');
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  // BUG-2 reproduction at the HTTP level
  test('?status= partial substring does NOT match tasks with different statuses', async () => {
    await createTask({ title: 'In progress', status: 'in_progress' });
    const res = await request(app).get('/tasks?status=in');
    // Expected: [] — 'in' is not a valid status, no task should match
    // If this fails, getByStatus() is doing substring matching
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  // --- pagination ---

  test('?page=1&limit=2 returns the first two tasks', async () => {
    await createTask({ title: 'Task 1' });
    await createTask({ title: 'Task 2' });
    await createTask({ title: 'Task 3' });
    const res = await request(app).get('/tasks?page=1&limit=2');
    // BUG-1 reproduction: page=1 should return items 0-1, not items 2-3
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(2);
    expect(res.body[0].title).toBe('Task 1');
    expect(res.body[1].title).toBe('Task 2');
  });

  test('?page=2&limit=2 returns the second page', async () => {
    await createTask({ title: 'Task 1' });
    await createTask({ title: 'Task 2' });
    await createTask({ title: 'Task 3' });
    const res = await request(app).get('/tasks?page=2&limit=2');
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].title).toBe('Task 3');
  });

  test('?page=1&limit=10 with fewer than 10 tasks returns all tasks', async () => {
    await createTask({ title: 'Only task' });
    const res = await request(app).get('/tasks?page=1&limit=10');
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
  });

  test('?page=99&limit=10 beyond available data returns empty array', async () => {
    await createTask({ title: 'T' });
    const res = await request(app).get('/tasks?page=99&limit=10');
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  // Specification ambiguity: ASSIGNMENT.md lists ?status=, ?page=, ?limit= as independent
  // options but does not specify they compose. The route handles them as mutually exclusive
  // branches (status check runs first). This test documents the actual behavior.
  test('?status= takes precedence when combined with ?page= and ?limit=', async () => {
    await createTask({ title: 'Todo 1', status: 'todo' });
    await createTask({ title: 'Todo 2', status: 'todo' });
    await createTask({ title: 'Done 1', status: 'done' });
    const res = await request(app).get('/tasks?status=todo&page=1&limit=1');
    expect(res.status).toBe(200);
    // status branch fires first — returns all todo tasks, pagination is not applied
    expect(res.body).toHaveLength(2);
    expect(res.body.every((t) => t.status === 'todo')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// POST /tasks
// ---------------------------------------------------------------------------
describe('POST /tasks', () => {
  test('creates a task and returns 201 with the task', async () => {
    const res = await request(app)
      .post('/tasks')
      .send({ title: 'Write tests' });
    expect(res.status).toBe(201);
    expect(res.body.title).toBe('Write tests');
    expect(res.body.id).toBeDefined();
    expect(res.body.createdAt).toBeDefined();
  });

  test('applies defaults: status=todo, priority=medium, completedAt=null', async () => {
    const res = await request(app).post('/tasks').send({ title: 'T' });
    expect(res.status).toBe(201);
    expect(res.body.status).toBe('todo');
    expect(res.body.priority).toBe('medium');
    expect(res.body.completedAt).toBeNull();
  });

  test('returns 400 when title is missing', async () => {
    const res = await request(app).post('/tasks').send({ priority: 'high' });
    expect(res.status).toBe(400);
    expect(res.body.error).toBeDefined();
  });

  test('returns 400 when title is an empty string', async () => {
    const res = await request(app).post('/tasks').send({ title: '' });
    expect(res.status).toBe(400);
  });

  test('returns 400 when title is whitespace only', async () => {
    const res = await request(app).post('/tasks').send({ title: '   ' });
    expect(res.status).toBe(400);
  });

  test('returns 400 for invalid status', async () => {
    const res = await request(app).post('/tasks').send({ title: 'T', status: 'invalid' });
    expect(res.status).toBe(400);
  });

  test('returns 400 for invalid priority', async () => {
    const res = await request(app).post('/tasks').send({ title: 'T', priority: 'urgent' });
    expect(res.status).toBe(400);
  });

  test('returns 400 for invalid dueDate', async () => {
    const res = await request(app).post('/tasks').send({ title: 'T', dueDate: 'not-a-date' });
    expect(res.status).toBe(400);
  });

  test('accepts a valid dueDate ISO string', async () => {
    const res = await request(app)
      .post('/tasks')
      .send({ title: 'T', dueDate: '2030-06-15T12:00:00.000Z' });
    expect(res.status).toBe(201);
    expect(res.body.dueDate).toBe('2030-06-15T12:00:00.000Z');
  });

  test('accepts all valid status values', async () => {
    for (const status of ['todo', 'in_progress', 'done']) {
      const res = await request(app).post('/tasks').send({ title: 'T', status });
      expect(res.status).toBe(201);
      expect(res.body.status).toBe(status);
    }
  });

  test('accepts all valid priority values', async () => {
    for (const priority of ['low', 'medium', 'high']) {
      const res = await request(app).post('/tasks').send({ title: 'T', priority });
      expect(res.status).toBe(201);
      expect(res.body.priority).toBe(priority);
    }
  });
});

// ---------------------------------------------------------------------------
// PUT /tasks/:id
// ---------------------------------------------------------------------------
describe('PUT /tasks/:id', () => {
  test('updates a task and returns the updated task', async () => {
    const task = await createTask({ title: 'Original' });
    const res = await request(app)
      .put(`/tasks/${task.id}`)
      .send({ title: 'Updated', priority: 'high' });
    expect(res.status).toBe(200);
    expect(res.body.title).toBe('Updated');
    expect(res.body.priority).toBe('high');
  });

  test('returns 404 for a non-existent task', async () => {
    const res = await request(app).put('/tasks/nonexistent').send({ title: 'X' });
    expect(res.status).toBe(404);
    expect(res.body.error).toBeDefined();
  });

  test('returns 400 for invalid status in update', async () => {
    const task = await createTask();
    const res = await request(app).put(`/tasks/${task.id}`).send({ status: 'invalid' });
    expect(res.status).toBe(400);
  });

  test('returns 400 for invalid priority in update', async () => {
    const task = await createTask();
    const res = await request(app).put(`/tasks/${task.id}`).send({ priority: 'critical' });
    expect(res.status).toBe(400);
  });

  test('returns 400 when title is set to empty string', async () => {
    const task = await createTask();
    const res = await request(app).put(`/tasks/${task.id}`).send({ title: '' });
    expect(res.status).toBe(400);
  });

  test('returns 400 for invalid dueDate in update', async () => {
    const task = await createTask();
    const res = await request(app).put(`/tasks/${task.id}`).send({ dueDate: 'not-a-date' });
    expect(res.status).toBe(400);
    expect(res.body.error).toBeDefined();
  });

  test('preserves fields not included in the update body', async () => {
    const task = await createTask({ title: 'T', description: 'keep me', priority: 'high' });
    const res = await request(app).put(`/tasks/${task.id}`).send({ title: 'New title' });
    expect(res.status).toBe(200);
    expect(res.body.description).toBe('keep me');
    expect(res.body.priority).toBe('high');
  });
});

// ---------------------------------------------------------------------------
// DELETE /tasks/:id
// ---------------------------------------------------------------------------
describe('DELETE /tasks/:id', () => {
  test('returns 204 and removes the task', async () => {
    const task = await createTask();
    const res = await request(app).delete(`/tasks/${task.id}`);
    expect(res.status).toBe(204);
    expect(res.body).toEqual({});
  });

  test('returns 404 for a non-existent task', async () => {
    const res = await request(app).delete('/tasks/nonexistent');
    expect(res.status).toBe(404);
    expect(res.body.error).toBeDefined();
  });

  test('task is no longer returned after deletion', async () => {
    const task = await createTask({ title: 'To delete' });
    await request(app).delete(`/tasks/${task.id}`);
    const all = await request(app).get('/tasks');
    expect(all.body.find((t) => t.id === task.id)).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// PATCH /tasks/:id/complete
// ---------------------------------------------------------------------------
describe('PATCH /tasks/:id/complete', () => {
  test('returns 200 and the updated task', async () => {
    const task = await createTask();
    const res = await request(app).patch(`/tasks/${task.id}/complete`);
    expect(res.status).toBe(200);
    expect(res.body.id).toBe(task.id);
  });

  test('sets status to done', async () => {
    const task = await createTask();
    const res = await request(app).patch(`/tasks/${task.id}/complete`);
    expect(res.body.status).toBe('done');
  });

  test('sets completedAt to a non-null ISO string', async () => {
    const task = await createTask();
    const res = await request(app).patch(`/tasks/${task.id}/complete`);
    expect(res.body.completedAt).not.toBeNull();
    expect(new Date(res.body.completedAt).toISOString()).toBe(res.body.completedAt);
  });

  test('returns 404 for a non-existent task', async () => {
    const res = await request(app).patch('/tasks/nonexistent/complete');
    expect(res.status).toBe(404);
    expect(res.body.error).toBeDefined();
  });

  // BUG-3 reproduction at the HTTP level
  test('does NOT change priority when completing a high-priority task', async () => {
    const task = await createTask({ title: 'T', priority: 'high' });
    const res = await request(app).patch(`/tasks/${task.id}/complete`);
    // Expected: priority remains 'high'
    // If this fails, completeTask() is silently overwriting priority with 'medium'
    expect(res.body.priority).toBe('high');
  });

  test('does NOT change priority when completing a low-priority task', async () => {
    const task = await createTask({ title: 'T', priority: 'low' });
    const res = await request(app).patch(`/tasks/${task.id}/complete`);
    expect(res.body.priority).toBe('low');
  });
});

// ---------------------------------------------------------------------------
// GET /tasks/stats
// ---------------------------------------------------------------------------
describe('GET /tasks/stats', () => {
  test('returns zero counts on empty store', async () => {
    const res = await request(app).get('/tasks/stats');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ todo: 0, in_progress: 0, done: 0, overdue: 0 });
  });

  test('counts tasks by status', async () => {
    await createTask({ status: 'todo' });
    await createTask({ status: 'todo' });
    await createTask({ status: 'in_progress' });
    await createTask({ status: 'done' });
    const res = await request(app).get('/tasks/stats');
    expect(res.body.todo).toBe(2);
    expect(res.body.in_progress).toBe(1);
    expect(res.body.done).toBe(1);
  });

  test('counts overdue tasks (past dueDate, not done)', async () => {
    await createTask({ status: 'todo', dueDate: '2000-01-01T00:00:00.000Z' });
    const res = await request(app).get('/tasks/stats');
    expect(res.body.overdue).toBe(1);
  });

  test('does not count done tasks as overdue even with past dueDate', async () => {
    await createTask({ status: 'done', dueDate: '2000-01-01T00:00:00.000Z' });
    const res = await request(app).get('/tasks/stats');
    expect(res.body.overdue).toBe(0);
  });

  test('does not count tasks with future dueDate as overdue', async () => {
    await createTask({ status: 'todo', dueDate: '2099-01-01T00:00:00.000Z' });
    const res = await request(app).get('/tasks/stats');
    expect(res.body.overdue).toBe(0);
  });

  test('does not count tasks with no dueDate as overdue', async () => {
    await createTask({ status: 'todo' });
    const res = await request(app).get('/tasks/stats');
    expect(res.body.overdue).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// PATCH /tasks/:id/assign
// ---------------------------------------------------------------------------
describe('PATCH /tasks/:id/assign', () => {
  test('returns 200 and the updated task with assignee set', async () => {
    const task = await createTask({ title: 'T' });
    const res = await request(app)
      .patch(`/tasks/${task.id}/assign`)
      .send({ assignee: 'Alice' });
    expect(res.status).toBe(200);
    expect(res.body.assignee).toBe('Alice');
  });

  test('returns 404 for a non-existent task', async () => {
    const res = await request(app)
      .patch('/tasks/nonexistent-id/assign')
      .send({ assignee: 'Alice' });
    expect(res.status).toBe(404);
    expect(res.body.error).toBeDefined();
  });

  test('returns 400 when assignee is missing', async () => {
    const task = await createTask();
    const res = await request(app).patch(`/tasks/${task.id}/assign`).send({});
    expect(res.status).toBe(400);
    expect(res.body.error).toBeDefined();
  });

  test('returns 400 when assignee is an empty string', async () => {
    const task = await createTask();
    const res = await request(app)
      .patch(`/tasks/${task.id}/assign`)
      .send({ assignee: '' });
    expect(res.status).toBe(400);
  });

  test('returns 400 when assignee is whitespace only', async () => {
    const task = await createTask();
    const res = await request(app)
      .patch(`/tasks/${task.id}/assign`)
      .send({ assignee: '   ' });
    expect(res.status).toBe(400);
  });

  test('returns 400 when assignee is a number', async () => {
    const task = await createTask();
    const res = await request(app)
      .patch(`/tasks/${task.id}/assign`)
      .send({ assignee: 123 });
    expect(res.status).toBe(400);
  });

  test('returns 400 when assignee is null', async () => {
    const task = await createTask();
    const res = await request(app)
      .patch(`/tasks/${task.id}/assign`)
      .send({ assignee: null });
    expect(res.status).toBe(400);
  });

  test('allows reassignment from one person to another', async () => {
    const task = await createTask();
    await request(app).patch(`/tasks/${task.id}/assign`).send({ assignee: 'Alice' });
    const res = await request(app)
      .patch(`/tasks/${task.id}/assign`)
      .send({ assignee: 'Bob' });
    expect(res.status).toBe(200);
    expect(res.body.assignee).toBe('Bob');
  });

  test('does not modify unrelated task fields', async () => {
    const task = await createTask({
      title: 'Original',
      description: 'keep',
      status: 'in_progress',
      priority: 'high',
      dueDate: '2030-01-01T00:00:00.000Z',
    });
    const res = await request(app)
      .patch(`/tasks/${task.id}/assign`)
      .send({ assignee: 'Alice' });
    expect(res.status).toBe(200);
    expect(res.body.id).toBe(task.id);
    expect(res.body.title).toBe('Original');
    expect(res.body.description).toBe('keep');
    expect(res.body.status).toBe('in_progress');
    expect(res.body.priority).toBe('high');
    expect(res.body.dueDate).toBe('2030-01-01T00:00:00.000Z');
    expect(res.body.completedAt).toBeNull();
    expect(res.body.createdAt).toBe(task.createdAt);
  });

  test('can assign a completed task without altering its completion state', async () => {
    const task = await createTask();
    await request(app).patch(`/tasks/${task.id}/complete`);
    const res = await request(app)
      .patch(`/tasks/${task.id}/assign`)
      .send({ assignee: 'Alice' });
    expect(res.status).toBe(200);
    expect(res.body.assignee).toBe('Alice');
    expect(res.body.status).toBe('done');
    expect(res.body.completedAt).not.toBeNull();
  });
});
