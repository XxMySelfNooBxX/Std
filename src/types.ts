export type TaskCategory = 'Urgent & Critical' | 'High Dependency' | 'Micro-Tasks';

export interface Task {
  id: string;
  title: string;
  category: TaskCategory;
  status: 'pending' | 'in-progress' | 'completed';
  estimatedMinutes?: number;
}

export interface ExecutionBlock {
  id: string;
  title: string;
  startTime: string; // ISO format
  endTime: string; // ISO format
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
}
