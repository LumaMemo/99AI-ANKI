import type { Response } from '@/utils/request'
import { del, get, patch, post } from '@/utils/request'

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

export function createKbFolderAPI(body: { parentId?: number; name: string }) {
  return post({
    url: '/kb/folders',
    data: {
      parentId: body.parentId ?? 0,
      name: body.name,
    },
  })
}

export function renameKbFolderAPI(folderId: number, body: { name: string }) {
  return patch({
    url: `/kb/folders/${folderId}`,
    data: { name: body.name },
  })
}

export function deleteKbFolderAPI(folderId: number) {
  return del({
    url: `/kb/folders/${folderId}`,
  })
}

export function uploadKbPdfAPI(file: File, folderId: number): Promise<Response<any>> {
  const form = new FormData()
  form.append('file', file)

  const path = `/kb/files/upload?folderId=${encodeURIComponent(String(folderId ?? 0))}`

  return post({
    url: path,
    data: form,
    headers: { 'Content-Type': 'multipart/form-data' },
  })
}

export function renameKbFileAPI(fileId: number, body: { displayName: string }) {
  return patch({
    url: `/kb/files/${fileId}`,
    data: { displayName: body.displayName },
  })
}

export function deleteKbFileAPI(fileId: number) {
  return del({
    url: `/kb/files/${fileId}`,
  })
}

export function fetchKbFileSignedUrlAPI(fileId: number) {
  return get<{ url: string; expiresAt: number }>({
    url: `/kb/files/${fileId}/signed-url`,
  })
}
