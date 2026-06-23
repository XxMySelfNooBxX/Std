import { useState, useCallback, useRef } from 'react';
import { ChatInterface } from './components/ChatInterface';
import { TaskTriageMatrix } from './components/TaskTriageMatrix';
import { TimelineBoard } from './components/TimelineBoard';
import { Message, Task, ExecutionBlock } from './types';

// ─── Demo Data ──────────────────────────────────────────────────────────────
const DEMO_TASKS: Task[] = [
  { id: 't1', title: 'Finish CS assignment (due 9pm tonight)', category: 'Urgent & Critical', status: 'pending', estimatedMinutes: 120, panicScore: 10, atRisk: true },
  { id: 't2', title: 'Study for tomorrow\'s Economics exam', category: 'Urgent & Critical', status: 'pending', estimatedMinutes: 90, panicScore: 9, atRisk: false },
  { id: 't3', title: 'Group project meeting at 6pm — prepare slides', category: 'High Dependency', status: 'pending', estimatedMinutes: 60, panicScore: 7, atRisk: false },
  { id: 't4', title: 'Reply to 3 urgent emails from professor', category: 'Micro-Tasks', status: 'pending', estimatedMinutes: 15, panicScore: 4, atRisk: false },
  { id: 't5', title: 'Pay electricity bill online', category: 'Micro-Tasks', status: 'pending', estimatedMinutes: 10, panicScore: 3, atRisk: false },
];

function buildDemoSchedule(): ExecutionBlock[] {
  const now = new Date();
  now.setMinutes(Math.ceil(now.getMinutes() / 15) * 15, 0, 0);
  const add = (m: number) => new Date(now.getTime() + m * 60000);
  let offset = 0;
  const block = (id: string, title: string, taskId: string | undefined, type: 'work' | 'break' | 'buffer', dur: number): ExecutionBlock => {
    const start = add(offset); offset += dur;
    return { id, title, startTime: start.toISOString(), endTime: add(offset).toISOString(), taskId, type };
  };
  return [
    block('s1', 'CS Assignment Sprint', 't1', 'work', 90),
    block('s2', 'Recovery Break', undefined, 'break', 10),
    block('s3', 'Finish CS Assignment', 't1', 'work', 30),
    block('s4', 'Quick Wins: Emails + Bill', 't4', 'work', 25),
    block('s5', 'Buffer Break', undefined, 'break', 10),
    block('s6', 'Group Project Slides', 't3', 'work', 60),
    block('s7', 'Economics Exam Study', 't2', 'work', 90),
  ];
}

const DEMO_MESSAGES: Message[] = [
  { id: 'sys-1', role: 'assistant', content: 'I am your Last-Minute Life Saver. Brain dump everything you need to do, and I will instantly triage your tasks and generate a realistic execution timeline.' },
  { id: 'demo-user', role: 'user', content: 'ok I have a CS assignment due at 9pm that I haven\'t started, need to reply to 3 urgent professor emails, group project meeting at 6pm I need to prep slides for, pay electricity bill, and study for tomorrow\'s econ exam' },
  { id: 'demo-ai', role: 'assistant', content: '⚠️ Your CS assignment is AT RISK — you have just enough time if you start now. I\'ve triaged everything and built a survival timeline. The emails and bill are 25 minutes combined — knock those out after your first work sprint. You can do this.' },
];

// ─── Debounce hook ───────────────────────────────────────────────────────────
function useDebounce<T extends (...args: any[]) => void>(fn: T, delay: number) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  return useCallback((...args: Parameters<T>) => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => fn(...args), delay);
  }, [fn, delay]);
}

