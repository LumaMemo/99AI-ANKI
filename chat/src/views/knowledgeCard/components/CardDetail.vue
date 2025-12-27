<script setup lang="ts">
import { onMounted, ref, watch, computed } from 'vue'
import { fetchKbCardDetailAPI } from '@/api/kb'
import SvgIcon from '@/components/common/SvgIcon/index.vue'
import MarkdownRenderer from './MarkdownRenderer.vue'
import { message } from '@/utils/message'
import { copyText } from '@/utils/format'

interface Props {
  pdfId: number
  path: string
  name: string
  keyword?: string
}

const props = defineProps<Props>()

const loading = ref(false)
const cardData = ref<any>(null)

const paradigms: Record<string, { color: string; label: string; icon: string }> = {
  'Concept': { color: '#60A5FA', label: '概念', icon: 'ri:book-mark-line' },
  'Fact': { color: '#34D399', label: '事实', icon: 'ri:shield-check-line' },
  'Rule': { color: '#A78BFA', label: '规则', icon: 'ri:scales-3-line' },
  'Logic': { color: '#A78BFA', label: '逻辑', icon: 'ri:node-tree' },
  'Procedure': { color: '#FBBF24', label: '过程', icon: 'ri:guide-line' },
  'Symbol': { color: '#F87171', label: '符号', icon: 'ri:functions' },
  'Case': { color: '#2DD4BF', label: '案例', icon: 'ri:flask-line' },
}

const currentParadigm = computed(() => {
  const type = cardData.value?.type || 'Concept'
  return paradigms[type] || paradigms['Concept']
})

async function loadDetail() {
  if (!props.pdfId || !props.path) return
  loading.value = true
  try {
    const res = await fetchKbCardDetailAPI({ pdfId: props.pdfId, path: props.path })
    if (res.code === 200) {
      cardData.value = res.data
    }
  } catch (error) {
    console.error('Failed to load card detail:', error)
    message.error('加载知识点详情失败')
  } finally {
    loading.value = false
  }
}

function formatKey(key: string) {
  return key
    .split('_')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
}

function handleCopyId() {
  if (cardData.value?.uid) {
    copyText(cardData.value.uid)
    message.success('ID 已复制')
  }
}

onMounted(() => {
  loadDetail()
})

watch(() => props.path, () => {
  loadDetail()
})

// Recursive Content Component (Internal)
</script>

<template>
  <div class="card-detail-container flex flex-col">
    <div v-if="loading" class="py-16 flex flex-col items-center justify-center text-gray-400">
      <SvgIcon icon="ri:loader-4-line" class="text-6xl mb-4 animate-spin opacity-20" />
      <p>正在加载知识点详情...</p>
    </div>

    <div v-else-if="cardData" class="flex flex-col animate-in fade-in slide-in-from-bottom-4 duration-500">
      <!-- Card Header -->
      <div 
        class="relative p-8 rounded-t-3xl bg-white dark:bg-[#181818] border-b border-gray-100 dark:border-gray-800 shadow-sm"
        :style="{ borderTop: `6px solid ${currentParadigm.color}` }"
      >
        <div class="flex flex-col items-center text-center">
          <div 
            class="px-3 py-1 rounded-full text-xs font-medium mb-4 flex items-center gap-1.5"
            :style="{ backgroundColor: `${currentParadigm.color}20`, color: currentParadigm.color }"
          >
            <SvgIcon :icon="currentParadigm.icon" />
            {{ currentParadigm.label }}
          </div>
          
          <h1 class="text-2xl md:text-3xl font-bold text-gray-800 dark:text-gray-100 mb-4 leading-tight">
            {{ cardData.topic }}
          </h1>

          <div class="flex items-center gap-4 text-sm text-gray-500">
            <div class="flex items-center gap-1">
              <SvgIcon icon="ri:star-line" class="text-amber-400" />
              难度: {{ cardData.difficulty || '普通' }}
            </div>
            <div class="flex items-center gap-1">
              <SvgIcon icon="ri:pages-line" />
              页码: P{{ cardData.page_idx }}
            </div>
          </div>
        </div>
      </div>

      <!-- Card Body (Recursive Content) -->
      <div class="p-6 md:p-10 bg-white dark:bg-[#181818]">
        <div class="max-w-4xl mx-auto space-y-8">
          <div v-for="(value, key) in cardData.content" :key="key" class="content-section">
            <h2 class="text-lg font-bold text-gray-800 dark:text-gray-200 mb-4 flex items-center gap-2">
              <span class="w-1.5 h-5 rounded-full" :style="{ backgroundColor: currentParadigm.color }"></span>
              {{ formatKey(key) }}
            </h2>
            
            <div class="pl-3.5 border-l border-gray-100 dark:border-gray-800 ml-0.5">
              <RecursiveRenderer :value="value" :color="currentParadigm.color" :keyword="keyword" />
            </div>
          </div>
        </div>
      </div>

      <!-- Card Footer -->
      <div class="p-6 bg-gray-50 dark:bg-[#111111] border-t border-gray-100 dark:border-gray-800 rounded-b-3xl flex flex-col sm:flex-row items-center justify-between gap-4">
        <div class="text-xs text-gray-400 font-mono">
          UID: {{ cardData.uid }}
        </div>
        <div class="flex items-center gap-2">
          <button 
            @click="handleCopyId"
            class="flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-800 rounded-lg transition-colors"
          >
            <SvgIcon icon="ri:file-copy-line" />
            复制 ID
          </button>
          <button 
            class="flex items-center gap-1.5 px-4 py-2 text-sm font-medium bg-primary text-white hover:bg-primary-dark rounded-lg transition-colors shadow-lg shadow-primary/20"
          >
            <SvgIcon icon="ri:download-2-line" />
            导出卡片
          </button>
        </div>
      </div>
    </div>

    <div v-else class="py-16 flex flex-col items-center justify-center text-gray-400">
      <SvgIcon icon="ri:error-warning-line" class="text-6xl mb-4 opacity-20" />
      <p>未找到该知识点的详细内容</p>
      <button @click="loadDetail" class="mt-4 text-primary hover:underline">重试</button>
    </div>
  </div>
