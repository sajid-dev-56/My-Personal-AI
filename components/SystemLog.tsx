import React, { useEffect, useState, useRef } from 'react';
import { SCIFI_QUOTES } from '../constants';

const SystemLog: React.FC = () => {
  const [logs, setLogs] = useState<string[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const interval = setInterval(() => {
      const newLog = `> ${SCIFI_QUOTES[Math.floor(Math.random() * SCIFI_QUOTES.length)]} [${Math.random().toFixed(3)}]`;
      setLogs(prev => [...prev.slice(-15), newLog]);
    }, 2000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [logs]);

  return (
    <div className="h-full flex flex-col font-mono text-xs text-cyan-700/80 p-4 border-l border-cyan-900/30 bg-slate-950/50 backdrop-blur-sm">
      <div className="mb-2 text-cyan-400 font-bold border-b border-cyan-900 pb-1">SYSTEM LOGS</div>
      <div ref={scrollRef} className="flex-1 overflow-hidden flex flex-col gap-1">
        {logs.map((log, i) => (
          <div key={i} className="whitespace-nowrap">{log}</div>
        ))}
        <div className="animate-pulse text-cyan-500">_</div>
      </div>
    </div>
  );
};

export default SystemLog;
