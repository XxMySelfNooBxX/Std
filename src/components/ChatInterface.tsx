import { useState, useRef, useEffect } from 'react';
import { Send, Loader2, Mic, MicOff, Square } from 'lucide-react';
import { Message } from '../types';

interface ChatInterfaceProps {
  messages: Message[];
  onSendMessage: (content: string) => void;
  onInputChange?: (text: string) => void;
  isProcessing: boolean;
  processingState?: string;
  stressScore?: number; // 0–10
}

function getStressStyle(score: number): { bgGlow: string; borderColor: string; label: string; labelColor: string } {
  if (score <= 2) return { bgGlow: '', borderColor: 'border-white/10', label: 'Calm', labelColor: 'text-emerald-400' };
  if (score <= 4) return { bgGlow: 'shadow-[inset_0_0_60px_rgba(99,102,241,0.06)]', borderColor: 'border-indigo-500/20', label: 'Focused', labelColor: 'text-indigo-400' };
  if (score <= 6) return { bgGlow: 'shadow-[inset_0_0_80px_rgba(245,158,11,0.08)]', borderColor: 'border-amber-500/30', label: 'Stressed', labelColor: 'text-amber-400' };
  if (score <= 8) return { bgGlow: 'shadow-[inset_0_0_100px_rgba(239,68,68,0.10)]', borderColor: 'border-red-500/40', label: 'High Stress', labelColor: 'text-red-400' };
  return { bgGlow: 'shadow-[inset_0_0_120px_rgba(239,68,68,0.18)]', borderColor: 'border-red-500/60', label: 'PANIC MODE', labelColor: 'text-red-400 animate-pulse' };
}

