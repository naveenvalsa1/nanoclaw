# Andy's Automatic Task Workflow

## How It Works

When Naveen asks Andy to do something, here's the automatic workflow:

### 1. User Request → Backlog
When you say: *"Andy, can you find flights to Paris?"*

Andy will:
1. Acknowledge the request
2. Add task to dashboard backlog automatically
3. Notify you it's been added

### 2. Backlog → In Progress
Andy monitors the backlog and:
1. Picks up the next task
2. Moves it to "In Progress"
3. Updates status indicator (turns orange)
4. Starts working on it

### 3. Working → Completed
As Andy completes the task:
1. Provides you the results
2. Moves task to "Completed"
3. Status indicator returns to idle (green)
4. Picks up next task from backlog

## For Andy (Internal Process)

### When User Makes a Request:

```javascript
// 1. Parse the request
const taskTitle = extractTaskFromUserMessage(userMessage);

// 2. Add to backlog
const task = {
    title: taskTitle,
    description: userMessage,
    status: 'backlog',
    priority: determinePriority(userMessage),
    deadline: extractDeadline(userMessage),
    timestamp: new Date().toISOString()
};

// 3. Save to tasks.json
addTaskToDashboard(task);

// 4. Acknowledge
respond("Got it! I've added this to my backlog and will work on it.");
```

### While Working:

```javascript
// Move to in progress
updateTaskStatus(taskId, 'progress');

// Do the work...

// Complete
updateTaskStatus(taskId, 'completed');
```

## Task States

- **Backlog**: Requested but not started
- **In Progress**: Currently being worked on
- **Completed**: Finished and delivered

## Dashboard Integration

The dashboard (`andy-dashboard-no-login.html`) will:
- Read from `tasks.json`
- Auto-refresh every 30 seconds
- Show real-time updates as Andy works
- Sync with localStorage and file system

## Files

- `tasks.json` - Shared task storage
- `task-bridge.js` - Node.js API for task management
- `andy-dashboard-no-login.html` - Visual dashboard
- `WORKFLOW.md` - This file (documentation)

## Example Flow

**User**: "Andy, help me find a hotel in Tokyo for March"

**Andy's Actions**:
1. ✅ Task added to backlog: "Find hotel in Tokyo for March"
2. 🔍 Moved to In Progress
3. 🌐 *Searches for Tokyo hotels...*
4. 💬 "I found 5 great options for you in Tokyo..."
5. ✅ Task moved to Completed

**Dashboard Shows**:
- Task appears in Backlog column
- Moves to In Progress (Andy's face turns orange)
- Moves to Completed (Andy's face turns green)

## Benefits

✅ Automatic task tracking
✅ Visual progress monitoring
✅ Nothing gets forgotten
✅ Clear history of what's been done
✅ Real-time status updates
