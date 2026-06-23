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

const MODEL = "gemini-2.0-flash";

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
      } catch {}
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
      } catch {}
    }

    return { title: task.title, panicScore, priority, atRisk };
  });

  return scored.sort((a, b) => b.panicScore - a.panicScore);
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
];

// ============================================================
// SERVER
// ============================================================
async function startServer() {
  const app = express();
  const PORT = 3000;
  app.use(express.json());

  // ----------------------------------------------------------
  // STRESS ANALYZER (real-time, as user types)
  // ----------------------------------------------------------
  app.post("/api/stress", async (req, res) => {
    try {
      const { text } = req.body;
      if (!text || text.length < 10) return res.json({ stressScore: 0 });

      const response = await ai.models.generateContent({
        model: MODEL,
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
      });

      const data = JSON.parse(response.text || '{"stressScore":0}');
      res.json({ stressScore: Math.min(10, Math.max(0, Math.round(data.stressScore))) });
    } catch {
      res.json({ stressScore: 5 });
    }
  });

  // ----------------------------------------------------------
  // MAIN CHAT — REAL AGENTIC LOOP WITH FUNCTION CALLING
  // ----------------------------------------------------------
  app.post("/api/retriage", async (req, res) => {
    try {
      const { remainingTasks, completedTaskTitle, currentTime } = req.body;

      const prompt = `You are "Last-Minute Life Saver". A task was just completed: "${completedTaskTitle}".
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

      const response = await ai.models.generateContent({
        model: MODEL,
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
      });

      const data = JSON.parse(response.text || "{}");
      res.json(data);
    } catch (e: any) {
      const status = e?.status === 429 ? 429 : 500;
      res.status(status).json({ error: e.message || "Retriage failed" });
    }
  });

  // ----------------------------------------------------------
  // MAIN CHAT — REAL AGENTIC LOOP WITH FUNCTION CALLING
  // ----------------------------------------------------------
  app.post("/api/chat", async (req, res) => {
    try {
      const { text, history, currentTime } = req.body;
      const agentLog: string[] = [];
      const toolResults: Record<string, any> = {};

      // Build multi-turn context string from recent history
      const historyContext = Array.isArray(history) && history.length > 0
        ? `\n\nPrevious conversation context:\n${history.map((m: any) => `${m.role === 'user' ? 'User' : 'Agent'}: ${m.content}`).join('\n')}`
        : '';

      const initialPrompt = `You are "Last-Minute Life Saver" — a proactive AI productivity agent for overwhelmed users.
Current time: ${currentTime}${historyContext}

INSTRUCTIONS:
1. Read the brain dump carefully and identify ALL individual tasks.
2. Call estimate_task_duration for EACH task you identify.
3. Once you have all durations, call check_schedule_conflicts with the complete task list.
4. Call prioritize_by_deadline to compute the execution order.
5. After all tool results are in, stop calling tools. The system will generate the final schedule.

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
          response = await ai.models.generateContent({
            model: MODEL,
            contents,
            config: {
              tools: [{ functionDeclarations: TOOL_DECLARATIONS }],
            },
          });
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

      const structuredPrompt = `You are generating the final structured triage result for Last-Minute Life Saver.

Agent analysis summary:
- Tool results: ${JSON.stringify(toolResults, null, 2)}
- Current time: ${currentTime}
- Original brain dump: "${text}"
- Agent reasoning: ${finalAgentText}

Rules:
- Generate a complete task list with panic scores from the prioritize_by_deadline results
- Mark atRisk=true for any task in the atRiskTasks list: ${JSON.stringify(conflictData.atRiskTasks || [])}
- Schedule starts from current time, blocks of focused work, 10-min break every 2 work blocks
- Write an encouraging, human, slightly urgent reply (2-3 sentences max)
- Task IDs must be short strings like "t1", "t2", etc.`;

      const structuredResponse = await ai.models.generateContent({
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
      });

      const triageData = JSON.parse(structuredResponse.text || "{}");
      triageData.agentLog = agentLog;

      res.json(triageData);
    } catch (e: any) {
      console.error("[SERVER ERROR]", e);
      const status = e?.status === 429 ? 429 : 500;
      const message = e?.status === 429
        ? "Rate limit exceeded on Gemini free tier. Please wait ~60 seconds and try again."
        : (e.message || "Agent failed to process brain dump");
      res.status(status).json({ error: message });
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
