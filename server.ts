import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, Type } from "@google/genai";
import dotenv from "dotenv";

dotenv.config();

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY || "",
  httpOptions: { headers: { "User-Agent": "aistudio-build" } },
});

const MODEL = "gemini-2.0-flash";       // full model — main /api/chat only
const MODEL_LITE = "gemini-2.0-flash-lite"; // separate quota, higher RPM — all lightweight endpoints

// ─── Exponential backoff retry ────────────────────────────────────────────────
async function withRetry<T>(fn: () => Promise<T>, maxRetries = 3): Promise<T> {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (e: any) {
      const is429 = e?.status === 429 || String(e?.message).includes("429") || String(e?.message).includes("quota");
      if (is429 && attempt < maxRetries) {
        const delayMs = Math.pow(2, attempt) * 1200; // 1.2s → 2.4s → 4.8s
        console.log(`[RATE LIMIT] 429 hit — retrying in ${delayMs}ms (attempt ${attempt + 1}/${maxRetries})`);
        await new Promise(r => setTimeout(r, delayMs));
        continue;
      }
      throw e;
    }
  }
  throw new Error("Max retries exceeded");
}

// ─── Request semaphore (max 1 concurrent Gemini call) ────────────────────────
let _semaphoreActive = false;
const _semaphoreQueue: Array<() => void> = [];

function acquireSemaphore(): Promise<void> {
  return new Promise(resolve => {
    if (!_semaphoreActive) {
      _semaphoreActive = true;
      resolve();
    } else {
      _semaphoreQueue.push(resolve);
    }
  });
}

function releaseSemaphore() {
  const next = _semaphoreQueue.shift();
  if (next) {
    next();
  } else {
    _semaphoreActive = false;
  }
}

// Wraps any Gemini call: queue it, run it, release when done
async function geminiCall<T>(fn: () => Promise<T>): Promise<T> {
  await acquireSemaphore();
  try {
    return await withRetry(fn);
  } finally {
    releaseSemaphore();
  }
}


// ============================================================
// REAL TOOL IMPLEMENTATIONS (Server-Side Business Logic)
// ============================================================

function estimateTaskDuration(
  taskTitle: string,
  complexity: string
): { estimatedMinutes: number; reasoning: string } {
  const complexityMap: Record<string, number> = { low: 15, medium: 45, high: 90 };
  let minutes = complexityMap[complexity] ?? 30;
  const lower = taskTitle.toLowerCase();

  if (lower.includes("essay") || lower.includes("report") || lower.includes("presentation")) minutes = Math.max(minutes, 120);
  else if (lower.includes("email") || lower.includes("message") || lower.includes("reply")) minutes = Math.min(minutes, 15);
  else if (lower.includes("study") || lower.includes("review") || lower.includes("read")) minutes = Math.max(minutes, 60);
  else if (lower.includes("submit") || lower.includes("upload") || lower.includes("send")) minutes = Math.min(minutes, 10);
  else if (lower.includes("meeting") || lower.includes("call") || lower.includes("interview")) minutes = Math.max(minutes, 60);
  else if (lower.includes("assignment") || lower.includes("homework")) minutes = Math.max(minutes, 90);
  else if (lower.includes("pay") || lower.includes("bill") || lower.includes("form")) minutes = Math.min(minutes, 20);

  return {
    estimatedMinutes: minutes,
    reasoning: `Complexity (${complexity}) + keyword heuristics`,
  };
}

function checkScheduleConflicts(
  tasks: Array<{ title: string; estimatedMinutes: number; deadline?: string }>
): {
  atRiskTasks: string[];
  totalMinutesRequired: number;
  availableMinutesUntilMidnight: number;
  conflicts: string[];
} {
  const now = new Date();
  const midnight = new Date(now);
  midnight.setHours(23, 59, 59, 999);
  const availableMinutes = Math.floor((midnight.getTime() - now.getTime()) / 60000);
  const totalRequired = tasks.reduce((sum, t) => sum + (t.estimatedMinutes || 30), 0);

  const atRiskTasks: string[] = [];
  const conflicts: string[] = [];

  if (totalRequired > availableMinutes) {
    conflicts.push(
      `Total work (${totalRequired}m) exceeds available time today (${availableMinutes}m). Triage ruthlessly.`
    );
  }

  tasks.forEach((task) => {
    if (task.deadline) {
      try {
        const deadlineTime = new Date(task.deadline).getTime();
        const minutesUntilDeadline = (deadlineTime - now.getTime()) / 60000;
        if (minutesUntilDeadline < (task.estimatedMinutes || 30) * 1.5) {
          atRiskTasks.push(task.title);
        }
      } catch { }
    }
  });

  return {
    atRiskTasks,
    totalMinutesRequired: totalRequired,
    availableMinutesUntilMidnight: availableMinutes,
    conflicts,
  };
}

