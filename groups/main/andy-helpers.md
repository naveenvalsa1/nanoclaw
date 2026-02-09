# Andy's Task Management Helpers

## Quick Reference for Andy

When a user makes a request, use these patterns:

### 1. Add Task to Dashboard

When user says: "Andy, can you X?"

```bash
# Create the task entry
node -e "
const fs = require('fs');
const tasksFile = '/workspace/group/tasks.json';

let tasks = [];
try { tasks = JSON.parse(fs.readFileSync(tasksFile, 'utf8')); } catch(e) {}

tasks.push({
    id: Date.now(),
    title: 'TASK_TITLE_HERE',
    description: 'FULL_DESCRIPTION',
    status: 'backlog',
    priority: 'medium',
    deadline: null,
    timestamp: new Date().toISOString()
});

fs.writeFileSync(tasksFile, JSON.stringify(tasks, null, 2));
console.log('✅ Task added to backlog');
"
```

### 2. Move Task to In Progress

```bash
node -e "
const fs = require('fs');
const tasksFile = '/workspace/group/tasks.json';
const tasks = JSON.parse(fs.readFileSync(tasksFile, 'utf8'));

const task = tasks.find(t => t.id === TASK_ID);
if (task) {
    task.status = 'progress';
    task.startedAt = new Date().toISOString();
    fs.writeFileSync(tasksFile, JSON.stringify(tasks, null, 2));
    console.log('🔍 Task moved to In Progress');
}
"
```

### 3. Complete Task

```bash
node -e "
const fs = require('fs');
const tasksFile = '/workspace/group/tasks.json';
const tasks = JSON.parse(fs.readFileSync(tasksFile, 'utf8'));

const task = tasks.find(t => t.id === TASK_ID);
if (task) {
    task.status = 'completed';
    task.completedAt = new Date().toISOString();
    fs.writeFileSync(tasksFile, JSON.stringify(tasks, null, 2));
    console.log('✅ Task completed');
}
"
```

### 4. Get Backlog

```bash
node -e "
const fs = require('fs');
const tasksFile = '/workspace/group/tasks.json';
try {
    const tasks = JSON.parse(fs.readFileSync(tasksFile, 'utf8'));
    const backlog = tasks.filter(t => t.status === 'backlog');
    console.log('Backlog tasks:', backlog.length);
    backlog.forEach((t, i) => console.log(\`\${i+1}. \${t.title}\`));
} catch(e) {
    console.log('No tasks yet');
}
"
```

## Simplified Workflow

For now, until full automation is built:

1. **User makes request** → I add task manually using bash command
2. **I start working** → Move to "progress"
3. **I complete** → Move to "completed"

The dashboard will auto-update by reading tasks.json
