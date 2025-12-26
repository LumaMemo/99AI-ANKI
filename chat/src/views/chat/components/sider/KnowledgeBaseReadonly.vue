<script setup lang="ts">
import {
  createKbFolderAPI,
  deleteKbFileAPI,
  deleteKbFolderAPI,
  fetchKbFileSignedUrlAPI,
  fetchKbFilesAPI,
  fetchKbFoldersTreeAPI,
  fetchKbQuotaAPI,
  renameKbFileAPI,
  renameKbFolderAPI,
  retryDeleteKbFileAPI,
  uploadKbPdfAPI,
} from '../../../../api/kb'
import { useAuthStore, useChatStore, useGlobalStoreWithOut } from '../../../../store'
import { useBasicLayout } from '../../../../hooks/useBasicLayout'
import { Close, CheckOne, ApplicationTwo } from '@icon-park/vue-next'
import { dialog } from '../../../../utils/dialog'
import { computed, ref, watch } from 'vue'
import { useRouter } from 'vue-router'

interface FolderTreeNode {
  id: number
  name: string
  children?: FolderTreeNode[]
}

interface PdfRow {
  id: number
  folderId: number
  displayName: string
  originalName: string
  sizeBytes: number
  status: number
  createdAt: string
}

const props = defineProps<{
  hideTrigger?: boolean
}>()

const useGlobalStore = useGlobalStoreWithOut()
const authStore = useAuthStore()
const chatStore = useChatStore()
const router = useRouter()
const isLogin = computed(() => authStore.isLogin)
// 聊天模块：将 640–767 也视为移动端（<md）
const { isSmallMd: isMobile } = useBasicLayout()
const dlg = dialog()

function viewKnowledgeCards(f: PdfRow) {
  router.push({
    path: '/knowledge-card',
    query: { pdfId: f.id },
  })
  closePane()
}

const visible = computed({
  get: () => useGlobalStore.showKnowledgeBase,
  set: (val) => useGlobalStore.showKnowledgeBase = val
})

const loading = ref(false)
const loadError = ref<string | null>(null)

const quotaBytes = ref(0)
const usedBytes = ref(0)

const folderTree = ref<FolderTreeNode | null>(null)
const selectedFolderId = ref<number>(0)

const folderById = ref(new Map<number, FolderTreeNode>())
const parentById = ref(new Map<number, number | null>())
const childrenById = ref(new Map<number, FolderTreeNode[]>())

const files = ref<PdfRow[]>([])

const fileInputRef = ref<HTMLInputElement | null>(null)
const uploading = ref(false)
const previewingId = ref<number | null>(null)

const quotaPercent = computed(() => {
  const quota = Number(quotaBytes.value)
  const used = Number(usedBytes.value)
  if (!Number.isFinite(quota) || quota <= 0) return 0
  if (!Number.isFinite(used) || used <= 0) return 0

  const p = (used / quota) * 100
  if (!Number.isFinite(p)) return 0
  return Math.max(0, Math.min(100, p))
})

const quotaPercentInt = computed(() => Math.round(quotaPercent.value))
const quotaBarStyle = computed(() => {
  const quota = Number(quotaBytes.value)
  const used = Number(usedBytes.value)
  const p = quotaPercent.value

  const style: Record<string, string> = {
    width: `${p.toFixed(2)}%`,
  }

  // 极小占比也给一个可见的最小宽度，避免看起来“没显示”
  if (Number.isFinite(quota) && quota > 0 && Number.isFinite(used) && used > 0 && p > 0 && p < 1)
    style.minWidth = '6px'

  return style
})

function formatBytes(bytes: number) {
  if (!bytes || bytes < 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  let size = bytes
  let unitIndex = 0
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024
    unitIndex += 1
  }
  const fixed = unitIndex === 0 ? 0 : size < 10 ? 2 : 1
  return `${size.toFixed(fixed)} ${units[unitIndex]}`
}

async function loadQuota() {
  const res = await fetchKbQuotaAPI()
  quotaBytes.value = Number((res as any)?.data?.quotaBytes) || 0
  usedBytes.value = Number((res as any)?.data?.usedBytes) || 0
}

async function loadTree() {
  const res = await fetchKbFoldersTreeAPI()
  folderTree.value = res.data
  if (folderTree.value?.id !== undefined && folderTree.value?.id !== null) {
    selectedFolderId.value = folderTree.value.id
  } else {
    selectedFolderId.value = 0
  }
}

