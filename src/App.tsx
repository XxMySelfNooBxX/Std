import { useState, useCallback, useRef, useEffect, lazy, Suspense } from 'react';
import { useTheme } from './hooks/useTheme';
import { createVoiceRecognizer } from './utils/voice';
import { motion, AnimatePresence } from 'motion/react';
import { ChatInterface } from './components/ChatInterface';
import { TaskTriageMatrix } from './components/TaskTriageMatrix';
import { TimelineBoard } from './components/TimelineBoard';
import { StatsBar } from './components/StatsBar';
import { ParticleField } from './components/ParticleField';
import { FocusMode } from './components/FocusMode';
import { CommandBar } from './components/CommandBar';
import { BurndownChart } from './components/BurndownChart';
import { WhatIf } from './components/WhatIf';
import { AgentTrace } from './components/AgentTrace';
import { EnergyCurve } from './components/EnergyCurve';
import { ConfettiExplosion } from './components/ConfettiExplosion';
import { OnboardingOverlay } from './components/OnboardingOverlay';
import { AnimatedBackground } from './components/AnimatedBackground';
import { Message, Task, ExecutionBlock, EnergyPoint } from './types';

// Lazy load the 3D chart — it's heavy, only loads when user requests it
const PanicChart3D = lazy(() => import('./components/PanicChart3D').then(m => ({ default: m.PanicChart3D })));

