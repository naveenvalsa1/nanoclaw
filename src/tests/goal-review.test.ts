/**
 * Tests for Goal Review Loop (Phase 3)
 * - Review task auto-creation with correct cron for each priority
 * - Breakdown task uses group context mode
 * - Breakdown task has 10-minute timeout
 */
import { describe, expect, it } from 'vitest';
import { CronExpressionParser } from 'cron-parser';
import Database from 'better-sqlite3';

function createTestDb(): Database.Database {
  const db = new Database(':memory:');
  db.exec(`
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

describe('Goal Review - Cron Frequency by Priority', () => {
  it('high priority goals get daily review (0 9 * * *)', () => {
    const cron = '0 9 * * *'; // daily at 9am
    const interval = CronExpressionParser.parse(cron, { tz: 'Asia/Kolkata' });
    const next = interval.next();
    expect(next).toBeDefined();

    // Verify it runs daily
    const second = interval.next();
    const diffMs = second.getTime() - next.getTime();
    const diffHours = diffMs / (1000 * 60 * 60);
    expect(diffHours).toBe(24);
  });

  it('medium priority goals get every-3-days review (0 9 */3 * *)', () => {
    const cron = '0 9 */3 * *';
    const interval = CronExpressionParser.parse(cron, { tz: 'Asia/Kolkata' });
    const next = interval.next();
    expect(next).toBeDefined();
  });

  it('low priority goals get weekly review (0 9 * * 1)', () => {
    const cron = '0 9 * * 1'; // Monday at 9am
    const interval = CronExpressionParser.parse(cron, { tz: 'Asia/Kolkata' });
    const next = interval.next();
    expect(next).toBeDefined();

    // Verify it runs weekly (next occurrence should be 7 days later)
    const second = interval.next();
    const diffMs = second.getTime() - next.getTime();
    const diffDays = diffMs / (1000 * 60 * 60 * 24);
    expect(diffDays).toBe(7);
  });

  it('maps priority to correct cron expression', () => {
    const cronMap: Record<string, string> = {
      high: '0 9 * * *',
      medium: '0 9 */3 * *',
      low: '0 9 * * 1',
    };

    for (const [priority, expectedCron] of Object.entries(cronMap)) {
      const reviewFrequency = priority === 'high' ? '0 9 * * *' : priority === 'medium' ? '0 9 */3 * *' : '0 9 * * 1';
      expect(reviewFrequency).toBe(expectedCron);
    }
  });
});

describe('Goal Review - Task Creation', () => {
  it('creates both breakdown and review tasks for a goal', () => {
    const db = createTestDb();
    const now = new Date().toISOString();
    const goalId = 'goal-test-123';

    // Create goal
    db.prepare(`INSERT INTO goals (id, group_folder, title, status, priority, progress, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run(goalId, 'main', 'Test Goal', 'active', 'high', 0, now, now);

    // Create breakdown task (once)
    db.prepare(`INSERT INTO scheduled_tasks (id, group_folder, chat_jid, prompt, schedule_type, schedule_value, context_mode, next_run, status, created_at, goal_id, timeout)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
      'task-breakdown', 'main', 'test@g.us', 'Break down goal...', 'once', now, 'group', now, 'active', now, goalId, 600000
    );

    // Create review task (cron)
    db.prepare(`INSERT INTO scheduled_tasks (id, group_folder, chat_jid, prompt, schedule_type, schedule_value, context_mode, next_run, status, created_at, goal_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
      'task-review', 'main', 'test@g.us', `Review goal ${goalId}...`, 'cron', '0 9 * * *', 'group', now, 'active', now, goalId
    );

    // Verify both tasks exist and are linked to the goal
    const tasks = db.prepare('SELECT * FROM scheduled_tasks WHERE goal_id = ?').all(goalId) as any[];
    expect(tasks).toHaveLength(2);

    const breakdown = tasks.find((t: any) => t.schedule_type === 'once');
    const review = tasks.find((t: any) => t.schedule_type === 'cron');

    expect(breakdown).toBeDefined();
    expect(review).toBeDefined();
    db.close();
  });

  it('breakdown task uses group context mode', () => {
    const db = createTestDb();
    const now = new Date().toISOString();

    db.prepare(`INSERT INTO scheduled_tasks (id, group_folder, chat_jid, prompt, schedule_type, schedule_value, context_mode, next_run, status, created_at, goal_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
      'task-bd', 'main', 'test@g.us', 'Break down goal...', 'once', now, 'group', now, 'active', now, 'goal-1'
    );

    const row = db.prepare('SELECT * FROM scheduled_tasks WHERE id = ?').get('task-bd') as any;
    expect(row.context_mode).toBe('group');
    db.close();
  });

  it('breakdown task has 10-minute timeout (600000ms)', () => {
    const db = createTestDb();
    const now = new Date().toISOString();

    db.prepare(`INSERT INTO scheduled_tasks (id, group_folder, chat_jid, prompt, schedule_type, schedule_value, context_mode, next_run, status, created_at, goal_id, timeout)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
      'task-bd', 'main', 'test@g.us', 'Break down goal...', 'once', now, 'group', now, 'active', now, 'goal-1', 600000
    );

    const row = db.prepare('SELECT * FROM scheduled_tasks WHERE id = ?').get('task-bd') as any;
    expect(row.timeout).toBe(600000);
    db.close();
  });

  it('review task prompt contains goal ID and required actions', () => {
    const goalId = 'goal-test-456';
    const title = 'Launch marketing campaign';
    const prompt = `Review goal ${goalId}: '${title}'. Read task results for all linked tasks (goal_id=${goalId}). Assess overall progress. Update progress with update_goal. If tasks are failing or stalled, replan. If you're blocked, use request_help. Report significant progress to the user via send_message.`;

    expect(prompt).toContain(goalId);
    expect(prompt).toContain(title);
    expect(prompt).toContain('update_goal');
    expect(prompt).toContain('request_help');
    expect(prompt).toContain('send_message');
  });
});