function prioritizeByDeadline(
  tasks: Array<{ title: string; estimatedMinutes?: number; deadline?: string; category: string }>
): Array<{ title: string; panicScore: number; priority: number; atRisk: boolean }> {
  const now = new Date().getTime();

  const scored = tasks.map((task, i) => {
    let panicScore = 5;
    let priority = i;
    let atRisk = false;

    if (task.category === "Urgent & Critical") { panicScore = 9; priority = 0; }
    else if (task.category === "High Dependency") { panicScore = 6; priority = 1; }
    else { panicScore = 3; priority = 2; }

    if (task.deadline) {
      try {
        const minutesUntilDeadline = (new Date(task.deadline).getTime() - now) / 60000;
        const ratio = minutesUntilDeadline / (task.estimatedMinutes || 30);
        if (ratio < 1.5) { panicScore = 10; atRisk = true; }
        else if (ratio < 3) panicScore = Math.max(panicScore, 8);
      } catch { }
    }

    return { title: task.title, panicScore, priority, atRisk };
  });

  return scored.sort((a, b) => b.panicScore - a.panicScore);
}

function decomposeTask(
  taskTitle: string,
  estimatedMinutes: number
): { subtasks: Array<{ id: string; title: string; estimatedMinutes: number }> } {
  const lower = taskTitle.toLowerCase();
  const subtasks = [];
  const partMin = Math.floor(estimatedMinutes / 3) || 15;

  if (lower.includes("essay") || lower.includes("report") || lower.includes("paper")) {
    subtasks.push(
      { id: `sub-${Math.random().toString(36).substring(2, 7)}`, title: "Research & outline", estimatedMinutes: partMin },
      { id: `sub-${Math.random().toString(36).substring(2, 7)}`, title: "Drafting core content", estimatedMinutes: partMin * 1.5 },
      { id: `sub-${Math.random().toString(36).substring(2, 7)}`, title: "Editing and formatting", estimatedMinutes: estimatedMinutes - Math.floor(partMin * 2.5) }
    );
  } else if (lower.includes("study") || lower.includes("exam") || lower.includes("test")) {
    subtasks.push(
      { id: `sub-${Math.random().toString(36).substring(2, 7)}`, title: "Review lecture notes & key concepts", estimatedMinutes: partMin * 1.2 },
      { id: `sub-${Math.random().toString(36).substring(2, 7)}`, title: "Solve practice questions", estimatedMinutes: partMin * 1.2 },
      { id: `sub-${Math.random().toString(36).substring(2, 7)}`, title: "Active recall on weak areas", estimatedMinutes: estimatedMinutes - Math.floor(partMin * 2.4) }
    );
  } else {
    subtasks.push(
      { id: `sub-${Math.random().toString(36).substring(2, 7)}`, title: "Preparation & setup", estimatedMinutes: partMin },
      { id: `sub-${Math.random().toString(36).substring(2, 7)}`, title: "Core execution & drafting", estimatedMinutes: estimatedMinutes - partMin * 2 },
      { id: `sub-${Math.random().toString(36).substring(2, 7)}`, title: "Review & finalize", estimatedMinutes: partMin }
    );
  }
  return { subtasks };
}

function estimateEnergyCurve(
  currentTime: string,
  userStateDescription: string
): { energyCurve: Array<{ hour: number; energy: number; label?: string }> } {
  const startHour = new Date(currentTime).getHours();
  const lower = userStateDescription.toLowerCase();

  const curve = [];
  const hours = 12; // predict next 12 hours

  let modifier = 0;
  if (lower.includes("exhausted") || lower.includes("tired") || lower.includes("sleepy") || lower.includes("drained")) {
    modifier = -3;
  } else if (lower.includes("caffeinated") || lower.includes("hyped") || lower.includes("energetic")) {
    modifier = 2;
  }

  let primaryLabel = "Optimal Focus";
  const startEnergy = 8 + modifier;
  if (startEnergy <= 4) primaryLabel = "Recovery State";
  else if (startEnergy <= 6) primaryLabel = "Moderate Energy";

  for (let i = 0; i < hours; i++) {
    const targetHour = (startHour + i) % 24;
    let baseLevel = 7;

    if (targetHour >= 9 && targetHour <= 12) baseLevel = 9;
    else if (targetHour >= 13 && targetHour <= 16) baseLevel = 5;
    else if (targetHour >= 18 && targetHour <= 21) baseLevel = 8;
    else if (targetHour >= 22 || targetHour <= 5) baseLevel = 3;

    const finalLevel = Math.min(10, Math.max(1, baseLevel + modifier));

    let label = "Stable";
    if (finalLevel >= 8) label = "Peak Focus";
    else if (finalLevel <= 4) label = "Recovery";
    else label = "Moderate";

    curve.push({
      hour: targetHour,
      energy: finalLevel,
      label: i === 0 ? primaryLabel : label
    });
  }

  return { energyCurve: curve };
}

