import http from 'http';

import { API_PORT, MAIN_GROUP_FOLDER } from './config.js';
import {
  createGoal,
  createTask,
  getAllGoals,
  getTasksForGoal,
} from './db.js';
import { writeDashboardData } from './dashboard-writer.js';
import { RegisteredGroup } from './types.js';
import { logger } from './logger.js';

interface ApiDeps {
  registeredGroups: () => Record<string, RegisteredGroup>;
  writeGoalsSnapshotForGroup: (groupFolder: string, isMain: boolean) => void;
}

let server: http.Server | null = null;

function setCors(res: http.ServerResponse): void {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

function readBody(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    const MAX_BODY = 1024 * 64; // 64 KB
    req.on('data', (chunk: Buffer) => {
      size += chunk.length;
      if (size > MAX_BODY) {
        req.destroy();
        reject(new Error('Body too large'));
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString()));
    req.on('error', reject);
  });
}

function json(res: http.ServerResponse, status: number, data: unknown): void {
  setCors(res);
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

function findMainGroupJid(
  groups: Record<string, RegisteredGroup>,
): string | null {
  for (const [jid, group] of Object.entries(groups)) {
    if (group.folder === MAIN_GROUP_FOLDER) return jid;
  }
  return null;
}

export function startApiServer(deps: ApiDeps): void {
  server = http.createServer(async (req, res) => {
    const url = new URL(req.url || '/', `http://localhost:${API_PORT}`);
    const method = req.method?.toUpperCase() || 'GET';

    // CORS preflight
    if (method === 'OPTIONS') {
      setCors(res);
      res.writeHead(204);
      res.end();
      return;
    }

    try {
      if (url.pathname === '/goals' && method === 'POST') {
        await handlePostGoal(req, res, deps);
      } else if (url.pathname === '/goals' && method === 'GET') {
        handleGetGoals(res);
      } else {
        json(res, 404, { error: 'Not found' });
      }
    } catch (err) {
      logger.error({ err }, 'API request error');
      json(res, 500, { error: 'Internal server error' });
    }
  });

  server.listen(API_PORT, () => {
    logger.info({ port: API_PORT }, 'API server started');
  });
}

export function stopApiServer(): void {
  if (server) {
    server.close();
    server = null;
    logger.info('API server stopped');
  }
}

async function handlePostGoal(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  deps: ApiDeps,
): Promise<void> {
  const body = await readBody(req);
  let data: {
    title?: string;
    description?: string;
    priority?: string;
    deadline?: string;
  };
  try {
    data = JSON.parse(body);
  } catch {
    json(res, 400, { error: 'Invalid JSON' });
    return;
  }

  if (!data.title || typeof data.title !== 'string' || !data.title.trim()) {
    json(res, 400, { error: 'title is required' });
    return;
  }

  const now = new Date().toISOString();
  const goalId = `goal-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const priority =
    data.priority === 'high' || data.priority === 'medium' || data.priority === 'low'
      ? data.priority
      : 'medium';
  const description = data.description?.trim() || null;
  const deadline = data.deadline || null;

  // 1. Create goal in SQLite
  createGoal({
    id: goalId,
    group_folder: MAIN_GROUP_FOLDER,
    title: data.title.trim(),
    description,
    status: 'active',
    priority,
    progress: 0,
    deadline,
    created_at: now,
    updated_at: now,
    completed_at: null,
  });

  // 2. Find main group's chat JID for the breakdown task
  const groups = deps.registeredGroups();
  const mainJid = findMainGroupJid(groups);

  if (mainJid) {
    // 3. Create a one-time scheduled task for Andy to break down the goal
    const taskId = `task-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const promptParts = [
      `New goal created from dashboard. Goal ID: ${goalId}`,
      `Title: '${data.title.trim()}'.`,
    ];
    if (description) promptParts.push(`Description: '${description}'.`);
    promptParts.push(`Priority: ${priority}.`);
    promptParts.push(
      `Break this goal into actionable tasks and schedule them. IMPORTANT: Every task you create with schedule_task MUST include goal_id="${goalId}" so they are linked to this goal.`,
    );
    promptParts.push(
      `After scheduling all tasks, call update_goal with goal_id="${goalId}" to set progress to an appropriate initial value (e.g. 10 for planned). When the final task completes, it should call update_goal to set status="completed" and progress=100.`,
    );

    createTask({
      id: taskId,
      group_folder: MAIN_GROUP_FOLDER,
      chat_jid: mainJid,
      prompt: promptParts.join(' '),
      schedule_type: 'once',
      schedule_value: now,
      context_mode: 'isolated',
      next_run: now,
      status: 'active',
      created_at: now,
      goal_id: goalId,
    });

    logger.info(
      { goalId, taskId },
      'Goal created via API with breakdown task',
    );
  } else {
    logger.warn(
      { goalId },
      'Goal created via API but no main group found for breakdown task',
    );
  }

  // 4. Update dashboard data & goals snapshot
  writeDashboardData(MAIN_GROUP_FOLDER);
  deps.writeGoalsSnapshotForGroup(MAIN_GROUP_FOLDER, true);

  json(res, 201, { id: goalId, success: true });
}

function handleGetGoals(res: http.ServerResponse): void {
  const goals = getAllGoals();
  const goalsWithTasks = goals.map((g) => {
    const tasks = getTasksForGoal(g.id);
    return {
      ...g,
      tasks: tasks.map((t) => ({
        id: t.id,
        prompt: t.prompt,
        schedule_type: t.schedule_type,
        schedule_value: t.schedule_value,
        status: t.status,
        next_run: t.next_run,
        last_run: t.last_run,
        last_result: t.last_result,
      })),
    };
  });
  json(res, 200, goalsWithTasks);
}
