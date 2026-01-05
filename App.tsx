
import React, { useState, useRef, useEffect, useCallback } from 'react';
import Header from './components/Header';
import Waterfall from './components/Waterfall';
import SSTVCanvas, { SSTVCanvasHandle } from './components/SSTVCanvas';
import { SSTVMode, SSTV_TIMINGS, DecodedImage } from './types';
import { detectFrequency, FREQ_BLACK, FREQ_RANGE, SSTVEncoder, yuvToRgb } from './services/sstvEngine';

type Session = 'RX' | 'TX' | 'HISTORY';

const App: React.FC = () => {
  const [activeSession, setActiveSession] = useState<Session>('RX');
  const [activeMode, setActiveMode] = useState<SSTVMode>(SSTVMode.ROBOT36);
  const [noiseReduction, setNoiseReduction] = useState(true);
  const [isListening, setIsListening] = useState(false);
  const [isDecoding, setIsDecoding] = useState(false);
  const [isEncoding, setIsEncoding] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [txVolume, setTxVolume] = useState(0.5);
  const [history, setHistory] = useState<DecodedImage[]>([]);
  const [txImage, setTxImage] = useState<string | null>(null);
  const [signalStrength, setSignalStrength] = useState(0);
  const [scanY, setScanY] = useState(0);
  const [syncConfidence, setSyncConfidence] = useState(0);

  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const canvasHandleRef = useRef<SSTVCanvasHandle>(null);
  const frequencyBufferRef = useRef<Float32Array | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const txSourceRef = useRef<AudioBufferSourceNode | null>(null);
  const txGainRef = useRef<GainNode | null>(null);

  const lastLineTimeRef = useRef(0);
  const scanYRef = useRef(0);
  const syncStrikeRef = useRef(0);
  const lineBufferRef = useRef<Record<string, number[]>>({});

  const startListening = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 44100 });
      audioCtxRef.current = audioCtx;
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 2048;
      analyserRef.current = analyser;
      const source = audioCtx.createMediaStreamSource(stream);
      source.connect(analyser);
      frequencyBufferRef.current = new Float32Array(analyser.frequencyBinCount);
      setIsListening(true);
      requestAnimationFrame(processAudio);
    } catch (err) {
      console.error('Mic Access Error:', err);
    }
  };

  const stopListening = () => {
    streamRef.current?.getTracks().forEach(t => t.stop());
    audioCtxRef.current?.close();
    setIsListening(false);
    setIsDecoding(false);
    setScanY(0);
    setSyncConfidence(0);
  };

  const clearLineBuffer = () => {
    lineBufferRef.current = { 'Y': [], 'U': [], 'V': [], 'R': [], 'G': [], 'B': [] };
  };

  const flushLineBuffer = () => {
    const timing = SSTV_TIMINGS[activeMode];
    const buffer = lineBufferRef.current;
    for (let x = 0; x < timing.width; x++) {
      let r = 0, g = 0, b = 0;
      if (timing.colorEncoding === 'YUV') {
        const y = buffer['Y']?.[x] ?? 128;
        const uIdx = Math.floor(x * (buffer['U']?.length ?? timing.width) / timing.width);
        const vIdx = Math.floor(x * (buffer['V']?.length ?? timing.width) / timing.width);
        const u = buffer['U']?.[uIdx] ?? 128;
        const v = buffer['V']?.[vIdx] ?? 128;
        [r, g, b] = yuvToRgb(y, u, v);
      } else if (timing.colorEncoding === 'BW') {
        r = g = b = buffer['Y']?.[x] ?? 0;
      } else {
        r = buffer['R']?.[x] ?? 0; g = buffer['G']?.[x] ?? 0; b = buffer['B']?.[x] ?? 0;
      }
      canvasHandleRef.current?.setPixel(x, scanYRef.current, r, g, b);
    }
  };

  const processAudio = useCallback(() => {
    if (!isListening || !analyserRef.current || !frequencyBufferRef.current) return;
    const freq = detectFrequency(analyserRef.current, frequencyBufferRef.current, noiseReduction);
    const now = performance.now();
    const timing = SSTV_TIMINGS[activeMode];
    setSignalStrength(Math.min(100, Math.floor((freq > 1100 && freq < 2400 ? 98 : 2) + Math.random() * 2)));

    // Accurate Sync Pulse Identification (1200Hz)
    if (Math.abs(freq - 1200) < 30) {
      syncStrikeRef.current++;
      setSyncConfidence(Math.min(100, syncStrikeRef.current * 10));
      
      const elapsedSinceSync = now - lastLineTimeRef.current;
      // Strict line-break check to reduce false positives
      if (syncStrikeRef.current > 7 && (elapsedSinceSync > timing.totalLineTime * 0.8 || !isDecoding)) {
        if (!isDecoding) { 
          setIsDecoding(true); 
          canvasHandleRef.current?.clear(); 
          scanYRef.current = 0; 
        } else { 
          flushLineBuffer(); 
          scanYRef.current++; 
        }
        setScanY(scanYRef.current);
        lastLineTimeRef.current = now;
        clearLineBuffer();
        if (scanYRef.current >= timing.height) { 
          saveToHistory(); 
          setIsDecoding(false); 
          scanYRef.current = 0; 
        }
      }
    } else {
      syncStrikeRef.current = Math.max(0, syncStrikeRef.current - 0.2);
      setSyncConfidence(prev => Math.max(0, prev - 0.3));
      
      if (isDecoding && freq >= 1400 && freq <= 2600) {
        const elapsed = now - lastLineTimeRef.current;
        const headerEnd = timing.syncDuration + timing.breakDuration;
        
        if (elapsed > headerEnd && elapsed < timing.totalLineTime) {
          let currentTime = elapsed - headerEnd;
          
          for (let i = 0; i < timing.components.length; i++) {
            const comp = timing.components[i];
            if (currentTime >= 0 && currentTime < comp.duration) {
              const x = Math.floor((currentTime / comp.duration) * comp.width);
              if (x < comp.width) {
                const val = Math.max(0, Math.min(255, ((freq - FREQ_BLACK) / FREQ_RANGE) * 255));
                if (!lineBufferRef.current[comp.name]) lineBufferRef.current[comp.name] = [];
                lineBufferRef.current[comp.name][x] = val;
                drawDecodingPixel(x, scanYRef.current, comp.name, val);
              }
              break;
            }
            currentTime -= comp.duration;
            currentTime -= timing.gapDuration;
          }
        }
      }
    }
    if (isListening) requestAnimationFrame(processAudio);
  }, [isListening, isDecoding, activeMode, noiseReduction]);

  const drawDecodingPixel = (x: number, y: number, name: string, val: number) => {
    let r = val, g = val, b = val;
    if (name === 'R') { g = 0; b = 0; }
    else if (name === 'G') { r = 0; b = 0; }
    else if (name === 'B') { r = 0; g = 0; }
    canvasHandleRef.current?.setPixel(x, y, r, g, b);
  };

  const handleGenerateSignal = async () => {
    if (!txImage) return;
    setIsEncoding(true);
    const img = new Image(); img.src = txImage;
    await new Promise(r => img.onload = r);
    const audioCtx = audioCtxRef.current || new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 44100 });
    audioCtxRef.current = audioCtx;
    const audioBuffer = await SSTVEncoder.generateAudio(img, activeMode);
    const gainNode = audioCtx.createGain(); gainNode.gain.value = txVolume; txGainRef.current = gainNode;
    const source = audioCtx.createBufferSource(); source.buffer = audioBuffer;
    source.connect(gainNode); gainNode.connect(audioCtx.destination);
    txSourceRef.current = source; source.start();
    source.onended = () => { setIsEncoding(false); setIsPaused(false); };
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setTxImage(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const stopTransmission = () => {
    if (txSourceRef.current) {
      try { txSourceRef.current.stop(); } catch (e) {}
      txSourceRef.current = null;
    }
    setIsEncoding(false);
    setIsPaused(false);
  };

  const saveToHistory = () => {
    const dataUrl = canvasHandleRef.current?.getDataUrl();
    if (dataUrl) setHistory(prev => [{ id: Math.random().toString(36).substring(2, 9), timestamp: Date.now(), dataUrl, mode: activeMode }, ...prev].slice(0, 20));
  };

  return (
    <div className="flex flex-col min-h-screen bg-black text-white font-sans overflow-x-hidden selection:bg-white selection:text-black">
      <Header activeSession={activeSession} onSessionChange={setActiveSession} />
      <main className="flex-grow container mx-auto px-6 py-12">
        {activeSession === 'RX' && (
          <div className="grid grid-cols-1 xl:grid-cols-12 gap-12 max-w-[1200px] mx-auto animate-in fade-in duration-500">
            <div className="xl:col-span-8 space-y-6">
              <div className="border border-white/10 overflow-hidden bg-black shadow-2xl relative">
                <SSTVCanvas ref={canvasHandleRef} mode={activeMode} isDecoding={isDecoding} scanY={scanY} />
                <div className="absolute top-4 left-4 flex items-center gap-3 z-10 pointer-events-none">
                  {isDecoding && <div className="bg-white text-black px-3 py-1 text-[9px] font-bold tracking-widest uppercase animate-pulse">LOCK ACTIVE</div>}
                  <div className="bg-black/80 border border-white/20 px-3 py-1 text-[9px] font-bold tracking-widest uppercase">{activeMode}</div>
                </div>
              </div>
              <div className="border border-white/10 p-4 bg-white/[0.01]">
                <Waterfall analyser={analyserRef.current} palette="monochrome" />
              </div>
            </div>
            <div className="xl:col-span-4 space-y-6">
              <div className="border border-white/10 p-8 bg-white/[0.01] flex flex-col justify-between">
                <div className="space-y-10">
                  <div>
                    <span className="text-[9px] font-bold tracking-widest uppercase opacity-30 mb-4 block">Mode Set</span>
                    <div className="grid grid-cols-1 gap-1.5">
                      {Object.values(SSTVMode).map(m => (
                        <button key={m} onClick={() => setActiveMode(m)} className={`py-2 text-[9px] font-bold border transition-all text-left px-4 ${activeMode === m ? 'bg-white text-black border-white' : 'border-white/5 text-white/30 hover:border-white/20'}`}>
                          {m.toUpperCase()}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="space-y-3">
                    <button onClick={isListening ? stopListening : startListening} className={`w-full py-4 font-bold text-[10px] tracking-[0.2em] uppercase transition-all ${isListening ? 'bg-white/10 border border-white/20 text-white' : 'bg-white text-black hover:bg-white/90'}`}>
                      {isListening ? 'Stop Intercept' : 'Listen Signal'}
                    </button>
                    <label className="flex items-center justify-between cursor-pointer py-3 border-y border-white/5 group">
                      <span className="text-[9px] font-bold text-white/40 group-hover:text-white transition-colors uppercase tracking-widest">Denoise</span>
                      <input type="checkbox" checked={noiseReduction} onChange={() => setNoiseReduction(!noiseReduction)} className="hidden" />
                      <div className={`w-8 h-4 rounded-full border border-white/20 p-0.5 flex items-center ${noiseReduction ? 'bg-white/10' : 'bg-transparent'}`}>
                        <div className={`w-2 h-2 rounded-full transition-transform ${noiseReduction ? 'translate-x-4 bg-white' : 'translate-x-0 bg-white/20'}`}></div>
                      </div>
                    </label>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
        {activeSession === 'TX' && (
          <div className="max-w-4xl mx-auto space-y-10 animate-in fade-in duration-500">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-10 items-start">
              <div onClick={() => fileInputRef.current?.click()} className="aspect-square border border-white/10 bg-white/[0.01] flex flex-col items-center justify-center cursor-pointer group hover:border-white/30 transition-all overflow-hidden relative">
                {txImage ? (
                  <img src={txImage} className="w-full h-full object-cover opacity-60 group-hover:opacity-80 transition-all duration-500" alt="TX" />
                ) : (
                  <div className="text-center p-8 opacity-20 group-hover:opacity-100 transition-opacity">
                    <i className="fas fa-plus text-3xl mb-4"></i>
                    <p className="text-[9px] font-bold uppercase tracking-[0.2em]">Select Asset</p>
                  </div>
                )}
                <input type="file" ref={fileInputRef} onChange={handleImageUpload} className="hidden" accept="image/*" />
              </div>
              <div className="space-y-6">
                <div className="p-8 border border-white/10 bg-white/[0.01] space-y-8">
                  <div>
                    <span className="text-[9px] font-bold tracking-widest uppercase opacity-30 mb-4 block">Select Transmission Mode</span>
                    <div className="grid grid-cols-1 gap-1.5">
                      {Object.values(SSTVMode).map(m => (
                        <button key={m} onClick={() => setActiveMode(m)} className={`py-2 text-[9px] font-bold border transition-all text-left px-4 ${activeMode === m ? 'bg-white text-black border-white' : 'border-white/5 text-white/30 hover:border-white/20'}`}>
                          {m.toUpperCase()}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="space-y-3">
                    <div className="flex justify-between items-center text-[9px] font-bold uppercase tracking-widest opacity-40">
                      <span>Gain</span>
                      <span>{Math.round(txVolume * 100)}%</span>
                    </div>
                    <input type="range" min="0" max="1" step="0.01" value={txVolume} onChange={(e) => setTxVolume(parseFloat(e.target.value))} className="w-full h-0.5 bg-white/10 appearance-none cursor-pointer accent-white" />
                  </div>
                  <div className="grid grid-cols-1 gap-3 pt-4">
                    <button onClick={handleGenerateSignal} disabled={isEncoding || !txImage} className={`py-4 text-[10px] font-bold tracking-[0.3em] uppercase transition-all ${isEncoding ? 'bg-white/5 text-white/30 cursor-not-allowed' : !txImage ? 'bg-white/5 text-white/20 border border-white/5 cursor-not-allowed' : 'bg-white text-black hover:bg-white/90'}`}>
                      {isEncoding ? 'Modulating...' : 'Start Broadcast'}
                    </button>
                    {isEncoding && <button onClick={stopTransmission} className="py-3 border border-white/10 text-white/50 hover:text-white transition-all text-[9px] font-bold uppercase tracking-widest">Cancel</button>}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
        {activeSession === 'HISTORY' && (
          <div className="animate-in fade-in duration-500 space-y-10 max-w-[1200px] mx-auto">
            <div className="flex justify-between items-end border-b border-white/10 pb-6">
              <h2 className="text-xl font-black italic uppercase tracking-tighter">Intercept Logs</h2>
              <span className="text-[9px] font-bold font-mono opacity-20 uppercase tracking-widest">{history.length} RECORDS</span>
            </div>
            {history.length > 0 ? (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {history.map(item => (
                  <div key={item.id} className="border border-white/10 bg-white/[0.01] hover:border-white/40 transition-all overflow-hidden group">
                    <div className="aspect-video bg-black relative">
                      <img src={item.dataUrl} className="w-full h-full object-contain opacity-60 group-hover:opacity-100 transition-all duration-500" alt="Log" />
                      <div className="absolute top-2 right-2 bg-black/80 px-2 py-0.5 text-[7px] font-bold tracking-widest border border-white/10 uppercase">{item.mode}</div>
                    </div>
                    <div className="p-3 flex justify-between items-center">
                      <span className="text-[8px] font-mono text-white/20">{new Date(item.timestamp).toLocaleTimeString()}</span>
                      <button onClick={() => { const a = document.createElement('a'); a.href = item.dataUrl; a.download = `SSTV_${item.id}.png`; a.click(); }} className="text-white/20 hover:text-white"><i className="fas fa-download text-[10px]"></i></button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-32 opacity-10">
                <i className="fas fa-database text-4xl mb-6"></i>
                <span className="text-[10px] font-bold tracking-widest uppercase">No Logged Data</span>
              </div>
            )}
          </div>
        )}
      </main>
      <footer className="border-t border-white/5 py-12 bg-black">
        <div className="container mx-auto px-10 flex flex-col items-center gap-4">
          <div className="text-center">
            <h1 className="text-xl font-black italic tracking-tighter text-white/80">SSTV VISION PRO</h1>
            <p className="text-[8px] font-bold tracking-[0.4em] uppercase opacity-20 mt-1">NExTQAT0R</p>
          </div>
          <div className="mt-6 pt-6 border-t border-white/5 w-64 text-center">
            <p className="text-[9px] font-bold tracking-[0.3em] uppercase opacity-30">Developed by g0w6y</p>
          </div>
        </div>
      </footer>
      <style dangerouslySetInnerHTML={{ __html: `
        .custom-scrollbar::-webkit-scrollbar { width: 3px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #333; }
        input[type="range"]::-webkit-slider-thumb { -webkit-appearance: none; width: 10px; height: 10px; border-radius: 0; background: white; cursor: pointer; }
        .image-render-pixelated { image-rendering: pixelated; }
      `}} />
    </div>
  );
};
export default App;