function suggestTaskBatching(
  tasks: Array<{ title: string; category: string }>
): { batchSuggestions: string[] } {
  const suggestions: string[] = [];
  const microTasks = tasks.filter(t => t.category === "Micro-Tasks");
  if (microTasks.length >= 2) {
    suggestions.push(
      `Batch together your ${microTasks.length} micro-tasks ("${microTasks.map(t => t.title.split(' ')[0]).join('", "')}") into a single 25-minute sprint to reduce context switching.`
    );
  }
  const studyTasks = tasks.filter(t => t.title.toLowerCase().includes("study") || t.title.toLowerCase().includes("read") || t.title.toLowerCase().includes("exam"));
  if (studyTasks.length >= 2) {
    suggestions.push(
      `Combine your study blocks to maintain high cognitive focus on reading/reviewing.`
    );
  }
  return { batchSuggestions: suggestions };
}

function calculateMinimumViablePlan(
  tasks: Array<{ title: string; panicScore: number; atRisk?: boolean; category: string }>,
  availableMinutes: number
): { mvpTasks: string[]; riskReductionPercentage: number } {
  const mvp = tasks.filter(t => t.category === "Urgent & Critical" || (t.panicScore && t.panicScore >= 8) || t.atRisk);
  const riskReduction = tasks.length > 0 ? Math.round((mvp.length / tasks.length) * 100) : 0;
  return {
    mvpTasks: mvp.map(t => t.title),
    riskReductionPercentage: riskReduction,
  };
}

// ============================================================
// TOOL DISPATCHER
// ============================================================
function dispatchTool(name: string, args: Record<string, any>): any {
  console.log(`\n[AGENT] ▶ Executing: ${name}`);
  console.log(`[AGENT]   Args: ${JSON.stringify(args)}`);
  let result: any;

  switch (name) {
    case "estimate_task_duration":
      result = estimateTaskDuration(args.taskTitle, args.complexity);
      break;
    case "check_schedule_conflicts":
      result = checkScheduleConflicts(args.tasks || []);
      break;
    case "prioritize_by_deadline":
      result = prioritizeByDeadline(args.tasks || []);
      break;
    case "decompose_task":
      result = decomposeTask(args.taskTitle, args.estimatedMinutes || 60);
      break;
    case "estimate_energy_curve":
      result = estimateEnergyCurve(args.currentTime || new Date().toISOString(), args.userStateDescription || "");
      break;
    case "suggest_task_batching":
      result = suggestTaskBatching(args.tasks || []);
      break;
    case "calculate_minimum_viable_plan":
      result = calculateMinimumViablePlan(args.tasks || [], args.availableMinutes || 480);
      break;
    default:
      result = { error: `Unknown tool: ${name}` };
  }

  console.log(`[AGENT] ✅ ${name} result:`, JSON.stringify(result).slice(0, 200));
  return result;
}

// ============================================================
// TOOL DECLARATIONS FOR GEMINI
// ============================================================
const TOOL_DECLARATIONS = [
  {
    name: "estimate_task_duration",
    description:
      "Estimates realistic time (in minutes) required to complete a task. Call this for EACH task identified in the brain dump to get accurate durations before scheduling.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        taskTitle: { type: Type.STRING, description: "The full title or description of the task" },
        complexity: {
          type: Type.STRING,
          description: "Task complexity: 'low' (quick, simple), 'medium' (focused effort needed), or 'high' (complex, multi-step)",
        },
      },
      required: ["taskTitle", "complexity"],
    },
  },
  {
    name: "check_schedule_conflicts",
    description:
      "Checks if all tasks can realistically fit within the available time today. Identifies which tasks are at risk of missing their deadlines. Call this AFTER estimating all task durations.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        tasks: {
          type: Type.ARRAY,
          description: "Array of all tasks with their estimated durations",
          items: {
            type: Type.OBJECT,
            properties: {
              title: { type: Type.STRING },
              estimatedMinutes: { type: Type.NUMBER },
              deadline: { type: Type.STRING, description: "ISO 8601 string if user mentioned a deadline, otherwise omit" },
            },
            required: ["title", "estimatedMinutes"],
          },
        },
      },
      required: ["tasks"],
    },
  },
  {
    name: "prioritize_by_deadline",
    description:
      "Calculates a panic score (0-10) for each task based on deadline proximity and category. Call this to determine the final execution order. Higher panic score = do it first.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        tasks: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              title: { type: Type.STRING },
              estimatedMinutes: { type: Type.NUMBER },
              deadline: { type: Type.STRING },
              category: { type: Type.STRING, description: "'Urgent & Critical', 'High Dependency', or 'Micro-Tasks'" },
            },
            required: ["title", "category"],
          },
        },
      },
      required: ["tasks"],
    },
  },
  {
    name: "decompose_task",
    description: "Breaks down a complex or long task into 2-3 actionable subtasks with individual estimated durations. Call this whenever a task is estimated to take 45+ minutes, is highly complex, or is described by the user as overwhelming.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        taskTitle: { type: Type.STRING, description: "The title of the task to decompose" },
        estimatedMinutes: { type: Type.NUMBER, description: "Estimated duration of the parent task in minutes" },
      },
      required: ["taskTitle", "estimatedMinutes"],
    },
  },
  {
    name: "estimate_energy_curve",
    description: "Predicts the user's cognitive energy curve (0-10) for the next 8-12 hours based on current time and their self-described mental/physical state (e.g. tired, caffeinated, panicking). Call this once at the start to align high-panic tasks with peak energy windows.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        currentTime: { type: Type.STRING, description: "ISO 8601 current datetime string" },
        userStateDescription: { type: Type.STRING, description: "Description of how the user is feeling physically or mentally, extracted from their brain dump" },
      },
      required: ["currentTime", "userStateDescription"],
    },
  },
  {
    name: "suggest_task_batching",
    description: "Identifies tasks that can be batched together (e.g. all micro-tasks, emails, or admin tasks) to minimize context switching. Call this after estimating task categories and durations.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        tasks: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              title: { type: Type.STRING },
              category: { type: Type.STRING, description: "'Urgent & Critical', 'High Dependency', or 'Micro-Tasks'" },
            },
            required: ["title", "category"],
          },
        },
      },
      required: ["tasks"],
    },
  },
  {
    name: "calculate_minimum_viable_plan",
    description: "Calculates a pared-down Minimum Viable Plan (MVP) containing only the absolute most critical, high-panic, or at-risk tasks to ensure basic survival if the user has a massive schedule conflict. Call this when check_schedule_conflicts flags a conflict.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        tasks: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              title: { type: Type.STRING },
              panicScore: { type: Type.NUMBER },
              atRisk: { type: Type.BOOLEAN },
              category: { type: Type.STRING },
            },
            required: ["title", "category"],
          },
        },
        availableMinutes: { type: Type.NUMBER, description: "Minutes available until midnight" },
      },
      required: ["tasks", "availableMinutes"],
    },
  },
];

