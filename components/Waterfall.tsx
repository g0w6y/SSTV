
import React, { useRef, useEffect, useState } from 'react';
import { FREQ_SYNC, FREQ_BLACK, FREQ_WHITE } from '../services/sstvEngine';

interface WaterfallProps {
  analyser: AnalyserNode | null;
  speed?: number;
  palette?: 'plasma' | 'monochrome' | 'classic';
}

const Waterfall: React.FC<WaterfallProps> = ({ analyser, speed = 1, palette = 'monochrome' }) => {
  const waterfallCanvasRef = useRef<HTMLCanvasElement>(null);
  const spectrumCanvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [hoverFreq, setHoverFreq] = useState<number | null>(null);

  useEffect(() => {
    if (!analyser || !waterfallCanvasRef.current || !spectrumCanvasRef.current) return;
    const wCanvas = waterfallCanvasRef.current;
    const wCtx = wCanvas.getContext('2d')!;
    const sCanvas = spectrumCanvasRef.current;
    const sCtx = sCanvas.getContext('2d')!;
    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    const sampleRate = analyser.context.sampleRate;
    const hzPerBin = (sampleRate / 2) / bufferLength;
    const minHz = 800; const maxHz = 2800;
    const minBin = Math.floor(minHz / hzPerBin);
    const maxBin = Math.ceil(maxHz / hzPerBin);
    const visibleBins = maxBin - minBin;

    let animationFrame: number;
    const draw = () => {
      analyser.getByteFrequencyData(dataArray);
      sCtx.fillStyle = '#000000';
      sCtx.fillRect(0, 0, sCanvas.width, sCanvas.height);
      const drawMarker = (hz: number, label: string, color: string) => {
        const x = ((hz - minHz) / (maxHz - minHz)) * sCanvas.width;
        sCtx.strokeStyle = color; sCtx.setLineDash([2, 4]);
        sCtx.beginPath(); sCtx.moveTo(x, 0); sCtx.lineTo(x, sCanvas.height); sCtx.stroke();
        sCtx.setLineDash([]); sCtx.fillStyle = color; sCtx.font = '7px monospace';
        sCtx.fillText(label, x + 2, 8);
      };
      drawMarker(FREQ_SYNC, 'S', 'rgba(255,255,255,0.4)');
      drawMarker(FREQ_BLACK, 'B', 'rgba(255,255,255,0.2)');
      drawMarker(FREQ_WHITE, 'W', 'rgba(255,255,255,0.6)');
      sCtx.beginPath(); sCtx.strokeStyle = 'white'; sCtx.lineWidth = 1;
      for (let i = 0; i < visibleBins; i++) {
        const val = dataArray[minBin + i];
        const x = (i / visibleBins) * sCanvas.width;
        const y = sCanvas.height - (val / 255) * sCanvas.height;
        if (i === 0) sCtx.moveTo(x, y); else sCtx.lineTo(x, y);
      }
      sCtx.stroke();
      const imageData = wCtx.getImageData(0, 0, wCanvas.width, wCanvas.height - speed);
      wCtx.putImageData(imageData, 0, speed);
      const barWidth = wCanvas.width / visibleBins;
      for (let i = 0; i < visibleBins; i++) {
        const val = dataArray[minBin + i];
        wCtx.fillStyle = `rgb(${val}, ${val}, ${val})`;
        wCtx.fillRect(i * barWidth, 0, barWidth + 1, speed);
      }
      animationFrame = requestAnimationFrame(draw);
    };
    draw();
    return () => cancelAnimationFrame(animationFrame);
  }, [analyser, speed, palette]);

  return (
    <div className="space-y-1 group relative" ref={containerRef} onMouseMove={(e) => {
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const percent = (e.clientX - rect.left) / rect.width;
      setHoverFreq(800 + percent * 2000);
    }} onMouseLeave={() => setHoverFreq(null)}>
      <div className="w-full h-10 border-b border-white/10 overflow-hidden">
        <canvas ref={spectrumCanvasRef} className="w-full h-full" width={1024} height={40} />
      </div>
      <div className="relative w-full h-32 bg-black overflow-hidden cursor-crosshair">
        <canvas ref={waterfallCanvasRef} className="w-full h-full" width={1024} height={128} />
        {hoverFreq !== null && (
          <div className="absolute top-2 left-2 bg-white text-black px-2 py-0.5 text-[8px] font-bold uppercase tracking-widest pointer-events-none">
            {hoverFreq.toFixed(0)} Hz
          </div>
        )}
      </div>
    </div>
  );
};

export default Waterfall;
