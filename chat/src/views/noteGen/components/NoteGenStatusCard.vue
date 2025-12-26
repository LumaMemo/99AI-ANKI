<script setup lang="ts">
import { computed } from 'vue'
import { Download, Refresh, Loading } from '@icon-park/vue-next'
import { fetchNoteGenFileSignedUrl } from '@/api/noteGen'

const props = defineProps<{
  job: any
  refreshing?: boolean
}>()

const emit = defineEmits<{
  (e: 'refresh'): void
  (e: 'retry'): void
}>()

const status = computed(() => props.job?.status || 'created')
const progress = computed(() => props.job?.progressPercent || 0)
const userMessage = computed(() => props.job?.userMessage)
const refreshing = computed(() => !!props.refreshing)

const statusLabel = computed(() => {
  if (status.value === 'completed') return '已完成'
  if (status.value === 'failed') return '失败'
  if (status.value === 'incomplete') return '未完成'
  return '队列中'
})

// 6段进度条计算
const progressSegments = computed(() => {
  const segmentCount = 6
  const step = 100 / segmentCount
  const currentProgress = Math.max(0, Math.min(100, Number(progress.value) || 0))

  const filledCount = currentProgress <= 0 ? 0 : Math.min(segmentCount, Math.ceil(currentProgress / step))
  const showActive = status.value === 'processing' || status.value === 'created'

  return Array.from({ length: segmentCount }, (_, index) => {
    const position = index + 1
    const completed = position <= filledCount
    const active = showActive && !completed && position === filledCount + 1
    return { completed, active }
  })
})

async function handleDownload(fileType: 'markdown-markmap' | 'word') {
  try {
    const res = await fetchNoteGenFileSignedUrl(props.job.jobId, fileType)
    const url = (res as any)?.data?.url || (res as any)?.url
    if (url) {
      window.open(url, '_blank')
    }
  } catch (error: any) {
    window.alert(error.message || '下载失败')
  }
}

function handleRefresh() {
  if (refreshing.value) return
  emit('refresh')
}

function handleRetry() {
  emit('retry')
}

function getSegmentClass(seg: any) {
  if (seg.completed) return 'bg-blue-500'
  if (seg.active) return 'bg-blue-300 animate-pulse'
  return 'bg-gray-200 dark:bg-gray-700'
}
</script>

<template>
  <div class="p-6 glass-card border border-glass-custom rounded-3xl shadow-xl max-w-2xl mx-auto w-full">
    <div class="flex items-center justify-between mb-6">
      <h3 class="text-lg font-bold text-primary-custom">生成进度</h3>
      <div class="flex items-center gap-2">
        <span v-if="status === 'processing'" class="text-xs text-blue-500 flex items-center gap-1">
          <Loading class="animate-spin" /> 处理中...
        </span>
        <button 
          v-if="status === 'processing' || status === 'created'"
          class="btn-icon btn-sm" 
          @click="handleRefresh"
          :disabled="refreshing"
          :class="{ 'opacity-60 cursor-not-allowed': refreshing }"
        >
          <Loading v-if="refreshing" class="animate-spin" size="16" />
          <Refresh v-else size="16" />
        </button>
      </div>
    </div>

    <!-- 6段进度条 -->
    <div class="flex gap-2 mb-4">
      <div 
        v-for="(seg, index) in progressSegments" 
        :key="index"
        class="h-2 flex-1 rounded-full transition-all duration-500"
        :class="getSegmentClass(seg)"
      ></div>
    </div>
    
    <div class="flex justify-between text-sm text-secondary-custom mb-8">
      <span>进度: {{ progress }}%</span>
      <span :class="{
        'text-green-500': status === 'completed',
        'text-red-500': status === 'failed',
        'text-orange-500': status === 'incomplete'
      }">
        {{ statusLabel }}
      </span>
    </div>

    <!-- 后台运行提示 -->
    <div v-if="status === 'processing' || status === 'created'" class="mb-8 p-4 bg-blue-50/50 dark:bg-blue-900/20 border border-blue-100 dark:border-blue-800/50 rounded-2xl text-xs text-blue-500/80 flex items-start gap-2">
      <span class="flex-shrink-0 w-1.5 h-1.5 rounded-full bg-blue-500 mt-1.5"></span>
      <p>任务正在后台处理中，您可以离开此页面进行其他操作。处理完成后，您可以随时回到此页面查看并下载笔记。</p>
    </div>

    <!-- 错误/提示信息 -->
    <div v-if="userMessage" class="mb-6 p-4 bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-800 rounded-xl text-sm text-orange-600 dark:text-orange-400">
      {{ userMessage }}
    </div>

    <!-- 下载区域 -->
    <div v-if="status === 'completed'" class="grid grid-cols-1 sm:grid-cols-2 gap-4">
      <button 
        class="flex items-center justify-center gap-2 p-4 rounded-2xl bg-blue-500 hover:bg-blue-600 text-white transition-colors shadow-lg shadow-blue-500/20"
        @click="handleDownload('markdown-markmap')"
      >
        <Download size="20" />
        <span>下载 Markdown/思维导图</span>
      </button>
      <button 
        class="flex items-center justify-center gap-2 p-4 rounded-2xl bg-indigo-500 hover:bg-indigo-600 text-white transition-colors shadow-lg shadow-indigo-500/20"
        @click="handleDownload('word')"
      >
        <Download size="20" />
        <span>下载 Word 笔记</span>
      </button>
    </div>

    <!-- 重试按钮 -->
    <div v-if="status === 'failed' || status === 'incomplete'" class="flex justify-center">
      <button 
        class="px-8 py-3 rounded-2xl btn-primary-custom text-white hover:opacity-90 transition-opacity"
        @click="handleRetry"
      >
        重试 / 再次发起生成
      </button>
    </div>
  </div>
</template>

<style scoped>
.glass-card {
  background: var(--glass-bg-primary);
  backdrop-filter: blur(12px);
}
.text-primary-custom {
  color: var(--text-primary);
}
.text-secondary-custom {
  color: var(--text-secondary);
}
.border-glass-custom {
  border-color: var(--glass-border);
}
.btn-primary-custom {
  background-color: var(--btn-bg-primary);
}
</style>
