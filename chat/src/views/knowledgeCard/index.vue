<script setup lang="ts">
import { computed } from 'vue'
import { useBasicLayout } from '@/hooks/useBasicLayout'
import { useAppStore } from '@/store'
import SvgIcon from '@/components/common/SvgIcon/index.vue'

const appStore = useAppStore()
const { isSmallMd: isMobile } = useBasicLayout()

const collapsed = computed(() => appStore.siderCollapsed)

function toggleSider() {
  appStore.setSiderCollapsed(!collapsed.value)
}
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
        <div class="flex-1 overflow-y-auto">
          <!-- <KnowledgeTree /> -->
          <div class="p-8 text-center text-gray-400 text-sm">
            <SvgIcon icon="ri:tree-line" class="text-4xl mb-2 mx-auto opacity-20" />
            <p>目录树加载中...</p>
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
          <span class="hover:text-primary cursor-pointer flex items-center gap-1">
            <SvgIcon icon="ri:home-4-line" />
            首页
          </span>
          <span class="mx-2 opacity-50">/</span>
          <span class="text-gray-800 dark:text-gray-200 font-medium truncate">知识卡片查看器</span>
        </div>
      </header>

      <!-- Content Area -->
      <div class="flex-1 overflow-y-auto p-4 md:p-6">
        <div class="max-w-5xl mx-auto h-full flex flex-col">
          <!-- <CardDetail /> -->
          <div class="flex-1 flex flex-col items-center justify-center text-gray-400">
            <div class="relative">
              <SvgIcon icon="ri:book-open-line" class="text-8xl mb-4 opacity-10" />
              <SvgIcon icon="ri:search-line" class="absolute bottom-4 right-0 text-4xl opacity-20 animate-pulse" />
            </div>
            <p class="text-lg font-medium text-gray-500 dark:text-gray-400">请从左侧选择一个知识点进行查看</p>
            <p class="text-sm mt-2 opacity-60">支持 Markdown 渲染与 LaTeX 公式</p>
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
        <div class="p-4 border-b border-gray-100 dark:border-gray-100 dark:border-gray-800 flex items-center justify-between">
          <h2 class="text-lg font-semibold text-gray-800 dark:text-gray-200">知识卡片</h2>
          <button @click="toggleSider" class="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full transition-colors">
            <SvgIcon icon="ri:close-line" class="text-xl" />
          </button>
        </div>
        <div class="flex-1 overflow-y-auto">
          <div class="p-8 text-center text-gray-400 text-sm">
            <SvgIcon icon="ri:tree-line" class="text-4xl mb-2 mx-auto opacity-20" />
            <p>目录树加载中...</p>
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
