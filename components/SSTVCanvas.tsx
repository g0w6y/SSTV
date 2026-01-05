
import React, { useRef, useEffect, forwardRef, useImperativeHandle } from 'react';
import { SSTVMode, SSTV_TIMINGS } from '../types';

interface SSTVCanvasProps {
  mode: SSTVMode;
  isDecoding: boolean;
  scanY: number;
}

export interface SSTVCanvasHandle {
  setPixel: (x: number, y: number, r: number, g: number, b: number) => void;
  clear: () => void;
  getDataUrl: () => string;
}

const SSTVCanvas = forwardRef<SSTVCanvasHandle, SSTVCanvasProps>(({ mode, isDecoding, scanY }, ref) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const timing = SSTV_TIMINGS[mode];

  useImperativeHandle(ref, () => ({
    setPixel: (x, y, r, g, b) => {
      if (!canvasRef.current) return;
      const ctx = canvasRef.current.getContext('2d', { alpha: false })!;
      ctx.fillStyle = `rgb(${r}, ${g}, ${b})`;
      ctx.fillRect(x, y, 1, 1);
    },
    clear: () => {
      if (!canvasRef.current) return;
      const ctx = canvasRef.current.getContext('2d', { alpha: false })!;
      ctx.fillStyle = '#000000';
      ctx.fillRect(0, 0, timing.width, timing.height);
    },
    getDataUrl: () => canvasRef.current?.toDataURL('image/png') || ''
  }));

  useEffect(() => {
    if (canvasRef.current) {
      const ctx = canvasRef.current.getContext('2d', { alpha: false })!;
      ctx.fillStyle = '#000000';
      ctx.fillRect(0, 0, timing.width, timing.height);
    }
  }, [mode]);

  const progress = (scanY / timing.height) * 100;

  return (
    <div className="relative w-full aspect-video bg-black overflow-hidden group">
      <canvas
        ref={canvasRef}
        width={timing.width}
        height={timing.height}
        className="w-full h-full image-render-pixelated grayscale group-hover:grayscale-0 transition-all duration-1000"
        style={{ imageRendering: 'pixelated' }}
      />
      {isDecoding && (
        <div 
          className="absolute left-0 w-full h-[1px] bg-white shadow-[0_0_15px_white] z-10 pointer-events-none transition-all duration-100"
          style={{ top: `${progress}%` }}
        />
      )}
      <div className="absolute inset-0 border-[24px] border-black pointer-events-none"></div>
      <div className="absolute inset-0 border border-white/5 pointer-events-none"></div>
      <div className="absolute bottom-10 right-10 flex items-center gap-3 px-4 py-1 bg-black/80 border border-white/10 shadow-xl opacity-0 group-hover:opacity-100 transition-opacity">
         <span className="text-[9px] font-bold font-mono text-white/50 uppercase tracking-widest">{timing.width}x{timing.height} px</span>
      </div>
    </div>
  );
});

export default SSTVCanvas;
