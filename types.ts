
export type Role = 'user' | 'assistant' | 'system';

export interface MessageMedia {
  data?: string; // Base64 for images
  mimeType: string;
  url?: string; // For generated video
  fileName?: string;
  textContent?: string; // For text-based documents
}

export interface Message {
  id: string;
  role: Role;
  content: string;
  timestamp: Date;
  mediaItems?: MessageMedia[];
  type?: 'text' | 'video_gen' | 'doc_analysis';
  status?: 'sending' | 'error' | 'sent';
}

export interface ChatState {
  messages: Message[];
  isThinking: boolean;
  isGeneratingVideo: boolean;
  error: string | null;
}
