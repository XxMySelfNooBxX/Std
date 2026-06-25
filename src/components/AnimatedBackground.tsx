import { motion } from 'motion/react';
import { useTheme } from '../hooks/useTheme';

export function AnimatedBackground() {
  const { isDark } = useTheme();
  
  if (!isDark) {
    return (
      <div className="fixed inset-0 overflow-hidden pointer-events-none -z-20">
        <motion.div
          animate={{
            scale: [1, 1.2, 1],
            opacity: [0.3, 0.5, 0.3],
            x: [0, 100, 0],
            y: [0, -50, 0],
          }}
          transition={{ duration: 15, repeat: Infinity, ease: "easeInOut" }}
          className="absolute -top-[20%] -left-[10%] w-[50%] h-[50%] rounded-full bg-indigo-300/30 blur-[120px]"
        />
        <motion.div
          animate={{
            scale: [1, 1.5, 1],
            opacity: [0.2, 0.4, 0.2],
            x: [0, -100, 0],
            y: [0, 100, 0],
          }}
          transition={{ duration: 20, repeat: Infinity, ease: "easeInOut" }}
          className="absolute top-[40%] -right-[10%] w-[60%] h-[60%] rounded-full bg-purple-300/30 blur-[120px]"
        />
      </div>
    );
  }

  return (
    <div className="fixed inset-0 overflow-hidden pointer-events-none -z-20">
      <motion.div
        animate={{
          scale: [1, 1.2, 1],
          opacity: [0.15, 0.25, 0.15],
          x: [0, 150, 0],
          y: [0, -100, 0],
        }}
        transition={{ duration: 20, repeat: Infinity, ease: "easeInOut" }}
        className="absolute -top-[20%] -left-[10%] w-[60%] h-[60%] rounded-full bg-indigo-600/20 blur-[120px]"
      />
      <motion.div
        animate={{
          scale: [1, 1.3, 1],
          opacity: [0.1, 0.2, 0.1],
          x: [0, -150, 0],
          y: [0, 150, 0],
        }}
        transition={{ duration: 25, repeat: Infinity, ease: "easeInOut" }}
        className="absolute top-[30%] -right-[10%] w-[70%] h-[70%] rounded-full bg-purple-600/20 blur-[120px]"
      />
      <motion.div
        animate={{
          scale: [1, 1.4, 1],
          opacity: [0.05, 0.15, 0.05],
          x: [0, 100, 0],
          y: [0, -50, 0],
        }}
        transition={{ duration: 18, repeat: Infinity, ease: "easeInOut", delay: 5 }}
        className="absolute -bottom-[20%] left-[20%] w-[50%] h-[50%] rounded-full bg-emerald-600/10 blur-[100px]"
      />
    </div>
  );
}
