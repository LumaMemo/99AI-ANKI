<script setup lang="ts">
import { computed, ref } from 'vue'
import { useBasicLayout } from '@/hooks/useBasicLayout'
import { useAppStore, useChatStore } from '@/store'
import SvgIcon from '@/components/common/SvgIcon/index.vue'
import KnowledgeTree from './components/KnowledgeTree.vue'

const appStore = useAppStore()
const chatStore = useChatStore()
const { isSmallMd: isMobile } = useBasicLayout()

const collapsed = computed(() => appStore.siderCollapsed)
const pdfId = computed(() => chatStore.selectedKbPdfId)
const pdfName = computed(() => chatStore.selectedKbPdfName || '知识卡片查看器')

const selectedNode = ref<any>(null)

function toggleSider() {
  appStore.setSiderCollapsed(!collapsed.value)
}

function handleSelect(node: any) {
  selectedNode.value = node
  if (isMobile.value)
    appStore.setSiderCollapsed(true)
}

const isTopicSelected = computed(() => selectedNode.value?.isTopic)

const breadcrumbs = computed(() => {
  const base = [
    { name: '首页', icon: 'ri:home-4-line' },
    { name: pdfName.value },
  ]
  
  if (selectedNode.value) {
    const parts = selectedNode.value.relativePath.split('/')
    parts.forEach((part: string) => {
      base.push({ name: part, icon: '' })
    })
  }
  
  return base
})
</script>