// Local Heuristic Fallback Parser for Triage
function localTriageFallback(text: string, currentTime: string): any {
  console.log("[FALLBACK] Running local heuristic triage parser...");
  const now = new Date(currentTime);
  
  // Smarter split: don't just split on periods. Add newlines before conjunctions, then split by newline.
  let processedText = text.replace(/([.?!])\s+(also|oh|then|and|but)/gi, "$1\n$2");
  processedText = processedText.replace(/,\s+(and|also)\s+(?=I need|I have|quickly|eventually)/gi, ",\n$1 ");
  
  // If still no newlines and it's a long paragraph, just split by period to be safe
  if (!processedText.includes('\n') && processedText.length > 100) {
    processedText = processedText.replace(/\.\s+/g, ".\n");
  }

  const lines = processedText.split(/\n+/).map(s => s.trim().replace(/^[-\*•]\s*/, '')).filter(s => s.length > 8);

  const rawTasks = lines.length > 0 ? lines.slice(0, 5) : ["CS assignment Sprint", "Group project prep", "Read economics chapter"];

  const tasks = rawTasks.map((title, index) => {
    const id = `t${index + 1}`;
    let category: "Urgent & Critical" | "High Dependency" | "Micro-Tasks" = "Micro-Tasks";
    let estimatedMinutes = 30;
    let panicScore = 5;
    let atRisk = false;
    let deadline = "";

    const lower = title.toLowerCase();

    if (lower.includes("essay") || lower.includes("exam") || lower.includes("study") || lower.includes("project") || lower.includes("assignment") || lower.includes("cs")) {
      category = "Urgent & Critical";
      estimatedMinutes = lower.includes("study") || lower.includes("exam") ? 90 : 120;
      panicScore = 9;
    } else if (lower.includes("meeting") || lower.includes("call") || lower.includes("slides") || lower.includes("presentation")) {
      category = "High Dependency";
      estimatedMinutes = 60;
      panicScore = 7;
    } else {
      category = "Micro-Tasks";
      estimatedMinutes = lower.includes("email") || lower.includes("message") ? 15 : 20;
      panicScore = 4;
    }

    if (lower.includes("9pm") || lower.includes("9 pm")) {
      const d = new Date(now); d.setHours(21, 0, 0, 0);
      deadline = d.toISOString();
      atRisk = true;
      panicScore = 10;
    } else if (lower.includes("6pm") || lower.includes("6 pm")) {
      const d = new Date(now); d.setHours(18, 0, 0, 0);
      deadline = d.toISOString();
    }

    return { id, title, category, status: "pending" as const, estimatedMinutes, panicScore, atRisk, deadline };
  });

  tasks.sort((a, b) => b.panicScore - a.panicScore);

  const schedule: any[] = [];
  let offsetMinutes = 0;
  const addMinutes = (m: number) => new Date(now.getTime() + m * 60000);

  tasks.forEach((task, i) => {
    const start = addMinutes(offsetMinutes);
    offsetMinutes += task.estimatedMinutes;
    const end = addMinutes(offsetMinutes);

    schedule.push({
      id: `s-w-${task.id}`,
      title: `${task.title} Sprint`,
      startTime: start.toISOString(),
      endTime: end.toISOString(),
      taskId: task.id,
      type: "work"
    });

    if ((i + 1) % 2 === 0 && i < tasks.length - 1) {
      const bStart = addMinutes(offsetMinutes);
      offsetMinutes += 10;
      const bEnd = addMinutes(offsetMinutes);
      schedule.push({
        id: `s-b-${i}`,
        title: "Recovery Break",
        startTime: bStart.toISOString(),
        endTime: bEnd.toISOString(),
        type: "break"
      });
    }
  });

  const suggestions = [
    "⚡ Local Fallback active: Triage calculated locally due to Gemini free tier rate limits.",
    tasks.some(t => t.atRisk) ? "⚠️ Proactive warning: Some deadlines are extremely tight. Focus heavily on Urgent tasks." : "Schedule looks tight, but feasible. Take regular breaks.",
  ];

  const energyCurve = estimateEnergyCurve(currentTime, text).energyCurve;

  return {
    tasks,
    schedule,
    reply: `⚠️ [FREE TIER FALLBACK] I triaged your tasks locally. You have ${tasks.length} tasks scheduled today. Let's focus on the critical sprint first.`,
    suggestions,
    energyCurve
  };
}

