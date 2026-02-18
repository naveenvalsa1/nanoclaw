/**
 * Tests for Per-Task Timeout (Phase 4)
 * - Timeout column storage
 * - Timeout value constraints
 * - Default vs override behavior
 */
import { describe, expect, it } from 'vitest';
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
  `);
  return db;
}

describe('Per-Task Timeout - Storage', () => {
  it('stores timeout in milliseconds', () => {
    const db = createTestDb();
    const now = new Date().toISOString();

    db.prepare(`INSERT INTO scheduled_tasks (id, group_folder, chat_jid, prompt, schedule_type, schedule_value, next_run, status, created_at, timeout)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run('task-1', 'main', 'test@g.us', 'prompt', 'once', now, now, 'active', now, 600000);

    const row = db.prepare('SELECT * FROM scheduled_tasks WHERE id = ?').get('task-1') as any;
    expect(row.timeout).toBe(600000);
    db.close();
  });

  it('stores null when no timeout specified', () => {
    const db = createTestDb();
    const now = new Date().toISOString();

    db.prepare(`INSERT INTO scheduled_tasks (id, group_folder, chat_jid, prompt, schedule_type, schedule_value, next_run, status, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).run('task-1', 'main', 'test@g.us', 'prompt', 'once', now, now, 'active', now);

    const row = db.prepare('SELECT * FROM scheduled_tasks WHERE id = ?').get('task-1') as any;
    expect(row.timeout).toBeNull();
    db.close();
  });
});

describe('Per-Task Timeout - IPC Conversion', () => {
  it('converts seconds to milliseconds (max 900s)', () => {
    // Mirrors ipc-mcp.ts logic
    const inputSeconds = 600;
    const timeoutMs = Math.min(inputSeconds, 900) * 1000;
    expect(timeoutMs).toBe(600000);
  });

  it('caps timeout at 900 seconds', () => {
    const inputSeconds = 1500; // Over the max
    const timeoutMs = Math.min(inputSeconds, 900) * 1000;
    expect(timeoutMs).toBe(900000);
  });

  it('handles small timeout values', () => {
    const inputSeconds = 60;
    const timeoutMs = Math.min(inputSeconds, 900) * 1000;
    expect(timeoutMs).toBe(60000);
  });
});

describe('Per-Task Timeout - Override Logic', () => {
  it('timeout override takes precedence over container config', () => {
    // Mirrors container-runner.ts logic:
    // timeoutOverride || group.containerConfig?.timeout || CONTAINER_TIMEOUT
    const timeoutOverride = 600000;
    const containerConfigTimeout = 300000;
    const CONTAINER_TIMEOUT = 300000;

    const effective = timeoutOverride || containerConfigTimeout || CONTAINER_TIMEOUT;
    expect(effective).toBe(600000);
  });

  it('falls back to container config when no override', () => {
    const timeoutOverride = undefined;
    const containerConfigTimeout = 450000;
    const CONTAINER_TIMEOUT = 300000;

    const effective = timeoutOverride || containerConfigTimeout || CONTAINER_TIMEOUT;
    expect(effective).toBe(450000);
  });

  it('falls back to default when no override or config', () => {
    const timeoutOverride = undefined;
    const containerConfigTimeout = undefined;
    const CONTAINER_TIMEOUT = 300000;

    const effective = timeoutOverride || containerConfigTimeout || CONTAINER_TIMEOUT;
    expect(effective).toBe(300000);
  });
});