<template>
  <div class="flex h-full w-full overflow-hidden bg-gray-50 dark:bg-[#0a0a0a]">
    <!-- Sidebar (Knowledge Tree) -->
    <aside
      v-if="!isMobile"
      class="h-full border-r border-gray-200 dark:border-gray-800 transition-all duration-300 bg-white dark:bg-[#111111] z-30"
      :class="[collapsed ? 'w-0 overflow-hidden' : 'w-[280px]']"
    >
      <div class="flex flex-col h-full w-[280px]">
        <div class="p-4 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between">
          <h2 class="text-lg font-semibold text-gray-800 dark:text-gray-200">知识卡片</h2>
        </div>
        <div class="flex-1 overflow-hidden">
          <KnowledgeTree v-if="pdfId" :pdf-id="pdfId" @select="handleSelect" />
          <div v-else class="p-8 text-center text-gray-400 text-sm">
            <SvgIcon icon="ri:error-warning-line" class="text-4xl mb-2 mx-auto opacity-20" />
            <p>未选择 PDF 文件</p>
          </div>
        </div>
      </div>
    </aside>

    <!-- Main Content -->
    <main class="flex-1 flex flex-col min-w-0 relative">
      <!-- Header / Breadcrumbs -->
      <header class="h-14 border-b border-gray-200 dark:border-gray-800 bg-white dark:bg-[#111111] flex items-center px-4 gap-4 z-20">
        <button
          class="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
          @click="toggleSider"
        >
          <SvgIcon 
            :icon="collapsed ? 'ri:menu-unfold-line' : 'ri:menu-fold-line'" 
            class="text-xl text-gray-600 dark:text-gray-400" 
          />
        </button>
        
        <div class="flex items-center text-sm text-gray-500 dark:text-gray-400 overflow-hidden whitespace-nowrap">
          <template v-for="(item, index) in breadcrumbs" :key="index">
            <span 
              class="flex items-center gap-1"
              :class="index === breadcrumbs.length - 1 ? 'text-gray-800 dark:text-gray-200 font-medium' : 'hover:text-primary cursor-pointer'"
            >
              <SvgIcon v-if="item.icon" :icon="item.icon" />
              {{ item.name }}
            </span>
            <span v-if="index < breadcrumbs.length - 1" class="mx-2 opacity-50">/</span>
          </template>
        </div>
      </header>

      <!-- Content Area -->
      <div class="flex-1 overflow-y-auto p-4 md:p-6 bg-gray-50/50 dark:bg-transparent">
        <div class="max-w-7xl mx-auto h-full">
          <!-- 场景 1: 未选中任何内容 -->
          <div v-if="!selectedNode" class="h-full flex flex-col items-center justify-center text-gray-400">
            <div class="relative">
              <SvgIcon icon="ri:book-open-line" class="text-8xl mb-4 opacity-10" />
              <SvgIcon icon="ri:search-line" class="absolute bottom-4 right-0 text-4xl opacity-20 animate-pulse" />
            </div>
            <p class="text-lg font-medium text-gray-500 dark:text-gray-400">请从左侧选择一个知识点进行查看</p>
            <p class="text-sm mt-2 opacity-60">支持 Windows 风格目录浏览与艺术化卡片展示</p>
          </div>

          <!-- 场景 2: 选中了知识点 (Topic) -> 显示详情页 -->
          <div v-else-if="isTopicSelected" class="animate-in fade-in slide-in-from-bottom-4 duration-500">
            <!-- <CardDetail :node="selectedNode" /> -->
            <div class="p-12 text-center border-2 border-dashed border-gray-200 dark:border-gray-800 rounded-2xl">
              <SvgIcon icon="ri:artboard-line" class="text-6xl mb-4 text-primary opacity-20" />
              <h3 class="text-xl font-semibold text-gray-800 dark:text-gray-200">{{ selectedNode.name }}</h3>
              <p class="mt-2 text-gray-500">详情渲染器 (Step 5) 正在开发中...</p>
            </div>
          </div>

          <!-- 场景 3: 选中了目录 (Folder) -> 显示卡片网格 (Topic Grid) -->
          <div v-else class="animate-in fade-in duration-500">
            <!-- <TopicGrid :nodes="selectedNode.children" /> -->
            <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              <div v-for="child in selectedNode.children" :key="child.path" 
                   class="p-4 bg-white dark:bg-[#181818] border border-gray-100 dark:border-gray-800 rounded-xl shadow-sm hover:shadow-md transition-all cursor-pointer group"
                   @click="handleSelect(child)">
                <div class="flex items-start justify-between mb-2">
                  <SvgIcon :icon="child.isTopic ? 'ri:file-list-2-line' : 'ri:folder-line'" 
                           :class="child.isTopic ? 'text-amber-500' : 'text-blue-400'" class="text-2xl" />
                  <SvgIcon icon="ri:arrow-right-up-line" class="opacity-0 group-hover:opacity-100 transition-opacity text-gray-400" />
                </div>
                <div class="font-medium text-gray-800 dark:text-gray-200 truncate">{{ child.name }}</div>
                <div class="text-xs text-gray-400 mt-1">
                  {{ child.isTopic ? '知识点卡片' : '子目录' }}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </main>

    <!-- Mobile Drawer Overlay -->
    <Transition name="fade">
      <div
        v-if="isMobile && !collapsed"
        class="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm"
        @click="toggleSider"
      ></div>
    </Transition>
    
    <!-- Mobile Sidebar -->
    <aside
      v-if="isMobile"
      class="fixed top-0 left-0 bottom-0 z-50 w-[280px] bg-white dark:bg-[#111111] transition-transform duration-300 shadow-2xl"
      :class="[collapsed ? '-translate-x-full' : 'translate-x-0']"
    >
       <div class="flex flex-col h-full">
        <div class="p-4 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between">
          <h2 class="text-lg font-semibold text-gray-800 dark:text-gray-200">知识卡片</h2>
          <button @click="toggleSider" class="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full transition-colors">
            <SvgIcon icon="ri:close-line" class="text-xl" />
          </button>
        </div>
        <div class="flex-1 overflow-hidden">
          <KnowledgeTree v-if="pdfId" :pdf-id="pdfId" @select="handleSelect" />
          <div v-else class="p-8 text-center text-gray-400 text-sm">
            <SvgIcon icon="ri:error-warning-line" class="text-4xl mb-2 mx-auto opacity-20" />
            <p>未选择 PDF 文件</p>
          </div>
        </div>
      </div>
    </aside>
  </div>
</template>

<style scoped>
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.3s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

/* 隐藏滚动条但保持功能 */
.overflow-y-auto {
  scrollbar-width: thin;
  scrollbar-color: rgba(0, 0, 0, 0.1) transparent;
}

.dark .overflow-y-auto {
  scrollbar-color: rgba(255, 255, 255, 0.1) transparent;
}
</style>
