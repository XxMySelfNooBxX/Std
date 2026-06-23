export type TaskCategory = 'Urgent & Critical' | 'High Dependency' | 'Micro-Tasks';

export interface Task {
  id: string;
  title: string;
  category: TaskCategory;
  status: 'pending' | 'in-progress' | 'completed';
  estimatedMinutes?: number;
  panicScore?: number;   // 0–10, computed by agent
  atRisk?: boolean;      // true if deadline is dangerously close
}

export interface ExecutionBlock {
  id: string;
  title: string;
  startTime: string; // ISO 8601
  endTime: string;   // ISO 8601
  taskId?: string;
  type: 'work' | 'break' | 'buffer';
}

export interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
}

export interface TriageResult {
  tasks: Task[];
  schedule: ExecutionBlock[];
  reply: string;
  agentLog?: string[];
}