</template>

<script lang="ts">
// Define the recursive renderer as a separate component in the same file for simplicity
import { defineComponent, h, PropType } from 'vue'
import MarkdownRenderer from './MarkdownRenderer.vue'

const RecursiveRenderer = defineComponent({
  name: 'RecursiveRenderer',
  props: {
    value: {
      type: [String, Object, Array] as PropType<any>,
      required: true
    },
    color: {
      type: String,
      required: true
    },
    depth: {
      type: Number,
      default: 0
    },
    keyword: {
      type: String,
      default: ''
    }
  },
  setup(props) {
    return () => {
      const { value, color, depth, keyword } = props

      // Case 1: String (Markdown)
      if (typeof value === 'string') {
        return h(MarkdownRenderer, { content: value, highlight: keyword })
      }

      // Case 2: Array
      if (Array.isArray(value)) {
        // If it's an array of strings, render as a list
        if (value.every(item => typeof item === 'string')) {
          return h('ul', { class: 'list-disc space-y-2' }, 
            value.map(item => h('li', null, [h(MarkdownRenderer, { content: item, highlight: keyword })]))
          )
        }
        
        // If it's an array of objects, render with "Item X" headers
        return h('div', { class: 'space-y-6' }, 
          value.map((item, index) => h('div', { class: 'item-wrapper' }, [
            h('h4', { 
              class: 'text-sm font-bold mb-3 uppercase tracking-wider opacity-50',
              style: { color }
            }, `Item ${index + 1}`),
            h(RecursiveRenderer, { value: item, color, depth: depth + 1, keyword })
          ]))
        )
      }

      // Case 3: Object
      if (typeof value === 'object' && value !== null) {
        return h('div', { class: 'space-y-6' }, 
          Object.entries(value).map(([k, v]) => h('div', { class: 'sub-section' }, [
            h('h4', { 
              class: 'text-sm font-bold mb-3 flex items-center gap-2',
              style: { color }
            }, [
              h('span', { class: 'w-1 h-1 rounded-full', style: { backgroundColor: color } }),
              k.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')
            ]),
            h('div', { class: 'pl-3 border-l border-gray-50 dark:border-gray-800' }, [
              h(RecursiveRenderer, { value: v, color, depth: depth + 1, keyword })
            ])
          ]))
        )
      }

      return null
    }
  }
})
</script>

<style scoped>
.content-section:last-child {
  margin-bottom: 0;
}
</style>
