import { get } from '@/utils/request'

export interface KbQuotaDto {
  quotaBytes: number
  usedBytes: number
  remainingBytes: number
}

export interface KbFolderTreeNodeDto {
  id: number
  name: string
  children?: KbFolderTreeNodeDto[]
}

export interface KbPdfRowDto {
  id: number
  folderId: number
  displayName: string
  originalName: string
  sizeBytes: number
  createdAt: string
}

export interface KbFilesListDto {
  rows: KbPdfRowDto[]
  count: number
}

export function fetchKbQuotaAPI() {
  return get<KbQuotaDto>({ url: '/kb/quota' })
}

export function fetchKbFoldersTreeAPI() {
  return get<KbFolderTreeNodeDto>({ url: '/kb/folders/tree' })
}

export function fetchKbFilesAPI(params: { folderId: number; page?: number; size?: number }) {
  return get<KbFilesListDto>({
    url: '/kb/files',
    data: {
      folderId: params.folderId,
      page: params.page ?? 1,
      size: params.size ?? 50,
    },
  })
}
