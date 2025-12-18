<script setup lang="ts">
import { fetchKbFilesAPI, fetchKbFoldersTreeAPI, fetchKbQuotaAPI } from '../../../../api/kb'
import { useAuthStore } from '../../../../store'
import { useBasicLayout } from '../../../../hooks/useBasicLayout'
import { Close } from '@icon-park/vue-next'
import { computed, nextTick, onMounted, ref, watch } from 'vue'

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
  createdAt: string
}

const authStore = useAuthStore()
const isLogin = computed(() => authStore.isLogin)
const { isMobile } = useBasicLayout()

const visible = ref(false)

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

const quotaPercent = computed(() => {
  if (!quotaBytes.value) return 0
  return Math.max(0, Math.min(100, Math.round((usedBytes.value / quotaBytes.value) * 100)))
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
  quotaBytes.value = res.data.quotaBytes ?? 0
  usedBytes.value = res.data.usedBytes ?? 0
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
  files.value = res.data?.rows ?? []
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

function openPane() {
  if (!isLogin.value) return
  visible.value = true
  nextTick(() => {
    loadAll()
  })
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
    if (val) loadAll()
    else {
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

onMounted(() => {
  loadAll()
})
</script>

<template>
  <div>
    <!-- 顶部入口按钮（常置顶） -->
    <div class="px-4 pt-3">
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
            class="h-full bg-[color:var(--primary-color)] transition-[width] duration-300"
            :style="{ width: `${quotaPercent}%` }"
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
        <div v-if="visible" class="fixed inset-0 z-[9000]" aria-label="知识库抽屉">
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

                <button type="button" class="btn-icon btn-md" @click="closePane" aria-label="关闭">
                  <Close size="20" />
                </button>
              </div>

              <div class="px-4 pt-3">
                <div
                  class="h-2 w-full rounded-full bg-[color:var(--glass-bg-secondary)] overflow-hidden"
                >
                  <div
                    class="h-full bg-[color:var(--primary-color)] transition-[width] duration-300"
                    :style="{ width: `${quotaPercent}%` }"
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
                        <button
                          type="button"
                          class="w-full flex items-center gap-3 px-3 py-2 rounded-2xl border border-transparent bg-transparent text-left hover:bg-[color:var(--glass-bg-secondary)] hover:border-[color:var(--glass-border)] transition-[background,border-color]"
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
                      </li>
                    </ul>

                    <div class="mt-4 text-xs font-bold text-[color:var(--text-secondary)]">PDF</div>
                    <div v-if="!files.length" class="mt-2 text-xs text-[color:var(--text-tertiary)]">暂无</div>
                    <ul v-else class="mt-2 space-y-2">
                      <li v-for="f in files" :key="f.id">
                        <div
                          class="w-full flex items-center gap-3 px-3 py-2 rounded-2xl border border-transparent bg-transparent text-left hover:bg-[color:var(--glass-bg-secondary)] hover:border-[color:var(--glass-border)] transition-[background,border-color]"
                        >
                          <div class="w-9 h-9 rounded-2xl bg-[color:var(--glass-bg-secondary)] border border-[color:var(--glass-border)] flex items-center justify-center">
                            <span class="text-[10px] font-bold text-[color:var(--text-tertiary)]">PDF</span>
                          </div>
                          <div class="flex-1 min-w-0">
                            <div class="truncate text-sm font-medium text-[color:var(--text-primary)]">{{ f.displayName || f.originalName }}</div>
                            <div class="mt-0.5 text-xs text-[color:var(--text-tertiary)] truncate">{{ f.originalName }}</div>
                          </div>
                          <div class="shrink-0 text-xs text-[color:var(--text-tertiary)]">{{ formatBytes(f.sizeBytes) }}</div>
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
