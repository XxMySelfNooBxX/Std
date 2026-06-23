import { Task } from '../types';
import { Clock, AlertTriangle, CheckCircle2, Circle } from 'lucide-react';

interface TaskTriageMatrixProps {
  tasks: Task[];
  onTaskComplete?: (taskId: string) => void;
}

export function TaskTriageMatrix({ tasks, onTaskComplete }: TaskTriageMatrixProps) {
  const urgent = tasks.filter(t => t.category === 'Urgent & Critical');
  const dependency = tasks.filter(t => t.category === 'High Dependency');
  const micro = tasks.filter(t => t.category === 'Micro-Tasks');

  const completedCount = tasks.filter(t => t.status === 'completed').length;
  const survivalRate = tasks.length > 0 ? Math.round((completedCount / tasks.length) * 100) : 0;

  const Section = ({ items, badgeBgClass, badgeText }: {
    items: Task[];
    badgeBgClass: string;
    badgeText: string;
  }) => (
    <div className="bg-zinc-900/50 border border-white/10 p-4 rounded-xl flex flex-col h-full">
      <div className="flex justify-between items-center mb-3">
        <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${badgeBgClass}`}>{badgeText}</span>
        <span className="text-xs text-zinc-500 font-medium">
          {items.filter(t => t.status === 'completed').length}/{items.length} done
        </span>
      </div>
      <div className="space-y-2 flex-1 min-h-[100px] max-h-[200px] overflow-y-auto pr-1">
        {items.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-zinc-600 italic py-4">
            <span className="text-[10px] uppercase font-bold opacity-50">Empty</span>
          </div>
        ) : (
          items.map((t: Task) => {
            const isDone = t.status === 'completed';
            return (
              <div
                key={t.id}
                className={`bg-zinc-900 p-2.5 rounded border text-xs flex flex-col gap-1 transition-all ${
                  isDone
                    ? 'border-emerald-500/20 bg-emerald-950/20 opacity-60'
                    : t.atRisk ? 'border-red-500/40 hover:border-red-500/60 hover:bg-zinc-800/50' : 'border-white/10 hover:border-zinc-700 hover:bg-zinc-800/50'
                } cursor-default`}
              >
                <div className="flex items-start gap-2">
                  {/* Completion toggle */}
                  <button
                    onClick={() => !isDone && onTaskComplete?.(t.id)}
                    disabled={isDone}
                    title={isDone ? 'Completed!' : 'Mark as done'}
                    className={`mt-0.5 shrink-0 transition-all ${isDone ? 'text-emerald-500 cursor-default' : 'text-zinc-600 hover:text-emerald-400 hover:scale-110'}`}
                  >
                    {isDone
                      ? <CheckCircle2 className="w-3.5 h-3.5" />
                      : <Circle className="w-3.5 h-3.5" />
                    }
                  </button>

                  <div className="flex items-start justify-between gap-2 flex-1 min-w-0">
                    <div className={`font-medium leading-snug flex-1 ${isDone ? 'line-through text-zinc-500' : 'text-zinc-200'}`}>
                      {t.title}
                    </div>
                    {t.atRisk && !isDone && (
                      <div className="flex items-center gap-1 bg-red-500/10 border border-red-500/30 px-1.5 py-0.5 rounded shrink-0">
                        <AlertTriangle className="w-2.5 h-2.5 text-red-400 animate-pulse" />
                        <span className="text-[9px] font-bold text-red-400 uppercase tracking-tight">AT RISK</span>
                      </div>
                    )}
                    {isDone && (
                      <div className="flex items-center gap-1 bg-emerald-500/10 border border-emerald-500/20 px-1.5 py-0.5 rounded shrink-0">
                        <span className="text-[9px] font-bold text-emerald-400 uppercase">DONE</span>
                      </div>
                    )}
                  </div>
                </div>

                {!isDone && (
                  <div className="flex items-center gap-3 pl-5">
                    {t.estimatedMinutes && (
                      <div className="text-[10px] font-medium text-zinc-500 flex items-center">
                        <Clock className="w-3 h-3 mr-1" />
                        {t.estimatedMinutes}m
                      </div>
                    )}
                    {t.panicScore !== undefined && (
                      <div className="flex items-center gap-1">
                        <div className="flex gap-0.5">
                          {Array.from({ length: 5 }).map((_, i) => (
                            <div key={i} className={`w-1 h-2 rounded-sm ${
                              i < Math.round(t.panicScore! / 2)
                                ? t.panicScore! >= 8 ? 'bg-red-500' : t.panicScore! >= 5 ? 'bg-amber-400' : 'bg-indigo-400'
                                : 'bg-zinc-700'
                            }`} />
                          ))}
                        </div>
                        <span className="text-[9px] text-zinc-600 font-mono">{t.panicScore}/10</span>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );

  return (
    <div className="space-y-4">
      {/* Survival Progress Bar */}
      {tasks.length > 0 && (
        <div className="bg-zinc-900/50 border border-white/10 rounded-xl p-3 flex items-center gap-4">
          <div className="flex-1">
            <div className="flex justify-between items-center mb-1.5">
              <span className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">Survival Progress</span>
              <span className={`text-xs font-bold font-mono ${
                survivalRate === 100 ? 'text-emerald-400' :
                survivalRate >= 60 ? 'text-amber-400' : 'text-red-400'
              }`}>{survivalRate}%</span>
            </div>
            <div className="h-1.5 bg-zinc-800 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-700 ${
                  survivalRate === 100 ? 'bg-emerald-500' :
                  survivalRate >= 60 ? 'bg-amber-400' : 'bg-red-500'
                }`}
                style={{ width: `${survivalRate}%` }}
              />
            </div>
          </div>
          <div className="text-right shrink-0">
            <div className="text-lg font-bold text-zinc-200">{completedCount}<span className="text-zinc-600 text-sm">/{tasks.length}</span></div>
            <div className="text-[9px] text-zinc-600 uppercase tracking-wider">tasks done</div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Section badgeText="URGENT" items={urgent} badgeBgClass="bg-red-500/10 text-red-400 border border-red-500/20" />
        <Section badgeText="DEPENDENCY" items={dependency} badgeBgClass="bg-amber-500/10 text-amber-400 border border-amber-500/20" />
        <Section badgeText="MICRO" items={micro} badgeBgClass="bg-indigo-500/10 text-indigo-400 border border-indigo-500/20" />
      </div>
    </div>
  );
}
