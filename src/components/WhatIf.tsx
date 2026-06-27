import { useState, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Lightbulb, Loader2, ArrowRight } from 'lucide-react';
import { Task, ExecutionBlock } from '../types';

interface WhatIfProps {
  tasks: Task[];
  schedule: ExecutionBlock[];
  onApply: (newSchedule: ExecutionBlock[], confirmation: string) => void;
  disabled?: boolean;
}

export function WhatIf({ tasks, schedule, onApply, disabled }: WhatIfProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<{ analysis: string; timeSaved: number; schedule: ExecutionBlock[] } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const SCENARIOS = [
    'What if I skip the emails task?',
    'What if I only have 2 hours left today?',
    'What is the bare minimum I must do?',
    'What if I swap the first two tasks?',
  ];

  const handleSubmit = async (scenario: string) => {
    if (!scenario.trim() || isLoading) return;
    setIsLoading(true);
    setResult(null);
    try {
      const res = await fetch('/api/whatif', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          scenario: scenario.trim(),
          currentTasks: tasks,
          currentSchedule: schedule,
          currentTime: new Date().toISOString(),
        }),
      });
      const data = await res.json();
      setResult(data);
    } catch {
      setResult({ analysis: 'Could not run scenario — rate limit may be active.', timeSaved: 0, schedule });
    } finally {
      setIsLoading(false);
    }
  };

  const handleApply = () => {
    if (!result) return;
    onApply(result.schedule, `Applied scenario: "${input}"`);
    setIsOpen(false);
    setInput('');
    setResult(null);
  };

  return (
    <>
      {/* Trigger */}
      <button
        onClick={() => { setIsOpen(true); setTimeout(() => inputRef.current?.focus(), 50); }}
        disabled={disabled}
        className={`flex items-center gap-1.5 px-3 py-1.5 bg-zinc-900 border border-white/10 rounded-lg text-xs text-zinc-500 transition-all group ${disabled ? 'opacity-50 cursor-not-allowed' : 'hover:text-amber-300 hover:border-amber-500/30 hover:bg-zinc-800'}`}
        title={disabled ? "Add tasks to explore scenarios" : "What-if scenario planner"}
      >
        <Lightbulb className={`w-3 h-3 ${disabled ? 'text-zinc-600' : 'text-amber-500/70 group-hover:text-amber-400'}`} />
        <span className="hidden sm:inline">What if?</span>
      </button>

      {/* Panel */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            className="fixed inset-0 z-40 flex items-start justify-center pt-[18vh]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={(e) => { if (e.target === e.currentTarget) { setIsOpen(false); setResult(null); setInput(''); } }}
          >
            <div className="absolute inset-0 bg-zinc-950/80 backdrop-blur-sm" />
            <motion.div
              className="relative z-10 w-full max-w-xl mx-4"
              initial={{ scale: 0.95, y: -16, opacity: 0 }}
              animate={{ scale: 1, y: 0, opacity: 1 }}
              exit={{ scale: 0.97, opacity: 0 }}
              transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
            >
              <div className="bg-zinc-900 border border-amber-500/20 rounded-2xl shadow-2xl overflow-hidden">
                {/* Header */}
                <div className="flex items-center gap-3 px-4 py-4 border-b border-white/10">
                  <Lightbulb className="w-4 h-4 text-amber-400 shrink-0" />
                  <input
                    ref={inputRef}
                    value={input}
                    onChange={e => setInput(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') handleSubmit(input); if (e.key === 'Escape') { setIsOpen(false); setResult(null); setInput(''); } }}
                    placeholder="Describe a scenario to explore..."
                    className="flex-1 bg-transparent text-sm text-zinc-100 placeholder:text-zinc-600 outline-none"
                  />
                  {isLoading
                    ? <Loader2 className="w-4 h-4 text-amber-400 animate-spin shrink-0" />
                    : input.trim() && <button onClick={() => handleSubmit(input)} className="text-[10px] text-amber-400 border border-amber-500/30 px-2 py-1 rounded hover:bg-amber-500/10 transition-colors">Analyze ↵</button>
                  }
                </div>

                {/* Preset scenarios */}
                {!result && (
                  <div className="p-3">
                    <div className="text-[9px] uppercase tracking-widest text-zinc-600 font-bold mb-2 px-1">Scenarios</div>
                    <div className="space-y-1">
                      {SCENARIOS.map(s => (
                        <button
                          key={s}
                          onClick={() => { setInput(s); handleSubmit(s); }}
                          className="w-full text-left text-xs text-zinc-500 hover:text-amber-300 px-2 py-1.5 rounded-lg hover:bg-amber-500/5 transition-colors"
                        >
                          {s}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Result */}
                <AnimatePresence>
                  {result && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      className="overflow-hidden"
                    >
                      <div className="p-4 border-t border-white/10">
                        <div className="flex items-start gap-2 mb-3">
                          <div className="w-1.5 h-1.5 rounded-full bg-amber-400 mt-1.5 shrink-0" />
                          <p className="text-sm text-zinc-200 leading-relaxed">{result.analysis}</p>
                        </div>
                        {result.timeSaved > 0 && (
                          <div className="inline-flex items-center gap-1.5 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs px-2.5 py-1 rounded-lg mb-3">
                            ⏱ Saves ~{result.timeSaved} minutes
                          </div>
                        )}
                        <div className="flex gap-2">
                          <button
                            onClick={handleApply}
                            className="flex items-center gap-1.5 px-4 py-2 bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/30 text-amber-300 text-xs font-bold rounded-lg transition-all"
                          >
                            <ArrowRight className="w-3.5 h-3.5" /> Apply this plan
                          </button>
                          <button
                            onClick={() => setResult(null)}
                            className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-400 text-xs rounded-lg transition-colors"
                          >
                            Try another
                          </button>
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                <div className="px-4 pb-3 text-[9px] text-zinc-700">
                  This is a hypothetical — your schedule won&apos;t change until you click Apply.
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
