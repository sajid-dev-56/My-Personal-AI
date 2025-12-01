import React, { useEffect, useRef } from 'react';

interface VisualizerProps {
  isActive: boolean;
}

const Visualizer: React.FC<VisualizerProps> = ({ isActive }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number>(0);
  const phaseRef = useRef<number>(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const draw = () => {
      if (!canvas) return;
      const width = canvas.width;
      const height = canvas.height;
      const centerX = width / 2;
      const centerY = height / 2;

      ctx.clearRect(0, 0, width, height);

      // Draw subtle sci-fi grid background
      ctx.strokeStyle = 'rgba(14, 165, 233, 0.05)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      // Vertical lines
      for(let i = 0; i < width; i += 60) {
        ctx.moveTo(i, 0);
        ctx.lineTo(i, height);
      }
      // Horizontal lines
      for(let i = 0; i < height; i += 60) {
        ctx.moveTo(0, i);
        ctx.lineTo(width, i);
      }
      ctx.stroke();

      if (isActive) {
        phaseRef.current += 0.08;
        
        // Active State: JARVIS Energy Core
        
        // 1. Dynamic Wave Ring
        ctx.strokeStyle = '#22d3ee'; // cyan-400
        ctx.lineWidth = 3;
        ctx.beginPath();
        const baseRadius = 70;
        const numPoints = 80;
        
        for (let i = 0; i <= numPoints; i++) {
          const angle = (i / numPoints) * Math.PI * 2;
          // Create "voice" modulation effect
          const noise = Math.sin(angle * 8 + phaseRef.current * 1.5) * Math.cos(angle * 4 - phaseRef.current) * 10;
          const r = baseRadius + noise + Math.sin(phaseRef.current) * 5;
          
          const x = centerX + Math.cos(angle) * r;
          const y = centerY + Math.sin(angle) * r;
          
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.closePath();
        ctx.stroke();
        
        // 2. Inner Glow Fill
        ctx.fillStyle = 'rgba(34, 211, 238, 0.05)';
        ctx.fill();

        // 3. Orbital Data Rings
        ctx.save();
        ctx.translate(centerX, centerY);
        ctx.rotate(phaseRef.current * 0.2);
        ctx.strokeStyle = 'rgba(14, 165, 233, 0.4)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(0, 0, baseRadius + 25, 0, Math.PI * 1.5);
        ctx.stroke();
        ctx.restore();

        ctx.save();
        ctx.translate(centerX, centerY);
        ctx.rotate(-phaseRef.current * 0.3);
        ctx.strokeStyle = 'rgba(14, 165, 233, 0.3)';
        ctx.lineWidth = 1;
        ctx.setLineDash([10, 20]);
        ctx.beginPath();
        ctx.arc(0, 0, baseRadius + 45, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();

      } else {
        // Idle State: Pulsing Reactor Mode
        const pulse = Math.sin(Date.now() / 1500) * 4;
        
        // Inner Core
        ctx.strokeStyle = 'rgba(14, 165, 233, 0.4)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(centerX, centerY, 50 + pulse, 0, Math.PI * 2);
        ctx.stroke();
        
        // Outer Core
        ctx.strokeStyle = 'rgba(14, 165, 233, 0.15)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(centerX, centerY, 65 - pulse, 0, Math.PI * 2);
        ctx.stroke();

        // Central Dot
        ctx.fillStyle = '#0ea5e9';
        ctx.beginPath();
        ctx.arc(centerX, centerY, 3, 0, Math.PI * 2);
        ctx.fill();
      }

      animationRef.current = requestAnimationFrame(draw);
    };

    const resize = () => {
      if (canvas.parentElement) {
        canvas.width = canvas.parentElement.clientWidth;
        canvas.height = canvas.parentElement.clientHeight;
      }
    };

    window.addEventListener('resize', resize);
    resize();
    draw();

    return () => {
      window.removeEventListener('resize', resize);
      cancelAnimationFrame(animationRef.current);
    };
  }, [isActive]);

  return <canvas ref={canvasRef} className="w-full h-full block" />;
};

export default Visualizer;