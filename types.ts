export interface LogEntry {
  id: string;
  message: string;
  type: 'info' | 'success' | 'error' | 'warning';
  timestamp: Date;
}

export interface ProcessingStatus {
  state: 'idle' | 'fetching' | 'processing' | 'archiving' | 'complete' | 'error';
  message: string;
}

export interface ServerResponse {
  success: boolean;
  logs: string[];
  folderUrl?: string;
  folderName?: string;
  folderId?: string;
  error?: string;
}

export interface SavedKey {
  id: string;
  alias: string;
  masked: string;
}

export interface KeyPayload {
  mode: 'saved' | 'new';
  id?: string;
  key?: string;
  alias?: string;
}