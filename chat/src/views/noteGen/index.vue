<script setup lang="ts">
import { computed, inject, onMounted, onUnmounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useAppStore, useChatStore, useGlobalStoreWithOut } from '@/store'
import { useBasicLayout } from '@/hooks/useBasicLayout'
import { message } from '@/utils/message'
import { ArrowLeft, Brightness, DarkMode, EditTwo, FilePdf, PlayOne } from '@icon-park/vue-next'
import NoteGenStatusCard from './components/NoteGenStatusCard.vue'

const router = useRouter()
const appStore = useAppStore()
const chatStore = useChatStore()
const globalStore = useGlobalStoreWithOut()
const ms = message()

// 聊天模块：将 640–767 也视为移动端（<md）
const { isSmallMd: isMobile } = useBasicLayout()
const darkMode = computed(() => appStore.theme === 'dark')
const createNewChatGroup = inject('createNewChatGroup', () => Promise.resolve()) as () => Promise<void>

function toggleTheme() {
  const mode = darkMode.value ? 'light' : 'dark'
  appStore.setTheme(mode)
}

const loading = ref(false)
const manualRefreshing = ref(false)
let timer: any = null

const selectedPdfId = computed(() => chatStore.selectedKbPdfId)
const selectedPdfName = computed(() => chatStore.selectedKbPdfName)
const activeJob = computed(() => chatStore.activeNoteGenJob)

// 初始化逻辑：从当前激活的对话组配置中恢复状态
async function restoreStateFromConfig() {
  const config = chatStore.activeConfig
  if (config?.isNoteGen) {
    // 恢复选中的 PDF 信息
    if (config.pdfId) {
      chatStore.setSelectedKbPdf(config.pdfId, config.pdfName)
    }
    // 恢复任务信息
    if (config.jobId && (!chatStore.activeNoteGenJob || chatStore.activeNoteGenJob.jobId !== config.jobId)) {
      await chatStore.syncNoteGenJobStatus(config.jobId)
    }
  }
  else {
    // 如果不是笔记生成组（比如 active === 0），则重置本地状态
    chatStore.activeNoteGenJob = null
    chatStore.setSelectedKbPdf(undefined, undefined)
    stopPolling()
  }
}

onMounted(() => {
  restoreStateFromConfig().finally(() => {
    // 自动打开知识库
    if (!selectedPdfId.value) {
      globalStore.showKnowledgeBase = true
    }

    // 如果已有任务在运行，立即刷新并开始轮询
    if (activeJob.value?.jobId && (activeJob.value.status === 'processing' || activeJob.value.status === 'created')) {
      refreshStatus()
      startPolling()
    }
    else {
      stopPolling()
    }
  })
})

// 当激活的对话组变化时（且仍然在当前页面），同步状态
watch(() => chatStore.active, () => {
  restoreStateFromConfig().finally(() => {
    if (activeJob.value?.jobId && (activeJob.value.status === 'processing' || activeJob.value.status === 'created')) {
      refreshStatus()
      startPolling()
    }
    else {
      stopPolling()
    }
  })
})

// 当选择的 PDF 发生变化时，把 pdfId/pdfName 写回当前笔记生成对话组的配置中
watch([selectedPdfId, selectedPdfName], async ([pdfId, pdfName]) => {
  const config = chatStore.activeConfig
  if (!config?.isNoteGen) return
  if (!chatStore.active) return
  if (!pdfId) return

  const nextConfig = {
    ...(config || {}),
    isNoteGen: true,
    pdfId,
    pdfName,
  }
  await chatStore.updateGroupInfo({
    groupId: chatStore.active,
    config: JSON.stringify(nextConfig),
  })
})

async function handleStart() {
  if (!selectedPdfId.value) {
    ms.warning('请先在知识库中选择一个 PDF')
    globalStore.showKnowledgeBase = true
    return
  }

  loading.value = true
  try {
    await chatStore.createNoteGenJob(selectedPdfId.value)
    ms.success('任务已提交')
    startPolling()
  } catch (error: any) {
    ms.error(error.message || '提交失败')
  } finally {
    loading.value = false
  }
}

async function handleRetry() {
  // “重试/再次发起生成”语义：再次调用创建任务接口，让后端幂等/断点续跑接管
  await handleStart()
}

async function refreshStatus(silent = false) {
  if (!activeJob.value?.jobId) return

  try {
    await chatStore.syncNoteGenJobStatus(activeJob.value.jobId, { silent })
    if (activeJob.value.status === 'processing' || activeJob.value.status === 'created') {
      // keep polling
      return
    }
    stopPolling()
  } catch (error: any) {
    // 手动刷新时提示错误；自动轮询时静默
    if (!silent) {
      ms.error(error?.message || '刷新失败')
    }
  }
}

async function handleManualRefresh() {
  if (manualRefreshing.value) return
  manualRefreshing.value = true
  try {
    await refreshStatus(false)
    ms.success('刷新成功')
  } finally {
    manualRefreshing.value = false
  }
}

function startPolling() {
  stopPolling()
  timer = setInterval(() => refreshStatus(true), 60000) // 60秒轮询一次（静默）
}

function stopPolling() {
  if (timer) {
    clearInterval(timer)
    timer = null
  }
}

function goBack() {
  router.push('/')
}

onUnmounted(() => {
  stopPolling()
})
</script>

