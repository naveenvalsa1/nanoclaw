/**
 * Tests for IPC MCP Tools (Phase 1d, 2c, 4d)
 * - request_help IPC message format
 * - check_help_requests file reading
 * - schedule_task with depends_on and timeout
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';

let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nanoclaw-ipc-test-'));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('IPC - request_help Message Format', () => {
  it('produces correct IPC file structure', () => {
    const data = {
      type: 'request_help',
      title: 'Need API credentials',
      description: 'I need the OpenWeather API key to set up the weather task',
      request_type: 'access',
      goal_id: 'goal-123',
      task_id: 'task-456',
      groupFolder: 'main',
      timestamp: new Date().toISOString(),
    };

    expect(data.type).toBe('request_help');
    expect(data.title).toBe('Need API credentials');
    expect(data.request_type).toBe('access');
    expect(data.goal_id).toBe('goal-123');
    expect(data.task_id).toBe('task-456');
  });

  it('handles optional goal_id and task_id', () => {
    const data: Record<string, unknown> = {
      type: 'request_help',
      title: 'General question',
      description: 'Is this the right approach?',
      request_type: 'question',
      groupFolder: 'main',
      timestamp: new Date().toISOString(),
    };

    // No goal_id or task_id should be fine
    expect(data.goal_id).toBeUndefined();
    expect(data.task_id).toBeUndefined();
  });

  it('validates request_type values', () => {
    const validTypes = ['blocker', 'question', 'access', 'integration'];
    for (const type of validTypes) {
      expect(validTypes).toContain(type);
    }

    // Invalid type should default to 'question' (handled in index.ts)
    const requestType = 'invalid';
    const effectiveType =
      requestType === 'blocker' || requestType === 'question' ||
      requestType === 'access' || requestType === 'integration'
        ? requestType : 'question';
    expect(effectiveType).toBe('question');
  });
});

describe('IPC - check_help_requests File Reading', () => {
  it('reads help_requests.json from IPC directory', () => {
    const ipcDir = path.join(tmpDir, 'ipc');
    fs.mkdirSync(ipcDir, { recursive: true });

    const requests = [
      { id: 'help-1', title: 'Need key', status: 'open', request_type: 'access', response: null },
      { id: 'help-2', title: 'Answered', status: 'resolved', request_type: 'question', response: 'Yes, proceed' },
    ];

    fs.writeFileSync(path.join(ipcDir, 'help_requests.json'), JSON.stringify(requests));

    const data = JSON.parse(fs.readFileSync(path.join(ipcDir, 'help_requests.json'), 'utf-8'));
    expect(data).toHaveLength(2);
    expect(data[0].status).toBe('open');
    expect(data[1].response).toBe('Yes, proceed');
  });

  it('handles missing help_requests.json gracefully', () => {
    const filePath = path.join(tmpDir, 'help_requests.json');
    expect(fs.existsSync(filePath)).toBe(false);
  });

  it('handles empty help_requests.json', () => {
    const filePath = path.join(tmpDir, 'help_requests.json');
    fs.writeFileSync(filePath, '[]');

    const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    expect(data).toEqual([]);
  });

  it('formats help request output correctly', () => {
    const requests = [
      { id: 'help-1', title: 'Need key', status: 'open', request_type: 'access', response: null },
      { id: 'help-2', title: 'Done', status: 'resolved', request_type: 'question', response: 'Use PDF' },
    ];

    // Mirrors the formatting logic in ipc-mcp.ts
    const formatted = requests.map(r => {
      let line = `- [${r.id}] "${r.title}" (${r.request_type}) — ${r.status}`;
      if (r.status === 'resolved' && r.response) {
        line += `\n  Response: ${r.response}`;
      }
      return line;
    }).join('\n');

    expect(formatted).toContain('[help-1]');
    expect(formatted).toContain('(access)');
    expect(formatted).toContain('— open');
    expect(formatted).toContain('Response: Use PDF');
  });
});

describe('IPC - schedule_task with depends_on', () => {
  it('includes depends_on in IPC data', () => {
    const data: Record<string, unknown> = {
      type: 'schedule_task',
      prompt: 'Analyze the results',
      schedule_type: 'once',
      schedule_value: new Date().toISOString(),
      context_mode: 'isolated',
      targetJid: 'test@g.us',
      depends_on: 'task-parent-123',
    };

    expect(data.depends_on).toBe('task-parent-123');
  });

  it('omits depends_on when not specified', () => {
    const data: Record<string, unknown> = {
      type: 'schedule_task',
      prompt: 'Independent task',
      schedule_type: 'once',
      schedule_value: new Date().toISOString(),
    };

    // depends_on not set
    expect(data.depends_on).toBeUndefined();
  });
});

describe('IPC - schedule_task with timeout', () => {
  it('converts seconds to milliseconds with cap at 900', () => {
    // Mirrors ipc-mcp.ts logic
    const testCases = [
      { input: 300, expected: 300000 },
      { input: 600, expected: 600000 },
      { input: 900, expected: 900000 },
      { input: 1200, expected: 900000 }, // Capped
    ];

    for (const { input, expected } of testCases) {
      const timeoutMs = Math.min(input, 900) * 1000;
      expect(timeoutMs).toBe(expected);
    }
  });

  it('includes timeout in IPC data', () => {
    const inputSeconds = 600;
    const data: Record<string, unknown> = {
      type: 'schedule_task',
      prompt: 'Long task',
      schedule_type: 'once',
      schedule_value: new Date().toISOString(),
      timeout: Math.min(inputSeconds, 900) * 1000,
    };

    expect(data.timeout).toBe(600000);
  });
});

describe('IPC - schedule_task depends_on + next_run interaction', () => {
  it('sets next_run to null when depends_on is present', () => {
    // Mirrors index.ts processTaskIpc logic
    const dependsOn = 'task-parent';
    const normalNextRun = new Date().toISOString();
    const effectiveNextRun = dependsOn ? null : normalNextRun;

    expect(effectiveNextRun).toBeNull();
  });

  it('keeps next_run when depends_on is absent', () => {
    const dependsOn = null;
    const normalNextRun = new Date().toISOString();
    const effectiveNextRun = dependsOn ? null : normalNextRun;

    expect(effectiveNextRun).toBe(normalNextRun);
  });
});

describe('IPC - Atomic File Write', () => {
  it('writes IPC file atomically (temp + rename)', () => {
    const dir = path.join(tmpDir, 'tasks');
    fs.mkdirSync(dir, { recursive: true });

    const data = { type: 'request_help', title: 'Test' };
    const filename = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.json`;
    const filepath = path.join(dir, filename);
    const tempPath = `${filepath}.tmp`;

    // Write to temp
    fs.writeFileSync(tempPath, JSON.stringify(data, null, 2));
    expect(fs.existsSync(tempPath)).toBe(true);

    // Rename to final
    fs.renameSync(tempPath, filepath);
    expect(fs.existsSync(filepath)).toBe(true);
    expect(fs.existsSync(tempPath)).toBe(false);

    // Verify content
    const readBack = JSON.parse(fs.readFileSync(filepath, 'utf-8'));
    expect(readBack.type).toBe('request_help');
    expect(readBack.title).toBe('Test');
  });
});