function rebuildFolderIndex(root: FolderTreeNode | null) {
  const byId = new Map<number, FolderTreeNode>()
  const parent = new Map<number, number | null>()
  const children = new Map<number, FolderTreeNode[]>()

  const walk = (node: FolderTreeNode, parentId: number | null) => {
    byId.set(node.id, node)
    parent.set(node.id, parentId)
    const childArr = Array.isArray(node.children) ? node.children : []
    children.set(node.id, childArr)
    for (const c of childArr) walk(c, node.id)
  }

  if (root) walk(root, null)

  folderById.value = byId
  parentById.value = parent
  childrenById.value = children
}

async function loadFiles(folderId: number) {
  const res = await fetchKbFilesAPI({ folderId, page: 1, size: 50 })
  const rows = (res.data?.rows ?? []) as any[]
  files.value = rows.map(r => ({
    ...r,
    status: Number(r?.status ?? 1) || 1,
  }))
}

async function loadAll() {
  if (!isLogin.value) return

  loading.value = true
  loadError.value = null
  try {
    await Promise.all([loadQuota(), loadTree()])
    await loadFiles(selectedFolderId.value ?? 0)
  } catch (e: any) {
    loadError.value = e?.message || '知识库加载失败'
  } finally {
    loading.value = false
  }
}

async function refreshAll(showToast = false) {
  await loadAll()
  if (showToast) window.alert('已刷新')
}

function openPane() {
  if (!isLogin.value) return
  visible.value = true
}

function closePane() {
  visible.value = false
}

const drawerWidthClass = computed(() => {
  if (isMobile.value) return 'w-[90vw] max-w-[390px]'
  return 'w-[390px]'
})

function onSelectFolder(id: number) {
  selectedFolderId.value = id
}

async function promptName(title: string, defaultValue = '', placeholder = '请输入') {
  const v = await dlg.prompt({
    title,
    defaultValue,
    placeholder,
    maxLength: 255,
    required: true,
  })
  if (v === null) return null
  const name = String(v).trim()
  if (!name) return null
  return name
}

async function createFolder() {
  if (!isLogin.value) return
  const name = await promptName('新建文件夹', '', '请输入文件夹名称')
  if (!name) return
  try {
    await createKbFolderAPI({ parentId: selectedFolderId.value ?? 0, name })
    await loadTree()
  } catch (e: any) {
    const msg = e?.message || '新建文件夹失败'
    loadError.value = msg
    window.alert(msg)
  }
}

async function renameFolder(node: FolderTreeNode) {
  if (!isLogin.value) return
  if (!node || !node.id) return
  const name = await promptName('重命名文件夹', node.name, '请输入新名称')
  if (!name) return
  try {
    await renameKbFolderAPI(node.id, { name })
    await loadTree()
  } catch (e: any) {
    const msg = e?.message || '重命名失败'
    loadError.value = msg
    window.alert(msg)
  }
}

async function deleteFolder(node: FolderTreeNode) {
  if (!isLogin.value) return
  if (!node || !node.id) return

  try {
    await dlg.warning({
      title: '删除文件夹',
      content: `确认删除文件夹“${node.name}”？\n（仅允许删除空文件夹）`,
      positiveText: '删除',
      negativeText: '取消',
    })
  } catch {
    return
  }

  try {
    await deleteKbFolderAPI(node.id)
    const parentId = parentById.value.get(node.id) ?? 0
    await loadTree()
    selectedFolderId.value = parentId
  } catch (e: any) {
    const msg = e?.message || '删除文件夹失败'
    loadError.value = msg
    window.alert(msg)
  }
}

function triggerUpload() {
  if (!isLogin.value) return
  fileInputRef.value?.click()
}

async function onFilePicked(ev: Event) {
  const input = ev.target as HTMLInputElement
  const f = input?.files?.[0]
  input.value = ''
  if (!f) return

  // 先做一层前端提示（最终以服务端校验为准）
  const quota = Number(quotaBytes.value)
  const used = Number(usedBytes.value)
  if (!Number.isFinite(quota) || quota <= 0) {
    window.alert('当前套餐未开通知识库空间配额，无法上传。')
    return
  }
  if (Number.isFinite(used) && used >= quota) {
    window.alert('知识库空间已用完，请先删除文件或升级套餐。')
    return
  }

  const isPdf = f.type === 'application/pdf' || f.name.toLowerCase().endsWith('.pdf')
  if (!isPdf) {
    window.alert('仅允许上传 PDF')
    return
  }

  uploading.value = true
  try {
    await uploadKbPdfAPI(f, selectedFolderId.value ?? 0)
    await Promise.all([loadQuota(), loadFiles(selectedFolderId.value ?? 0)])
  } catch (e: any) {
    const msg = e?.message || '上传失败'
    loadError.value = msg
    // 上传失败时也刷新一次配额，避免 UI 停留在旧值
    await loadQuota().catch(() => {})
    // 明确提示：空间不足 / 文件过大
    if (String(msg).includes('空间不足') || String(msg).includes('文件过大')) window.alert(msg)
  } finally {
    uploading.value = false
  }
}

