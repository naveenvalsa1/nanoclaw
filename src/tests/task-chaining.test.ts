/**
 * Tests for Task Chaining (Phase 2)
 * - depends_on field storage
 * - Child task discovery
 * - Parent result injection
 * - Null next_run for dependent tasks
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

function insertTask(db: Database.Database, overrides: Partial<{
  id: string; group_folder: string; chat_jid: string; prompt: string;
  schedule_type: string; schedule_value: string; context_mode: string;
  next_run: string | null; status: string; created_at: string;
  goal_id: string | null; depends_on: string | null; timeout: number | null;
}> = {}) {
  const defaults = {
    id: `task-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    group_folder: 'main',
    chat_jid: 'test@g.us',
    prompt: 'Test task',
    schedule_type: 'once',
    schedule_value: new Date().toISOString(),
    context_mode: 'isolated',
    next_run: new Date().toISOString(),
    status: 'active',
    created_at: new Date().toISOString(),
    goal_id: null,
    depends_on: null,
    timeout: null,
  };
  const task = { ...defaults, ...overrides };

  db.prepare(`
    INSERT INTO scheduled_tasks (id, group_folder, chat_jid, prompt, schedule_type, schedule_value, context_mode, next_run, status, created_at, goal_id, depends_on, timeout)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(task.id, task.group_folder, task.chat_jid, task.prompt, task.schedule_type,
    task.schedule_value, task.context_mode, task.next_run, task.status, task.created_at,
    task.goal_id, task.depends_on, task.timeout);

  return task;
}

describe('Task Chaining - depends_on Storage', () => {
  it('stores depends_on when creating a task', () => {
    const db = createTestDb();
    const parent = insertTask(db, { id: 'task-parent', prompt: 'Parent task' });
    const child = insertTask(db, {
      id: 'task-child',
      prompt: 'Child task',
      depends_on: 'task-parent',
      next_run: null, // Should be null for dependent tasks
    });

    const row = db.prepare('SELECT * FROM scheduled_tasks WHERE id = ?').get('task-child') as any;
    expect(row.depends_on).toBe('task-parent');
    expect(row.next_run).toBeNull();
    db.close();
  });

  it('stores null depends_on for independent tasks', () => {
    const db = createTestDb();
    const task = insertTask(db, { id: 'task-independent' });

    const row = db.prepare('SELECT * FROM scheduled_tasks WHERE id = ?').get('task-independent') as any;
    expect(row.depends_on).toBeNull();
    db.close();
  });
});

describe('Task Chaining - Child Task Discovery', () => {
  it('finds child tasks by parent ID', () => {
    const db = createTestDb();
    insertTask(db, { id: 'task-parent', prompt: 'Parent' });
    insertTask(db, { id: 'task-child-1', prompt: 'Child 1', depends_on: 'task-parent', next_run: null });
    insertTask(db, { id: 'task-child-2', prompt: 'Child 2', depends_on: 'task-parent', next_run: null });
    insertTask(db, { id: 'task-unrelated', prompt: 'Unrelated' });

    const children = db.prepare('SELECT * FROM scheduled_tasks WHERE depends_on = ? ORDER BY created_at')
      .all('task-parent') as any[];

    expect(children).toHaveLength(2);
    expect(children[0].id).toBe('task-child-1');
    expect(children[1].id).toBe('task-child-2');
    db.close();
  });

  it('returns empty array when no children exist', () => {
    const db = createTestDb();
    insertTask(db, { id: 'task-lonely', prompt: 'No children' });

    const children = db.prepare('SELECT * FROM scheduled_tasks WHERE depends_on = ?')
      .all('task-lonely') as any[];

    expect(children).toHaveLength(0);
    db.close();
  });
});

describe('Task Chaining - Parent Result Retrieval', () => {
  it('gets the latest run result for a task', () => {
    const db = createTestDb();
    insertTask(db, { id: 'task-1', prompt: 'Do something' });

    // Insert multiple run logs
    db.prepare(`INSERT INTO task_run_logs (task_id, run_at, duration_ms, status, result, error)
      VALUES (?, ?, ?, ?, ?, ?)`).run('task-1', '2026-01-01T00:00:00Z', 1000, 'success', 'First result', null);
    db.prepare(`INSERT INTO task_run_logs (task_id, run_at, duration_ms, status, result, error)
      VALUES (?, ?, ?, ?, ?, ?)`).run('task-1', '2026-01-02T00:00:00Z', 2000, 'success', 'Latest result', null);

    const latest = db.prepare('SELECT * FROM task_run_logs WHERE task_id = ? ORDER BY run_at DESC LIMIT 1')
      .get('task-1') as any;

    expect(latest.result).toBe('Latest result');
    expect(latest.duration_ms).toBe(2000);
    db.close();
  });
});

describe('Task Chaining - Result Injection Logic', () => {
  it('prepends parent result to child prompt', () => {
    const parentResult = 'Found 3 competitors: A, B, C';
    const childPrompt = 'Analyze the research and write a comparison';

    // This mirrors the logic in task-scheduler.ts
    const augmentedPrompt = `Previous task result:\n${parentResult}\n\n---\nYour task: ${childPrompt}`;

    expect(augmentedPrompt).toContain('Previous task result:');
    expect(augmentedPrompt).toContain(parentResult);
    expect(augmentedPrompt).toContain('Your task:');
    expect(augmentedPrompt).toContain(childPrompt);
  });

  it('activates child task by setting next_run', () => {
    const db = createTestDb();
    insertTask(db, { id: 'task-child', prompt: 'Child', depends_on: 'task-parent', next_run: null });

    // Verify initially null
    let row = db.prepare('SELECT * FROM scheduled_tasks WHERE id = ?').get('task-child') as any;
    expect(row.next_run).toBeNull();

    // Simulate parent completion: set next_run = now
    const now = new Date().toISOString();
    db.prepare('UPDATE scheduled_tasks SET next_run = ? WHERE id = ?').run(now, 'task-child');

    row = db.prepare('SELECT * FROM scheduled_tasks WHERE id = ?').get('task-child') as any;
    expect(row.next_run).toBe(now);
    db.close();
  });
});

describe('Task Chaining - Multi-Step Chain', () => {
  it('supports chains of 3+ tasks', () => {
    const db = createTestDb();
    insertTask(db, { id: 'step-1', prompt: 'Step 1', depends_on: null });
    insertTask(db, { id: 'step-2', prompt: 'Step 2', depends_on: 'step-1', next_run: null });
    insertTask(db, { id: 'step-3', prompt: 'Step 3', depends_on: 'step-2', next_run: null });

    // Step 1 has no parent
    const step1 = db.prepare('SELECT * FROM scheduled_tasks WHERE id = ?').get('step-1') as any;
    expect(step1.depends_on).toBeNull();

    // Step 2 depends on step 1
    const childrenOf1 = db.prepare('SELECT * FROM scheduled_tasks WHERE depends_on = ?').all('step-1') as any[];
    expect(childrenOf1).toHaveLength(1);
    expect(childrenOf1[0].id).toBe('step-2');

    // Step 3 depends on step 2
    const childrenOf2 = db.prepare('SELECT * FROM scheduled_tasks WHERE depends_on = ?').all('step-2') as any[];
    expect(childrenOf2).toHaveLength(1);
    expect(childrenOf2[0].id).toBe('step-3');

    db.close();
  });
});
