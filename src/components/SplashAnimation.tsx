import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Zap } from 'lucide-react';
import { ChaosParticles, AnimationPhase } from './ChaosParticles';

interface SplashAnimationProps {
  onComplete: () => void;
}

export function SplashAnimation({ onComplete }: SplashAnimationProps) {
  const [phase, setPhase] = useState<AnimationPhase>('chaos');

  useEffect(() => {
    // 0.0s - 0.5s: Chaos
    const t1 = setTimeout(() => {
      setPhase('compression');
    }, 500);

    // 0.5s - 1.2s: Compression Snap
    const t2 = setTimeout(() => {
      setPhase('reveal');
    }, 1200);

    // 1.2s - 2.0s: Reveal Brand
    const t3 = setTimeout(() => {
      setPhase('done');
      onComplete();
    }, 2200);

    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
    };
  }, [onComplete]);

  const title = "Last-Minute Life Saver";
  const letters = title.split('');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-hidden bg-zinc-950 font-sans">
      {/* Background Particles Layer */}
      <ChaosParticles phase={phase} />

      {/* Foreground Brand Reveal */}
      <div className="relative z-10 flex flex-col items-center">
        {/* Bolt Icon Container (Acts as the gravity well and mask) */}
        <motion.div
          initial={{ scale: 0, opacity: 0, rotate: -45 }}
          animate={
            phase === 'chaos' ? { scale: 0, opacity: 0 } :
            phase === 'compression' ? { scale: [0, 1.5, 1], opacity: 1, rotate: [45, 0] } :
            { scale: 1, opacity: 1, rotate: 0 }
          }
          transition={{
            type: "spring",
            stiffness: 200,
            damping: 15,
            mass: 0.5
          }}
          className="relative flex items-center justify-center w-24 h-24 mb-6 rounded-3xl bg-indigo-500/20 shadow-[0_0_80px_rgba(99,102,241,0.5)] border border-indigo-400/30 overflow-hidden"
        >
          {/* Intense glow burst behind the bolt */}
          <motion.div
            animate={
              phase === 'compression' ? { opacity: [0, 1, 0], scale: [0.5, 2] } : { opacity: 0 }
            }
            transition={{ duration: 0.6, ease: "easeOut" }}
            className="absolute inset-0 bg-white/40 blur-md rounded-full"
          />
          <motion.div
            animate={
              phase === 'compression' ? { scale: [0.8, 1.2, 1], filter: ['brightness(1)', 'brightness(2)', 'brightness(1)'] } : {}
            }
            transition={{ duration: 0.5 }}
          >
            <Zap className="w-12 h-12 text-indigo-400 fill-indigo-400/50" />
          </motion.div>
        </motion.div>

        {/* Split Text Reveal */}
        <div className="flex overflow-hidden h-12 items-center justify-center">
          <AnimatePresence>
            {(phase === 'reveal' || phase === 'done') && letters.map((letter, i) => (
              <motion.span
                key={i}
                initial={{ y: 50, opacity: 0, filter: 'blur(4px)' }}
                animate={{ y: 0, opacity: 1, filter: 'blur(0px)' }}
                transition={{
                  duration: 0.4,
                  delay: i * 0.03, // Staggered reveal
                  ease: [0.25, 1, 0.5, 1] // Custom cubic-bezier out
                }}
                className={`text-3xl font-bold tracking-tight text-zinc-100 ${letter === ' ' ? 'w-2' : ''}`}
              >
                {letter}
              </motion.span>
            ))}
          </AnimatePresence>
        </div>
        
        {/* Subtitle pulse */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={phase === 'reveal' ? { opacity: 1, y: 0 } : { opacity: 0 }}
          transition={{ duration: 0.6, delay: 0.6 }}
          className="text-[10px] text-indigo-400 font-mono tracking-widest uppercase mt-4"
        >
          Powered by Gemini
        </motion.div>
      </div>
      
      {/* Chromatic aberration overlay on snap */}
      <motion.div
        className="absolute inset-0 pointer-events-none mix-blend-screen"
        initial={{ opacity: 0 }}
        animate={
          phase === 'compression' ? { 
            opacity: [0, 0.15, 0], 
            boxShadow: [
              'inset 0 0 0px rgba(255,0,0,0)',
              'inset 20px 0 100px rgba(255,0,0,0.5), inset -20px 0 100px rgba(0,255,255,0.5)',
              'inset 0 0 0px rgba(255,0,0,0)'
            ] 
          } : { opacity: 0 }
        }
        transition={{ duration: 0.5, ease: "easeOut" }}
      />
    </div>
  );
}
