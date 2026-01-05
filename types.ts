
export enum SSTVMode {
  ROBOT8_BW = 'Robot 8 (B/W)',
  ROBOT36 = 'Robot 36 (Robot)',
  MARTIN1 = 'Martin 1',
  SCOTTIE1 = 'Scottie 1',
  WRAASE_SC2_180 = 'Wraase (SC2-180)'
}

export interface SSTVComponent {
  name: 'Y' | 'U' | 'V' | 'R' | 'G' | 'B';
  duration: number; // ms
  width: number; // pixels
}

export interface ModeTiming {
  name: string;
  width: number;
  height: number;
  visCode: number;
  syncFreq: number;
  syncDuration: number;
  breakFreq: number;
  breakDuration: number;
  gapDuration: number;
  totalLineTime: number;
  colorEncoding: 'YUV' | 'RGB' | 'BW';
  components: SSTVComponent[];
}

export const SSTV_TIMINGS: Record<SSTVMode, ModeTiming> = {
  [SSTVMode.ROBOT8_BW]: {
    name: 'Robot 8 (B/W)',
    width: 160,
    height: 120,
    visCode: 2,
    syncFreq: 1200,
    syncDuration: 10,
    breakFreq: 1500,
    breakDuration: 0,
    gapDuration: 0,
    totalLineTime: 66.66,
    colorEncoding: 'BW',
    components: [
      { name: 'Y', duration: 56.66, width: 160 }
    ]
  },
  [SSTVMode.ROBOT36]: {
    name: 'Robot 36',
    width: 320,
    height: 240,
    visCode: 8,
    syncFreq: 1200,
    syncDuration: 9,
    breakFreq: 1500,
    breakDuration: 3,
    gapDuration: 1.5,
    totalLineTime: 147, // 9+3+88+1.5+22+1.5+22
    colorEncoding: 'YUV',
    components: [
      { name: 'Y', duration: 88, width: 320 },
      { name: 'V', duration: 22, width: 160 },
      { name: 'U', duration: 22, width: 160 }
    ]
  },
  [SSTVMode.MARTIN1]: {
    name: 'Martin 1',
    width: 320,
    height: 256,
    visCode: 44,
    syncFreq: 1200,
    syncDuration: 4.862,
    breakFreq: 1500,
    breakDuration: 0.572,
    gapDuration: 0.572,
    totalLineTime: 450.096,
    colorEncoding: 'RGB',
    components: [
      { name: 'G', duration: 146.432, width: 320 },
      { name: 'B', duration: 146.432, width: 320 },
      { name: 'R', duration: 146.432, width: 320 }
    ]
  },
  [SSTVMode.SCOTTIE1]: {
    name: 'Scottie 1',
    width: 320,
    height: 256,
    visCode: 60,
    syncFreq: 1200,
    syncDuration: 9,
    breakFreq: 1500,
    breakDuration: 1.5,
    gapDuration: 1.5,
    totalLineTime: 432.0,
    colorEncoding: 'RGB',
    components: [
      { name: 'G', duration: 138.24, width: 320 },
      { name: 'B', duration: 138.24, width: 320 },
      { name: 'R', duration: 138.24, width: 320 }
    ]
  },
  [SSTVMode.WRAASE_SC2_180]: {
    name: 'Wraase SC2-180',
    width: 320,
    height: 256,
    visCode: 55,
    syncFreq: 1200,
    syncDuration: 5,
    breakFreq: 1500,
    breakDuration: 0.5,
    gapDuration: 0.5,
    totalLineTime: 711, 
    colorEncoding: 'RGB',
    components: [
      { name: 'R', duration: 235, width: 320 },
      { name: 'G', duration: 235, width: 320 },
      { name: 'B', duration: 235, width: 320 }
    ]
  }
};

export interface DecodedImage {
  id: string;
  timestamp: number;
  dataUrl: string;
  mode: SSTVMode;
}