async function renamePdfFile(f: PdfRow) {
  if (!isLogin.value) return
  const name = await promptName('重命名 PDF', f.displayName || f.originalName, '请输入新展示名')
  if (!name) return
  try {
    await renameKbFileAPI(f.id, { displayName: name })
    await loadFiles(selectedFolderId.value ?? 0)
  } catch (e: any) {
    const msg = e?.message || '重命名失败'
    loadError.value = msg
    window.alert(msg)
  }
}

async function deletePdfFile(f: PdfRow) {
  if (!isLogin.value) return
  if (Number(f?.status) === 2) {
    // 兼容旧数据：历史上可能存在 status=2 的记录
    try {
      await dlg.warning({
        title: '重试删除',
        content: `该文件处于“删除中”状态，是否尝试再次删除？\n\n${f.displayName || f.originalName}`,
        positiveText: '继续删除',
        negativeText: '取消',
      })
    } catch {
      return
    }
    return retryDeletePdfFile(f)
  }

  try {
    await dlg.warning({
      title: '删除 PDF',
      content: `确认删除“${f.displayName || f.originalName}”？`,
      positiveText: '删除',
      negativeText: '取消',
    })
  } catch {
    return
  }

  try {
    await deleteKbFileAPI(f.id)
    await Promise.all([loadQuota(), loadFiles(selectedFolderId.value ?? 0)])
  } catch (e: any) {
    const msg = e?.message || '删除失败'
    loadError.value = msg
    window.alert(msg)
    await loadFiles(selectedFolderId.value ?? 0).catch(() => {})
  }
}

async function retryDeletePdfFile(f: PdfRow) {
  if (!isLogin.value) return
  try {
    await retryDeleteKbFileAPI(f.id)
    await Promise.all([loadQuota(), loadFiles(selectedFolderId.value ?? 0)])
  } catch (e: any) {
    loadError.value = e?.message || '重试删除失败'
    await loadFiles(selectedFolderId.value ?? 0).catch(() => {})
  }
}

async function previewPdfFile(f: PdfRow) {
  if (!isLogin.value) return
  if (Number(f?.status) === 2) {
    window.alert('该文件正在删除中，暂不可预览')
    return
  }
  previewingId.value = f.id
  try {
    const res = await fetchKbFileSignedUrlAPI(f.id)
    const url = res.data?.url
    if (!url) throw new Error('签名 URL 为空')
    window.open(url, '_blank', 'noopener')
  } catch (e: any) {
    const msg = e?.message || '预览失败'
    loadError.value = msg
    window.alert(msg)
  } finally {
    previewingId.value = null
  }
}

function selectPdfForNoteGen(f: PdfRow) {
  if (!isLogin.value) return
  if (Number(f?.status) === 2) {
    window.alert('该文件正在删除中，无法选择')
    return
  }
  chatStore.setSelectedKbPdf(f.id, f.displayName || f.originalName)
  closePane()
}

const breadcrumb = computed(() => {
  const result: Array<{ id: number; name: string }> = []
  const byId = folderById.value
  const parent = parentById.value

  const startId = selectedFolderId.value ?? 0
  let cur: number | null | undefined = startId
  const guard = new Set<number>()

  while (cur !== null && cur !== undefined) {
    if (guard.has(cur)) break
    guard.add(cur)

    const node = byId.get(cur)
    if (node) result.push({ id: node.id, name: node.name })
    else result.push({ id: cur, name: cur === 0 ? '根目录' : '未知目录' })

    cur = parent.get(cur) ?? null
  }

  return result.reverse()
})

const currentFolders = computed(() => {
  return childrenById.value.get(selectedFolderId.value ?? 0) ?? []
})

watch(selectedFolderId, async id => {
  if (!isLogin.value) return
  try {
    await loadFiles(id ?? 0)
  } catch (e: any) {
    loadError.value = e?.message || '文件列表加载失败'
  }
})

