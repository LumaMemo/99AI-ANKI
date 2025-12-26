<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useBasicLayout } from '@/hooks/useBasicLayout'
import { useAppStore, useChatStore } from '@/store'
import SvgIcon from '@/components/common/SvgIcon/index.vue'
import KnowledgeTree from './components/KnowledgeTree.vue'
import TopicGrid from './components/TopicGrid.vue'
import CardDetail from './components/CardDetail.vue'
import PdfSelector from './components/PdfSelector.vue'

import { fetchKbCardTreeAPI } from '@/api/kb'

const route = useRoute()
const router = useRouter()
const appStore = useAppStore()
const chatStore = useChatStore()
const { isSmallMd: isMobile } = useBasicLayout()

const collapsed = computed(() => appStore.siderCollapsed)
const pdfId = computed(() => chatStore.selectedKbPdfId)
const pdfName = computed(() => chatStore.selectedKbPdfName || '知识卡片查看器')

const selectedNode = ref<any>(null)
const rootNodes = ref<any[]>([])
const loading = ref(false)

// Load root nodes for the grid when PDF changes
async function loadRootNodes() {
  if (!pdfId.value) return
  loading.value = true
  try {
    const res = await fetchKbCardTreeAPI(pdfId.value)
    if (res.code === 200) {
      rootNodes.value = res.data
    }
  } catch (error) {
    console.error('Failed to load root nodes:', error)
  } finally {
    loading.value = false
  }
}

watch(pdfId, (newId) => {
  if (newId) {
    loadRootNodes()
    selectedNode.value = null
  } else {
    rootNodes.value = []
  }
}, { immediate: true })

// Sync route query to store
watch(() => route.query.pdfId, (newId) => {
  if (newId) {
    const id = Number(newId)
    if (chatStore.selectedKbPdfId !== id) {
      chatStore.setSelectedKbPdf(id, (route.query.pdfName as string) || chatStore.selectedKbPdfName)
    }
  }
}, { immediate: true })

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

function handlePdfSelect(pdf: any) {
  chatStore.setSelectedKbPdf(pdf.id, pdf.displayName || pdf.originalName)
  router.replace({
    path: '/knowledge-card',
    query: { pdfId: pdf.id, pdfName: pdf.displayName || pdf.originalName }
  })
}

function resetSelection() {
  selectedNode.value = null
}

function handleBack() {
  if (selectedNode.value) {
    // If we have a way to find parent, we should go to parent. 
    // For now, going back to root grid is a good start.
    selectedNode.value = null
  } else if (pdfId.value) {
    backToPdfList()
  } else {
    router.back()
  }
}

function backToPdfList() {
  chatStore.setSelectedKbPdf(undefined, undefined)
  selectedNode.value = null
  router.replace({ path: '/knowledge-card' })
}

const isLeafNode = computed(() => selectedNode.value?.isLeaf || selectedNode.value?.isTopic)

const breadcrumbs = computed(() => {
  const base = [
    { name: '卡片库', icon: 'ri:layout-grid-line', action: backToPdfList },
  ]
  
  if (pdfId.value) {
    base.push({ name: pdfName.value, icon: 'ri:file-pdf-line', action: resetSelection })
  }
  
  if (selectedNode.value) {
    // If it's a leaf, we might want to show the path? 
    // For now just the name.
    base.push({ name: selectedNode.value.name, icon: isLeafNode.value ? 'ri:file-text-line' : 'ri:folder-open-line' })
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
            <SvgIcon icon="ri:file-list-3-line" class="text-4xl mb-2 mx-auto opacity-20" />
            <p>请先选择一个 PDF 文件</p>
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
      <header class="h-14 border-b border-gray-200 dark:border-gray-800 bg-white dark:bg-[#111111] flex items-center px-4 gap-2 z-20">
        <button
          class="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors text-gray-600 dark:text-gray-400"
          @click="handleBack"
          title="返回"
        >
          <SvgIcon icon="ri:arrow-left-line" class="text-xl" />
        </button>

        <div class="w-px h-6 bg-gray-200 dark:bg-gray-800 mx-1"></div>

        <button
          v-if="pdfId"
          class="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
          @click="toggleSider"
          title="切换目录"
        >
          <SvgIcon 
            :icon="collapsed ? 'ri:menu-unfold-line' : 'ri:menu-fold-line'" 
            class="text-xl text-gray-600 dark:text-gray-400" 
          />
        </button>
        
        <div class="flex items-center text-sm text-gray-500 dark:text-gray-400 overflow-hidden whitespace-nowrap ml-2">
          <template v-for="(item, index) in breadcrumbs" :key="index">
            <span 
              class="flex items-center gap-1.5 transition-colors"
              :class="index === breadcrumbs.length - 1 ? 'text-gray-800 dark:text-gray-200 font-medium' : 'hover:text-primary cursor-pointer'"
              @click="item.action?.()"
            >
              <SvgIcon v-if="item.icon" :icon="item.icon" :class="index === breadcrumbs.length - 1 ? 'text-primary' : ''" />
              {{ item.name }}
            </span>
            <span v-if="index < breadcrumbs.length - 1" class="mx-2 opacity-30">
              <SvgIcon icon="ri:arrow-right-s-line" />
            </span>
          </template>
        </div>
      </header>

      <!-- Content Area -->
      <div class="flex-1 overflow-hidden bg-gray-50/50 dark:bg-transparent">
        <Transition name="fade" mode="out-in">
          <!-- Case 0: No PDF selected -> Show PDF Selector -->
          <div v-if="!pdfId" class="h-full">
            <PdfSelector @select="handlePdfSelect" />
          </div>

          <!-- Case 1: No selection or Folder selected -> Show Topic Grid -->
          <div v-else-if="!selectedNode || !isLeafNode" class="h-full">
            <TopicGrid 
              v-if="selectedNode?.children || (!selectedNode && rootNodes.length > 0)"
              :topics="selectedNode?.children || rootNodes"
              :parent-name="selectedNode?.name || pdfName"
              @select="handleGridSelect"
            />
            <div v-else-if="loading" class="h-full flex items-center justify-center">
              <div class="flex flex-col items-center gap-3">
                <div class="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full"></div>
                <p class="text-sm text-gray-400">加载知识目录...</p>
              </div>
            </div>
            <div v-else class="h-full flex flex-col items-center justify-center text-gray-400">
              <div class="text-center animate-in fade-in zoom-in duration-700">
                <SvgIcon icon="ri:inbox-line" class="text-8xl mb-6 opacity-5 mx-auto" />
                <h3 class="text-xl font-medium text-gray-400 dark:text-gray-600">暂无知识内容</h3>
                <p class="mt-2 text-sm opacity-60">该 PDF 尚未生成知识卡片</p>
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
