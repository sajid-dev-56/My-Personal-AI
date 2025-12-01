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

      // Draw subtle grid
      ctx.strokeStyle = 'rgba(14, 165, 233, 0.1)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      for(let i=0; i<width; i+=40) {
        ctx.moveTo(i, 0);
        ctx.lineTo(i, height);
      }
      for(let i=0; i<height; i+=40) {
        ctx.moveTo(0, i);
        ctx.lineTo(width, i);
      }
      ctx.stroke();

      if (isActive) {
        phaseRef.current += 0.1;
        
        // Draw JARVIS-like oscillating circle
        ctx.strokeStyle = '#22d3ee'; // cyan-400
        ctx.lineWidth = 3;
        ctx.beginPath();
        
        const baseRadius = 60;
        const numPoints = 60;
        
        for (let i = 0; i <= numPoints; i++) {
          const angle = (i / numPoints) * Math.PI * 2;
          const noise = Math.sin(angle * 5 + phaseRef.current) * Math.cos(angle * 3 - phaseRef.current * 0.5) * 15;
          const r = baseRadius + noise + Math.sin(phaseRef.current * 0.5) * 5;
          
          const x = centerX + Math.cos(angle) * r;
          const y = centerY + Math.sin(angle) * r;
          
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        
        ctx.closePath();
        ctx.stroke();
        
        // Inner Glow
        ctx.fillStyle = 'rgba(34, 211, 238, 0.1)';
        ctx.fill();

        // Outer Ring
        ctx.strokeStyle = 'rgba(14, 165, 233, 0.5)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(centerX, centerY, baseRadius + 30 + Math.sin(phaseRef.current * 0.2) * 10, 0, Math.PI * 2);
        ctx.stroke();

        // Particles
        for(let i=0; i<4; i++) {
           const angle = (Date.now() / 1000) + (i * Math.PI/2);
           const r = baseRadius + 40;
           const x = centerX + Math.cos(angle) * r;
           const y = centerY + Math.sin(angle) * r;
           
           ctx.fillStyle = '#fff';
           ctx.beginPath();
           ctx.arc(x, y, 2, 0, Math.PI*2);
           ctx.fill();
        }

      } else {
        // Idle State - Pulsing Circle
        const pulse = Math.sin(Date.now() / 1000) * 5;
        ctx.strokeStyle = 'rgba(14, 165, 233, 0.3)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(centerX, centerY, 50 + pulse, 0, Math.PI * 2);
        ctx.stroke();
        
        ctx.strokeStyle = 'rgba(14, 165, 233, 0.1)';
        ctx.beginPath();
        ctx.arc(centerX, centerY, 70 - pulse, 0, Math.PI * 2);
        ctx.stroke();
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
