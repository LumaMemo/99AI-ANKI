import { get, post } from '@/utils/request'

type RequestOptions = { silent?: boolean }

/* 创建新的对话组 */
export function fetchCreateGroupAPI<T>(data?: {
  appId?: number
  modelConfig?: any
  params?: string
}, options?: RequestOptions): Promise<T> {
  return post<T>({
    url: '/group/create',
    data,
    silent: options?.silent,
  })
}

/* 查询对话组列表 */
export function fetchQueryGroupAPI<T>(options?: RequestOptions): Promise<T> {
  return get<T>({ url: '/group/query', silent: options?.silent })
}

/* 通过groupId查询当前对话组的详细信息 */
export function fetchGroupInfoById<T>(groupId: number | string): Promise<T> {
  return get<T>({ url: `/group/info/${groupId}` })
}

/* 修改对话组 */
export function fetchUpdateGroupAPI<T>(data?: {
  groupId?: number
  title?: string
  isSticky?: boolean
  config?: string
  fileUrl?: string
}, options?: RequestOptions): Promise<T> {
  return post<T>({
    url: '/group/update',
    data,
    silent: options?.silent,
  })
}

/* 删除对话组 */
export function fetchDelGroupAPI<T>(data?: { groupId: number }): Promise<T> {
  return post<T>({
    url: '/group/del',
    data,
  })
}

/* 删除全部对话组 */
export function fetchDelAllGroupAPI<T>(data?: { groupId: number }): Promise<T> {
  return post<T>({
    url: '/group/delAll',
    data,
  })
}