<template>
  <div class="flex h-full w-full">
    <div class="glass-card relative overflow-hidden h-full w-full flex flex-col transition-all duration-300 ease-in-out transform">
      <!-- Header（右上角：主题切换 + 新建对话，行为与新对话页一致） -->
      <header class="sticky top-0 left-0 right-0 z-30 h-16 select-none flex items-center px-6 border-b border-[color:var(--glass-border)] bg-white/50 dark:bg-gray-900/50 backdrop-blur-sm">
        <div class="flex items-center justify-between w-full min-w-0">
          <div class="flex items-center min-w-0">
            <button class="btn-icon mr-4" @click="goBack" aria-label="返回聊天">
              <ArrowLeft size="24" />
            </button>
            <h2 class="text-xl font-bold text-[color:var(--text-primary)] truncate">笔记生成专用页</h2>
          </div>

          <div class="flex items-center flex-shrink-0">
            <div class="relative group mx-1">
              <button type="button" class="btn-icon btn-md" @click="toggleTheme" aria-label="切换主题">
                <Brightness v-if="!darkMode" size="20" aria-hidden="true" />
                <DarkMode v-else size="20" aria-hidden="true" />
              </button>
              <div v-if="!isMobile" class="tooltip tooltip-bottom">切换主题</div>
            </div>

            <div class="relative group mx-1">
              <button type="button" class="btn-icon btn-md" @click="createNewChatGroup()" aria-label="新建对话">
                <EditTwo size="20" aria-hidden="true" />
              </button>
              <div v-if="!isMobile" class="tooltip tooltip-bottom">新建对话</div>
            </div>
          </div>
        </div>
      </header>

      <!-- Main Content -->
      <main class="flex-1 overflow-y-auto p-6 relative z-10">
      <div class="max-w-4xl mx-auto space-y-8">
        
        <!-- PDF 选择展示 -->
        <section class="glass-card p-8 rounded-3xl border border-[color:var(--glass-border)] shadow-lg">
          <div class="flex items-start justify-between">
            <div class="flex items-center gap-4">
              <div class="w-16 h-16 flex items-center justify-center rounded-2xl bg-red-50 dark:bg-red-900/20 text-red-500">
                <FilePdf size="40" />
              </div>
              <div>
                <h3 class="text-lg font-bold text-[color:var(--text-primary)]">
                  {{ selectedPdfName || '未选择 PDF' }}
                </h3>
                <p class="text-sm text-[color:var(--text-tertiary)] mt-1">
                  {{ selectedPdfId ? `ID: ${selectedPdfId}` : '请从左侧知识库中选择一个文件' }}
                </p>
              </div>
            </div>
            <button 
              class="px-4 py-2 rounded-xl border border-blue-500 text-blue-500 hover:bg-blue-500 hover:text-white transition-all text-sm"
              @click="globalStore.showKnowledgeBase = true"
            >
              {{ selectedPdfId ? '重新选择' : '打开知识库' }}
            </button>
          </div>
        </section>

        <!-- 配置展示 (本期固定) -->
        <section v-if="selectedPdfId && !activeJob" class="glass-card p-8 rounded-3xl border border-[color:var(--glass-border)] shadow-lg">
          <h3 class="text-lg font-bold text-[color:var(--text-primary)] mb-4">生成配置</h3>
          <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div class="p-4 rounded-2xl bg-[color:var(--glass-bg-secondary)] border border-[color:var(--glass-border)]">
              <div class="text-xs text-[color:var(--text-tertiary)] mb-1">页码范围</div>
              <div class="text-sm font-medium">全部页面 (Mode: All)</div>
            </div>
            <div class="p-4 rounded-2xl bg-[color:var(--glass-bg-secondary)] border border-[color:var(--glass-border)]">
              <div class="text-xs text-[color:var(--text-tertiary)] mb-1">输出格式</div>
              <div class="text-sm font-medium">Markdown + Word</div>
            </div>
          </div>
          
          <div class="mt-8 flex justify-center">
            <button 
              class="flex items-center gap-2 px-12 py-4 rounded-2xl bg-blue-600 hover:bg-blue-700 text-white font-bold transition-all shadow-xl shadow-blue-600/30 disabled:opacity-50 disabled:cursor-not-allowed"
              :disabled="loading"
              @click="handleStart"
            >
              <PlayOne v-if="!loading" size="24" />
              <span v-else class="animate-spin border-2 border-white border-t-transparent rounded-full w-5 h-5"></span>
              <span>开始生成笔记</span>
            </button>
          </div>
        </section>

        <!-- 进度与结果展示 -->
        <section v-if="activeJob">
          <NoteGenStatusCard :job="activeJob" :refreshing="manualRefreshing" @refresh="handleManualRefresh" @retry="handleRetry" />
          
          <div v-if="activeJob.status === 'completed' || activeJob.status === 'failed'" class="mt-8 flex justify-center">
            <button 
              class="text-sm text-blue-500 hover:underline"
              @click="chatStore.setSelectedKbPdf(undefined, undefined); chatStore.activeNoteGenJob = null"
            >
              生成另一个 PDF
            </button>
          </div>
        </section>

        </div>
      </main>
    </div>
  </div>
</template>

<style scoped>
.glass-card {
  background: var(--glass-bg-primary);
  backdrop-filter: blur(12px);
}
</style>
