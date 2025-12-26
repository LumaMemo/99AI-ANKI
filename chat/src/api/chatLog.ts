import { get, post } from '@/utils/request'

type RequestOptions = { silent?: boolean }

/* 删除对话记录 */
export function fetchDelChatLogAPI<T>(data: { id: number }): Promise<T> {
  return post<T>({
    url: '/chatlog/del',
    // url: '/chatlog/deleteChatsAfterId',
    data,
  })
}

/* 删除一组对话记录 */
export function fetchDelChatLogByGroupIdAPI<T>(data: { groupId: number }): Promise<T> {
  return post<T>({
    url: '/chatlog/delByGroupId',
    data,
  })
}

/* 删除一组对话记录 */
export function fetchDeleteGroupChatsAfterIdAPI<T>(data: { id: number }): Promise<T> {
  return post<T>({
    url: '/chatlog/deleteChatsAfterId',
    data,
  })
}

/* 查询x组对话信息 */
export function fetchQueryChatLogListAPI<T>(
  data: { groupId: number },
  options?: RequestOptions
): Promise<T> {
  return get<T>({
    url: '/chatlog/chatList',
    data,
    silent: options?.silent,
  })
}

/* 查询单个应用的对话信息 */
export function fetchQueryChatLogByAppIdAPI<T>(data: {
  page?: number
  size?: number
  appId: number
}): Promise<T> {
  return get<T>({
    url: '/chatlog/byAppId',
    data,
  })
}

/* 查询单条消息的状态和内容 */
export function fetchQuerySingleChatLogAPI<T>(data: { chatId: number }): Promise<T> {
  return get<T>({
    url: '/chatlog/querySingleChat',
    data,
  })
}
