export type NoteGenJobStatus = 'created' | 'processing' | 'completed' | 'incomplete' | 'failed';
export type NoteGenChargeStatus = 'not_charged' | 'charging' | 'charged' | 'partial';
export type NoteGenArtifactType = 'markdown-markmap' | 'word';
export type NoteGenArtifactStatus = 'ready' | 'uploading' | 'failed';
export type NoteGenStepStatus = 'success' | 'failed' | 'skipped';
