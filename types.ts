export interface Message {
  role: 'user' | 'model';
  content: string;
  timestamp: Date;
  isSystemAction?: boolean;
}

export enum SystemState {
  IDLE = 'IDLE',
  LISTENING = 'LISTENING',
  PROCESSING = 'PROCESSING',
  SPEAKING = 'SPEAKING',
  INITIALIZING = 'INITIALIZING'
}

export interface SystemStat {
  label: string;
  value: number;
  unit: string;
}

export interface AudioVisualizerData {
  values: number[];
}
