
export interface VoiceState {
  isListening: boolean;
  isSpeaking: boolean;
  isConnected: boolean;
  isConnecting?: boolean;
}

export enum AssistantVoice {
  ZEPHYR = 'Zephyr',
  PUCK = 'Puck',
  CHARON = 'Charon',
  KORE = 'Kore',
  FENRIR = 'Fenrir'
}
