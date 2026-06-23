import { Task } from '../types';
import { AlertCircle, Clock, Search, Layers } from 'lucide-react';

export function TaskTriageMatrix({ tasks }: { tasks: Task[] }) {
  const urgent = tasks.filter(t => t.category === 'Urgent & Critical');
  const dependency = tasks.filter(t => t.category === 'High Dependency');
  const micro = tasks.filter(t => t.category === 'Micro-Tasks');

  const Section = ({ title, items, badgeBgClass, badgeText, countClass }: any) => (
    <div className={`bg-zinc-900/50 border border-white/10 p-4 rounded-xl flex flex-col h-full`}>
      <div className="flex justify-between items-center mb-3">
        <span className={`text-[10px] font-bold ${badgeBgClass} px-2 py-0.5 rounded`}>{badgeText}</span>
        <span className={`text-xs ${countClass} font-medium`}>{items.length} Items</span>
      </div>
      <div className="space-y-2 flex-1 min-h-[100px] max-h-[200px] overflow-y-auto pr-1">
        {items.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-zinc-600 italic py-4">
            <span className="text-[10px] uppercase font-bold opacity-50">Empty</span>
          </div>
        ) : (
          items.map((t: Task) => (
            <div key={t.id} className={`bg-zinc-900 p-2.5 rounded border border-white/10 text-xs flex flex-col gap-1 transition-all hover:border-zinc-700 hover:bg-zinc-800/50 cursor-default`}>
              <div className="text-zinc-200 font-medium leading-snug">{t.title}</div>
              {t.estimatedMinutes && (
                <div className="text-[10px] font-medium text-zinc-500 flex items-center">
                  <Clock className="w-3 h-3 mr-1" />
                  {t.estimatedMinutes}m
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      <Section title="Urgent & Critical" badgeText="URGENT" items={urgent} badgeBgClass="bg-red-500/10 text-red-400 border border-red-500/20" countClass="text-zinc-500" />
      <Section title="High Dependency" badgeText="DEPENDENCY" items={dependency} badgeBgClass="bg-amber-500/10 text-amber-400 border border-amber-500/20" countClass="text-zinc-500" />
      <Section title="Micro-Tasks" badgeText="MICRO" items={micro} badgeBgClass="bg-indigo-500/10 text-indigo-400 border border-indigo-500/20" countClass="text-zinc-500" />
    </div>
  );
}
