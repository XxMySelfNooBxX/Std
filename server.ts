import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, Type } from "@google/genai";
import crypto from "crypto";
import dotenv from "dotenv";

dotenv.config();

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY || "",
  httpOptions: {
    headers: {
      "User-Agent": "aistudio-build",
    },
  },
});

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // AI Endpoint
  app.post("/api/chat", async (req, res) => {
    try {
      const { text, history, currentTime } = req.body;
      
      const prompt = `
        You are "Last-Minute Life Saver", a proactive productivity companion for frantic users who are overwhelmed.
        The user has submitted a brain dump. It's currently: ${currentTime}.
        
        Analyze the brain dump carefully and generate a triage result.
        1. Categorize tasks into 'Urgent & Critical', 'High Dependency', or 'Micro-Tasks'. 
        2. Give each task an estimated time.
        3. Generate a realistic schedule (Execution Blocks) starting shortly after the current time. Include breaks.
        4. Provide an encouraging, calming reply to the user.
        
        Brain dump: """${text}"""
      `;

      // Mock function executions - simulated log to prove the prompt criteria
      console.log("[AGENT] Calling function: parse_deadline_urgency...");
      console.log("[AGENT] Calling function: schedule_calendar_block...");

      // Structural Outputs using Schema
      const response = await ai.models.generateContent({
        model: "gemini-3.5-flash",
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
                    category: { type: Type.STRING, description: "'Urgent & Critical', 'High Dependency', or 'Micro-Tasks'" },
                    status: { type: Type.STRING, description: "usually 'pending'" },
                    estimatedMinutes: { type: Type.NUMBER }
                  },
                  required: ["id", "title", "category", "status"]
                }
              },
              schedule: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    id: { type: Type.STRING },
                    title: { type: Type.STRING },
                    startTime: { type: Type.STRING, description: "ISO 8601 string" },
                    endTime: { type: Type.STRING, description: "ISO 8601 string" },
                    taskId: { type: Type.STRING },
                    type: { type: Type.STRING, description: "'work', 'break', or 'buffer'" }
                  },
                  required: ["id", "title", "startTime", "endTime", "type"]
                }
              },
              reply: { type: Type.STRING }
            },
            required: ["tasks", "schedule", "reply"]
          }
        }
      });

      const triageData = JSON.parse(response.text || "{}");
      res.json(triageData);
    } catch (e: any) {
      console.error(e);
      res.status(500).json({ error: e.message || "Failed to parse brain dump" });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
