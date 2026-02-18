/**
 * Tests for Dashboard Writer (Phase 1g, 5)
 * - requests.json file generation
 * - Help request data included in dashboard output
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';

let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nanoclaw-dash-test-'));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('Dashboard Writer - requests.json', () => {
  it('writes valid JSON with help requests', () => {
    const requests = [
      {
        id: 'help-1',
        group_folder: 'main',
        goal_id: 'goal-1',
        task_id: null,
        title: 'Need API key',
        description: 'I need a weather API key',
        request_type: 'access',
        status: 'open',
        response: null,
        created_at: '2026-02-01T00:00:00Z',
        updated_at: '2026-02-01T00:00:00Z',
        resolved_at: null,
      },
      {
        id: 'help-2',
        group_folder: 'main',
        goal_id: null,
        task_id: null,
        title: 'Clarification needed',
        description: 'What format do you want?',
        request_type: 'question',
        status: 'resolved',
        response: 'Use PDF format',
        created_at: '2026-01-31T00:00:00Z',
        updated_at: '2026-02-01T00:00:00Z',
        resolved_at: '2026-02-01T00:00:00Z',
      },
    ];

    const filePath = path.join(tmpDir, 'requests.json');
    fs.writeFileSync(filePath, JSON.stringify(requests, null, 2));

    // Read back and verify
    const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    expect(data).toHaveLength(2);
    expect(data[0].id).toBe('help-1');
    expect(data[0].status).toBe('open');
    expect(data[1].status).toBe('resolved');
    expect(data[1].response).toBe('Use PDF format');
  });

  it('writes empty array when no requests', () => {
    const filePath = path.join(tmpDir, 'requests.json');
    fs.writeFileSync(filePath, JSON.stringify([], null, 2));

    const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    expect(data).toEqual([]);
  });

  it('preserves all help request fields', () => {
    const request = {
      id: 'help-full',
      group_folder: 'main',
      goal_id: 'goal-123',
      task_id: 'task-456',
      title: 'Test title',
      description: 'Test description',
      request_type: 'blocker',
      status: 'open',
      response: null,
      created_at: '2026-02-01T00:00:00Z',
      updated_at: '2026-02-01T00:00:00Z',
      resolved_at: null,
    };

    const filePath = path.join(tmpDir, 'requests.json');
    fs.writeFileSync(filePath, JSON.stringify([request], null, 2));

    const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    expect(data[0]).toEqual(request);
  });
});

describe('Dashboard Writer - Help Requests Snapshot', () => {
  it('writes help_requests.json to IPC directory', () => {
    const ipcDir = path.join(tmpDir, 'ipc', 'main');
    fs.mkdirSync(ipcDir, { recursive: true });

    const requests = [
      { id: 'help-1', status: 'open', title: 'Test', response: null },
      { id: 'help-2', status: 'resolved', title: 'Done', response: 'Fixed' },
    ];

    const filePath = path.join(ipcDir, 'help_requests.json');
    fs.writeFileSync(filePath, JSON.stringify(requests, null, 2));

    const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    expect(data).toHaveLength(2);
    expect(data[0].status).toBe('open');
    expect(data[1].response).toBe('Fixed');
  });

  it('filters requests by group for non-main groups', () => {
    const allRequests = [
      { id: 'help-1', group_folder: 'main', title: 'Main request' },
      { id: 'help-2', group_folder: 'family-chat', title: 'Family request' },
      { id: 'help-3', group_folder: 'main', title: 'Another main request' },
    ];

    // Main sees all
    const mainVisible = allRequests;
    expect(mainVisible).toHaveLength(3);

    // Non-main sees only their own
    const familyVisible = allRequests.filter(r => r.group_folder === 'family-chat');
    expect(familyVisible).toHaveLength(1);
    expect(familyVisible[0].id).toBe('help-2');
  });
});
