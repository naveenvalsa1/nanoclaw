/**
 * IPC-based MCP Server for NanoClaw
 * Writes messages and tasks to files for the host process to pick up
 */

import { createSdkMcpServer, tool } from '@anthropic-ai/claude-agent-sdk';
import { z } from 'zod';
import fs from 'fs';
import path from 'path';
import { CronExpressionParser } from 'cron-parser';

const IPC_DIR = '/workspace/ipc';
const MESSAGES_DIR = path.join(IPC_DIR, 'messages');
const TASKS_DIR = path.join(IPC_DIR, 'tasks');

export interface IpcMcpContext {
  chatJid: string;
  groupFolder: string;
  isMain: boolean;
}

function writeIpcFile(dir: string, data: object): string {
  fs.mkdirSync(dir, { recursive: true });

  const filename = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.json`;
  const filepath = path.join(dir, filename);

  // Atomic write: temp file then rename
  const tempPath = `${filepath}.tmp`;
  fs.writeFileSync(tempPath, JSON.stringify(data, null, 2));
  fs.renameSync(tempPath, filepath);

  return filename;
}

export function createIpcMcp(ctx: IpcMcpContext) {
  const { chatJid, groupFolder, isMain } = ctx;

  return createSdkMcpServer({
    name: 'nanoclaw',
    version: '1.0.0',
    tools: [
      tool(
        'send_message',
        'Send a message to the user or group. The message is delivered immediately while you\'re still running. You can call this multiple times to send multiple messages.',
        {
          text: z.string().describe('The message text to send')
        },
        async (args) => {
          const data = {
            type: 'message',
            chatJid,
            text: args.text,
            groupFolder,
            timestamp: new Date().toISOString()
          };

          writeIpcFile(MESSAGES_DIR, data);

          return {
            content: [{
              type: 'text',
              text: 'Message sent.'
            }]
          };
        }
      ),

      tool(
        'schedule_task',
        `Schedule a recurring or one-time task. The task will run as a full agent with access to all tools.

CONTEXT MODE - Choose based on task type:
• "group": Task runs in the group's conversation context, with access to chat history. Use for tasks that need context about ongoing discussions, user preferences, or recent interactions.
• "isolated": Task runs in a fresh session with no conversation history. Use for independent tasks that don't need prior context. When using isolated mode, include all necessary context in the prompt itself.

If unsure which mode to use, you can ask the user. Examples:
- "Remind me about our discussion" → group (needs conversation context)
- "Check the weather every morning" → isolated (self-contained task)
- "Follow up on my request" → group (needs to know what was requested)
- "Generate a daily report" → isolated (just needs instructions in prompt)

SCHEDULE VALUE FORMAT (all times are LOCAL timezone):
• cron: Standard cron expression (e.g., "*/5 * * * *" for every 5 minutes, "0 9 * * *" for daily at 9am LOCAL time)
• interval: Milliseconds between runs (e.g., "300000" for 5 minutes, "3600000" for 1 hour)
• once: Local time WITHOUT "Z" suffix (e.g., "2026-02-01T15:30:00"). Do NOT use UTC/Z suffix.

GOAL LINKING: If this task is part of a goal, you MUST pass goal_id so the task appears under the goal in the dashboard. Tasks without goal_id will be orphaned.`,
        {
          prompt: z.string().describe('What the agent should do when the task runs. For isolated mode, include all necessary context here.'),
          schedule_type: z.enum(['cron', 'interval', 'once']).describe('cron=recurring at specific times, interval=recurring every N ms, once=run once at specific time'),
          schedule_value: z.string().describe('cron: "*/5 * * * *" | interval: milliseconds like "300000" | once: local timestamp like "2026-02-01T15:30:00" (no Z suffix!)'),
          context_mode: z.enum(['group', 'isolated']).default('group').describe('group=runs with chat history and memory, isolated=fresh session (include context in prompt)'),
          goal_id: z.string().optional().describe('Link this task to a goal. Use the goal ID from create_goal.'),
          depends_on: z.string().optional().describe('Task ID this task depends on. Will run after that task completes, with its result injected into the prompt. Use for multi-step workflows.'),
          timeout: z.number().optional().describe('Timeout in seconds for this task (max 900). Defaults to 300 (5 min). Use longer timeouts for complex tasks.'),
          parent_task_id: z.string().optional().describe('Parent task ID if this is a subtask. Use for breaking down complex tasks into sub-steps.'),
          ...(isMain ? { target_group_jid: z.string().optional().describe('JID of the group to schedule the task for. The group must be registered — look up JIDs in /workspace/project/data/registered_groups.json (the keys are JIDs). If the group is not registered, let the user know and ask if they want to activate it. Defaults to the current group.') } : {}),
        },
        async (args) => {
          // Validate schedule_value before writing IPC
          if (args.schedule_type === 'cron') {
            try {
              CronExpressionParser.parse(args.schedule_value);
            } catch (err) {
              return {
                content: [{ type: 'text', text: `Invalid cron: "${args.schedule_value}". Use format like "0 9 * * *" (daily 9am) or "*/5 * * * *" (every 5 min).` }],
                isError: true
              };
            }
          } else if (args.schedule_type === 'interval') {
            const ms = parseInt(args.schedule_value, 10);
            if (isNaN(ms) || ms <= 0) {
              return {
                content: [{ type: 'text', text: `Invalid interval: "${args.schedule_value}". Must be positive milliseconds (e.g., "300000" for 5 min).` }],
                isError: true
              };
            }
          } else if (args.schedule_type === 'once') {
            const date = new Date(args.schedule_value);
            if (isNaN(date.getTime())) {
              return {
                content: [{ type: 'text', text: `Invalid timestamp: "${args.schedule_value}". Use ISO 8601 format like "2026-02-01T15:30:00.000Z".` }],
                isError: true
              };
            }
          }

          // Non-main groups can only schedule for themselves
          const targetJid = isMain && args.target_group_jid ? args.target_group_jid : chatJid;

          const data: Record<string, unknown> = {
            type: 'schedule_task',
            prompt: args.prompt,
            schedule_type: args.schedule_type,
            schedule_value: args.schedule_value,
            context_mode: args.context_mode || 'group',
            targetJid,
            createdBy: groupFolder,
            timestamp: new Date().toISOString()
          };
          if (args.goal_id) {
            data.goal_id = args.goal_id;
          }
          if (args.depends_on) {
            data.depends_on = args.depends_on;
          }
          if (args.parent_task_id) {
            data.parent_task_id = args.parent_task_id;
          }
          if (args.timeout) {
            const timeoutMs = Math.min(args.timeout, 900) * 1000;
            data.timeout = timeoutMs;
          }

          const filename = writeIpcFile(TASKS_DIR, data);

          let response = `Task scheduled (${filename}): ${args.schedule_type} - ${args.schedule_value}`;
          if (!args.goal_id && /goal[-_]/.test(args.prompt)) {
            response += '\n\nWARNING: Your prompt mentions a goal but you did not pass goal_id. The task will NOT appear under the goal in the dashboard. Re-create with goal_id if this was intended to be linked.';
          }

          return {
            content: [{
              type: 'text',
              text: response
            }]
          };
        }
      ),

      // Reads from current_tasks.json which host keeps updated
      tool(
        'list_tasks',
        'List all scheduled tasks. From main: shows all tasks. From other groups: shows only that group\'s tasks.',
        {},
        async () => {
          const tasksFile = path.join(IPC_DIR, 'current_tasks.json');

          try {
            if (!fs.existsSync(tasksFile)) {
              return {
                content: [{
                  type: 'text',
                  text: 'No scheduled tasks found.'
                }]
              };
            }

            const allTasks = JSON.parse(fs.readFileSync(tasksFile, 'utf-8'));

            const tasks = isMain
              ? allTasks
              : allTasks.filter((t: { groupFolder: string }) => t.groupFolder === groupFolder);

            if (tasks.length === 0) {
              return {
                content: [{
                  type: 'text',
                  text: 'No scheduled tasks found.'
                }]
              };
            }

            const formatted = tasks.map((t: { id: string; prompt: string; schedule_type: string; schedule_value: string; status: string; next_run: string }) =>
              `- [${t.id}] ${t.prompt.slice(0, 50)}... (${t.schedule_type}: ${t.schedule_value}) - ${t.status}, next: ${t.next_run || 'N/A'}`
            ).join('\n');

            return {
              content: [{
                type: 'text',
                text: `Scheduled tasks:\n${formatted}`
              }]
            };
          } catch (err) {
            return {
              content: [{
                type: 'text',
                text: `Error reading tasks: ${err instanceof Error ? err.message : String(err)}`
              }]
            };
          }
        }
      ),

      tool(
        'pause_task',
        'Pause a scheduled task. It will not run until resumed.',
        {
          task_id: z.string().describe('The task ID to pause')
        },
        async (args) => {
          const data = {
            type: 'pause_task',
            taskId: args.task_id,
            groupFolder,
            isMain,
            timestamp: new Date().toISOString()
          };

          writeIpcFile(TASKS_DIR, data);

          return {
            content: [{
              type: 'text',
              text: `Task ${args.task_id} pause requested.`
            }]
          };
        }
      ),

      tool(
        'resume_task',
        'Resume a paused task.',
        {
          task_id: z.string().describe('The task ID to resume')
        },
        async (args) => {
          const data = {
            type: 'resume_task',
            taskId: args.task_id,
            groupFolder,
            isMain,
            timestamp: new Date().toISOString()
          };

          writeIpcFile(TASKS_DIR, data);

          return {
            content: [{
              type: 'text',
              text: `Task ${args.task_id} resume requested.`
            }]
          };
        }
      ),

      tool(
        'cancel_task',
        'Cancel and delete a scheduled task.',
        {
          task_id: z.string().describe('The task ID to cancel')
        },
        async (args) => {
          const data = {
            type: 'cancel_task',
            taskId: args.task_id,
            groupFolder,
            isMain,
            timestamp: new Date().toISOString()
          };

          writeIpcFile(TASKS_DIR, data);

          return {
            content: [{
              type: 'text',
              text: `Task ${args.task_id} cancellation requested.`
            }]
          };
        }
      ),

      tool(
        'create_goal',
        `Create a high-level goal. Goals are objectives that guide your work and can have tasks linked to them.

When to create a goal:
- User describes something they want to achieve (not a one-off task)
- User says "I want to...", "Help me...", "Keep track of...", "Make sure..."
- The objective requires multiple tasks or ongoing effort

After creating a goal, break it down into tasks using schedule_task with the goal_id.`,
        {
          id: z.string().describe('Goal ID you generate, format: goal-{timestamp}-{random} (e.g. goal-1700000000000-a1b2c3)'),
          title: z.string().describe('Short title for the goal'),
          description: z.string().optional().describe('Detailed description of what this goal aims to achieve'),
          priority: z.enum(['high', 'medium', 'low']).default('medium').describe('Goal priority'),
          deadline: z.string().optional().describe('Optional deadline as ISO timestamp (e.g. "2026-03-01T00:00:00")'),
          project_id: z.string().optional().describe('Link this goal to a project. Use the project ID from create_project.')
        },
        async (args) => {
          const data: Record<string, unknown> = {
            type: 'create_goal',
            id: args.id,
            title: args.title,
            description: args.description || null,
            priority: args.priority || 'medium',
            deadline: args.deadline || null,
            groupFolder,
            timestamp: new Date().toISOString()
          };
          if (args.project_id) data.project_id = args.project_id;

          writeIpcFile(TASKS_DIR, data);

          return {
            content: [{
              type: 'text',
              text: `Goal created: "${args.title}" (${args.id}). Now create tasks linked to this goal using schedule_task with goal_id="${args.id}".`
            }]
          };
        }
      ),

      tool(
        'update_goal',
        'Update a goal\'s status, progress, or details.',
        {
          goal_id: z.string().describe('The goal ID to update'),
          status: z.enum(['active', 'paused', 'completed', 'cancelled']).optional().describe('New status'),
          progress: z.number().min(0).max(100).optional().describe('Progress percentage (0-100)'),
          description: z.string().optional().describe('Updated description'),
          priority: z.enum(['high', 'medium', 'low']).optional().describe('Updated priority'),
          deadline: z.string().optional().describe('Updated deadline as ISO timestamp')
        },
        async (args) => {
          const data: Record<string, unknown> = {
            type: 'update_goal',
            goalId: args.goal_id,
            groupFolder,
            timestamp: new Date().toISOString()
          };
          if (args.status !== undefined) data.status = args.status;
          if (args.progress !== undefined) data.progress = args.progress;
          if (args.description !== undefined) data.description = args.description;
          if (args.priority !== undefined) data.priority = args.priority;
          if (args.deadline !== undefined) data.deadline = args.deadline;

          writeIpcFile(TASKS_DIR, data);

          const updates = [];
          if (args.status) updates.push(`status=${args.status}`);
          if (args.progress !== undefined) updates.push(`progress=${args.progress}%`);
          if (args.priority) updates.push(`priority=${args.priority}`);

          return {
            content: [{
              type: 'text',
              text: `Goal ${args.goal_id} update requested: ${updates.join(', ') || 'details updated'}.`
            }]
          };
        }
      ),

      tool(
        'list_goals',
        'List all goals. From main: shows all goals. From other groups: shows only that group\'s goals.',
        {},
        async () => {
          const goalsFile = path.join(IPC_DIR, 'current_goals.json');

          try {
            if (!fs.existsSync(goalsFile)) {
              return {
                content: [{
                  type: 'text',
                  text: 'No goals found.'
                }]
              };
            }

            const allGoals = JSON.parse(fs.readFileSync(goalsFile, 'utf-8'));

            const goals = isMain
              ? allGoals
              : allGoals.filter((g: { group_folder: string }) => g.group_folder === groupFolder);

            if (goals.length === 0) {
              return {
                content: [{
                  type: 'text',
                  text: 'No goals found.'
                }]
              };
            }

            const formatted = goals.map((g: { id: string; title: string; status: string; priority: string; progress: number; deadline: string | null }) =>
              `- [${g.id}] ${g.title} (${g.status}, ${g.priority}, ${g.progress}% done${g.deadline ? `, deadline: ${g.deadline}` : ''})`
            ).join('\n');

            return {
              content: [{
                type: 'text',
                text: `Goals:\n${formatted}`
              }]
            };
          } catch (err) {
            return {
              content: [{
                type: 'text',
                text: `Error reading goals: ${err instanceof Error ? err.message : String(err)}`
              }]
            };
          }
        }
      ),

      tool(
        'register_group',
        `Register a new Telegram group so the agent can respond to messages there. Main group only.

Use available_groups.json to find the chat ID for a group. The folder name should be lowercase with hyphens (e.g., "family-chat").`,
        {
          jid: z.string().describe('The Telegram chat ID (e.g., "-1001234567890")'),
          name: z.string().describe('Display name for the group'),
          folder: z.string().describe('Folder name for group files (lowercase, hyphens, e.g., "family-chat")'),
          trigger: z.string().describe('Trigger word (e.g., "@Andy")')
        },
        async (args) => {
          if (!isMain) {
            return {
              content: [{ type: 'text', text: 'Only the main group can register new groups.' }],
              isError: true
            };
          }

          const data = {
            type: 'register_group',
            jid: args.jid,
            name: args.name,
            folder: args.folder,
            trigger: args.trigger,
            timestamp: new Date().toISOString()
          };

          writeIpcFile(TASKS_DIR, data);

          return {
            content: [{
              type: 'text',
              text: `Group "${args.name}" registered. It will start receiving messages immediately.`
            }]
          };
        }
      ),

      tool(
        'request_help',
        `Ask the user for help when you're blocked or need something. The request will be sent to the user via Telegram and shown in the dashboard where they can respond.

Request types:
- blocker: You can't proceed without this (missing access, credentials, etc.)
- question: You need clarification on requirements
- access: You need access to a system, API, or resource
- integration: You need a new integration set up

Always link to the relevant project_id, goal_id, and task_id if applicable.`,
        {
          title: z.string().describe('Short title for the help request'),
          description: z.string().describe('Detailed description of what you need help with'),
          request_type: z.enum(['blocker', 'question', 'access', 'integration']).default('question').describe('Type of help needed'),
          project_id: z.string().optional().describe('Project ID this request relates to'),
          goal_id: z.string().optional().describe('Goal ID this request relates to'),
          task_id: z.string().optional().describe('Task ID this request relates to')
        },
        async (args) => {
          const data: Record<string, unknown> = {
            type: 'request_help',
            title: args.title,
            description: args.description,
            request_type: args.request_type || 'question',
            groupFolder,
            timestamp: new Date().toISOString()
          };
          if (args.project_id) data.project_id = args.project_id;
          if (args.goal_id) data.goal_id = args.goal_id;
          if (args.task_id) data.task_id = args.task_id;

          writeIpcFile(TASKS_DIR, data);

          return {
            content: [{
              type: 'text',
              text: `Help request sent: "${args.title}". The user will be notified via Telegram and can respond in the dashboard.`
            }]
          };
        }
      ),

      tool(
        'create_project',
        `Create a top-level project. Projects are containers for related goals.

Examples of projects: "Notion Press", "Zournal", "Zero Origin", "Personal Health".
After creating a project, create goals within it using create_goal with project_id.`,
        {
          id: z.string().describe('Project ID you generate, format: proj-{short-slug} (e.g. proj-notion-press)'),
          name: z.string().describe('Short name for the project'),
          description: z.string().optional().describe('Description of what this project is about')
        },
        async (args) => {
          const data = {
            type: 'create_project',
            id: args.id,
            name: args.name,
            description: args.description || null,
            groupFolder,
            timestamp: new Date().toISOString()
          };

          writeIpcFile(TASKS_DIR, data);

          return {
            content: [{
              type: 'text',
              text: `Project created: "${args.name}" (${args.id}). Now create goals within this project using create_goal with project_id="${args.id}".`
            }]
          };
        }
      ),

      tool(
        'update_project',
        'Update a project\'s name, description, or status.',
        {
          project_id: z.string().describe('The project ID to update'),
          name: z.string().optional().describe('Updated project name'),
          description: z.string().optional().describe('Updated description'),
          status: z.enum(['active', 'paused', 'completed', 'archived']).optional().describe('New status')
        },
        async (args) => {
          const data: Record<string, unknown> = {
            type: 'update_project',
            projectId: args.project_id,
            groupFolder,
            timestamp: new Date().toISOString()
          };
          if (args.name !== undefined) data.name = args.name;
          if (args.description !== undefined) data.description = args.description;
          if (args.status !== undefined) data.status = args.status;

          writeIpcFile(TASKS_DIR, data);

          const updates = [];
          if (args.name) updates.push(`name=${args.name}`);
          if (args.status) updates.push(`status=${args.status}`);

          return {
            content: [{
              type: 'text',
              text: `Project ${args.project_id} update requested: ${updates.join(', ') || 'details updated'}.`
            }]
          };
        }
      ),

      tool(
        'list_projects',
        'List all projects. From main: shows all projects. From other groups: shows only that group\'s projects.',
        {},
        async () => {
          const projectsFile = path.join(IPC_DIR, 'current_projects.json');

          try {
            if (!fs.existsSync(projectsFile)) {
              return {
                content: [{
                  type: 'text',
                  text: 'No projects found.'
                }]
              };
            }

            const allProjects = JSON.parse(fs.readFileSync(projectsFile, 'utf-8'));

            const projects = isMain
              ? allProjects
              : allProjects.filter((p: { group_folder: string }) => p.group_folder === groupFolder);

            if (projects.length === 0) {
              return {
                content: [{
                  type: 'text',
                  text: 'No projects found.'
                }]
              };
            }

            const formatted = projects.map((p: { id: string; name: string; status: string; description: string | null }) =>
              `- [${p.id}] ${p.name} (${p.status})${p.description ? ` — ${p.description.slice(0, 60)}` : ''}`
            ).join('\n');

            return {
              content: [{
                type: 'text',
                text: `Projects:\n${formatted}`
              }]
            };
          } catch (err) {
            return {
              content: [{
                type: 'text',
                text: `Error reading projects: ${err instanceof Error ? err.message : String(err)}`
              }]
            };
          }
        }
      ),

      tool(
        'check_help_requests',
        'Check for help request responses from the user. Use this to see if the user has responded to any of your previous help requests before proceeding.',
        {},
        async () => {
          const requestsFile = path.join(IPC_DIR, 'help_requests.json');

          try {
            if (!fs.existsSync(requestsFile)) {
              return {
                content: [{
                  type: 'text',
                  text: 'No help requests found.'
                }]
              };
            }

            const requests = JSON.parse(fs.readFileSync(requestsFile, 'utf-8'));

            if (!Array.isArray(requests) || requests.length === 0) {
              return {
                content: [{
                  type: 'text',
                  text: 'No help requests found.'
                }]
              };
            }

            const formatted = requests.map((r: { id: string; title: string; status: string; request_type: string; response: string | null; created_at: string }) => {
              let line = `- [${r.id}] "${r.title}" (${r.request_type}) — ${r.status}`;
              if (r.status === 'resolved' && r.response) {
                line += `\n  Response: ${r.response}`;
              }
              return line;
            }).join('\n');

            return {
              content: [{
                type: 'text',
                text: `Help requests:\n${formatted}`
              }]
            };
          } catch (err) {
            return {
              content: [{
                type: 'text',
                text: `Error reading help requests: ${err instanceof Error ? err.message : String(err)}`
              }]
            };
          }
        }
      )
    ]
  });
}
