import { useState } from 'react';
import { ChatInterface } from './components/ChatInterface';
import { TaskTriageMatrix } from './components/TaskTriageMatrix';
import { TimelineBoard } from './components/TimelineBoard';
import { Message, Task, ExecutionBlock } from './types';

// Mock function representing an autonomous workflow tool call
const mockToolCall = async (toolName: string, delayMs: number) => {
  console.log(`[Agent Workflow] Executing: ${toolName}...`);
  return new Promise(resolve => setTimeout(resolve, delayMs));
};

export default function App() {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: 'sys-1',
      role: 'assistant',
      content: 'I am your Last-Minute Life Saver. Brain dump everything you need to do, and I will instantly triage your tasks and generate a realistic execution timeline.'
    }
  ]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [schedule, setSchedule] = useState<ExecutionBlock[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingState, setProcessingState] = useState<string>('');

  const handleSendMessage = async (content: string) => {
    const newUserMsg: Message = { id: crypto.randomUUID(), role: 'user', content };
    setMessages(prev => [...prev, newUserMsg]);
    setIsProcessing(true);
    
    try {
      setProcessingState('Analyzing semantic urgency...');
      await mockToolCall('parse_deadline_urgency', 600);
      
      setProcessingState('Negotiating block scheduling...');
      await mockToolCall('schedule_calendar_block', 800);

      setProcessingState('Synthesizing dynamic matrix...');
      
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: content,
          history: messages,
          currentTime: new Date().toISOString()
        })
      });

      if (!response.ok) throw new Error('API request failed');

      const data = await response.json();
      
      const newAssistantMsg: Message = {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: data.reply || 'Here is your triaged schedule.'
      };

      setTasks(data.tasks || []);
      setSchedule(data.schedule || []);
      setMessages(prev => [...prev, newAssistantMsg]);

    } catch (error) {
      console.error(error);
      setMessages(prev => [...prev, {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: 'I apologize, something went wrong while processing your brain dump.'
      }]);
    } finally {
      setIsProcessing(false);
      setProcessingState('');
    }
  };

  return (
    <div className="flex flex-col md:flex-row h-screen bg-zinc-950 overflow-hidden font-sans text-zinc-100 selection:bg-indigo-500/30 selection:text-white">
      {/* Left Panel: Chat Interface */}
      <div className="w-full md:w-[380px] shrink-0 h-[50vh] md:h-full flex flex-col z-20 border-r border-white/10 bg-zinc-950">
        <ChatInterface 
          messages={messages} 
          onSendMessage={handleSendMessage} 
          isProcessing={isProcessing} 
          processingState={processingState}
        />
      </div>

      {/* Right Panel: Dashboard */}
      <div className="flex-1 h-[50vh] md:h-full overflow-y-auto relative scroll-smooth">
        {/* Atmospheric background glow */}
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[50%] bg-indigo-500/10 blur-[120px] rounded-full pointer-events-none -z-10" />
        
        <div className="p-6 md:p-8 lg:p-10 max-w-[1200px] mx-auto space-y-8 flex flex-col h-full">
          
          <header className="mb-2 pt-2 shrink-0">
            <h1 className="text-3xl font-bold tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-white to-zinc-400 mb-2 ml-1">Execution Dashboard</h1>
            <p className="text-zinc-500 font-medium ml-1 text-sm">Real-time triage and autonomous timeline generation to prevent procrastination and minimize cognitive load.</p>
          </header>

          <section className="animate-in fade-in slide-in-from-bottom-4 duration-700 shrink-0">
            <div className="flex items-center mb-4 ml-1">
              <h2 className="text-xs font-bold uppercase tracking-widest text-zinc-500">Task Triage Matrix</h2>
            </div>
            <TaskTriageMatrix tasks={tasks} />
          </section>

          <section className="pt-2 animate-in flex-1 flex flex-col fade-in slide-in-from-bottom-4 duration-700 delay-150 overflow-hidden">
             <div className="flex items-center mb-4 ml-1 shrink-0">
              <h2 className="text-xs font-bold uppercase tracking-widest text-zinc-500">Survival Execution Timeline</h2>
            </div>
            <div className="flex-1 overflow-y-auto">
              <TimelineBoard schedule={schedule} tasks={tasks} />
            </div>
          </section>

          {/* AGENT STATUS BAR */}
          <div className="bg-zinc-900 border border-white/10 text-zinc-300 p-3 rounded-xl flex items-center justify-between shrink-0 mb-4 mt-2">
            <div className="flex items-center gap-3">
              <div className="flex gap-1">
                <div className={`w-1.5 h-1.5 rounded-full ${isProcessing ? 'bg-indigo-400 animate-pulse' : 'bg-zinc-700'}`}></div>
                <div className={`w-1.5 h-1.5 rounded-full ${isProcessing ? 'bg-indigo-400 animate-pulse delay-75' : 'bg-zinc-700'}`}></div>
                <div className={`w-1.5 h-1.5 rounded-full ${isProcessing ? 'bg-indigo-400 animate-pulse delay-150' : 'bg-zinc-700'}`}></div>
              </div>
              <span className="text-[11px] font-mono opacity-80 uppercase tracking-tighter">
                {isProcessing ? `Agent Status: ${processingState || 'Optimizing Schedule...'}` : 'Agent Status: Idle'}
              </span>
            </div>
            <div className="text-[10px] opacity-60 flex gap-4 font-mono">
              {isProcessing && (
                <>
                  <span className="hidden sm:inline">call: parse_deadline_urgency</span>
                  <span className="hidden sm:inline">call: schedule_calendar_block</span>
                </>
              )}
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
