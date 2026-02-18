export interface AdditionalMount {
  hostPath: string; // Absolute path on host (supports ~ for home)
  containerPath: string; // Path inside container (under /workspace/extra/)
  readonly?: boolean; // Default: true for safety
}

/**
 * Mount Allowlist - Security configuration for additional mounts
 * This file should be stored at ~/.config/nanoclaw/mount-allowlist.json
 * and is NOT mounted into any container, making it tamper-proof from agents.
 */
export interface MountAllowlist {
  // Directories that can be mounted into containers
  allowedRoots: AllowedRoot[];
  // Glob patterns for paths that should never be mounted (e.g., ".ssh", ".gnupg")
  blockedPatterns: string[];
  // If true, non-main groups can only mount read-only regardless of config
  nonMainReadOnly: boolean;
}

export interface AllowedRoot {
  // Absolute path or ~ for home (e.g., "~/projects", "/var/repos")
  path: string;
  // Whether read-write mounts are allowed under this root
  allowReadWrite: boolean;
  // Optional description for documentation
  description?: string;
}

export interface ContainerConfig {
  additionalMounts?: AdditionalMount[];
  timeout?: number; // Default: 300000 (5 minutes)
}

export interface RegisteredGroup {
  name: string;
  folder: string;
  trigger: string;
  added_at: string;
  containerConfig?: ContainerConfig;
  requiresTrigger?: boolean; // Default: true for groups, false for solo chats
}

export interface NewMessage {
  id: string;
  chat_jid: string;
  sender: string;
  sender_name: string;
  content: string;
  timestamp: string;
}

export interface ScheduledTask {
  id: string;
  group_folder: string;
  chat_jid: string;
  prompt: string;
  schedule_type: 'cron' | 'interval' | 'once';
  schedule_value: string;
  context_mode: 'group' | 'isolated';
  next_run: string | null;
  last_run: string | null;
  last_result: string | null;
  status: 'active' | 'paused' | 'completed';
  created_at: string;
  goal_id: string | null;
  depends_on: string | null;
  timeout: number | null;
  parent_task_id: string | null;
}

export interface Project {
  id: string;
  group_folder: string;
  name: string;
  description: string | null;
  status: 'active' | 'paused' | 'completed' | 'archived';
  created_at: string;
  updated_at: string;
}

export interface Goal {
  id: string;
  group_folder: string;
  project_id: string | null;
  title: string;
  description: string | null;
  status: 'active' | 'paused' | 'completed' | 'cancelled';
  priority: 'high' | 'medium' | 'low';
  progress: number;
  deadline: string | null;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
}

export interface TaskRunLog {
  task_id: string;
  run_at: string;
  duration_ms: number;
  status: 'success' | 'error';
  result: string | null;
  error: string | null;
}

export interface HelpRequest {
  id: string;
  group_folder: string;
  project_id: string | null;
  goal_id: string | null;
  task_id: string | null;
  title: string;
  description: string;
  request_type: 'blocker' | 'question' | 'access' | 'integration';
  status: 'open' | 'resolved';
  response: string | null;
  created_at: string;
  updated_at: string;
  resolved_at: string | null;
}
