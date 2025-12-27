<script setup lang="ts">
import { computed } from 'vue'
import SvgIcon from '@/components/common/SvgIcon/index.vue'

interface TopicItem {
  name: string
  displayName?: string
  startPage?: number
  endPage?: number
  path: string
  isLeaf: boolean
  children?: TopicItem[]
}

interface Props {
  topics: TopicItem[]
  parentName: string
}

const props = defineProps<Props>()
const emit = defineEmits(['select'])

const sortedTopics = computed(() => {
  // If the backend already sorted them (which it should now), we just return them.
  // But we keep the folder-first logic as a fallback if needed.
  return [...props.topics]
})

function handleSelect(item: TopicItem) {
  emit('select', item)
}
</script>

<template>
  <div class="topic-grid-container p-6 md:p-10 h-full overflow-y-auto">
    <div class="max-w-6xl mx-auto">
      <div class="mb-8">
        <h2 class="text-2xl font-bold text-gray-800 dark:text-gray-100 mb-2">
          {{ parentName }}
        </h2>
        <p class="text-gray-500 text-sm">
          共包含 {{ topics.length }} 个知识点和目录
        </p>
      </div>

      <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        <div 
          v-for="item in sortedTopics" 
          :key="item.path"
          @click="handleSelect(item)"
          class="group relative p-5 rounded-2xl border border-gray-100 dark:border-gray-800 bg-white dark:bg-[#181818] hover:border-primary/30 hover:shadow-xl hover:shadow-primary/5 transition-all cursor-pointer overflow-hidden"
        >
          <!-- Background Accent -->
          <div 
            class="absolute top-0 right-0 w-24 h-24 -mr-8 -mt-8 rounded-full opacity-[0.03] group-hover:opacity-[0.08] transition-opacity"
            :class="item.isLeaf ? 'bg-primary' : 'bg-amber-500'"
          ></div>

          <div class="flex items-start gap-4 relative z-10">
            <div 
              class="w-12 h-12 rounded-xl flex items-center justify-center shrink-0 transition-transform group-hover:scale-110"
              :class="item.isLeaf ? 'bg-blue-50 text-blue-500 dark:bg-blue-500/10' : 'bg-amber-50 text-amber-500 dark:bg-amber-500/10'"
            >
              <SvgIcon :icon="item.isLeaf ? 'ri:file-list-3-line' : 'ri:folder-line'" class="text-2xl" />
            </div>

            <div class="flex-1 min-w-0">
              <h3 class="font-bold text-gray-800 dark:text-gray-200 mb-1 truncate group-hover:text-primary transition-colors">
                {{ item.displayName || item.name }}
              </h3>
              <div class="flex items-center gap-2">
                <p class="text-xs text-gray-400 truncate">
                  {{ item.isLeaf ? '知识卡片' : '目录' }}
                </p>
                <span v-if="item.startPage !== undefined && item.startPage !== null" class="text-[10px] px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-800 text-gray-400 font-mono">
                  P{{ item.startPage }}{{ item.endPage && item.endPage !== item.startPage ? `-${item.endPage}` : '' }}
                </span>
              </div>
            </div>
          </div>

          <div class="mt-4 flex items-center justify-between text-xs text-gray-400 relative z-10">
            <span v-if="!item.isLeaf" class="flex items-center gap-1">
              <SvgIcon icon="ri:node-tree" />
              {{ item.children?.length || 0 }} 子项
            </span>
            <span v-else class="flex items-center gap-1">
              <SvgIcon icon="ri:time-line" />
              待复习
            </span>
            
            <div class="opacity-0 group-hover:opacity-100 transition-opacity text-primary flex items-center gap-0.5 font-medium">
              查看
              <SvgIcon icon="ri:arrow-right-s-line" />
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.topic-grid-container {
  scrollbar-width: thin;
  scrollbar-color: rgba(0, 0, 0, 0.05) transparent;
}

.dark .topic-grid-container {
  scrollbar-color: rgba(255, 255, 255, 0.05) transparent;
}
</style>
