export class KbFileListItemDto {
  id: number;
  folderId: number;
  displayName: string;
  originalName: string;
  sizeBytes: number;
  createdAt: string;
}

export class KbFileListResponseDto {
  rows: KbFileListItemDto[];
  count: number;
}