export function ChatInterface({ messages, onSendMessage, onInputChange, isProcessing, processingState, stressScore = 0 }: ChatInterfaceProps) {
  const [input, setInput] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const [voiceSupported, setVoiceSupported] = useState(false);
  const [interimTranscript, setInterimTranscript] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);
  const recognitionRef = useRef<any>(null);
  const { bgGlow, borderColor, label, labelColor } = getStressStyle(stressScore);
  const isPanicking = stressScore >= 9;

  // Check for Web Speech API support
  useEffect(() => {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    setVoiceSupported(!!SR);
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isProcessing, processingState]);

  const startRecording = () => {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) return;

    const recognition = new SR();
    recognitionRef.current = recognition;
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'en-US';

    recognition.onstart = () => setIsRecording(true);

    recognition.onresult = (event: any) => {
      let finalText = '';
      let interim = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript;
        if (event.results[i].isFinal) finalText += transcript + ' ';
        else interim += transcript;
      }
      setInterimTranscript(interim);
      if (finalText) {
        setInput(prev => {
          const updated = (prev + ' ' + finalText).trim();
          onInputChange?.(updated);
          return updated;
        });
      }
    };

    recognition.onerror = (e: any) => {
      console.error('Speech recognition error:', e.error);
      setIsRecording(false);
      setInterimTranscript('');
    };

    recognition.onend = () => {
      setIsRecording(false);
      setInterimTranscript('');
    };

    recognition.start();
  };

  const stopRecording = () => {
    recognitionRef.current?.stop();
    setIsRecording(false);
    setInterimTranscript('');
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (isRecording) stopRecording();
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

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
    onInputChange?.(e.target.value);
  };

  const sendDisabled = !input.trim() || isProcessing;

  return (
    <div className={`flex flex-col h-full bg-zinc-950 transition-all duration-700 ${bgGlow}`}>
      {/* Header */}
      <div className={`p-6 border-b ${borderColor} flex flex-col pt-6 transition-all duration-700`}>
        <div className="flex items-center gap-2 mb-1">
          <div className={`w-3 h-3 rounded-full ${
            stressScore >= 9 ? 'bg-red-500 animate-ping shadow-[0_0_12px_rgba(239,68,68,0.8)]' :
            stressScore >= 6 ? 'bg-red-500 animate-pulse shadow-[0_0_8px_rgba(239,68,68,0.6)]' :
            'bg-red-500 animate-pulse shadow-[0_0_8px_rgba(239,68,68,0.4)]'
          }`} />
          <h1 className="text-lg font-bold tracking-tight text-zinc-100">Last-Minute Life Saver</h1>
        </div>
        <div className="flex items-center justify-between">
          <p className="text-xs text-zinc-400">Processing frantic inputs in real-time...</p>
          {stressScore > 0 && (
            <div className="flex items-center gap-1.5">
              <div className="flex gap-0.5">
                {Array.from({ length: 10 }).map((_, i) => (
                  <div key={i} className={`w-1.5 h-3 rounded-sm transition-all duration-300 ${
                    i < stressScore
                      ? stressScore >= 8 ? 'bg-red-500' : stressScore >= 5 ? 'bg-amber-400' : 'bg-indigo-400'
                      : 'bg-zinc-800'
                  }`} />
                ))}
              </div>
              <span className={`text-[10px] font-bold font-mono ${labelColor} transition-all duration-300`}>{label}</span>
            </div>
          )}
        </div>
      </div>

      {/* Voice Recording Banner */}
      {isRecording && (
        <div className="bg-red-950/60 border-b border-red-500/30 px-4 py-2 flex items-center gap-3">
          <div className="w-2 h-2 rounded-full bg-red-500 animate-ping" />
          <span className="text-xs text-red-300 font-medium flex-1">
            Listening... {interimTranscript && <span className="italic text-red-400">"{interimTranscript}"</span>}
          </span>
          <button onClick={stopRecording} className="flex items-center gap-1.5 text-[10px] text-red-400 hover:text-red-300 border border-red-500/30 px-2 py-1 rounded">
            <Square className="w-2.5 h-2.5 fill-current" /> Stop
          </button>
        </div>
      )}

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-4">
        {messages.map((msg) => (
          <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[85%] rounded-2xl p-3 text-sm leading-relaxed ${
              msg.role === 'user'
                ? 'bg-zinc-800 border border-white/10 text-zinc-100 rounded-tr-none'
                : 'bg-zinc-900 border border-white/10 text-zinc-300 rounded-tl-none'
            }`}>
              {msg.role === 'assistant' && msg.id !== 'sys-1' && msg.id !== 'demo-ai' && (
                <span className="font-semibold block mb-1 text-zinc-400">AI Agent</span>
              )}
              {msg.content}
            </div>
          </div>
        ))}

        {isProcessing && (
          <div className="flex justify-start">
            <div className="bg-zinc-900/50 text-zinc-400 rounded-2xl rounded-tl-none p-4 text-sm flex flex-col space-y-2 border border-white/10 min-w-[240px]">
              <div className="flex items-center gap-3">
                <Loader2 className="w-3.5 h-3.5 animate-spin text-indigo-400 shrink-0" />
                <span className="font-medium text-zinc-300">{processingState || 'Analyzing...'}</span>
              </div>
              <div className="h-1 bg-zinc-800 rounded-full overflow-hidden">
                <div className="h-full bg-indigo-500/50 rounded-full animate-pulse w-2/3" />
              </div>
            </div>
          </div>
        )}

        <div ref={bottomRef} className="h-1" />
      </div>

      {/* Input */}
      <div className={`p-4 bg-zinc-950 border-t ${borderColor} relative transition-all duration-700`}>
        <form onSubmit={handleSubmit} className="relative">
          <textarea
            value={input}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
            placeholder={
              isRecording ? 'Speak now — I\'m listening...' :
              isPanicking ? 'You\'re panicking — just type everything, I\'ll sort it out...' :
              'Type your frantic thoughts or tap the mic...'
            }
            className={`w-full h-24 p-3 pr-20 text-sm border ${borderColor} rounded-xl bg-zinc-900 resize-none focus:outline-none focus:ring-1 focus:ring-zinc-700 transition-all placeholder:text-zinc-600 text-zinc-100 ${isRecording ? 'border-red-500/40 bg-red-950/10' : ''}`}
          />

          {/* Mic Button */}
          {voiceSupported && (
            <button
              type="button"
              onClick={isRecording ? stopRecording : startRecording}
              disabled={isProcessing}
              title={isRecording ? 'Stop recording' : 'Voice input'}
              className={`absolute right-12 bottom-3 p-2 border rounded-lg text-xs font-semibold transition-all ${
                isRecording
                  ? 'bg-red-600 border-red-500/40 text-white shadow-[0_0_16px_rgba(239,68,68,0.4)] animate-pulse'
                  : 'bg-zinc-800 border-white/10 text-zinc-400 hover:bg-zinc-700 hover:text-white'
              } hover:scale-[1.02] active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed`}
            >
              {isRecording ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
            </button>
          )}

          {/* Send Button */}
          <button
            type="submit"
            disabled={sendDisabled}
            className={`absolute right-3 bottom-3 p-2 border border-white/10 text-white rounded-lg text-xs font-semibold transition-all ${
              isPanicking && !sendDisabled
                ? 'bg-red-600 hover:bg-red-500 border-red-500/40 shadow-[0_0_16px_rgba(239,68,68,0.4)] animate-pulse'
                : 'bg-zinc-800 hover:bg-zinc-700'
            } hover:scale-[1.02] active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100`}
          >
            <Send className="w-4 h-4" />
          </button>
        </form>
        <div className="mt-3 text-[10px] text-center font-medium uppercase tracking-widest text-neutral-300">
          {voiceSupported ? 'Shift + Enter for new line  ·  Mic for voice' : 'Shift + Enter for new line'}
        </div>
      </div>
    </div>
  );
}
