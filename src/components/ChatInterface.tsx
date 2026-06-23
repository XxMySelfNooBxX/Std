import { useState, useRef, useEffect } from 'react';
import { Send, Loader2 } from 'lucide-react';
import { Message } from '../types';

interface ChatInterfaceProps {
  messages: Message[];
  onSendMessage: (content: string) => void;
  isProcessing: boolean;
  processingState?: string;
}

export function ChatInterface({ messages, onSendMessage, isProcessing, processingState }: ChatInterfaceProps) {
  const [input, setInput] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isProcessing, processingState]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isProcessing) return;
    onSendMessage(input.trim());
    setInput('');
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  return (
    <div className="flex flex-col h-full bg-zinc-950">
      <div className="p-6 border-b border-white/10 flex flex-col pt-6">
        <div className="flex items-center gap-2 mb-1">
          <div className="w-3 h-3 bg-red-500 rounded-full animate-pulse shadow-[0_0_8px_rgba(239,68,68,0.6)]"></div>
          <h1 className="text-lg font-bold tracking-tight text-zinc-100">Last-Minute Life Saver</h1>
        </div>
        <p className="text-xs text-zinc-400">Processing frantic inputs in real-time...</p>
      </div>

      <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-4">
        {messages.map((msg) => (
          <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div 
              className={`max-w-[85%] rounded-2xl p-3 text-sm leading-relaxed ${
                msg.role === 'user' 
                  ? 'bg-zinc-800 border border-white/10 text-zinc-100 rounded-tr-none' 
                  : 'bg-zinc-900 border border-white/10 text-zinc-300 rounded-tl-none'
              }`}
            >
              {msg.role === 'assistant' && msg.id !== 'sys-1' && (
                <span className="font-semibold block mb-1 text-zinc-400">AI Assistant</span>
              )}
              {msg.content}
            </div>
          </div>
        ))}
        {isProcessing && (
          <div className="flex justify-start">
             <div className="bg-zinc-900/50 text-zinc-400 rounded-2xl rounded-tl-none p-4 text-sm flex flex-col space-y-2 border border-white/10 min-w-[200px]">
                <div className="flex items-center gap-3">
                  <div className="flex gap-1">
                    <div className="w-1.5 h-1.5 rounded-full bg-zinc-500 animate-bounce"></div>
                    <div className="w-1.5 h-1.5 rounded-full bg-zinc-500 animate-bounce delay-75/[75ms]"></div>
                    <div className="w-1.5 h-1.5 rounded-full bg-zinc-500 animate-bounce delay-150/[150ms]"></div>
                  </div>
                  <span className="font-medium animate-pulse text-zinc-300">{processingState || 'Analyzing...'}</span>
                </div>
             </div>
          </div>
        )}
        <div ref={bottomRef} className="h-1 text-transparent font-light">_</div>
      </div>

      <div className="p-4 bg-zinc-950 border-t border-white/10 relative">
        <form onSubmit={handleSubmit} className="relative">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type your frantic thoughts..."
            className="w-full h-24 p-3 text-sm border border-white/10 rounded-xl bg-zinc-900 resize-none focus:outline-none focus:ring-1 focus:ring-zinc-700 transition-all placeholder:text-zinc-600 text-zinc-100"
          />
          <button
            type="submit"
            disabled={!input.trim() || isProcessing}
            className="absolute right-3 bottom-3 p-2 bg-zinc-800 border border-white/10 text-white rounded-lg text-xs font-semibold hover:bg-zinc-700 hover:scale-[1.02] active:scale-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100"
          >
            <Send className="w-4 h-4" />
          </button>
        </form>
        <div className="mt-3 text-[10px] text-center font-medium uppercase tracking-widest text-neutral-300">
          Shift + Enter for new line
        </div>
      </div>
    </div>
  );
}
