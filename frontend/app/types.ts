export interface TerminalLog {
  id: string;
  text: string;
  type: 'info' | 'success' | 'warning' | 'error' | 'system';
  timestamp: string;
}

export interface FeatureCardProps {
  title: string;
  description: string;
  icon: React.ReactNode;
  techSpec: string;
  delay?: number;
}

export enum GenerationState {
  IDLE,
  ENCRYPTING,
  PROCESSING_TEE,
  DECRYPTING,
  COMPLETE,
  ERROR
}
