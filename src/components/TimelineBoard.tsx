import { Task, ExecutionBlock } from '../types';
import { format, parseISO } from 'date-fns';
import { Calendar, Briefcase, Coffee, Zap } from 'lucide-react';

export function TimelineBoard({ schedule, tasks }: { schedule: ExecutionBlock[], tasks: Task[] }) {
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
          
          let blockClasses = "bg-zinc-800/30 border-zinc-700/50";
          let titleClasses = "text-zinc-300";
          let subtitleClasses = "text-zinc-500";

          if (block.type === 'work') {
            blockClasses = "bg-indigo-500/10 border-indigo-500/50";
            titleClasses = "text-indigo-400";
            subtitleClasses = "text-indigo-600";
            if (task?.category === 'Urgent & Critical') {
              blockClasses = "bg-red-500/10 border-red-500/50";
              titleClasses = "text-red-400";
              subtitleClasses = "text-red-600/80";
            } else if (task?.category === 'High Dependency') {
              blockClasses = "bg-amber-500/10 border-amber-500/50";
              titleClasses = "text-amber-400";
              subtitleClasses = "text-amber-600/80";
            }
          }
          
          return (
            <div key={block.id} className="relative mb-6">
              {/* Timeline dot */}
              <div className="absolute -left-[5px] top-4 w-2.5 h-2.5 rounded-full bg-zinc-700 border-2 border-zinc-900 z-10" />
              
              {/* Time Label */}
              <div className="absolute -left-[4.5rem] top-3 text-[10px] text-zinc-500 font-mono w-14 text-right pr-2">
                {format(parseISO(block.startTime), 'HH:mm')}
              </div>

              {/* Block Content */}
              <div className="ml-4 flex-1">
                <div className={`p-3 rounded-r border-l-4 ${blockClasses} transition-all`}>
                  <div className="flex justify-between items-start">
                    <span className={`text-xs font-bold uppercase tracking-tight ${titleClasses}`}>
                      {block.title}
                    </span>
                    <span className="text-[10px] bg-zinc-800/50 px-1.5 py-0.5 rounded font-mono text-zinc-500 shrink-0 ml-2">
                       {format(parseISO(block.startTime), 'h:mm a')} - {format(parseISO(block.endTime), 'h:mm a')}
                    </span>
                  </div>
                  
                  {task && (
                    <p className={`text-[10px] mt-1 line-clamp-1 font-medium ${subtitleClasses}`}>
                      Focus: {task.title}
                    </p>
                  )}
                  {block.type !== 'work' && (
                    <p className={`text-[10px] mt-1 line-clamp-1 italic ${subtitleClasses}`}>
                      Reserved for decompression.
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
