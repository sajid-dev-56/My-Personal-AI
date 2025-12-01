import React, { useEffect, useRef } from 'react';
import { Emotion } from '../types';
import { EMOTION_COLORS } from '../constants';

interface VisualizerProps {
  isActive: boolean;
  analyser: AnalyserNode | null;
  emotion: Emotion;
}

const Visualizer: React.FC<VisualizerProps> = ({ isActive, analyser, emotion }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number>(0);
  const phaseRef = useRef<number>(0);
  // Store previous data to smooth transitions
  const dataArrayRef = useRef<Uint8Array | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    if (analyser && !dataArrayRef.current) {
      dataArrayRef.current = new Uint8Array(analyser.frequencyBinCount);
    }

    const draw = () => {
      if (!canvas) return;
      const width = canvas.width;
      const height = canvas.height;
      const centerX = width / 2;
      const centerY = height / 2;
      
      // Determine Target Color based on Emotion
      const targetColor = EMOTION_COLORS[emotion] || EMOTION_COLORS.neutral;

      ctx.clearRect(0, 0, width, height);

      // Draw subtle sci-fi grid background
      ctx.strokeStyle = `${targetColor}10`; // Very transparent
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

      phaseRef.current += 0.05;

      // GET AUDIO DATA IF ACTIVE
      let frequencyData: Uint8Array | null = null;
      let averageVolume = 0;

      if (isActive && analyser && dataArrayRef.current) {
        analyser.getByteFrequencyData(dataArrayRef.current);
        frequencyData = dataArrayRef.current;
        
        // Calculate average volume for pulse intensity
        let sum = 0;
        // Focus on lower-mid frequencies for voice (indices 0-100 roughly for 256 fftSize)
        const relevantBins = Math.min(frequencyData.length, 100);
        for(let i=0; i<relevantBins; i++) {
            sum += frequencyData[i];
        }
        averageVolume = sum / relevantBins; 
      } else {
        // Idle breathing
        averageVolume = 20 + Math.sin(phaseRef.current) * 10;
      }

      const normalizedVol = averageVolume / 255;
      const coreRadius = 60 + (normalizedVol * 40);

      // --- LAYER 1: OUTER RINGS (Rotators) ---
      ctx.save();
      ctx.translate(centerX, centerY);
      
      // Ring 1
      ctx.rotate(phaseRef.current * 0.1);
      ctx.strokeStyle = `${targetColor}40`; // 40 hex = ~25% opacity
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(0, 0, coreRadius + 40, 0, Math.PI * 1.5);
      ctx.stroke();

      // Ring 2 (Counter rotate)
      ctx.rotate(-phaseRef.current * 0.25);
      ctx.strokeStyle = `${targetColor}30`;
      ctx.setLineDash([5, 15]);
      ctx.beginPath();
      ctx.arc(0, 0, coreRadius + 60, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
      
      ctx.restore();


      // --- LAYER 2: AUDIO WAVEFORM (The Arc Reactor) ---
      ctx.strokeStyle = targetColor;
      ctx.lineWidth = 3 + (normalizedVol * 3);
      ctx.shadowBlur = 10 + (normalizedVol * 20);
      ctx.shadowColor = targetColor;
      
      ctx.beginPath();
      const numPoints = 120; // Resolution of the circle
      const angleStep = (Math.PI * 2) / numPoints;

      for (let i = 0; i <= numPoints; i++) {
        const angle = i * angleStep;
        
        // Calculate dynamic radius offset based on frequency data
        let offset = 0;
        if (frequencyData) {
            // Map the circle angle to frequency bins (mirrored for symmetry)
            // 0 -> PI uses bins 0 -> length/2
            // PI -> 2PI uses bins length/2 -> 0
            
            let dataIndex = Math.floor((i / numPoints) * (frequencyData.length / 2));
            if (i > numPoints / 2) {
               dataIndex = Math.floor(((numPoints - i) / numPoints) * (frequencyData.length / 2));
            }
            
            // Safety check
            dataIndex = Math.max(0, Math.min(dataIndex, frequencyData.length - 1));
            
            const value = frequencyData[dataIndex];
            offset = (value / 255) * 60; // Max offset 60px
        } else {
            // Idle noise
             offset = Math.sin(angle * 6 + phaseRef.current) * 5;
        }

        const r = coreRadius + offset;
        const x = centerX + Math.cos(angle) * r;
        const y = centerY + Math.sin(angle) * r;

        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.closePath();
      ctx.stroke();
      ctx.shadowBlur = 0; // Reset shadow

      // --- LAYER 3: INNER CORE GLOW ---
      ctx.fillStyle = `${targetColor}10`; // Very faint fill
      ctx.beginPath();
      ctx.arc(centerX, centerY, coreRadius * 0.8, 0, Math.PI * 2);
      ctx.fill();

      // Central Heart
      ctx.fillStyle = targetColor;
      ctx.beginPath();
      ctx.arc(centerX, centerY, 5 + (normalizedVol * 5), 0, Math.PI * 2);
      ctx.fill();

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
  }, [isActive, emotion, analyser]);

  return <canvas ref={canvasRef} className="w-full h-full block" />;
};

export default Visualizer;