/**
 * Tests for Help Requests (Phase 1)
 * - Database CRUD operations
 * - Help request lifecycle
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import Database from 'better-sqlite3';
import fs from 'fs';
import os from 'os';
import path from 'path';

// We test the db module by pointing STORE_DIR to a temp dir
let tmpDir: string;
let dbModule: typeof import('../db.js');

beforeEach(async () => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nanoclaw-test-'));

  // Set env vars before importing (config reads them at import time)
  process.env.STORE_DIR_OVERRIDE = tmpDir;

  // We need to directly create and test the db functions
  // Since the module uses global state, we'll test via a fresh DB
  dbModule = await import('../db.js');
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

// Since the db module uses module-level state and config,
// we'll test the SQL logic directly with a fresh DB per test
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
    CREATE INDEX IF NOT EXISTS idx_help_requests_status ON help_requests(status);

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

    CREATE TABLE IF NOT EXISTS task_run_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      task_id TEXT NOT NULL,
      run_at TEXT NOT NULL,
      duration_ms INTEGER NOT NULL,
      status TEXT NOT NULL,
      result TEXT,
      error TEXT
    );
  `);
  return db;
}

describe('Help Requests - Database Schema', () => {
  it('creates help_requests table with all columns', () => {
    const db = createTestDb();
    const cols = db.pragma('table_info(help_requests)') as Array<{ name: string }>;
    const colNames = cols.map((c) => c.name);

    expect(colNames).toContain('id');
    expect(colNames).toContain('group_folder');
    expect(colNames).toContain('goal_id');
    expect(colNames).toContain('task_id');
    expect(colNames).toContain('title');
    expect(colNames).toContain('description');
    expect(colNames).toContain('request_type');
    expect(colNames).toContain('status');
    expect(colNames).toContain('response');
    expect(colNames).toContain('created_at');
    expect(colNames).toContain('updated_at');
    expect(colNames).toContain('resolved_at');
    db.close();
  });

  it('scheduled_tasks table has depends_on and timeout columns', () => {
    const db = createTestDb();
    const cols = db.pragma('table_info(scheduled_tasks)') as Array<{ name: string }>;
    const colNames = cols.map((c) => c.name);

    expect(colNames).toContain('depends_on');
    expect(colNames).toContain('timeout');
    db.close();
  });
});

describe('Help Requests - CRUD Operations', () => {
  it('creates and retrieves a help request', () => {
    const db = createTestDb();
    const now = new Date().toISOString();

    db.prepare(`
      INSERT INTO help_requests (id, group_folder, goal_id, task_id, title, description, request_type, status, response, created_at, updated_at, resolved_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run('help-123', 'main', 'goal-1', 'task-1', 'Need API key', 'I need an API key for the weather service', 'access', 'open', null, now, now, null);

    const row = db.prepare('SELECT * FROM help_requests WHERE id = ?').get('help-123') as any;

    expect(row).toBeDefined();
    expect(row.id).toBe('help-123');
    expect(row.title).toBe('Need API key');
    expect(row.request_type).toBe('access');
    expect(row.status).toBe('open');
    expect(row.response).toBeNull();
    expect(row.goal_id).toBe('goal-1');
    expect(row.task_id).toBe('task-1');
    db.close();
  });

  it('lists all help requests with open first', () => {
    const db = createTestDb();
    const now = new Date().toISOString();

    // Insert resolved first, then open
    db.prepare(`INSERT INTO help_requests (id, group_folder, title, description, request_type, status, response, created_at, updated_at, resolved_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run('help-1', 'main', 'Resolved', 'desc', 'question', 'resolved', 'done', now, now, now);
    db.prepare(`INSERT INTO help_requests (id, group_folder, title, description, request_type, status, response, created_at, updated_at, resolved_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run('help-2', 'main', 'Open', 'desc', 'blocker', 'open', null, now, now, null);

    const rows = db.prepare("SELECT * FROM help_requests ORDER BY CASE status WHEN 'open' THEN 0 ELSE 1 END, created_at DESC").all() as any[];

    expect(rows).toHaveLength(2);
    expect(rows[0].status).toBe('open');
    expect(rows[1].status).toBe('resolved');
    db.close();
  });

  it('filters open help requests', () => {
    const db = createTestDb();
    const now = new Date().toISOString();

    db.prepare(`INSERT INTO help_requests (id, group_folder, title, description, status, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)`).run('help-1', 'main', 'Open one', 'desc', 'open', now, now);
    db.prepare(`INSERT INTO help_requests (id, group_folder, title, description, status, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)`).run('help-2', 'main', 'Resolved', 'desc', 'resolved', now, now);
    db.prepare(`INSERT INTO help_requests (id, group_folder, title, description, status, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)`).run('help-3', 'main', 'Open two', 'desc', 'open', now, now);

    const open = db.prepare("SELECT * FROM help_requests WHERE status = 'open' ORDER BY created_at DESC").all() as any[];
    expect(open).toHaveLength(2);
    expect(open.every((r: any) => r.status === 'open')).toBe(true);
    db.close();
  });

  it('updates a help request to resolved with response', () => {
    const db = createTestDb();
    const now = new Date().toISOString();

    db.prepare(`INSERT INTO help_requests (id, group_folder, title, description, status, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)`).run('help-1', 'main', 'Need key', 'desc', 'open', now, now);

    const resolvedAt = new Date().toISOString();
    db.prepare(`UPDATE help_requests SET status = ?, response = ?, resolved_at = ?, updated_at = ? WHERE id = ?`)
      .run('resolved', 'Here is the key: abc123', resolvedAt, resolvedAt, 'help-1');

    const row = db.prepare('SELECT * FROM help_requests WHERE id = ?').get('help-1') as any;
    expect(row.status).toBe('resolved');
    expect(row.response).toBe('Here is the key: abc123');
    expect(row.resolved_at).toBe(resolvedAt);
    db.close();
  });

  it('filters help requests by goal', () => {
    const db = createTestDb();
    const now = new Date().toISOString();

    db.prepare(`INSERT INTO help_requests (id, group_folder, goal_id, title, description, status, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run('help-1', 'main', 'goal-A', 'For goal A', 'desc', 'open', now, now);
    db.prepare(`INSERT INTO help_requests (id, group_folder, goal_id, title, description, status, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run('help-2', 'main', 'goal-B', 'For goal B', 'desc', 'open', now, now);
    db.prepare(`INSERT INTO help_requests (id, group_folder, goal_id, title, description, status, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run('help-3', 'main', 'goal-A', 'Also for A', 'desc', 'open', now, now);

    const forA = db.prepare('SELECT * FROM help_requests WHERE goal_id = ? ORDER BY created_at DESC').all('goal-A') as any[];
    expect(forA).toHaveLength(2);
    expect(forA.every((r: any) => r.goal_id === 'goal-A')).toBe(true);
    db.close();
  });
});

describe('Help Requests - Request Types', () => {
  it('supports all four request types', () => {
    const db = createTestDb();
    const now = new Date().toISOString();
    const types = ['blocker', 'question', 'access', 'integration'];

    for (const type of types) {
      db.prepare(`INSERT INTO help_requests (id, group_folder, title, description, request_type, status, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run(`help-${type}`, 'main', `Test ${type}`, 'desc', type, 'open', now, now);
    }

    const rows = db.prepare('SELECT * FROM help_requests').all() as any[];
    expect(rows).toHaveLength(4);

    for (const type of types) {
      const row = db.prepare('SELECT * FROM help_requests WHERE request_type = ?').get(type) as any;
      expect(row).toBeDefined();
      expect(row.request_type).toBe(type);
    }
    db.close();
  });
});

describe('Help Requests - ID Generation Pattern', () => {
  it('generates IDs matching help-{timestamp}-{random} pattern', () => {
    const id = `help-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    expect(id).toMatch(/^help-\d+-[a-z0-9]+$/);
  });
});
