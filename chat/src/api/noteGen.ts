import { get, post } from '@/utils/request'

export type NoteGenJobStatus = 'created' | 'processing' | 'completed' | 'incomplete' | 'failed'
export type NoteGenArtifactType = 'markdown-markmap' | 'word'
export type NoteGenArtifactStatus = 'ready' | 'uploading' | 'failed'

export interface NoteGenJobDetailDto {
  jobId: string
  kbPdfId: number
  status: NoteGenJobStatus
  progressPercent: number
  estimatedCostPoints: { min: number; max: number }
  chargedPoints: number
  chargeStatus: string
  updatedAt: string
  userMessage?: string
  resultFiles?: Array<{
    type: NoteGenArtifactType
    status: NoteGenArtifactStatus
    fileName: string
    sizeBytes: number
    updatedAt: string
  }>
}

export interface CreateNoteGenJobDto {
  kbPdfId: number
  pageRange: { mode: 'all' }
  configSnapshotId?: number
}

export interface CreateNoteGenJobResponseDto {
  jobId: string
  status: NoteGenJobStatus
  progressPercent: number
  estimatedCostPoints: { min: number; max: number }
  chargedPoints: number
  chargeStatus: string
  createdAt: string
  updatedAt: string
}

export interface NoteGenFileSignedUrlResponseDto {
  url: string
  expiresAt: number
}

/** 创建生成笔记任务 */
export function fetchCreateNoteGenJob(data: CreateNoteGenJobDto) {
  return post<CreateNoteGenJobResponseDto>({
    url: '/note-gen/jobs',
    data,
  })
}

/** 查询任务详情 */
export function fetchNoteGenJobDetail(jobId: string, options?: { silent?: boolean }) {
  return get<NoteGenJobDetailDto>({
    url: `/note-gen/jobs/${jobId}`,
    data: { _t: Date.now() },
    silent: options?.silent,
  })
}

/** 获取产物下载签名链接 */
export function fetchNoteGenFileSignedUrl(jobId: string, fileType: NoteGenArtifactType, options?: { silent?: boolean }) {
  return get<NoteGenFileSignedUrlResponseDto>({
    url: `/note-gen/jobs/${jobId}/files/${fileType}/signed-url`,
    data: { _t: Date.now() },
    silent: options?.silent,
  })
}
