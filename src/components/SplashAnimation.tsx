import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Zap } from 'lucide-react';

interface SplashAnimationProps {
  onComplete: () => void;
}

export function SplashAnimation({ onComplete }: SplashAnimationProps) {
  const [phase, setPhase] = useState<'hidden' | 'logo' | 'text' | 'done'>('hidden');

  useEffect(() => {
    // 0.0s - 0.5s: Complete black screen for dramatic pause
    const t1 = setTimeout(() => {
      setPhase('logo');
    }, 500);

    // 0.5s - 2.0s: Slow, elegant logo reveal
    const t2 = setTimeout(() => {
      setPhase('text');
    }, 2000);

    // 2.0s - 4.0s: Text fade in and breathe
    const t3 = setTimeout(() => {
      setPhase('done');
      onComplete();
    }, 4500);

    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
    };
  }, [onComplete]);

  return (
    <motion.div 
      initial={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 1.2, ease: "easeInOut" }}
      className="fixed inset-0 z-50 flex items-center justify-center overflow-hidden bg-[#000000] font-sans"
    >
      {/* Subtle Ambient Background (Aurora Effect) */}
      <div className="absolute inset-0 z-0 overflow-hidden opacity-60 mix-blend-screen pointer-events-none">
        <motion.div
          animate={{
            scale: [1, 1.1, 1],
            x: ['-5%', '5%', '-5%'],
            y: ['-5%', '5%', '-5%'],
          }}
          transition={{ duration: 15, repeat: Infinity, ease: "easeInOut" }}
          className="absolute top-[-20%] left-[-10%] w-[70vw] h-[70vw] rounded-full bg-indigo-900/30 blur-[120px]"
        />
        <motion.div
          animate={{
            scale: [1, 1.2, 1],
            x: ['5%', '-5%', '5%'],
            y: ['5%', '-5%', '5%'],
          }}
          transition={{ duration: 18, repeat: Infinity, ease: "easeInOut" }}
          className="absolute bottom-[-20%] right-[-10%] w-[60vw] h-[60vw] rounded-full bg-purple-900/20 blur-[120px]"
        />
      </div>

      <div className="relative z-10 flex flex-col items-center justify-center">
        
        {/* Apple-style minimalist logo reveal */}
        <AnimatePresence>
          {(phase === 'logo' || phase === 'text' || phase === 'done') && (
            <motion.div
              initial={{ opacity: 0, scale: 0.9, filter: 'blur(20px)' }}
              animate={{ opacity: 1, scale: 1, filter: 'blur(0px)' }}
              transition={{ 
                duration: 2.0, 
                ease: [0.25, 0.1, 0.25, 1] // Apple-like smooth easing
              }}
              className="flex items-center justify-center w-24 h-24 mb-8"
            >
              <Zap className="w-12 h-12 text-zinc-100 fill-zinc-100/10" strokeWidth={1} />
            </motion.div>
          )}
        </AnimatePresence>

        {/* Apple-style typographic fade */}
        <div className="flex overflow-hidden h-16 items-center justify-center">
          <AnimatePresence>
            {(phase === 'text' || phase === 'done') && (
              <motion.h1
                initial={{ opacity: 0, y: 10, filter: 'blur(10px)', letterSpacing: '0em' }}
                animate={{ opacity: 1, y: 0, filter: 'blur(0px)', letterSpacing: '0.05em' }}
                transition={{ 
                  duration: 2.5, 
                  ease: [0.25, 0.1, 0.25, 1],
                  delay: 0.2
                }}
                className="text-2xl font-light tracking-wide text-zinc-200"
              >
                Last-Minute Life Saver
              </motion.h1>
            )}
          </AnimatePresence>
        </div>
        
        {/* Subtle Subtitle */}
        <AnimatePresence>
          {(phase === 'text' || phase === 'done') && (
            <motion.div
              initial={{ opacity: 0, y: 5 }}
              animate={{ opacity: 0.8, y: 0 }}
              transition={{ duration: 2.0, delay: 0.8 }}
              className="text-[10px] text-zinc-400 font-mono tracking-widest uppercase mt-4"
            >
              Powered by Gemini
            </motion.div>
          )}
        </AnimatePresence>

      </div>
    </motion.div>
  );
}