export default function App() {
  const [messages, setMessages] = useState<Message[]>(DEMO_MESSAGES);
  const [tasks, setTasks] = useState<Task[]>(DEMO_TASKS);
  const [schedule, setSchedule] = useState<ExecutionBlock[]>(buildDemoSchedule());
  const [isProcessing, setIsProcessing] = useState(false);
  const [isReTriaging, setIsReTriaging] = useState(false);
  const [processingState, setProcessingState] = useState<string>('');
  const [agentLog, setAgentLog] = useState<string[]>([]);
  const [stressScore, setStressScore] = useState<number>(7);

  // ─── Real-time stress analyzer ───────────────────────────────────────────
  const fetchStress = useCallback(async (text: string) => {
    if (text.length < 10) { setStressScore(0); return; }
    try {
      const res = await fetch('/api/stress', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      });
      const data = await res.json();
      setStressScore(data.stressScore ?? 0);
    } catch { /* silent */ }
  }, []);

  const debouncedFetchStress = useDebounce(fetchStress, 2000);
  const handleInputChange = useCallback((text: string) => {
    debouncedFetchStress(text);
  }, [debouncedFetchStress]);

  // ─── Task completion → auto re-triage ────────────────────────────────────
  const handleTaskComplete = useCallback(async (taskId: string) => {
    // Optimistically mark as done
    const updatedTasks = tasks.map(t =>
      t.id === taskId ? { ...t, status: 'completed' as const } : t
    );
    setTasks(updatedTasks);

    const completedTask = tasks.find(t => t.id === taskId);
    const remaining = updatedTasks.filter(t => t.status !== 'completed');

    // AI confirmation message
    const doneMsg: Message = {
      id: crypto.randomUUID(),
      role: 'assistant',
      content: `✅ Marked "${completedTask?.title}" as complete. ${remaining.length > 0 ? 'Re-triaging your remaining tasks...' : '🎉 You\'ve completed everything! Amazing work.'}`,
    };
    setMessages(prev => [...prev, doneMsg]);

    if (remaining.length === 0) return;

    // Auto re-triage with remaining tasks
    setIsReTriaging(true);
    try {
      const res = await fetch('/api/retriage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          remainingTasks: remaining,
          completedTaskTitle: completedTask?.title,
          currentTime: new Date().toISOString(),
        }),
      });
      if (!res.ok) throw new Error('Retriage failed');
      const data = await res.json();

      // Merge completed tasks back in
      const completedTasks = updatedTasks.filter(t => t.status === 'completed');
      setTasks([...completedTasks, ...(data.tasks || remaining)]);
      setSchedule(data.schedule || schedule);

      setMessages(prev => [...prev, {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: data.reply || 'Timeline updated with your remaining tasks.',
      }]);
    } catch {
      // Silently keep current state if retriage fails
    } finally {
      setIsReTriaging(false);
    }
  }, [tasks, schedule]);

  // ─── Main send handler with multi-turn history ────────────────────────────
  const handleSendMessage = async (content: string) => {
    const newUserMsg: Message = { id: crypto.randomUUID(), role: 'user', content };
    setMessages(prev => [...prev, newUserMsg]);
    setIsProcessing(true);
    setAgentLog([]);

    const processingStates = [
      'Parsing brain dump...',
      'Estimating task durations...',
      'Checking schedule conflicts...',
      'Prioritizing by deadline...',
      'Building execution timeline...',
    ];
    let stateIndex = 0;
    setProcessingState(processingStates[0]);
    const stateInterval = setInterval(() => {
      stateIndex = Math.min(stateIndex + 1, processingStates.length - 1);
      setProcessingState(processingStates[stateIndex]);
    }, 1200);

    try {
      // Build concise history for context (last 6 messages, excluding demo)
      const historyForAPI = messages
        .filter(m => !['sys-1', 'demo-user', 'demo-ai'].includes(m.id))
        .slice(-6)
        .map(m => ({ role: m.role, content: m.content }));

      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: content,
          history: historyForAPI,
          currentTime: new Date().toISOString(),
        }),
      });

      clearInterval(stateInterval);

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        const err: any = new Error(errData.error || 'API request failed');
        if (response.status === 429) err.message = '429 ' + err.message;
        throw err;
      }

      const data = await response.json();
      setTasks(data.tasks || []);
      setSchedule(data.schedule || []);
      setAgentLog(data.agentLog || []);
      setMessages(prev => [...prev, {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: data.reply || 'Here is your triaged execution plan.',
      }]);

      const urgentCount = (data.tasks || []).filter((t: Task) => t.category === 'Urgent & Critical').length;
      setStressScore(Math.min(10, urgentCount * 2 + 3));

    } catch (error: any) {
      clearInterval(stateInterval);
      console.error(error);
      const isRateLimit = error?.message?.includes('429') || error?.message?.includes('quota');
      setMessages(prev => [...prev, {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: isRateLimit
          ? '⏳ Rate limit hit on free tier — wait ~60 seconds and try again.'
          : 'Something went wrong. Check that your GEMINI_API_KEY is set correctly in .env',
      }]);
    } finally {
      setIsProcessing(false);
      setProcessingState('');
    }
  };

  const agentBusy = isProcessing || isReTriaging;
  const agentStateLabel = isReTriaging ? 'Re-triaging schedule...' : processingState;

  return (
    <div className="flex flex-col md:flex-row h-screen bg-zinc-950 overflow-hidden font-sans text-zinc-100 selection:bg-indigo-500/30 selection:text-white">

      {/* Left Panel: Chat */}
      <div className="w-full md:w-[380px] shrink-0 h-[50vh] md:h-full flex flex-col z-20 border-r border-white/10">
        <ChatInterface
          messages={messages}
          onSendMessage={handleSendMessage}
          onInputChange={handleInputChange}
          isProcessing={agentBusy}
          processingState={agentStateLabel}
          stressScore={stressScore}
        />
      </div>

      {/* Right Panel: Dashboard */}
      <div className="flex-1 h-[50vh] md:h-full overflow-y-auto relative scroll-smooth">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[50%] bg-indigo-500/10 blur-[120px] rounded-full pointer-events-none -z-10" />

        <div className="p-6 md:p-8 lg:p-10 max-w-[1200px] mx-auto space-y-8 flex flex-col h-full">

          <header className="mb-2 pt-2 shrink-0">
            <h1 className="text-3xl font-bold tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-white to-zinc-400 mb-2 ml-1">
              Execution Dashboard
            </h1>
            <p className="text-zinc-500 font-medium ml-1 text-sm">
              Real-time triage and autonomous timeline generation to prevent procrastination and minimize cognitive load.
            </p>
          </header>

          <section className="animate-in fade-in slide-in-from-bottom-4 duration-700 shrink-0">
            <div className="flex items-center mb-4 ml-1">
              <h2 className="text-xs font-bold uppercase tracking-widest text-zinc-500">Task Triage Matrix</h2>
              {isReTriaging && (
                <span className="ml-3 text-[10px] text-indigo-400 font-mono animate-pulse">⟳ Re-triaging...</span>
              )}
            </div>
            <TaskTriageMatrix tasks={tasks} onTaskComplete={handleTaskComplete} />
          </section>

          <section className="pt-2 animate-in flex-1 flex flex-col fade-in slide-in-from-bottom-4 duration-700 delay-150 overflow-hidden">
            <div className="flex items-center mb-4 ml-1 shrink-0">
              <h2 className="text-xs font-bold uppercase tracking-widest text-zinc-500">Survival Execution Timeline</h2>
            </div>
            <div className="flex-1 overflow-y-auto">
              <TimelineBoard schedule={schedule} tasks={tasks} />
            </div>
          </section>

          {/* Agent Status Bar */}
          <div className="bg-zinc-900 border border-white/10 text-zinc-300 p-3 rounded-xl flex items-center justify-between shrink-0 mb-4 mt-2">
            <div className="flex items-center gap-3">
              <div className="flex gap-1">
                <div className={`w-1.5 h-1.5 rounded-full ${agentBusy ? 'bg-indigo-400 animate-pulse' : 'bg-zinc-700'}`} />
                <div className={`w-1.5 h-1.5 rounded-full ${agentBusy ? 'bg-indigo-400 animate-pulse delay-75' : 'bg-zinc-700'}`} />
                <div className={`w-1.5 h-1.5 rounded-full ${agentBusy ? 'bg-indigo-400 animate-pulse delay-150' : 'bg-zinc-700'}`} />
              </div>
              <span className="text-[11px] font-mono opacity-80 uppercase tracking-tighter">
                {agentBusy
                  ? `Agent: ${agentStateLabel || 'Working...'}`
                  : agentLog.length > 0
                    ? `Last run: ${agentLog.length} tool calls`
                    : 'Agent Status: Idle'}
              </span>
            </div>
            <div className="text-[10px] opacity-60 flex gap-4 font-mono overflow-hidden">
              {!agentBusy && agentLog.length > 0 && (
                <span className="hidden sm:inline text-emerald-500/70">
                  ✓ {agentLog.filter(l => l.includes('✓')).length} tools completed
                </span>
              )}
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
