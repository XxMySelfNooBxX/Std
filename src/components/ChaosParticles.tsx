import { useEffect, useRef } from 'react';

export type AnimationPhase = 'chaos' | 'compression' | 'reveal' | 'done';

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  color: string;
  angle: number;
  speed: number;
}

export function ChaosParticles({ phase }: { phase: AnimationPhase }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const particlesRef = useRef<Particle[]>([]);
  const phaseRef = useRef(phase);

  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) return;

    let animationFrameId: number;
    let width = window.innerWidth;
    let height = window.innerHeight;

    const resize = () => {
      width = window.innerWidth;
      height = window.innerHeight;
      canvas.width = width * window.devicePixelRatio;
      canvas.height = height * window.devicePixelRatio;
      ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
    };
    window.addEventListener('resize', resize);
    resize();

    const colors = ['#ef4444', '#f59e0b', '#71717a', '#3f3f46'];
    const initParticles = () => {
      particlesRef.current = Array.from({ length: 400 }, () => ({
        x: Math.random() * width,
        y: Math.random() * height,
        vx: (Math.random() - 0.5) * 8,
        vy: (Math.random() - 0.5) * 8,
        size: Math.random() * 2 + 1,
        color: colors[Math.floor(Math.random() * colors.length)],
        angle: Math.random() * Math.PI * 2,
        speed: Math.random() * 4 + 2,
      }));
    };
    initParticles();

    const render = () => {
      // Clear with trail effect for chaos
      ctx.fillStyle = 'rgba(9, 9, 11, 0.3)'; // zinc-950 with opacity for trails
      ctx.fillRect(0, 0, width, height);

      const centerX = width / 2;
      const centerY = height / 2;
      const currentPhase = phaseRef.current;

      particlesRef.current.forEach(p => {
        if (currentPhase === 'chaos') {
          // Erratic jittering
          p.x += p.vx + (Math.random() - 0.5) * 4;
          p.y += p.vy + (Math.random() - 0.5) * 4;

          // Bounce off walls
          if (p.x < 0 || p.x > width) p.vx *= -1;
          if (p.y < 0 || p.y > height) p.vy *= -1;
        } else if (currentPhase === 'compression') {
          // Extreme gravitational pull to center
          const dx = centerX - p.x;
          const dy = centerY - p.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          
          if (dist > 5) {
            // Accelerate towards center
            p.vx += (dx / dist) * 2;
            p.vy += (dy / dist) * 2;
            
            // Add some spiral
            p.x += p.vx + dy * 0.05;
            p.y += p.vy - dx * 0.05;
          } else {
            // Snap to center
            p.x = centerX;
            p.y = centerY;
            p.size *= 0.8; // Shrink
          }
          
          // Shift color to purple/indigo as they compress
          p.color = '#818cf8'; // indigo-400
        }

        // Draw particle (line fragment for chaos)
        ctx.save();
        ctx.translate(p.x, p.y);
        if (currentPhase === 'chaos') {
          ctx.rotate(Math.atan2(p.vy, p.vx));
        }
        ctx.fillStyle = p.color;
        
        if (currentPhase === 'chaos') {
          // Draw as a stretched line indicating speed
          const stretch = Math.sqrt(p.vx * p.vx + p.vy * p.vy) * 2;
          ctx.fillRect(-stretch/2, -p.size/2, stretch, p.size);
        } else {
          // Draw as a dot during compression
          ctx.beginPath();
          ctx.arc(0, 0, p.size, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.restore();
      });

      if (currentPhase !== 'done' && currentPhase !== 'reveal') {
        animationFrameId = requestAnimationFrame(render);
      }
    };
    
    render();

    return () => {
      window.removeEventListener('resize', resize);
      cancelAnimationFrame(animationFrameId);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 w-full h-full z-0"
      style={{ opacity: phase === 'reveal' || phase === 'done' ? 0 : 1, transition: 'opacity 0.2s ease-out' }}
    />
  );
}
