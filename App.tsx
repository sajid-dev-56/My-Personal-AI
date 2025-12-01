import React, { useState, useEffect, useRef } from 'react';
import { GoogleGenAI, LiveServerMessage, Modality } from '@google/genai';
import { Mic, Send, Terminal, Cpu, Wifi, Activity, Power, Shield, Video, PhoneOff, Scan, Target, Volume2, VolumeX, AlertCircle } from 'lucide-react';
import { JARVIS_SYSTEM_INSTRUCTION } from './constants';
import { Message, SystemState, Emotion } from './types';
import Visualizer from './components/Visualizer';
import SystemLog from './components/SystemLog';
import { createPcmBlob, decodeAudioData, base64ToUint8Array } from './services/audioUtils';

// --- MAIN APP COMPONENT ---

const App: React.FC = () => {
  // State
  const [messages, setMessages] = useState<Message[]>([
    { role: 'model', content: "J.A.R.V.I.S. Online. Systems nominal. Ready for input, Sir.", timestamp: new Date() }
  ]);
  const [inputText, setInputText] = useState('');
  const [systemState, setSystemState] = useState<SystemState>(SystemState.IDLE);
  const [currentEmotion, setCurrentEmotion] = useState<Emotion>('neutral');
  const [isLiveMode, setIsLiveMode] = useState(false);
  const [isVideoMode, setIsVideoMode] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [isMuted, setIsMuted] = useState(false);

  // Refs for Chat
  const chatEndRef = useRef<HTMLDivElement>(null);
  
  // Refs for Live API & Media
  const liveSessionRef = useRef<Promise<any> | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const outputContextRef = useRef<AudioContext | null>(null);
  const inputSourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null); // Visualizer Analyser
  const nextStartTimeRef = useRef<number>(0);
  const streamRef = useRef<MediaStream | null>(null);
  
  // Video Refs
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const videoIntervalRef = useRef<number | null>(null);

  // Scroll to bottom of chat
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, systemState]);

  // --- EMOTION DETECTION ---
  // Simple heuristic to set visualizer color based on text content
  const detectEmotion = (text: string) => {
    const lower = text.toLowerCase();
    if (lower.includes('access denied') || lower.includes('alert') || lower.includes('threat') || lower.includes('error') || lower.includes('warning')) {
        setCurrentEmotion('alert');
    } else if (lower.includes('success') || lower.includes('complete') || lower.includes('nominal') || lower.includes('online')) {
        setCurrentEmotion('success');
    } else if (lower.includes('calculating') || lower.includes('analyzing') || lower.includes('processing') || lower.includes('scanning')) {
        setCurrentEmotion('thinking');
    } else if (lower.includes('unsure') || lower.includes('unknown') || lower.includes('searching')) {
        setCurrentEmotion('uncertain');
    } else {
        setCurrentEmotion('neutral');
    }

    // Reset to neutral after a few seconds if it was an event
    if (['alert', 'success'].includes(currentEmotion)) {
        setTimeout(() => setCurrentEmotion('neutral'), 3000);
    }
  };

  // --- TEXT CHAT HANDLER ---
  const handleSendMessage = async () => {
    if (!inputText.trim()) return;

    const userMsg: Message = { role: 'user', content: inputText, timestamp: new Date() };
    setMessages(prev => [...prev, userMsg]);
    setInputText('');
    setSystemState(SystemState.PROCESSING);
    setCurrentEmotion('thinking');

    try {
      // Re-init client for text requests to ensure freshness
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: [
            ...messages.map(m => ({ 
                role: m.role === 'model' ? 'model' : 'user', 
                parts: [{ text: m.content }] 
            })),
            { role: 'user', parts: [{ text: inputText }] }
        ],
        config: {
          systemInstruction: JARVIS_SYSTEM_INSTRUCTION,
        }
      });

      const text = response.text || "System error. Rerouting...";
      detectEmotion(text);
      
      const modelMsg: Message = { role: 'model', content: text, timestamp: new Date() };
      setMessages(prev => [...prev, modelMsg]);
    } catch (error) {
      console.error(error);
      setMessages(prev => [...prev, { role: 'model', content: "Connection interrupted. Please retry.", timestamp: new Date() }]);
      setCurrentEmotion('alert');
    } finally {
      setSystemState(SystemState.IDLE);
    }
  };

  // --- HELPERS FOR VIDEO ---
  const captureAndSendFrame = (session: any) => {
    if (!videoRef.current || !canvasRef.current) return;
    
    const canvas = canvasRef.current;
    const video = videoRef.current;
    const ctx = canvas.getContext('2d');
    
    if (ctx && video.videoWidth > 0 && video.videoHeight > 0) {
        // Downscale for performance/bandwidth (approx 320x240 usually sufficient for object detection)
        canvas.width = video.videoWidth / 3; 
        canvas.height = video.videoHeight / 3;
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        
        const base64 = canvas.toDataURL('image/jpeg', 0.6).split(',')[1];
        
        try {
            session.sendRealtimeInput({
                media: {
                    mimeType: 'image/jpeg',
                    data: base64
                }
            });
        } catch (e) {
            console.error("Frame send error", e);
        }
    }
  };

  // --- LIVE MODE HANDLERS ---
  const startLiveSession = async (enableVideo: boolean) => {
    try {
      // Clean up any existing session first
      await stopLiveSession();
      
      setSystemState(SystemState.INITIALIZING);
      setIsVideoMode(enableVideo);
      
      // 1. Setup Audio Contexts
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      const inputCtx = new AudioContextClass({ sampleRate: 16000 });
      const outputCtx = new AudioContextClass({ sampleRate: 24000 });
      
      // 2. Setup Analyser Node for Visualizer
      const analyser = outputCtx.createAnalyser();
      analyser.fftSize = 256;
      analyserRef.current = analyser;
      
      audioContextRef.current = inputCtx;
      outputContextRef.current = outputCtx;

      // 3. Get Media Stream
      const stream = await navigator.mediaDevices.getUserMedia({ 
          audio: true,
          video: enableVideo ? { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'environment' } : false
      });
      streamRef.current = stream;

      // 4. Setup Video Element if enabled
      if (enableVideo && videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play().catch(e => console.error("Video play failed", e));
      }

      // 5. Connect to Gemini Live
      // IMPORTANT: Create new instance here to avoid stale state/Network Errors
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      
      const sessionPromise = ai.live.connect({
        model: 'gemini-2.5-flash-native-audio-preview-09-2025',
        callbacks: {
          onopen: () => {
            console.log('JARVIS Live Uplink Established');
            setSystemState(SystemState.LISTENING);
            setCurrentEmotion('neutral');
            
            // Start processing audio from mic
            const source = inputCtx.createMediaStreamSource(stream);
            const processor = inputCtx.createScriptProcessor(4096, 1, 1);
            
            processor.onaudioprocess = (e) => {
              const inputData = e.inputBuffer.getChannelData(0);
              const pcmBlob = createPcmBlob(inputData);
              
              sessionPromise.then(session => {
                session.sendRealtimeInput({ media: pcmBlob });
              });
            };

            source.connect(processor);
            processor.connect(inputCtx.destination);
            
            inputSourceRef.current = source;
            processorRef.current = processor;

            // Start Video Loop if enabled
            if (enableVideo) {
                // 5 FPS (200ms) is safer for network stability than 10 FPS
                videoIntervalRef.current = window.setInterval(() => {
                    sessionPromise.then(session => captureAndSendFrame(session));
                }, 200); 
            }
          },
          onmessage: async (msg: LiveServerMessage) => {
             // Handle Text for Emotion Detection
             // Note: Live API mostly sends audio, but sometimes sends text parts or tool calls
             // We can primarily infer emotion from the fact that it is speaking
             
             // Handle Audio Output
             const base64Audio = msg.serverContent?.modelTurn?.parts?.[0]?.inlineData?.data;
             if (base64Audio && outputCtx) {
                setSystemState(SystemState.SPEAKING);
                
                // Decode and play
                const audioData = base64ToUint8Array(base64Audio);
                const audioBuffer = await decodeAudioData(audioData, outputCtx, 24000, 1);
                
                const source = outputCtx.createBufferSource();
                source.buffer = audioBuffer;
                
                // CONNECT TO ANALYSER FOR VISUALIZER
                if (analyserRef.current) {
                    source.connect(analyserRef.current);
                    analyserRef.current.connect(outputCtx.destination);
                } else {
                    source.connect(outputCtx.destination);
                }
                
                const currentTime = outputCtx.currentTime;
                if (nextStartTimeRef.current < currentTime) {
                    nextStartTimeRef.current = currentTime;
                }
                
                source.start(nextStartTimeRef.current);
                nextStartTimeRef.current += audioBuffer.duration;
                
                source.onended = () => {
                    // Slight delay to prevent flickering state
                    setTimeout(() => {
                         if (outputCtx.currentTime >= nextStartTimeRef.current) {
                            setSystemState(SystemState.LISTENING);
                         }
                    }, 100);
                };
             }
             if (msg.serverContent?.turnComplete) {
                 setSystemState(SystemState.LISTENING);
             }
          },
          onclose: () => {
            console.log('JARVIS Uplink Severed');
            setSystemState(SystemState.IDLE);
            stopLiveSession();
          },
          onerror: (err) => {
            console.error('JARVIS System Error', err);
            setSystemState(SystemState.IDLE);
            setCurrentEmotion('alert');
          }
        },
        config: {
          systemInstruction: JARVIS_SYSTEM_INSTRUCTION,
          responseModalities: [Modality.AUDIO], 
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Kore' } }
          }
        }
      });

      liveSessionRef.current = sessionPromise;
      setIsLiveMode(true);

    } catch (e) {
      console.error("Initialization Failed", e);
      setSystemState(SystemState.IDLE);
      setCurrentEmotion('alert');
      alert("Error: Unable to establish uplink. Check network and permissions.");
      stopLiveSession();
    }
  };

  const stopLiveSession = async () => {
    // Clear video interval
    if (videoIntervalRef.current) {
        clearInterval(videoIntervalRef.current);
        videoIntervalRef.current = null;
    }

    // Clean up media tracks
    if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
        streamRef.current = null;
    }
    
    // Cleanup Audio Nodes
    if (processorRef.current) {
        processorRef.current.disconnect();
        processorRef.current = null;
    }
    if (inputSourceRef.current) {
        inputSourceRef.current.disconnect();
        inputSourceRef.current = null;
    }
    if (audioContextRef.current) {
        if (audioContextRef.current.state !== 'closed') {
           await audioContextRef.current.close();
        }
        audioContextRef.current = null;
    }
    if (outputContextRef.current) {
        if (outputContextRef.current.state !== 'closed') {
           await outputContextRef.current.close();
        }
        outputContextRef.current = null;
    }
    
    analyserRef.current = null;

    setIsLiveMode(false);
    setIsVideoMode(false);
    setIsScanning(false);
    setSystemState(SystemState.IDLE);
    setCurrentEmotion('neutral');
    liveSessionRef.current = null;
  };

  const toggleScan = () => {
      setIsScanning(!isScanning);
      // Logic handled in Visualizer/Overlay, purely visual for now unless we send a text trigger
  };

  const toggleMute = () => {
      if (streamRef.current) {
          const audioTracks = streamRef.current.getAudioTracks();
          audioTracks.forEach(track => {
              track.enabled = !isMuted; // Toggle based on previous state (inverted logic here is handled by state update)
          });
          setIsMuted(!isMuted);
      }
  };


  return (
    <div className="h-screen bg-slate-950 text-cyan-500 font-sans selection:bg-cyan-500/30 selection:text-cyan-200 overflow-hidden flex flex-col relative">
      
      {/* --- HUD HEADER --- */}
      <header className={`h-16 shrink-0 border-b border-cyan-900/50 bg-slate-950/80 backdrop-blur-md flex items-center justify-between px-6 z-20 shadow-[0_0_20px_rgba(8,145,178,0.2)] transition-colors duration-500 ${currentEmotion === 'alert' ? 'border-red-900/50 shadow-red-900/20' : ''}`}>
        <div className="flex items-center gap-3">
          <div className={`w-10 h-10 rounded-full border-2 flex items-center justify-center relative transition-colors duration-500 ${currentEmotion === 'alert' ? 'border-red-500' : 'border-cyan-400'}`}>
             <div className={`absolute w-full h-full rounded-full border animate-ping opacity-20 ${currentEmotion === 'alert' ? 'border-red-500' : 'border-cyan-400'}`}></div>
             <Cpu size={20} className={`transition-colors duration-500 ${currentEmotion === 'alert' ? 'text-red-400' : 'text-cyan-400'}`} />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-widest text-cyan-100 font-mono">J.A.R.V.I.S.</h1>
            <p className="text-[10px] text-cyan-600 font-mono tracking-widest">JUST A RATHER VERY INTELLIGENT SYSTEM</p>
          </div>
        </div>

        <div className="flex items-center gap-6">
           <div className="hidden md:flex gap-4 text-xs font-mono text-cyan-600">
              <div className="flex items-center gap-1">
                 <Wifi size={14} className={isLiveMode ? "text-cyan-400 animate-pulse" : ""} />
                 <span>{isLiveMode ? "UPLINK: SECURE" : "UPLINK: STANDBY"}</span>
              </div>
              <div className="flex items-center gap-1">
                 <Activity size={14} className={currentEmotion === 'alert' ? 'text-red-500 animate-pulse' : ''} />
                 <span>STATUS: {currentEmotion.toUpperCase()}</span>
              </div>
              <div className="flex items-center gap-1">
                 <Shield size={14} />
                 <span>PROTOCOL: 7</span>
              </div>
           </div>

           <div className="flex gap-2">
             {!isLiveMode ? (
               <>
                 <button 
                   onClick={() => startLiveSession(false)}
                   className="flex items-center gap-2 px-4 py-2 rounded border border-cyan-500 text-cyan-400 hover:bg-cyan-500/20 shadow-[0_0_10px_rgba(6,182,212,0.4)] font-mono text-sm transition-all"
                 >
                   <Mic size={16} /> VOICE
                 </button>
                 <button 
                   onClick={() => startLiveSession(true)}
                   className="flex items-center gap-2 px-4 py-2 rounded border border-cyan-500 text-cyan-400 hover:bg-cyan-500/20 shadow-[0_0_10px_rgba(6,182,212,0.4)] font-mono text-sm transition-all"
                 >
                   <Video size={16} /> VIDEO
                 </button>
               </>
             ) : (
                <button 
                   onClick={() => stopLiveSession()}
                   className="flex items-center gap-2 px-4 py-2 rounded border border-red-500 text-red-400 hover:bg-red-500/20 shadow-[0_0_10px_rgba(239,68,68,0.4)] font-mono text-sm transition-all animate-pulse"
                 >
                   <Power size={16} /> TERMINATE
                 </button>
             )}
           </div>
        </div>
      </header>

      {/* --- MAIN CONTENT AREA --- */}
      <main className="flex-1 flex overflow-hidden relative z-10">
        
        {/* Left Panel: Chat / Visualizer / Video */}
        <div className="flex-1 flex flex-col relative overflow-hidden">
            
            {/* Visualizer & Video Layer */}
            <div className={`absolute inset-0 z-0 flex items-center justify-center transition-all duration-1000 ${isLiveMode ? 'opacity-100' : 'opacity-10'}`}>
                 {isVideoMode ? (
                    <div className="relative w-full h-full flex items-center justify-center p-4">
                       {/* Video HUD Container */}
                       <div className={`relative border-2 ${isScanning || currentEmotion === 'alert' ? 'border-red-400 shadow-[0_0_50px_rgba(248,113,113,0.4)]' : 'border-cyan-500/50 shadow-[0_0_50px_rgba(6,182,212,0.3)]'} rounded-lg overflow-hidden bg-black/50 backdrop-blur-sm max-w-5xl w-full aspect-video transition-all duration-500`}>
                          <video 
                             ref={videoRef} 
                             className="w-full h-full object-cover transform scale-x-[-1]" 
                             autoPlay 
                             playsInline 
                             muted 
                          />
                          <canvas ref={canvasRef} className="hidden" />
                          
                          {/* HUD Overlays */}
                          <div className="absolute top-4 left-4 flex items-center gap-2 text-cyan-400 font-mono text-xs bg-black/40 p-1 px-3 border border-cyan-500/30 rounded">
                             <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse"></div>
                             REC ● LIVE FEED
                          </div>
                          
                          <div className="absolute bottom-4 left-4 text-cyan-400 font-mono text-xs space-y-1">
                             <div>FPS: {isScanning ? "PROCESSING..." : "30"}</div>
                             <div>ISO: AUTO</div>
                             <div>ZOOM: 1.0x</div>
                          </div>

                          <div className="absolute bottom-4 right-4 text-cyan-400 font-mono text-xs text-right">
                             {isScanning ? (
                                <div className="text-red-400 animate-pulse">
                                  ANALYZING OBJECT PROTOCOL...<br/>
                                  IDENTIFYING MODEL...
                                </div>
                             ) : (
                                <div>
                                  TARGET: SCANNING...<br/>
                                  BIO-METRICS: STABLE
                                </div>
                             )}
                          </div>

                          {/* Center Reticle / Scanning Overlay */}
                          {isScanning && (
                              <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-64 h-64 border border-red-400/50 rounded-lg flex items-center justify-center pointer-events-none">
                                  <div className="absolute w-full h-0.5 bg-red-400/50 animate-scanline"></div>
                                  <div className="w-56 h-56 border-2 border-dashed border-red-500/30 rounded-lg animate-spin-slow"></div>
                                  <Target className="text-red-400 w-8 h-8 opacity-80" />
                              </div>
                          )}

                          {/* Corner Markers */}
                          <div className={`absolute top-0 left-0 w-12 h-12 border-t-2 border-l-2 ${isScanning ? 'border-red-500' : 'border-cyan-400'} transition-colors`}></div>
                          <div className={`absolute top-0 right-0 w-12 h-12 border-t-2 border-r-2 ${isScanning ? 'border-red-500' : 'border-cyan-400'} transition-colors`}></div>
                          <div className={`absolute bottom-0 left-0 w-12 h-12 border-b-2 border-l-2 ${isScanning ? 'border-red-500' : 'border-cyan-400'} transition-colors`}></div>
                          <div className={`absolute bottom-0 right-0 w-12 h-12 border-b-2 border-r-2 ${isScanning ? 'border-red-500' : 'border-cyan-400'} transition-colors`}></div>
                       </div>
                    </div>
                 ) : (
                    <Visualizer 
                        isActive={isLiveMode && (systemState === SystemState.SPEAKING || systemState === SystemState.LISTENING)} 
                        analyser={analyserRef.current}
                        emotion={currentEmotion}
                    />
                 )}
            </div>

            {/* Chat Messages Area */}
            <div className={`flex-1 overflow-y-auto p-6 space-y-6 z-10 transition-all duration-500 ${isLiveMode && isVideoMode ? 'hidden' : isLiveMode ? 'blur-sm opacity-50' : 'opacity-100'}`}>
                {messages.map((msg, idx) => (
                  <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-[80%] md:max-w-[60%] p-4 rounded-sm border backdrop-blur-md transition-all duration-300
                      ${msg.role === 'user' 
                        ? 'bg-cyan-900/20 border-cyan-800 text-cyan-100 rounded-br-none ml-12' 
                        : 'bg-slate-900/60 border-cyan-500/40 text-cyan-300 rounded-bl-none mr-12'
                      }
                      ${currentEmotion === 'alert' && msg.role === 'model' ? 'border-red-500/50 text-red-100' : ''}
                    `}>
                        <div className="flex items-center gap-2 mb-2 border-b border-cyan-500/20 pb-1">
                            <span className="text-[10px] font-mono opacity-60 uppercase tracking-widest">
                                {msg.role === 'user' ? 'COMMANDER' : 'JARVIS'}
                            </span>
                            <span className="text-[10px] font-mono opacity-40">
                                {msg.timestamp.toLocaleTimeString([], {hour12: false})}
                            </span>
                        </div>
                        <div className="text-sm md:text-base leading-relaxed whitespace-pre-wrap font-sans">
                            {msg.content}
                        </div>
                    </div>
                  </div>
                ))}
                
                {systemState === SystemState.PROCESSING && !isLiveMode && (
                   <div className="flex justify-start">
                     <div className="bg-slate-900/60 border border-cyan-500/40 p-4 rounded-sm rounded-bl-none flex items-center gap-2">
                        <div className="w-2 h-2 bg-cyan-400 rounded-full animate-bounce"></div>
                        <div className="w-2 h-2 bg-cyan-400 rounded-full animate-bounce delay-100"></div>
                        <div className="w-2 h-2 bg-cyan-400 rounded-full animate-bounce delay-200"></div>
                        <span className="text-xs font-mono text-cyan-400 ml-2">PROCESSING...</span>
                     </div>
                   </div>
                )}
                <div ref={chatEndRef} className="h-4" />
            </div>

            {/* Input Area */}
            <div className={`p-4 bg-slate-950/80 border-t border-cyan-900/50 backdrop-blur-md shrink-0 z-20 ${isVideoMode ? 'hidden' : ''}`}>
               <div className="max-w-4xl mx-auto flex gap-4 items-end relative">
                  <div className="absolute -top-1 -left-1 w-3 h-3 border-t border-l border-cyan-500"></div>
                  <div className="absolute -top-1 -right-1 w-3 h-3 border-t border-r border-cyan-500"></div>
                  <div className="absolute -bottom-1 -left-1 w-3 h-3 border-b border-l border-cyan-500"></div>
                  <div className="absolute -bottom-1 -right-1 w-3 h-3 border-b border-r border-cyan-500"></div>

                  <div className="flex-1 bg-slate-900/50 border border-cyan-800/50 flex items-center p-2 gap-2 focus-within:border-cyan-500/50 focus-within:shadow-[0_0_15px_rgba(6,182,212,0.1)] transition-all">
                      <Terminal size={18} className="text-cyan-600" />
                      <input 
                        type="text" 
                        value={inputText}
                        onChange={(e) => setInputText(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && !isLiveMode && handleSendMessage()}
                        disabled={isLiveMode}
                        placeholder={isLiveMode ? "VOICE PROTOCOL ACTIVE" : "ENTER COMMAND..."}
                        className="flex-1 bg-transparent border-none outline-none text-cyan-100 font-mono placeholder-cyan-800 disabled:opacity-50"
                      />
                  </div>
                  <button 
                    onClick={handleSendMessage}
                    disabled={isLiveMode || !inputText.trim()}
                    className="p-3 bg-cyan-900/20 border border-cyan-700 text-cyan-400 hover:bg-cyan-500/20 hover:text-cyan-200 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                  >
                    <Send size={20} />
                  </button>
               </div>
            </div>
        </div>

        {/* Right Sidebar: System Logs */}
        <div className="hidden lg:block w-72 h-full border-l border-cyan-900/30">
            <SystemLog />
        </div>

      </main>

      {/* Decorative Background */}
      <div className="absolute inset-0 pointer-events-none z-0">
         <div className={`absolute top-1/4 left-1/4 w-96 h-96 rounded-full blur-3xl transition-colors duration-1000 ${currentEmotion === 'alert' ? 'bg-red-500/5' : 'bg-cyan-500/5'}`}></div>
         <div className={`absolute bottom-1/4 right-1/4 w-96 h-96 rounded-full blur-3xl transition-colors duration-1000 ${currentEmotion === 'alert' ? 'bg-red-600/5' : 'bg-blue-600/5'}`}></div>
      </div>
      
      {/* Central HUD Ring (Audio Only Mode) */}
      {isLiveMode && !isVideoMode && (
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none z-30">
           <div className={`w-[340px] h-[340px] border rounded-full animate-spin-slow absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 transition-colors duration-500 ${currentEmotion === 'alert' ? 'border-red-500/20' : 'border-cyan-500/20'}`}></div>
           <div className={`w-[300px] h-[300px] border rounded-full animate-spin-reverse absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 transition-colors duration-500 ${currentEmotion === 'alert' ? 'border-red-400/10' : 'border-cyan-400/10'}`}></div>
           <div className="text-center mt-60">
              <div className={`font-mono text-sm tracking-[0.2em] animate-pulse transition-colors duration-500 ${currentEmotion === 'alert' ? 'text-red-400' : 'text-cyan-400'}`}>
                {systemState === SystemState.LISTENING ? "LISTENING..." : 
                 systemState === SystemState.SPEAKING ? "VOCALIZING..." : 
                 "STANDBY"}
              </div>
           </div>
        </div>
      )}

      {/* Video Call Controls Overlay */}
      {isLiveMode && isVideoMode && (
          <div className="absolute bottom-8 left-1/2 -translate-x-1/2 flex items-center gap-4 z-50 bg-slate-900/90 p-3 px-6 rounded-full border border-cyan-500/30 backdrop-blur-md shadow-[0_0_20px_rgba(0,0,0,0.5)]">
             <button 
                onClick={toggleScan}
                className={`p-3 rounded-full border transition-all ${isScanning ? 'bg-red-500 text-white border-red-500 shadow-[0_0_15px_rgba(239,68,68,0.5)]' : 'bg-cyan-500/10 text-cyan-400 border-cyan-500/50 hover:bg-cyan-500/30'}`}
                title="Identify Object"
             >
                <Scan size={24} className={isScanning ? "animate-spin-slow" : ""} />
             </button>

             <button 
                onClick={toggleMute}
                className={`p-3 rounded-full border transition-all ${isMuted ? 'bg-red-500/20 text-red-400 border-red-500' : 'bg-cyan-500/10 text-cyan-400 border-cyan-500/50 hover:bg-cyan-500/30'}`}
             >
                {isMuted ? <VolumeX size={24} /> : <Volume2 size={24} />}
             </button>
             
             <div className="h-6 w-px bg-cyan-500/30 mx-2"></div>

             <button onClick={() => stopLiveSession()} className="p-3 rounded-full bg-red-500/20 text-red-400 border border-red-500 hover:bg-red-500 hover:text-white transition-all shadow-[0_0_15px_rgba(239,68,68,0.3)]">
                <PhoneOff size={24} />
             </button>
             
             <div className="absolute -top-12 left-1/2 -translate-x-1/2 text-[10px] font-mono text-cyan-500/80 bg-black/80 px-2 py-1 rounded border border-cyan-900/50 whitespace-nowrap">
                {isScanning ? "MODE: OBJECT IDENTIFICATION" : "MODE: VIDEO FEED"}
             </div>
          </div>
      )}

    </div>
  );
};

export default App;