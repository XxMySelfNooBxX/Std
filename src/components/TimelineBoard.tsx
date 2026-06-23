import { Task, ExecutionBlock } from '../types';
import { format, parseISO } from 'date-fns';
import { Calendar, AlertTriangle } from 'lucide-react';

// Generates an .ics file string for a single block
function generateICS(block: ExecutionBlock, task?: Task): string {
  const fmt = (iso: string) => iso.replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const uid = `${block.id}@lastminutelifesaver`;
  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//LastMinuteLifeSaver//EN',
    'BEGIN:VEVENT',
    `UID:${uid}`,
    `DTSTART:${fmt(block.startTime)}`,
    `DTEND:${fmt(block.endTime)}`,
    `SUMMARY:${block.title}`,
    task ? `DESCRIPTION:Focus: ${task.title}` : 'DESCRIPTION:Scheduled by Last-Minute Life Saver',
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n');
}

function downloadICS(block: ExecutionBlock, task?: Task) {
  const ics = generateICS(block, task);
  const blob = new Blob([ics], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${block.title.replace(/\s+/g, '_')}.ics`;
  a.click();
  URL.revokeObjectURL(url);
}

export function TimelineBoard({ schedule, tasks }: { schedule: ExecutionBlock[]; tasks: Task[] }) {
  if (schedule.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-[250px] md:h-full text-zinc-600 bg-zinc-900/50 rounded-2xl border border-dashed border-white/10">
        <Calendar className="w-10 h-10 mb-4 opacity-20" />
        <p className="text-sm font-medium tracking-tight">Timeline Awaiting Generation...</p>
      </div>
    );
  }

  return (
    <div className="bg-zinc-900/50 border border-white/10 rounded-2xl p-6 relative h-[350px] md:h-full overflow-y-auto">
      <div className="ml-16 border-l border-white/10 relative min-h-full py-2">
        {schedule.map((block) => {
          const task = tasks.find(t => t.id === block.taskId);
          const isAtRisk = task?.atRisk;

          let blockClasses = 'bg-zinc-800/30 border-zinc-700/50';
          let titleClasses = 'text-zinc-300';
          let dotClass = 'bg-zinc-700';

          if (block.type === 'work') {
            if (task?.category === 'Urgent & Critical') {
              blockClasses = isAtRisk
                ? 'bg-red-500/15 border-red-500/60 shadow-[0_0_12px_rgba(239,68,68,0.15)]'
                : 'bg-red-500/10 border-red-500/50';
              titleClasses = 'text-red-400';
              dotClass = isAtRisk ? 'bg-red-500 animate-pulse' : 'bg-red-600';
            } else if (task?.category === 'High Dependency') {
              blockClasses = 'bg-amber-500/10 border-amber-500/50';
              titleClasses = 'text-amber-400';
              dotClass = 'bg-amber-500';
            } else {
              blockClasses = 'bg-indigo-500/10 border-indigo-500/50';
              titleClasses = 'text-indigo-400';
              dotClass = 'bg-indigo-500';
            }
          } else if (block.type === 'break') {
            blockClasses = 'bg-emerald-500/5 border-emerald-500/20';
            titleClasses = 'text-emerald-500';
            dotClass = 'bg-emerald-600';
          }

          return (
            <div key={block.id} className="relative mb-6 group">
              {/* Timeline dot */}
              <div className={`absolute -left-[5px] top-4 w-2.5 h-2.5 rounded-full ${dotClass} border-2 border-zinc-900 z-10`} />

              {/* Time label */}
              <div className="absolute -left-[4.5rem] top-3 text-[10px] text-zinc-500 font-mono w-14 text-right pr-2">
                {format(parseISO(block.startTime), 'HH:mm')}
              </div>

              {/* Block content */}
              <div className="ml-4 flex-1">
                <div className={`p-3 rounded-r border-l-4 ${blockClasses} transition-all`}>
                  <div className="flex justify-between items-start gap-2">
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                      <span className={`text-xs font-bold uppercase tracking-tight ${titleClasses} truncate`}>
                        {block.title}
                      </span>
                      {isAtRisk && block.type === 'work' && (
                        <div className="flex items-center gap-1 bg-red-500/10 border border-red-500/30 px-1 py-0.5 rounded shrink-0">
                          <AlertTriangle className="w-2.5 h-2.5 text-red-400 animate-pulse" />
                          <span className="text-[9px] font-bold text-red-400 uppercase">AT RISK</span>
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-[10px] bg-zinc-800/50 px-1.5 py-0.5 rounded font-mono text-zinc-500">
                        {format(parseISO(block.startTime), 'h:mm a')} – {format(parseISO(block.endTime), 'h:mm a')}
                      </span>
                      {block.type === 'work' && (
                        <button
                          onClick={() => downloadICS(block, task)}
                          title="Export to Google Calendar"
                          className="opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded bg-zinc-800 border border-white/10 hover:bg-zinc-700 hover:border-indigo-500/30 text-zinc-400 hover:text-indigo-300"
                        >
                          <Calendar className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                  </div>

                  {task && (
                    <p className={`text-[10px] mt-1 line-clamp-1 font-medium ${titleClasses} opacity-70`}>
                      Focus: {task.title}
                    </p>
                  )}
                  {block.type === 'break' && (
                    <p className="text-[10px] mt-1 italic text-emerald-600/70">
                      Decompression — step away from the screen.
                    </p>
                  )}
                  {block.type === 'buffer' && (
                    <p className="text-[10px] mt-1 italic text-zinc-500">
                      Buffer time — review progress.
                    </p>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
