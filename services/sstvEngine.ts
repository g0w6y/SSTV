
import { SSTVMode, SSTV_TIMINGS, ModeTiming, SSTVComponent } from '../types';

export const FREQ_SYNC = 1200;
export const FREQ_BLACK = 1500;
export const FREQ_WHITE = 2300;
export const FREQ_RANGE = FREQ_WHITE - FREQ_BLACK;

export class SSTVEncoder {
  static async generateAudio(image: HTMLImageElement, mode: SSTVMode): Promise<AudioBuffer> {
    const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 44100 });
    const timing = SSTV_TIMINGS[mode];
    
    const canvas = document.createElement('canvas');
    canvas.width = timing.width;
    canvas.height = timing.height;
    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(image, 0, 0, timing.width, timing.height);
    const imageData = ctx.getImageData(0, 0, timing.width, timing.height);
    
    const headerDuration = 2.0; 
    const lineCount = timing.height;
    const lineDuration = timing.totalLineTime / 1000;
    const totalDuration = headerDuration + (lineCount * lineDuration);
    
    const sampleRate = audioCtx.sampleRate;
    const buffer = audioCtx.createBuffer(1, Math.ceil(sampleRate * totalDuration), sampleRate);
    const data = buffer.getChannelData(0);
    
    let phase = 0;
    let offset = 0;

    const writeFreq = (freq: number, durationSec: number) => {
      const samples = Math.floor(durationSec * sampleRate);
      for (let i = 0; i < samples && offset < data.length; i++) {
        data[offset] = Math.sin(phase);
        phase += (2 * Math.PI * freq) / sampleRate;
        offset++;
      }
    };

    // VIS Header
    writeFreq(1900, 0.3); // Leader
    writeFreq(1200, 0.01); // Break
    writeFreq(1900, 0.3); // Leader
    writeFreq(1200, 0.03); // Start bit
    writeFreq(1200 + timing.visCode, 0.1); // VIS Mode Marker
    writeFreq(1200, 0.03); // Stop bit

    for (let y = 0; y < timing.height; y++) {
      writeFreq(timing.syncFreq, timing.syncDuration / 1000);
      writeFreq(timing.breakFreq, timing.breakDuration / 1000);

      for (const comp of timing.components) {
        const pixelTime = (comp.duration / 1000) / comp.width;
        for (let x = 0; x < comp.width; x++) {
          // Map x to source image width if comp.width differs
          const srcX = Math.floor((x / comp.width) * timing.width);
          const idx = (y * timing.width + srcX) * 4;
          const R = imageData.data[idx];
          const G = imageData.data[idx+1];
          const B = imageData.data[idx+2];

          let val = 128;
          if (comp.name === 'Y') val = 0.299 * R + 0.587 * G + 0.114 * B;
          else if (comp.name === 'U') val = 128 + (-0.1687 * R - 0.3313 * G + 0.5 * B);
          else if (comp.name === 'V') val = 128 + (0.5 * R - 0.4187 * G - 0.0813 * B);
          else if (comp.name === 'R') val = R;
          else if (comp.name === 'G') val = G;
          else if (comp.name === 'B') val = B;

          const freq = FREQ_BLACK + (Math.max(0, Math.min(255, val)) / 255) * FREQ_RANGE;
          writeFreq(freq, pixelTime);
          
          if (comp.name === 'Y' && timing.colorEncoding === 'YUV' && x === comp.width - 1) {
             writeFreq(timing.breakFreq, timing.gapDuration / 1000);
          }
        }
      }
    }
    return buffer;
  }
}

export function yuvToRgb(y: number, u: number, v: number): [number, number, number] {
  const r = y + 1.402 * (v - 128);
  const g = y - 0.34414 * (u - 128) - 0.71414 * (v - 128);
  const b = y + 1.772 * (u - 128);
  return [
    Math.max(0, Math.min(255, r)),
    Math.max(0, Math.min(255, g)),
    Math.max(0, Math.min(255, b))
  ];
}

export function detectFrequency(analyser: AnalyserNode, buffer: Float32Array, useNoiseFilter: boolean = false): number {
  analyser.getFloatFrequencyData(buffer);
  let maxVal = -Infinity;
  let maxIdx = -1;
  const sampleRate = analyser.context.sampleRate;
  const fftSize = analyser.fftSize;
  const binFreq = sampleRate / fftSize;
  
  const startBin = Math.floor(800 / binFreq);
  const endBin = Math.ceil(2800 / binFreq);

  for (let i = startBin; i < endBin && i < buffer.length; i++) {
    if (buffer[i] > maxVal) {
      maxVal = buffer[i];
      maxIdx = i;
    }
  }

  if (maxIdx === -1 || (useNoiseFilter && maxVal < -90)) return 0;

  const alpha = maxIdx > 0 ? buffer[maxIdx - 1] : buffer[maxIdx];
  const beta = buffer[maxIdx];
  const gamma = maxIdx < buffer.length - 1 ? buffer[maxIdx + 1] : buffer[maxIdx];
  const p = 0.5 * (alpha - gamma) / (alpha - 2 * beta + gamma || 1);
  return (maxIdx + p) * binFreq;
}
