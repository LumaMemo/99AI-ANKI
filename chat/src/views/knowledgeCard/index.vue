<script setup lang="ts">
import { computed, ref } from 'vue'
import { useBasicLayout } from '@/hooks/useBasicLayout'
import { useAppStore, useChatStore } from '@/store'
import SvgIcon from '@/components/common/SvgIcon/index.vue'
import KnowledgeTree from './components/KnowledgeTree.vue'
import TopicGrid from './components/TopicGrid.vue'
import CardDetail from './components/CardDetail.vue'

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

function handleGridSelect(item: any) {
  selectedNode.value = item
}

function resetSelection() {
  selectedNode.value = null
}

const isLeafNode = computed(() => selectedNode.value?.isLeaf || selectedNode.value?.isTopic)

const breadcrumbs = computed(() => {
  const base = [
    { name: '首页', icon: 'ri:home-4-line', action: resetSelection },
    { name: pdfName.value, icon: '' },
  ]
  
  if (selectedNode.value) {
    // Simple breadcrumb for now, can be improved with full path logic
    base.push({ name: selectedNode.value.name, icon: '' })
  }
  
  return base
})
</script>

<template>
  <div class="flex h-full w-full overflow-hidden bg-gray-50 dark:bg-[#0a0a0a]">
    <!-- Sidebar (Knowledge Tree) - Desktop -->
    <aside
      v-if="!isMobile"
      class="h-full border-r border-gray-200 dark:border-gray-800 transition-all duration-300 bg-white dark:bg-[#111111] z-30"
      :class="[collapsed ? 'w-0 overflow-hidden' : 'w-[280px]']"
    >
      <div class="flex flex-col h-full w-[280px]">
        <div class="p-4 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between">
          <h2 class="text-lg font-semibold text-gray-800 dark:text-gray-200 flex items-center gap-2">
            <SvgIcon icon="ri:book-3-line" class="text-primary" />
            知识目录
          </h2>
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

    <!-- Mobile Sidebar Overlay -->
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
          <h2 class="text-lg font-semibold text-gray-800 dark:text-gray-200 flex items-center gap-2">
            <SvgIcon icon="ri:book-3-line" class="text-primary" />
            知识目录
          </h2>
          <button @click="toggleSider" class="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full transition-colors">
            <SvgIcon icon="ri:close-line" class="text-xl" />
          </button>
        </div>
        <div class="flex-1 overflow-hidden">
          <KnowledgeTree v-if="pdfId" :pdf-id="pdfId" @select="handleSelect" />
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
              @click="item.action?.()"
            >
              <SvgIcon v-if="item.icon" :icon="item.icon" />
              {{ item.name }}
            </span>
            <span v-if="index < breadcrumbs.length - 1" class="mx-2 opacity-50">/</span>
          </template>
        </div>
      </header>

      <!-- Content Area -->
      <div class="flex-1 overflow-hidden bg-gray-50/50 dark:bg-transparent">
        <Transition name="fade" mode="out-in">
          <!-- Case 1: No selection or Folder selected -> Show Topic Grid -->
          <div v-if="!selectedNode || !isLeafNode" class="h-full">
            <TopicGrid 
              v-if="selectedNode?.children"
              :topics="selectedNode.children"
              :parent-name="selectedNode.name"
              @select="handleGridSelect"
            />
            <div v-else-if="!selectedNode" class="h-full flex flex-col items-center justify-center text-gray-400">
              <div class="text-center animate-in fade-in zoom-in duration-700">
                <SvgIcon icon="ri:layout-grid-line" class="text-8xl mb-6 opacity-5 mx-auto" />
                <h3 class="text-xl font-medium text-gray-400 dark:text-gray-600">开启你的知识探索之旅</h3>
                <p class="mt-2 text-sm opacity-60">从左侧目录中选择一个章节或知识点</p>
              </div>
            </div>
          </div>

          <!-- Case 2: Leaf node selected -> Show Card Detail -->
          <div v-else class="h-full p-4 md:p-8">
            <div class="max-w-5xl mx-auto h-full">
              <CardDetail 
                v-if="pdfId"
                :pdf-id="pdfId"
                :path="selectedNode.path"
                :name="selectedNode.name"
              />
            </div>
          </div>
        </Transition>
      </div>
    </main>
  </div>
</template>

<style scoped>
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
