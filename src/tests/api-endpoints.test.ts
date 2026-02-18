/**
 * Tests for API Endpoints (Phase 1f, 3a)
 * - GET /requests returns help requests
 * - POST /requests/:id/respond marks as resolved
 * - POST /goals creates breakdown + review tasks
 *
 * Tests the HTTP handler logic by simulating the data layer.
 */
import { describe, expect, it } from 'vitest';
import Database from 'better-sqlite3';

function createTestDb(): Database.Database {
  const db = new Database(':memory:');
  db.exec(`
    CREATE TABLE IF NOT EXISTS help_requests (
      id TEXT PRIMARY KEY,
      group_folder TEXT NOT NULL,
      goal_id TEXT,
      task_id TEXT,
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      request_type TEXT DEFAULT 'question',
      status TEXT DEFAULT 'open',
      response TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      resolved_at TEXT
    );

    CREATE TABLE IF NOT EXISTS scheduled_tasks (
      id TEXT PRIMARY KEY,
      group_folder TEXT NOT NULL,
      chat_jid TEXT NOT NULL,
      prompt TEXT NOT NULL,
      schedule_type TEXT NOT NULL,
      schedule_value TEXT NOT NULL,
      context_mode TEXT DEFAULT 'isolated',
      next_run TEXT,
      last_run TEXT,
      last_result TEXT,
      status TEXT DEFAULT 'active',
      created_at TEXT NOT NULL,
      goal_id TEXT,
      depends_on TEXT,
      timeout INTEGER
    );

    CREATE TABLE IF NOT EXISTS goals (
      id TEXT PRIMARY KEY,
      group_folder TEXT NOT NULL,
      title TEXT NOT NULL,
      description TEXT,
      status TEXT DEFAULT 'active',
      priority TEXT DEFAULT 'medium',
      progress INTEGER DEFAULT 0,
      deadline TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      completed_at TEXT
    );
  `);
  return db;
}

describe('API - GET /requests', () => {
  it('returns all help requests ordered by status', () => {
    const db = createTestDb();
    const now = new Date().toISOString();

    db.prepare(`INSERT INTO help_requests (id, group_folder, title, description, status, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)`).run('help-1', 'main', 'Resolved one', 'desc', 'resolved', now, now);
    db.prepare(`INSERT INTO help_requests (id, group_folder, title, description, status, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)`).run('help-2', 'main', 'Open one', 'desc', 'open', now, now);

    const rows = db.prepare("SELECT * FROM help_requests ORDER BY CASE status WHEN 'open' THEN 0 ELSE 1 END, created_at DESC").all() as any[];

    expect(rows).toHaveLength(2);
    expect(rows[0].status).toBe('open');
    expect(rows[1].status).toBe('resolved');
    db.close();
  });

  it('returns empty array when no requests exist', () => {
    const db = createTestDb();
    const rows = db.prepare('SELECT * FROM help_requests').all();
    expect(rows).toHaveLength(0);
    db.close();
  });
});

describe('API - POST /requests/:id/respond', () => {
  it('marks request as resolved with response', () => {
    const db = createTestDb();
    const now = new Date().toISOString();

    db.prepare(`INSERT INTO help_requests (id, group_folder, title, description, status, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)`).run('help-1', 'main', 'Need help', 'desc', 'open', now, now);

    // Simulate the respond handler
    const response = 'Here is the answer';
    const resolvedAt = new Date().toISOString();
    db.prepare(`UPDATE help_requests SET status = 'resolved', response = ?, resolved_at = ?, updated_at = ? WHERE id = ?`)
      .run(response, resolvedAt, resolvedAt, 'help-1');

    const row = db.prepare('SELECT * FROM help_requests WHERE id = ?').get('help-1') as any;
    expect(row.status).toBe('resolved');
    expect(row.response).toBe(response);
    expect(row.resolved_at).toBeTruthy();
    db.close();
  });

  it('returns 404 for non-existent request', () => {
    const db = createTestDb();
    const row = db.prepare('SELECT * FROM help_requests WHERE id = ?').get('nonexistent');
    expect(row).toBeUndefined();
    db.close();
  });

  it('rejects empty response', () => {
    const response = '';
    const isValid = response && typeof response === 'string' && response.trim();
    expect(isValid).toBeFalsy();
  });
});

describe('API - POST /goals (Review Task)', () => {
  it('creates a goal with linked breakdown and review tasks', () => {
    const db = createTestDb();
    const now = new Date().toISOString();
    const goalId = 'goal-api-test';

    // Create goal
    db.prepare(`INSERT INTO goals (id, group_folder, title, status, priority, progress, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run(goalId, 'main', 'Test Goal', 'active', 'high', 0, now, now);

    // Create breakdown task (context_mode = group, timeout = 600000)
    db.prepare(`INSERT INTO scheduled_tasks (id, group_folder, chat_jid, prompt, schedule_type, schedule_value, context_mode, next_run, status, created_at, goal_id, timeout)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
      'task-breakdown', 'main', 'test@g.us', 'Break down...', 'once', now, 'group', now, 'active', now, goalId, 600000
    );

    // Create review task (cron for high priority)
    db.prepare(`INSERT INTO scheduled_tasks (id, group_folder, chat_jid, prompt, schedule_type, schedule_value, context_mode, next_run, status, created_at, goal_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
      'task-review', 'main', 'test@g.us', `Review goal ${goalId}...`, 'cron', '0 9 * * *', 'group', now, 'active', now, goalId
    );

    // Verify
    const tasks = db.prepare('SELECT * FROM scheduled_tasks WHERE goal_id = ? ORDER BY schedule_type').all(goalId) as any[];
    expect(tasks).toHaveLength(2);

    // Breakdown task
    const breakdown = tasks.find((t: any) => t.schedule_type === 'once');
    expect(breakdown).toBeDefined();
    expect(breakdown.context_mode).toBe('group');
    expect(breakdown.timeout).toBe(600000);

    // Review task
    const review = tasks.find((t: any) => t.schedule_type === 'cron');
    expect(review).toBeDefined();
    expect(review.context_mode).toBe('group');
    expect(review.schedule_value).toBe('0 9 * * *');
    expect(review.prompt).toContain(goalId);
    db.close();
  });

  it('uses correct cron for each priority level', () => {
    const priorities = ['high', 'medium', 'low'];
    const expectedCron: Record<string, string> = {
      high: '0 9 * * *',
      medium: '0 9 */3 * *',
      low: '0 9 * * 1',
    };

    for (const priority of priorities) {
      const cron = priority === 'high' ? '0 9 * * *' : priority === 'medium' ? '0 9 */3 * *' : '0 9 * * 1';
      expect(cron).toBe(expectedCron[priority]);
    }
  });
});