// ============================================================
// SERVER
// ============================================================
async function startServer() {
  const app = express();
  const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;
  app.use(express.json());

  // ----------------------------------------------------------
  // STRESS ANALYZER (real-time, as user types)
  // ----------------------------------------------------------
  app.post("/api/stress", async (req, res) => {
    try {
      const { text } = req.body;
      if (!text || text.length < 10) return res.json({ stressScore: 0 });

      const response = await geminiCall(() => ai.models.generateContent({
        model: MODEL_LITE,
        contents: `Analyze the cognitive load and stress level in this text. Return ONLY a JSON with "stressScore" (integer 0-10).
0 = completely calm, simple single task.
5 = moderate stress, a few competing priorities.
10 = extreme panic, multiple urgent deadlines, overwhelmed.

Text: "${text.substring(0, 400)}"`,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: { stressScore: { type: Type.NUMBER } },
            required: ["stressScore"],
          },
        },
      }));

      const data = JSON.parse(response.text || '{"stressScore":0}');
      res.json({ stressScore: Math.min(10, Math.max(0, Math.round(data.stressScore))) });
    } catch {
      res.json({ stressScore: 5 });
    }
  });

  // ----------------------------------------------------------
  // NATURAL LANGUAGE COMMAND PROCESSOR
  // ----------------------------------------------------------
  app.post("/api/command", async (req, res) => {
    try {
      const { command, currentSchedule, currentTasks, currentTime } = req.body;

      const response = await geminiCall(() => ai.models.generateContent({
        model: MODEL_LITE,
        contents: `You are PanicMode Planner's natural language command processor.
Current time: ${currentTime}
Current tasks: ${JSON.stringify(currentTasks, null, 2)}
Current schedule: ${JSON.stringify(currentSchedule, null, 2)}

User command: "${command}"

Interpret the user's command and return an updated schedule.
Rules:
- Keep all task IDs exactly the same
- Only modify what the command specifies
- If command asks to skip/remove a task, remove its schedule blocks but keep the task in the tasks array
- Write a short, direct confirmation (1 sentence) of what you changed
- Preserve break blocks unless command explicitly removes them
- If you can't interpret the command, return the original schedule unchanged with explanation in confirmation`,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              schedule: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    id: { type: Type.STRING },
                    title: { type: Type.STRING },
                    startTime: { type: Type.STRING },
                    endTime: { type: Type.STRING },
                    taskId: { type: Type.STRING },
                    type: { type: Type.STRING },
                  },
                  required: ["id", "title", "startTime", "endTime", "type"],
                },
              },
              confirmation: { type: Type.STRING },
            },
            required: ["schedule", "confirmation"],
          },
        },
      }));

      const data = JSON.parse(response.text || "{}");
      res.json(data);
    } catch (e: any) {
      console.warn("[COMMAND] Gemini command processing failed, using local fallback. Error:", e.message || e);
      res.json({
        schedule: req.body.currentSchedule,
        confirmation: `Processed locally: "${req.body.command}" (AI offline)`
      });
    }
  });

  // ----------------------------------------------------------
  // WHAT IF? SCENARIO PLANNER
  // ----------------------------------------------------------
  app.post("/api/whatif", async (req, res) => {
    try {
      const { scenario, currentTasks, currentSchedule, currentTime } = req.body;

      const response = await geminiCall(() => ai.models.generateContent({
        model: MODEL_LITE,
        contents: `You are PanicMode Planner's scenario planner.
Current time: ${currentTime}
Current tasks: ${JSON.stringify(currentTasks, null, 2)}
Current schedule: ${JSON.stringify(currentSchedule, null, 2)}

User scenario: "${scenario}"

Analyze this hypothetical scenario and return:
1. A concise, direct analysis (2-3 sentences) of the impact — be specific about which deadlines are affected, what risks emerge, or what gets easier
2. Estimated minutes saved (0 if the scenario doesn't save time)
3. A hypothetical modified schedule showing what the plan would look like

Rules:
- Analysis should be honest, not sugar-coated
- Keep task IDs the same
- This is HYPOTHETICAL — make clear it hasn't been applied yet`,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              analysis: { type: Type.STRING },
              timeSaved: { type: Type.NUMBER, description: "Minutes saved by this scenario, 0 if none" },
              schedule: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    id: { type: Type.STRING },
                    title: { type: Type.STRING },
                    startTime: { type: Type.STRING },
                    endTime: { type: Type.STRING },
                    taskId: { type: Type.STRING },
                    type: { type: Type.STRING },
                  },
                  required: ["id", "title", "startTime", "endTime", "type"],
                },
              },
            },
            required: ["analysis", "timeSaved", "schedule"],
          },
        },
      }));

      const data = JSON.parse(response.text || "{}");
      res.json(data);
    } catch (e: any) {
      console.warn("[WHATIF] Gemini scenario planning failed, using local fallback. Error:", e.message || e);
      res.json({
        analysis: `Analyzed locally: "${req.body.scenario}". Skipping a task will free up schedule space. (AI offline)`,
        timeSaved: 30,
        schedule: req.body.currentSchedule
      });
    }
  });

  // ----------------------------------------------------------
  // PROACTIVE CHECK-IN (timer-based agent nudge)
  // ----------------------------------------------------------
  app.post("/api/checkin", async (req, res) => {
    try {
      const { currentTaskTitle, elapsedMinutes, remainingTasksCount, currentTime } = req.body;

      const response = await ai.models.generateContent({
        model: MODEL,
        contents: `You are "PanicMode Planner" doing a proactive check-in with an overwhelmed user.
Current time: ${currentTime}
The user has been working for ${elapsedMinutes} minutes.
Current task they should be on: "${currentTaskTitle}"
Remaining tasks count: ${remainingTasksCount}

Generate a SHORT (1-2 sentences MAX), direct, energetic check-in message.
- Start with ⏰
- Ask specifically how the current task is going
- Mention the time elapsed
- Be encouraging but urgent, not preachy
- Do NOT suggest they take a break unless it is a break block`,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: { message: { type: Type.STRING } },
            required: ["message"],
          },
        },
      });

      const data = JSON.parse(response.text || '{}');
      res.json(data);
    } catch (e: any) {
      console.warn("[CHECKIN] Gemini check-in failed, using local fallback. Error:", e.message || e);
      res.json({
        message: `⏰ Proactive Check-in: You've been working on "${req.body.currentTaskTitle}" for ${req.body.elapsedMinutes} minutes. How is it going? Keep pushing!`
      });
    }
  });

  // ----------------------------------------------------------
  // MAIN CHAT — REAL AGENTIC LOOP WITH FUNCTION CALLING
  // ----------------------------------------------------------
  app.post("/api/retriage", async (req, res) => {
    try {
      const { remainingTasks, completedTaskTitle, currentTime } = req.body;

      const prompt = `You are "PanicMode Planner". A task was just completed: "${completedTaskTitle}".
Current time: ${currentTime}.

Now regenerate an optimized schedule for ONLY these remaining tasks:
${JSON.stringify(remainingTasks, null, 2)}

Rules:
- Keep the same task IDs from the input
- Re-order by urgency (atRisk tasks first)
- Schedule blocks starting from current time
- Include 10-min breaks every 2 work blocks
- Write an encouraging 1-sentence reply acknowledging the completion and what's next
- Set atRisk=true for tasks already marked as such`;

      const response = await geminiCall(() => ai.models.generateContent({
        model: MODEL_LITE,
        contents: prompt,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              tasks: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    id: { type: Type.STRING },
                    title: { type: Type.STRING },
                    category: { type: Type.STRING },
                    status: { type: Type.STRING },
                    estimatedMinutes: { type: Type.NUMBER },
                    panicScore: { type: Type.NUMBER },
                    atRisk: { type: Type.BOOLEAN },
                  },
                  required: ["id", "title", "category", "status", "estimatedMinutes", "panicScore", "atRisk"],
                },
              },
              schedule: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    id: { type: Type.STRING },
                    title: { type: Type.STRING },
                    startTime: { type: Type.STRING },
                    endTime: { type: Type.STRING },
                    taskId: { type: Type.STRING },
                    type: { type: Type.STRING },
                  },
                  required: ["id", "title", "startTime", "endTime", "type"],
                },
              },
              reply: { type: Type.STRING },
            },
            required: ["tasks", "schedule", "reply"],
          },
        },
      }));

      const data = JSON.parse(response.text || "{}");
      res.json(data);
    } catch (e: any) {
      const status = e?.status === 429 ? 429 : 500;
      res.status(status).json({ error: e.message || "Retriage failed" });
    }
  });

  // ----------------------------------------------------------
  // TASK DECOMPOSITION ENDPOINT
  // ----------------------------------------------------------
  app.post("/api/decompose", async (req, res) => {
    const { taskTitle, estimatedMinutes, complexity } = req.body;
    console.log(`[DECOMPOSE] Received request for task: "${taskTitle}"`);
    try {
      const response = await geminiCall(() => ai.models.generateContent({
        model: MODEL_LITE,
        contents: `You are PanicMode Planner's task decomposition agent.
Break down the following task into 2-4 actionable subtasks.

Task: "${taskTitle}"
Total Estimated Minutes: ${estimatedMinutes}
Complexity: ${complexity}

Rules:
- Generate 2-4 sequential subtasks
- Their combined estimatedMinutes should roughly equal the total
- Subtasks should be specific and actionable
- Keep subtask titles under 60 characters
- Return JSON strictly following the schema.`,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              subtasks: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    id: { type: Type.STRING },
                    title: { type: Type.STRING },
                    estimatedMinutes: { type: Type.NUMBER },
                  },
                  required: ["id", "title", "estimatedMinutes"],
                },
              },
            },
            required: ["subtasks"],
          },
        },
      }));

      const data = JSON.parse(response.text || "{}");
      res.json(data);
    } catch (e: any) {
      console.warn("[DECOMPOSE] Gemini call failed, using local fallback. Error:", e.message || e);
      const fallbackData = decomposeTask(taskTitle, estimatedMinutes || 60);
      res.json(fallbackData);
    }
  });

  // ----------------------------------------------------------
  // MAIN CHAT — REAL AGENTIC LOOP WITH FUNCTION CALLING
  // ----------------------------------------------------------
  app.post("/api/chat", async (req, res) => {
    try {
      const { text, history, currentTime } = req.body;
      const cleanText = (text || "").trim();
      
      // Conversational short-circuit for simple greetings
      if (cleanText.length < 15 && !cleanText.match(/(need|due|tomorrow|exam|assignment|meeting|urgent|help|do|finish|task|work)/i)) {
        return res.json({
          tasks: [],
          schedule: [],
          reply: `Hi! I'm your PanicMode Planner. Just brain dump everything you need to do, and I'll instantly triage your tasks and generate a realistic execution timeline!`,
          suggestions: ["Type a list of tasks", "Include any deadlines"],
          energyCurve: [],
          agentLog: ["Conversational greeting detected. Bypassed triage loop."]
        });
      }

      const agentLog: string[] = [];
      const toolResults: Record<string, any> = {};

      // Build multi-turn context string from recent history
      const historyContext = Array.isArray(history) && history.length > 0
        ? `\n\nPrevious conversation context:\n${history.map((m: any) => `${m.role === 'user' ? 'User' : 'Agent'}: ${m.content}`).join('\n')}`
        : '';

      const initialPrompt = `You are "PanicMode Planner" — a proactive AI productivity agent for overwhelmed users.
Current time: ${currentTime}${historyContext}

INSTRUCTIONS:
1. Read the brain dump carefully and identify ALL individual tasks.
2. Extract or infer how the user is feeling physically/mentally and call estimate_energy_curve.
3. Call estimate_task_duration for EACH task you identify.
4. If any task is estimated to take 45+ minutes, call decompose_task to break it down into actionable steps.
5. Once you have all tasks, call suggest_task_batching to find batching opportunities.
6. Call check_schedule_conflicts. If it returns conflicts, call calculate_minimum_viable_plan to determine the core survival tasks.
7. Call prioritize_by_deadline to compute the final panic scores and execution order.
8. After all tool results are in, stop calling tools. The system will generate the final schedule.

Brain dump: """${text}"""`;

      const contents: any[] = [
        { role: "user", parts: [{ text: initialPrompt }] },
      ];

      let finalAgentText = "";

      // Real agentic loop — up to 8 iterations
      for (let iteration = 0; iteration < 8; iteration++) {
        console.log(`\n[AGENT] ── Iteration ${iteration + 1} ──`);

        let response: any;
        try {
          response = await geminiCall(() => ai.models.generateContent({
            model: MODEL,
            contents,
            config: {
              tools: [{ functionDeclarations: TOOL_DECLARATIONS }],
            },
          }));
        } catch (loopErr: any) {
          // Gemini throws when a turn produces no text AND no tool calls
          // (e.g. after function responses are fed back and model is "done")
          console.log(`[AGENT] ── Loop ended at iteration ${iteration + 1}: ${loopErr.message}`);
          break;
        }

        const candidate = response.candidates?.[0];
        if (!candidate) break;

        const parts = candidate.content?.parts || [];
        if (!parts.length) {
          console.log("[AGENT] ✔ Empty parts — agent finished.");
          break;
        }

        const fnCallParts = parts.filter((p: any) => p.functionCall);
        const textParts = parts.filter((p: any) => p.text);

        // Add model turn to conversation
        contents.push({ role: "model", parts });

        if (fnCallParts.length === 0) {
          // No more tool calls — agent has finished reasoning
          finalAgentText = textParts.map((p: any) => p.text).join("");
          console.log("[AGENT] ✔ Agent loop complete. No further tool calls.");
          break;
        }

        // Execute each tool call
        const fnResponseParts: any[] = [];
        for (const part of fnCallParts) {
          const { name, args } = part.functionCall;
          agentLog.push(`Calling ${name.replace(/_/g, " ")}...`);

          const result = dispatchTool(name, args);
          toolResults[name] = result;
          agentLog.push(`${name.replace(/_/g, " ")} ✓`);

          fnResponseParts.push({
            functionResponse: { name, response: result },
          });
        }

        // Feed tool results back into the conversation
        contents.push({ role: "user", parts: fnResponseParts });
      }

      // ----------------------------------------------------------
      // STRUCTURED OUTPUT PHASE — Generate final JSON from tool data
      // ----------------------------------------------------------
      const panicData = (toolResults["prioritize_by_deadline"] as any[]) || [];
      const conflictData = toolResults["check_schedule_conflicts"] || {};

      const structuredPrompt = `You are generating the final structured triage result for PanicMode Planner.

Agent analysis summary:
- Tool results: ${JSON.stringify(toolResults, null, 2)}
- Current time: ${currentTime}
- Original brain dump: "${text}"
- Agent reasoning: ${finalAgentText}

Rules:
- Generate a complete task list with panic scores from the prioritize_by_deadline results
- Mark atRisk=true for any task in the atRiskTasks list: ${JSON.stringify(conflictData.atRiskTasks || [])}
- For 'deadline': extract specific deadline times mentioned in the brain dump for each task (e.g. "due 9pm" → ISO string for today at 21:00). Leave empty string "" if no deadline mentioned.
- Schedule starts from current time, blocks of focused work, 10-min break every 2 work blocks
- Write an encouraging, human, slightly urgent reply (2-3 sentences max)
- Task IDs must be short strings like "t1", "t2", etc.
- Generate 2-3 specific, actionable 'suggestions' — smart tips tailored to THIS user's exact situation. Examples: warn if a task has barely enough time, suggest batching similar tasks, flag scheduling conflicts. Be specific, not generic.
- Generate a predicted 'energyCurve' array of 8-12 hours based on the estimate_energy_curve results. Each point must have "hour" (0-23, number), "energy" (0-10, number), and "label" (string). If estimate_energy_curve was not called, generate a fallback curve based on the current time and user stress (extreme stress slumps sooner, high energy peaks).`;

      const structuredResponse = await geminiCall(() => ai.models.generateContent({
        model: MODEL,
        contents: structuredPrompt,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              tasks: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    id: { type: Type.STRING },
                    title: { type: Type.STRING },
                    category: {
                      type: Type.STRING,
                      description: "'Urgent & Critical', 'High Dependency', or 'Micro-Tasks'",
                    },
                    status: { type: Type.STRING },
                    estimatedMinutes: { type: Type.NUMBER },
                    panicScore: { type: Type.NUMBER, description: "0-10" },
                    atRisk: { type: Type.BOOLEAN },
                    deadline: { type: Type.STRING, description: "ISO 8601 datetime if user specified a deadline, otherwise empty string" },
                  },
                  required: ["id", "title", "category", "status", "estimatedMinutes", "panicScore", "atRisk"],
                },
              },
              schedule: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    id: { type: Type.STRING },
                    title: { type: Type.STRING },
                    startTime: { type: Type.STRING },
                    endTime: { type: Type.STRING },
                    taskId: { type: Type.STRING },
                    type: { type: Type.STRING },
                  },
                  required: ["id", "title", "startTime", "endTime", "type"],
                },
              },
              reply: { type: Type.STRING },
              suggestions: {
                type: Type.ARRAY,
                description: "2-3 smart, specific, actionable tips tailored to this user's exact situation",
                items: { type: Type.STRING },
              },
              energyCurve: {
                type: Type.ARRAY,
                description: "Predicted circadian energy levels per hour",
                items: {
                  type: Type.OBJECT,
                  properties: {
                    hour: { type: Type.NUMBER },
                    energy: { type: Type.NUMBER },
                    label: { type: Type.STRING },
                  },
                  required: ["hour", "energy"],
                },
              },
            },
            required: ["tasks", "schedule", "reply", "suggestions", "energyCurve"],
          },
        },
      }));

      const triageData = JSON.parse(structuredResponse.text || "{}");
      triageData.agentLog = agentLog;

      res.json(triageData);
    } catch (e: any) {
      console.warn("[CHAT] Gemini agent loop failed, using local fallback. Error:", e.message || e);
      const fallbackResult = localTriageFallback(req.body.text, req.body.currentTime);
      res.json(fallbackResult);
    }
  });

  // Vite dev / production static
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({ server: { middlewareMode: true }, appType: "spa" });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (_req, res) => res.sendFile(path.join(distPath, "index.html")));
  }

  app.listen(PORT, "0.0.0.0", () => console.log(`\n🚀 Server running on http://localhost:${PORT}\n`));
}

startServer();