watch(
  folderTree,
  root => {
    rebuildFolderIndex(root)
  },
  { immediate: true }
)

watch(
  () => authStore.isLogin,
  val => {
    if (!val) {
      folderTree.value = null
      files.value = []
      quotaBytes.value = 0
      usedBytes.value = 0
      loadError.value = null
      visible.value = false
    }
  },
  { immediate: true }
)

// 仅在打开抽屉时加载，避免“进入页面就发请求”的体验问题。
watch(
  visible,
  val => {
    if (val) loadAll()
  },
  { immediate: false }
)
</script>

<template>
  <div>
    <!-- 顶部入口按钮（常置顶） -->
    <div v-if="!hideTrigger" class="px-4 pt-3">
      <button
        type="button"
        class="w-full text-left glass rounded-2xl p-3 border border-[color:var(--glass-border)] hover:bg-[color:var(--glass-bg-secondary)] transition-[background]"
        :class="{ 'opacity-60 cursor-not-allowed': !isLogin }"
        @click="openPane"
        aria-label="打开知识库"
      >
        <div class="flex items-center justify-between">
          <div class="text-sm font-bold text-[color:var(--text-primary)]">知识库</div>
          <div class="text-xs text-[color:var(--text-tertiary)]" v-if="loading">加载中…</div>
        </div>

        <div class="mt-2 flex items-center justify-between text-xs text-[color:var(--text-secondary)]">
          <span>已用 {{ formatBytes(usedBytes) }}</span>
          <span>总额 {{ formatBytes(quotaBytes) }}</span>
        </div>

        <div class="mt-2 h-2 w-full rounded-full bg-[color:var(--glass-bg-secondary)] overflow-hidden">
          <div
            class="h-full bg-[color:var(--btn-bg-primary)] transition-[width] duration-300"
            :style="quotaBarStyle"
          />
        </div>
      </button>

      <div v-if="!isLogin" class="mt-2 text-xs text-[color:var(--text-tertiary)]">
        登录后可管理知识库
      </div>
    </div>

    <!-- 左侧抽屉（只读管理）：Teleport 到 body，确保是顶层覆盖层，不受侧边栏 transform 影响 -->
    <Teleport to="body">
      <transition name="kb-drawer">
        <div v-if="visible" class="fixed inset-0 z-[9999]" aria-label="知识库抽屉">
          <!-- 遮罩 -->
          <div
            class="absolute inset-0 bg-black/40 backdrop-blur-sm"
            @click="closePane"
            aria-hidden="true"
          />

          <!-- 抽屉本体：从左侧滑出，宽为侧栏 1.5 倍（390px），高度同侧栏 -->
          <aside
            class="absolute top-0 left-0 h-full md:top-4 md:left-4 md:bottom-4 md:h-auto"
            :class="drawerWidthClass"
          >
            <div class="glass-card aurora-border overflow-hidden flex flex-col h-full select-none">
              <div class="flex items-center justify-between px-4 pt-4">
                <div>
                  <div class="text-lg font-bold text-[color:var(--text-primary)]">知识库</div>
                  <div class="mt-1 text-xs text-[color:var(--text-tertiary)]">
                    已用 {{ formatBytes(usedBytes) }} / 总额 {{ formatBytes(quotaBytes) }}
                  </div>
                </div>

                <div class="flex items-center gap-2">
                  <button
                    type="button"
                    class="btn btn-sm"
                    @click="refreshAll(false)"
                    aria-label="刷新知识库"
                  >
                    刷新
                  </button>

                  <button
                    type="button"
                    class="btn btn-sm"
                    @click="createFolder"
                    aria-label="新建文件夹"
                  >
                    新建
                  </button>

                  <button
                    type="button"
                    class="btn btn-sm"
                    :class="{ 'opacity-60 cursor-not-allowed': uploading }"
                    :disabled="uploading"
                    @click="triggerUpload"
                    aria-label="上传 PDF"
                  >
                    {{ uploading ? '上传中…' : '上传' }}
                  </button>

                  <button type="button" class="btn-icon btn-md" @click="closePane" aria-label="关闭">
                    <Close size="20" />
                  </button>
                </div>
              </div>

              <input
                ref="fileInputRef"
                type="file"
                accept="application/pdf"
                class="hidden"
                @change="onFilePicked"
              />

              <div class="px-4 pt-3">
                <div
                  class="h-2 w-full rounded-full bg-[color:var(--glass-bg-secondary)] overflow-hidden"
                >
                  <div
                    class="h-full bg-[color:var(--btn-bg-primary)] transition-[width] duration-300"
                    :style="quotaBarStyle"
                  />
                </div>

                <div
                  v-if="loadError"
                  class="mt-2 text-xs text-red-500 break-words"
                  role="alert"
                  aria-live="polite"
                >
                  {{ loadError }}
                </div>
              </div>

              <div class="flex-1 min-h-0 px-4 pt-4 pb-4 flex flex-col gap-3">
                <!-- 当前路径（面包屑） -->
                <div class="glass rounded-2xl px-3 py-2 border border-[color:var(--glass-border)]">
                  <div class="flex items-center gap-1 flex-wrap text-xs text-[color:var(--text-secondary)]">
                    <span v-for="(seg, idx) in breadcrumb" :key="seg.id" class="flex items-center gap-1">
                      <button
                        type="button"
                        class="px-2 py-1 rounded-xl hover:bg-[color:var(--glass-bg-secondary)] transition-[background]"
                        @click="onSelectFolder(seg.id)"
                        :aria-label="`切换到目录 ${seg.name}`"
                      >
                        {{ seg.name }}
                      </button>
                      <span v-if="idx !== breadcrumb.length - 1" class="opacity-60">/</span>
                    </span>
                  </div>
                </div>

                <!-- 当前目录内容（文件夹 + PDF） -->
                <div class="glass rounded-2xl p-3 flex-1 min-h-0 overflow-hidden">
                  <div class="h-full overflow-y-auto custom-scrollbar pr-1">
                    <div class="text-xs font-bold text-[color:var(--text-secondary)]">文件夹</div>
                    <div v-if="!currentFolders.length" class="mt-2 text-xs text-[color:var(--text-tertiary)]">暂无</div>
                    <ul v-else class="mt-2 space-y-2">
                      <li v-for="d in currentFolders" :key="d.id">
                        <div
                          class="w-full flex items-center gap-3 px-3 py-2 rounded-2xl border border-transparent bg-transparent hover:bg-[color:var(--glass-bg-secondary)] hover:border-[color:var(--glass-border)] transition-[background,border-color]"
                        >
                          <button
                            type="button"
                            class="flex items-center gap-3 flex-1 min-w-0 text-left"
                            @click="onSelectFolder(d.id)"
                            :aria-label="`进入文件夹 ${d.name}`"
                          >
                            <div class="w-9 h-9 rounded-2xl bg-[color:var(--glass-bg-secondary)] border border-[color:var(--glass-border)] flex items-center justify-center">
                              <span class="text-[10px] font-bold text-[color:var(--text-tertiary)]">DIR</span>
                            </div>
                            <div class="flex-1 min-w-0">
                              <div class="truncate text-sm font-medium text-[color:var(--text-primary)]">{{ d.name }}</div>
                              <div class="mt-0.5 text-xs text-[color:var(--text-tertiary)] truncate">文件夹</div>
                            </div>
                          </button>

                          <div class="shrink-0 flex items-center gap-2">
                            <button
                              type="button"
                              class="text-xs text-[color:var(--text-tertiary)] hover:text-[color:var(--text-primary)]"
                              @click.stop="renameFolder(d)"
                              aria-label="重命名文件夹"
                            >
                              重命名
                            </button>
                            <button
                              type="button"
                              class="text-xs text-[color:var(--text-tertiary)] hover:text-[color:var(--text-primary)]"
                              @click.stop="deleteFolder(d)"
                              aria-label="删除文件夹"
                            >
                              删除
                            </button>
                          </div>
                        </div>
                      </li>
                    </ul>

                    <div class="mt-4 text-xs font-bold text-[color:var(--text-secondary)]">PDF</div>
                    <div v-if="!files.length" class="mt-2 text-xs text-[color:var(--text-tertiary)]">暂无</div>
                    <ul v-else class="mt-2 space-y-2">
                      <li v-for="f in files" :key="f.id">
                        <div
                          class="w-full flex items-start gap-3 px-3 py-3 rounded-2xl border border-transparent bg-transparent text-left hover:bg-[color:var(--glass-bg-secondary)] hover:border-[color:var(--glass-border)] transition-[background,border-color] relative overflow-hidden"
                          :class="{ 
                            'bg-[color:var(--glass-bg-secondary)] border-[color:var(--glass-border)] ring-1 ring-[color:var(--btn-bg-primary)]': chatStore.selectedKbPdfId === f.id,
                            'aurora-purple-marker': true 
                          }"
                        >
                          <!-- 极光紫标记 (装饰性) -->
                          <div class="absolute top-0 right-0 w-16 h-16 bg-purple-500/5 blur-2xl -mr-8 -mt-8 pointer-events-none"></div>

                          <div class="shrink-0 w-9 h-9 rounded-2xl bg-[color:var(--glass-bg-secondary)] border border-[color:var(--glass-border)] flex items-center justify-center relative">
                            <span class="text-[10px] font-bold text-[color:var(--text-tertiary)]">PDF</span>
                            <div v-if="chatStore.selectedKbPdfId === f.id" class="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-[color:var(--btn-bg-primary)] flex items-center justify-center text-white">
                              <CheckOne size="10" />
                            </div>
                          </div>

                          <div class="flex-1 min-w-0 flex flex-col gap-2">
                            <!-- 第一行：名称和大小 -->
                            <div class="flex items-center justify-between gap-2">
                              <div class="truncate text-sm font-medium text-[color:var(--text-primary)] flex items-center gap-1">
                                {{ f.displayName || f.originalName }}
                                <span class="px-1 py-0.5 rounded text-[8px] bg-purple-100 text-purple-600 dark:bg-purple-900/30 dark:text-purple-400 font-bold scale-90 origin-left">卡片</span>
                              </div>
                              <div class="shrink-0 text-[10px] text-[color:var(--text-tertiary)]">
                                {{ formatBytes(f.sizeBytes) }}
                              </div>
                            </div>

                            <!-- 状态/原名（可选，较淡） -->
                            <div v-if="Number(f.status) === 2 || f.displayName" class="text-[10px] text-[color:var(--text-tertiary)] truncate opacity-60">
                              <span v-if="Number(f.status) === 2" class="mr-2 text-red-500">删除中</span>
                              <span v-if="f.displayName">{{ f.originalName }}</span>
                            </div>

                            <!-- 第二行：操作按钮 -->
                            <div class="flex items-center gap-4">
                              <button
                                type="button"
                                class="text-xs font-bold text-[color:var(--btn-bg-primary)] hover:opacity-80"
                                @click.stop="selectPdfForNoteGen(f)"
                                :class="{ 'opacity-60 cursor-not-allowed': Number(f.status) === 2 }"
                                :disabled="Number(f.status) === 2"
                                aria-label="选择 PDF"
                              >
                                {{ chatStore.selectedKbPdfId === f.id ? '已选' : '选择' }}
                              </button>
                              <button
                                type="button"
                                class="text-xs font-bold text-purple-500 hover:opacity-80 flex items-center gap-1"
                                @click.stop="viewKnowledgeCards(f)"
                                :class="{ 'opacity-60 cursor-not-allowed': Number(f.status) === 2 }"
                                :disabled="Number(f.status) === 2"
                                aria-label="查看知识卡片"
                              >
                                <ApplicationTwo size="14" />
                                <span>查看卡片</span>
                              </button>
                              <button
                                type="button"
                                class="text-xs text-[color:var(--text-tertiary)] hover:text-[color:var(--text-primary)]"
                                @click.stop="previewPdfFile(f)"
                                :class="{ 'opacity-60 cursor-not-allowed': previewingId === f.id || Number(f.status) === 2 }"
                                :disabled="previewingId === f.id || Number(f.status) === 2"
                                aria-label="预览 PDF"
                              >
                                {{ previewingId === f.id ? '预览中…' : '预览' }}
                              </button>
                              <button
                                type="button"
                                class="text-xs text-[color:var(--text-tertiary)] hover:text-[color:var(--text-primary)]"
                                @click.stop="deletePdfFile(f)"
                                aria-label="删除 PDF"
                              >
                                {{ Number(f.status) === 2 ? '重试删除' : '删除' }}
                              </button>
                            </div>
                          </div>
                        </div>
                      </li>
                    </ul>
                  </div>
                </div>
              </div>
            </div>
          </aside>
        </div>
      </transition>
    </Teleport>
  </div>
</template>

<style scoped>
.kb-drawer-enter-active,
.kb-drawer-leave-active {
  transition: opacity 0.2s ease;
}
.kb-drawer-enter-from,
.kb-drawer-leave-to {
  opacity: 0;
}

/* 抽屉本体滑入滑出 */
.kb-drawer-enter-active aside,
.kb-drawer-leave-active aside {
  transition: transform 0.25s ease;
}
.kb-drawer-enter-from aside,
.kb-drawer-leave-to aside {
  transform: translateX(-110%);
}
</style>
