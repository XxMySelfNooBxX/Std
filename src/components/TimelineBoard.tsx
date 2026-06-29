import { useState, useEffect } from 'react';
import { Task, ExecutionBlock } from '../types';
import { format, parseISO } from 'date-fns';
import { Calendar, AlertTriangle, Play } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

function generateICS(block: ExecutionBlock, task?: Task): string {
  const fmt = (iso: string) => iso.replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  return [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//LastMinuteLifeSaver//EN',
    'BEGIN:VEVENT',
    `UID:${block.id}@lastminutelifesaver`,
    `DTSTART:${fmt(block.startTime)}`,
    `DTEND:${fmt(block.endTime)}`,
    `SUMMARY:${block.title}`,
    task ? `DESCRIPTION:Focus: ${task.title}` : 'DESCRIPTION:Scheduled by PanicMode Planner',
    'END:VEVENT', 'END:VCALENDAR',
  ].join('\r\n');
}

function downloadICS(block: ExecutionBlock, task?: Task) {
  const blob = new Blob([generateICS(block, task)], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = `${block.title.replace(/\s+/g, '_')}.ics`; a.click();
  URL.revokeObjectURL(url);
}

export function TimelineBoard({ schedule, tasks, onStartFocus }: {
  schedule: ExecutionBlock[];
  tasks: Task[];
  onStartFocus?: (block: ExecutionBlock, task?: Task) => void;
}) {
  const [now, setNow] = useState(new Date());

  // Update "now" every 30 seconds so the indicator moves
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 30000);
    return () => clearInterval(id);
  }, []);

  if (schedule.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-[250px] md:h-full text-zinc-600 bg-zinc-900/50 rounded-2xl border border-dashed border-white/10">
        <Calendar className="w-10 h-10 mb-4 opacity-20" />
        <p className="text-sm font-medium tracking-tight">Timeline Awaiting Generation...</p>
      </div>
    );
  }

  // Classify each block relative to now
  const classifyBlock = (block: ExecutionBlock) => {
    const start = parseISO(block.startTime).getTime();
    const end = parseISO(block.endTime).getTime();
    const nowMs = now.getTime();
    if (end < nowMs) return 'past';
    if (start <= nowMs && end >= nowMs) return 'active';
    return 'future';
  };

  // Find index where NOW indicator should appear (before first future block)
  const firstFutureIdx = schedule.findIndex(b => classifyBlock(b) === 'future');
  const hasActiveBlock = schedule.some(b => classifyBlock(b) === 'active');
  const nowInsertIdx = hasActiveBlock ? -1 : firstFutureIdx; // -1 = don't show divider (active block is already highlighted)

  return (
    <div className="bg-zinc-900/50 border border-white/10 rounded-2xl p-6 relative h-[350px] md:h-full overflow-y-auto">
      <div className="ml-16 border-l border-white/10 relative min-h-full py-2">
        <AnimatePresence mode="popLayout">
          {schedule.map((block, index) => {
            const task = tasks.find(t => t.id === block.taskId);
            const isAtRisk = task?.atRisk;
            const state = classifyBlock(block);
            const isPast = state === 'past';
            const isActive = state === 'active';

            let blockClasses = 'bg-zinc-800/30 border-zinc-700/50';
            let titleClasses = 'text-zinc-300';
            let dotClass = 'bg-zinc-700';

            if (block.type === 'work') {
              if (task?.category === 'Urgent & Critical') {
                blockClasses = isAtRisk
                  ? 'bg-red-100 dark:bg-red-500/15 border-red-400 dark:border-red-500/60 shadow-[0_0_12px_rgba(239,68,68,0.15)]'
                  : 'bg-red-50 dark:bg-red-500/10 border-red-300 dark:border-red-500/50';
                titleClasses = 'text-red-700 dark:text-red-400';
                dotClass = isAtRisk ? 'bg-red-500' : 'bg-red-600';
              } else if (task?.category === 'High Dependency') {
                blockClasses = 'bg-amber-100 dark:bg-amber-500/10 border-amber-300 dark:border-amber-500/50';
                titleClasses = 'text-amber-700 dark:text-amber-400';
                dotClass = 'bg-amber-500';
              } else {
                blockClasses = 'bg-indigo-100 dark:bg-indigo-500/10 border-indigo-300 dark:border-indigo-500/50';
                titleClasses = 'text-indigo-700 dark:text-indigo-400';
                dotClass = 'bg-indigo-500';
              }
            } else if (block.type === 'break') {
              blockClasses = 'bg-emerald-100 dark:bg-emerald-500/5 border-emerald-300 dark:border-emerald-500/20';
              titleClasses = 'text-emerald-700 dark:text-emerald-500';
              dotClass = 'bg-emerald-600';
            }

            return (
              <motion.div key={block.id} layout>
                {/* NOW indicator — insert before the first future block when no active block */}
                {index === nowInsertIdx && (
                  <motion.div
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    className="relative mb-4 flex items-center"
                  >
                    <div className="absolute -left-[5px] w-2.5 h-2.5 rounded-full bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.8)] z-10 animate-pulse" />
                    <div className="ml-4 flex-1 border-t-2 border-red-500/60 border-dashed" />
                    <span className="ml-3 text-[10px] font-bold text-red-400 font-mono uppercase tracking-wider shrink-0">
                      ◀ NOW {format(now, 'h:mm a')}
                    </span>
                  </motion.div>
                )}

                <motion.div
                  className="relative mb-6 group"
                  initial={{ opacity: 0, x: -12 }}
                  animate={{ opacity: isPast ? 0.45 : 1, x: 0 }}
                  transition={{ duration: 0.4, delay: index * 0.06, ease: [0.16, 1, 0.3, 1] }}
                >
                  {/* Timeline dot */}
                  <motion.div
                    className={`absolute -left-[5px] top-4 w-2.5 h-2.5 rounded-full ${isActive ? dotClass + ' shadow-[0_0_8px_currentColor]' : dotClass} border-2 border-zinc-900 z-10`}
                    animate={isActive && isAtRisk ? { scale: [1, 1.3, 1] } : {}}
                    transition={{ duration: 1.2, repeat: Infinity }}
                  />

                  {/* Time label */}
                  <div className="absolute -left-[4.5rem] top-3 text-[10px] text-zinc-500 font-mono w-14 text-right pr-2">
                    {format(parseISO(block.startTime), 'HH:mm')}
                  </div>

                  {/* Block content */}
                  <div className="ml-4 flex-1">
                    <div className={`p-3 rounded-r border-l-4 ${blockClasses} ${isActive ? 'ring-1 ring-white/10' : ''} transition-all`}>
                      <div className="flex justify-between items-start gap-2">
                        <div className="flex items-center gap-2 flex-1 min-w-0">
                          {isActive && (
                            <motion.div
                              className="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0"
                              animate={{ opacity: [1, 0.3, 1] }}
                              transition={{ duration: 1, repeat: Infinity }}
                            />
                          )}
                          <span className={`text-xs font-bold uppercase tracking-tight ${titleClasses} truncate`}>
                            {block.title}
                          </span>
                          {isAtRisk && block.type === 'work' && !isPast && (
                            <motion.div
                              className="flex items-center gap-1 bg-red-500/10 border border-red-500/30 px-1 py-0.5 rounded shrink-0"
                              animate={{ opacity: [1, 0.6, 1] }}
                              transition={{ duration: 1.5, repeat: Infinity }}
                            >
                              <AlertTriangle className="w-2.5 h-2.5 text-red-400" />
                              <span className="text-[9px] font-bold text-red-400 uppercase">AT RISK</span>
                            </motion.div>
                          )}
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <span className="text-[10px] bg-zinc-800/50 px-1.5 py-0.5 rounded font-mono text-zinc-500">
                            {format(parseISO(block.startTime), 'h:mm a')} – {format(parseISO(block.endTime), 'h:mm a')}
                          </span>
                          {block.type === 'work' && (
                            <>
                              <button
                                onClick={() => onStartFocus?.(block, task)}
                                title="Enter Focus Mode"
                                className="opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded bg-indigo-600/20 border border-indigo-500/30 hover:bg-indigo-600/40 hover:border-indigo-400/50 text-indigo-300 hover:text-indigo-200"
                              >
                                <Play className="w-3 h-3 fill-current" />
                              </button>
                              <button
                                onClick={() => downloadICS(block, task)}
                                title="Export to Google Calendar"
                                className="opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded bg-zinc-800 border border-white/10 hover:bg-zinc-700 hover:border-indigo-500/30 text-zinc-400 hover:text-indigo-300"
                              >
                                <Calendar className="w-3 h-3" />
                              </button>
                            </>
                          )}
                        </div>
                      </div>

                      {task && !isPast && (
                        <p className={`text-[10px] mt-1 line-clamp-1 font-medium ${titleClasses} opacity-70`}>
                          Focus: {task.title}
                        </p>
                      )}
                      {block.type === 'break' && (
                        <p className="text-[10px] mt-1 italic text-emerald-600/70">
                          Decompression — step away from the screen.
                        </p>
                      )}
                      {isPast && (
                        <p className="text-[10px] mt-1 italic text-zinc-600">Completed window</p>
                      )}
                    </div>
                  </div>
                </motion.div>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
    </div>
  );
}