const SESSION_KEY = 'lmls-session-v2';

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
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [dismissedSuggestions, setDismissedSuggestions] = useState<Set<string>>(new Set());
  const [focusBlock, setFocusBlock] = useState<{ block: ExecutionBlock; task?: Task } | null>(null);
  const [show3D, setShow3D] = useState(false);
  const [showSplash, setShowSplash] = useState(true);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(() => !localStorage.getItem('onboarded'));
  const [confettiAt, setConfettiAt] = useState<{x: number, y: number} | null>(null);
  const [energyCurve, setEnergyCurve] = useState<EnergyPoint[]>([]);
  
  // Theme handling
  const { theme, toggleTheme } = useTheme();
  // Expose to window for CommandBar buttons
  useEffect(() => {
    (window as any).toggleTheme = toggleTheme;
  }, [toggleTheme]);

  // Splash screen timer
  useEffect(() => {
    const timer = setTimeout(() => setShowSplash(false), 1500);
    return () => clearTimeout(timer);
  }, []);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === '?' && !['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement).tagName)) {
        setShowShortcuts(prev => !prev);
      }
      if (e.key === 'Escape') {
        setShowShortcuts(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);
  const [isCommandProcessing, setIsCommandProcessing] = useState(false);
  const [completionHistory, setCompletionHistory] = useState<{ remaining: number; timestamp: number }[]>([]);
  const [streak, setStreak] = useState(0);
  const [sessionStart] = useState(() => Date.now());
  // Voice recognizer setup
  const voiceRecognizer = useRef<any>(null);
  useEffect(() => {
    voiceRecognizer.current = createVoiceRecognizer((transcript) => {
      // Insert transcript into CommandBar input via a global handler
      if (typeof (window as any).insertCommandText === 'function') {
        (window as any).insertCommandText(transcript);
      }
    });
    (window as any).startVoiceListening = () => {
      voiceRecognizer.current?.start();
    };
    // Clean up on unmount
    return () => {
      voiceRecognizer.current?.stop();
    };
  }, []);

  // ─── Session Persistence ─────────────────────────────────────────────────
  // Load from localStorage on first mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem(SESSION_KEY);
      if (saved) {
        const data = JSON.parse(saved);
        if (data.tasks?.length > 0 && data.tasks.some((t: Task) => t.status !== 'completed')) {
          setTasks(data.tasks);
          setSchedule(data.schedule || []);
          setCompletionHistory(data.completionHistory || []);
          const pending = data.tasks.filter((t: Task) => t.status !== 'completed').length;
          const done = data.tasks.filter((t: Task) => t.status === 'completed').length;
          setMessages([
            { id: 'sys-1', role: 'assistant', content: 'I am your Last-Minute Life Saver. Brain dump everything you need to do, and I will instantly triage your tasks and generate a realistic execution timeline.' },
            {
              id: crypto.randomUUID(),
              role: 'assistant',
              content: `👋 Welcome back! You have **${pending}** tasks still pending.${done > 0 ? ` You completed ${done} last session — great progress.` : ''} Ready to keep going?`,
            },
          ]);
        }
      }
    } catch { /* ignore corrupt data */ }
  }, []);

  // Save session to localStorage whenever tasks or schedule change
  useEffect(() => {
    try {
      localStorage.setItem(SESSION_KEY, JSON.stringify({
        tasks,
        schedule,
        completionHistory,
        savedAt: Date.now(),
      }));
    } catch { /* quota exceeded — ignore */ }
  }, [tasks, schedule, completionHistory]);

  // ─── Proactive check-in timer (every 25 mins) ───────────────────────────
  const checkInTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const tasksRef = useRef(tasks);
  const scheduleRef = useRef(schedule);
  const setMessagesRef = useRef(setMessages);
  tasksRef.current = tasks;
  scheduleRef.current = schedule;
  setMessagesRef.current = setMessages;

  useEffect(() => {
    const INTERVAL_MS = 25 * 60 * 1000; // 25 minutes

    const runCheckIn = async () => {
      const currentTasks = tasksRef.current;
      const currentSchedule = scheduleRef.current;
      const pending = currentTasks.filter(t => t.status !== 'completed');
      if (pending.length === 0) return;

      const now = new Date();
      const activeBlock = currentSchedule.find(b => {
        try {
          const start = new Date(b.startTime).getTime();
          const end = new Date(b.endTime).getTime();
          return now.getTime() >= start && now.getTime() <= end;
        } catch { return false; }
      });

      const activeTask = activeBlock?.taskId
        ? currentTasks.find(t => t.id === activeBlock.taskId)
        : pending[0];

      try {
        const res = await fetch('/api/checkin', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            currentTaskTitle: activeTask?.title ?? 'your current task',
            elapsedMinutes: 25,
            remainingTasksCount: pending.length,
            currentTime: now.toISOString(),
          }),
        });
        const data = await res.json();
        if (data.message) {
          setMessagesRef.current(prev => [...prev, {
            id: crypto.randomUUID(),
            role: 'assistant',
            content: data.message,
          }]);
        }
      } catch { /* silent — don't disrupt user */ }
    };

    checkInTimerRef.current = setInterval(runCheckIn, INTERVAL_MS);
    return () => {
      if (checkInTimerRef.current) clearInterval(checkInTimerRef.current);
    };
  }, []); // runs once, uses refs to avoid stale closures

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

  const debouncedFetchStress = useDebounce(fetchStress, 3500);
  const handleInputChange = useCallback((text: string) => {
    debouncedFetchStress(text);
  }, [debouncedFetchStress]);

  // ─── Task completion → auto re-triage ───────────────────────────────────────────
  const handleTaskComplete = useCallback(async (taskId: string) => {
    let completedTask: Task | undefined;
    let justCompletedParent = false;

    // Optimistically mark as done
    const updatedTasks = tasks.map(t => {
      if (t.id === taskId) {
        completedTask = t;
        justCompletedParent = true;
        const subtasks = t.subtasks ? t.subtasks.map(s => ({ ...s, status: 'completed' as const })) : undefined;
        return { ...t, status: 'completed' as const, subtasks };
      }
      if (t.subtasks && t.subtasks.some(s => s.id === taskId)) {
        completedTask = t.subtasks.find(s => s.id === taskId);
        const newSubtasks = t.subtasks.map(s => s.id === taskId ? { ...s, status: 'completed' as const } : s);
        if (newSubtasks.every(s => s.status === 'completed')) {
          justCompletedParent = true;
          return { ...t, status: 'completed' as const, subtasks: newSubtasks };
        }
        return { ...t, subtasks: newSubtasks };
      }
      return t;
    });

    setTasks(updatedTasks);

    // Track completion in burndown history
    const newRemaining = updatedTasks.filter(t => t.status !== 'completed').length;
    setCompletionHistory(prev => [
      ...prev,
      { remaining: newRemaining, timestamp: Date.now() },
    ]);
    setStreak(s => s + 1);

    if (justCompletedParent) {
      setConfettiAt({ x: window.innerWidth / 2, y: window.innerHeight / 2 });
    }

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

  // ─── Natural Language Command Handler ───────────────────────────────────────────
  const handleCommand = useCallback(async (command: string) => {
    setIsCommandProcessing(true);
    try {
      const res = await fetch('/api/command', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          command,
          currentSchedule: schedule,
          currentTasks: tasks,
          currentTime: new Date().toISOString(),
        }),
      });
      const data = await res.json();
      if (data.schedule) setSchedule(data.schedule);
      if (data.confirmation) {
        setMessages(prev => [...prev, {
          id: crypto.randomUUID(),
          role: 'assistant',
          content: `⚡ ${data.confirmation}`,
        }]);
      }
    } catch {
      setMessages(prev => [...prev, {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: 'Command failed. Try again after the rate limit resets.',
      }]);
    } finally {
      setIsCommandProcessing(false);
    }
  }, [schedule, tasks]);

  // ─── Task Decomposition Handler ───────────────────────────────────────────────
  const handleTaskDecompose = useCallback(async (task: Task) => {
    try {
      setIsReTriaging(true);
      const res = await fetch('/api/decompose', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          taskTitle: task.title,
          estimatedMinutes: task.estimatedMinutes || 60,
          complexity: 'high',
        }),
      });
      const data = await res.json();
      if (data.subtasks) {
        setTasks(prev => prev.map(t => 
          t.id === task.id 
            ? { ...t, subtasks: data.subtasks.map((s: any) => ({ ...s, status: 'pending' as const, parentId: task.id, category: task.category })) } 
            : t
        ));
      }
    } catch {
      console.error("Decompose failed");
    } finally {
      setIsReTriaging(false);
    }
  }, []);

  // ─── Main send handler with multi-turn history ─────────────────────────────
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
      setSuggestions(data.suggestions || []);
      if (data.energyCurve) setEnergyCurve(data.energyCurve);
      setDismissedSuggestions(new Set()); // reset on new brain dump
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
    <>
    <AnimatePresence mode="wait">
      {showSplash ? (
        <motion.div
          key="splash"
          initial={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.5 }}
          className={theme + " flex items-center justify-center h-screen bg-zinc-950"}
        >
          <motion.div
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 1.1, opacity: 0 }}
            transition={{ duration: 0.8, ease: "easeOut" }}
            className="flex flex-col items-center gap-4"
          >
            <div className="w-16 h-16 rounded-2xl bg-indigo-500/20 border border-indigo-500/30 flex items-center justify-center shadow-[0_0_40px_rgba(99,102,241,0.2)]">
              <span className="text-3xl animate-pulse">⚡</span>
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-zinc-100">Last-Minute Life Saver</h1>
            <div className="text-[10px] text-indigo-400 font-mono tracking-widest uppercase mt-4">Powered by Gemini</div>
          </motion.div>
        </motion.div>
      ) : (
        <motion.div
          key="main-app"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.5 }}
          className={theme + " flex flex-col md:flex-row h-screen bg-transparent overflow-hidden font-sans text-zinc-100 selection:bg-indigo-500/30 selection:text-white w-full"}
        >
          <AnimatedBackground />

      {/* Left Panel: Chat + Particle Field */}
      <motion.div
        className="w-full md:w-[380px] shrink-0 h-[50vh] md:h-full flex flex-col z-20 border-r border-white/10 relative overflow-hidden"
        initial={{ x: -40, opacity: 0 }}
        animate={{ x: 0, opacity: 1 }}
        transition={{ duration: 0.55, ease: [0.16, 1, 0.3, 1] }}
      >
        <ParticleField stressScore={stressScore} />
        <div className="relative z-10 flex flex-col h-full">
          <ChatInterface
            messages={messages}
            onSendMessage={handleSendMessage}
            onInputChange={handleInputChange}
            isProcessing={agentBusy}
            processingState={agentStateLabel}
            stressScore={stressScore}
          />
        </div>
      </motion.div>

      {/* Right Panel: Dashboard */}
      <motion.div
        className="flex-1 h-[50vh] md:h-full overflow-y-auto relative scroll-smooth"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, delay: 0.2, ease: [0.16, 1, 0.3, 1] }}
      >
        {/* Animated Background Grid */}
        <motion.div
          className="absolute inset-0 bg-grid-pattern pointer-events-none -z-20"
          animate={{
            y: [0, 32],
            x: [0, 32],
          }}
          transition={{
            duration: 8,
            repeat: Infinity,
            ease: "linear"
          }}
        />

        {/* Animated Background Blobs */}
        <motion.div
          className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] bg-indigo-500/10 dark:bg-indigo-500/8 blur-[120px] rounded-full pointer-events-none -z-10"
          animate={{
            x: [0, 40, -20, 0],
            y: [0, -30, 20, 0],
            scale: [1, 1.1, 0.9, 1],
          }}
          transition={{
            duration: 22,
            repeat: Infinity,
            ease: "easeInOut",
          }}
        />
        <motion.div
          className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] bg-purple-500/10 dark:bg-purple-500/5 blur-[120px] rounded-full pointer-events-none -z-10"
          animate={{
            x: [0, -40, 20, 0],
            y: [0, 30, -20, 0],
            scale: [1, 0.9, 1.1, 1],
          }}
          transition={{
            duration: 28,
            repeat: Infinity,
            ease: "easeInOut",
          }}
        />

        <div className="p-6 md:p-8 lg:p-10 max-w-[1200px] mx-auto space-y-8 flex flex-col min-h-full">

          <motion.header
            className="mb-2 pt-2 shrink-0"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.35, ease: [0.16, 1, 0.3, 1] }}
          >
            <div className="flex items-start justify-between ml-1">
              <div>
                <div className="flex items-center gap-3 mb-2">
                  <h1 className="text-3xl font-bold tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-zinc-100 to-zinc-400">
                    Execution Dashboard
                  </h1>
                  <span className="hidden sm:inline-block text-[9px] uppercase tracking-widest font-bold bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 px-2 py-0.5 rounded-full">
                    Powered by Gemini
                  </span>
                </div>
                <p className="text-zinc-500 font-medium text-sm">
                  Real-time triage and autonomous timeline generation to prevent procrastination and minimize cognitive load.
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <WhatIf
                  tasks={tasks}
                  schedule={schedule}
                  onApply={(newSchedule, confirmation) => {
                    setSchedule(newSchedule);
                    setMessages(prev => [...prev, {
                      id: crypto.randomUUID(),
                      role: 'assistant',
                      content: `⚡ ${confirmation}`,
                    }]);
                  }}
                />
                <CommandBar onCommand={handleCommand} isProcessing={isCommandProcessing} toggleTheme={toggleTheme} theme={theme} />
              </div>
            </div>
          </motion.header>

          {/* Smart Suggestions */}
          <AnimatePresence>
            {suggestions.filter(s => !dismissedSuggestions.has(s)).length > 0 && (
              <motion.section
                key="suggestions"
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.4 }}
                className="shrink-0 overflow-hidden"
              >
                <div className="flex flex-wrap gap-2">
                  {suggestions.filter(s => !dismissedSuggestions.has(s)).map((tip, i) => (
                    <motion.div
                      key={tip}
                      initial={{ opacity: 0, scale: 0.9 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.85 }}
                      transition={{ delay: i * 0.08 }}
                      className="flex items-start gap-2 bg-indigo-500/10 border border-indigo-500/20 text-indigo-300 text-[11px] px-3 py-2 rounded-lg max-w-sm"
                    >
                      <span className="mt-0.5 shrink-0">💡</span>
                      <span className="flex-1 leading-snug">{tip}</span>
                      <button
                        onClick={() => setDismissedSuggestions(prev => new Set([...prev, tip]))}
                        className="text-indigo-500 hover:text-indigo-300 shrink-0 ml-1 text-xs font-bold"
                      >✕</button>
                    </motion.div>
                  ))}
                </div>
              </motion.section>
            )}
          </AnimatePresence>

          {/* Session Stats & Energy Curve */}
          <motion.section
            className="shrink-0 flex flex-col lg:flex-row gap-4"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.45 }}
          >
            <div className="flex-1 flex flex-col">
              <StatsBar tasks={tasks} schedule={schedule} />
              {/* Burndown chart — only shows after first completion */}
              {completionHistory.length >= 2 && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  className="mt-3 overflow-hidden"
                >
                  <BurndownChart
                    history={[{ remaining: tasks.length, timestamp: sessionStart }, ...completionHistory]}
                    total={tasks.length}
                    streak={streak}
                  />
                </motion.div>
              )}
            </div>
            
            {energyCurve.length > 0 && (
              <div className="w-full lg:w-1/3 flex-shrink-0">
                <EnergyCurve curve={energyCurve} />
              </div>
            )}
          </motion.section>

          <motion.section
            className="shrink-0"
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.55 }}
          >
            <div className="flex items-center justify-between mb-4 ml-1">
              <div className="flex items-center gap-3">
                <h2 className="text-xs font-bold uppercase tracking-widest text-zinc-500">Task Triage Matrix</h2>
                {isReTriaging && (
                  <span className="text-[10px] text-indigo-400 font-mono animate-pulse">⟳ Re-triaging...</span>
                )}
              </div>
              {/* 3D toggle */}
              <button
                onClick={() => setShow3D(v => !v)}
                className={`flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-lg border transition-all ${
                  show3D
                    ? 'bg-indigo-500/20 border-indigo-500/40 text-indigo-300'
                    : 'bg-zinc-900 border-white/10 text-zinc-500 hover:text-zinc-300 hover:border-indigo-500/30'
                }`}
              >
                <span className="text-sm leading-none">{show3D ? '▣' : '▤'}</span>
                {show3D ? '2D View' : '3D View'}
              </button>
            </div>

            <AnimatePresence mode="wait">
              {show3D ? (
                <motion.div key="3d"
                  initial={{ opacity: 0, scale: 0.97 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.97 }}
                  transition={{ duration: 0.3 }}
                >
                  <Suspense fallback={
                    <div className="h-[320px] rounded-xl bg-zinc-900 border border-white/10 flex items-center justify-center text-zinc-600 text-sm">
                      Loading 3D view...
                    </div>
                  }>
                    <PanicChart3D tasks={tasks} />
                  </Suspense>
                </motion.div>
              ) : (
                <motion.div key="2d"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.25 }}
                >
                  <TaskTriageMatrix tasks={tasks} onTaskComplete={handleTaskComplete} onTaskDecompose={handleTaskDecompose} />
                </motion.div>
              )}
            </AnimatePresence>
          </motion.section>

          <motion.section
            className="pt-2 flex-1 flex flex-col min-h-[400px]"
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.65 }}
          >
            <div className="flex items-center mb-4 ml-1 shrink-0">
              <h2 className="text-xs font-bold uppercase tracking-widest text-zinc-500">Survival Execution Timeline</h2>
            </div>
            <div className="flex-1 overflow-y-auto">
              <TimelineBoard
                schedule={schedule}
                tasks={tasks}
                onStartFocus={(block, task) => setFocusBlock({ block, task })}
              />
            </div>
          </motion.section>

          {/* Agent Status Bar */}
          <AgentTrace agentLog={agentLog} isProcessing={agentBusy} processingState={agentStateLabel} />

        </div>
      </motion.div>
    </motion.div>
      )}
    </AnimatePresence>

    {/* Confetti */}
    {confettiAt && (
      <ConfettiExplosion 
        x={confettiAt.x} 
        y={confettiAt.y} 
        onComplete={() => setConfettiAt(null)} 
      />
    )}

    {/* Onboarding Overlay */}
    <AnimatePresence>
      {showOnboarding && !showSplash && (
        <OnboardingOverlay 
          onDismiss={() => {
            setShowOnboarding(false);
            localStorage.setItem('onboarded', 'true');
          }} 
        />
      )}
    </AnimatePresence>

    {/* Focus Mode overlay */}
    <AnimatePresence>
      {focusBlock && (
        <FocusMode
          block={focusBlock.block}
          task={focusBlock.task}
          onClose={() => setFocusBlock(null)}
          onComplete={(taskId) => {
            handleTaskComplete(taskId);
            setFocusBlock(null);
          }}
        />
      )}
    </AnimatePresence>

    {/* Keyboard Shortcuts Overlay */}
    <AnimatePresence>
      {showShortcuts && (
        <motion.div
          className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-zinc-950/80 backdrop-blur-sm"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={() => setShowShortcuts(false)}
        >
          <motion.div
            className="bg-zinc-900 border border-white/10 rounded-2xl p-6 max-w-sm w-full shadow-2xl glass-panel"
            initial={{ scale: 0.95, y: 10, opacity: 0 }}
            animate={{ scale: 1, y: 0, opacity: 1 }}
            exit={{ scale: 0.95, opacity: 0 }}
            onClick={e => e.stopPropagation()}
          >
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-bold text-zinc-100">Keyboard Shortcuts</h3>
              <button onClick={() => setShowShortcuts(false)} className="text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200">✕</button>
            </div>
            <div className="space-y-3">
              <div className="flex justify-between text-sm items-center">
                <span className="text-zinc-400">Toggle Shortcuts</span>
                <kbd className="px-2 py-1 bg-zinc-800 rounded border border-white/10 font-mono text-xs text-zinc-300">?</kbd>
              </div>
              <div className="flex justify-between text-sm items-center">
                <span className="text-zinc-400">Send Message</span>
                <kbd className="px-2 py-1 bg-zinc-800 rounded border border-white/10 font-mono text-xs text-zinc-300">Enter</kbd>
              </div>
              <div className="flex justify-between text-sm items-center">
                <span className="text-zinc-400">New Line</span>
                <kbd className="px-2 py-1 bg-zinc-800 rounded border border-white/10 font-mono text-xs text-zinc-300">Shift + Enter</kbd>
              </div>
              <div className="flex justify-between text-sm items-center">
                <span className="text-zinc-400">Close Modals</span>
                <kbd className="px-2 py-1 bg-zinc-800 rounded border border-white/10 font-mono text-xs text-zinc-300">Esc</kbd>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
    </>
  );
}
