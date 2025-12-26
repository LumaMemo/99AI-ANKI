<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { fetchKbFilesAPI, fetchKbFoldersTreeAPI } from '@/api/kb'
import SvgIcon from '@/components/common/SvgIcon/index.vue'

const emit = defineEmits(['select'])

const loading = ref(false)
const folders = ref<any[]>([])
const files = ref<any[]>([])
const currentFolderId = ref(0)
const breadcrumbs = ref([{ id: 0, name: '根目录' }])

async function loadData(folderId: number = 0) {
  loading.value = true
  try {
    const [foldersRes, filesRes] = await Promise.all([
      fetchKbFoldersTreeAPI(),
      fetchKbFilesAPI({ folderId, page: 1, size: 100 })
    ])
    
    // Process folders for current level
    if (folderId === 0) {
      folders.value = foldersRes.data?.children || []
    } else {
      // Find current folder in tree to get its children
      const findFolder = (nodes: any[], id: number): any => {
        for (const node of nodes) {
          if (node.id === id) return node
          if (node.children) {
            const found = findFolder(node.children, id)
            if (found) return found
          }
        }
        return null
      }
      const current = findFolder([foldersRes.data], folderId)
      folders.value = current?.children || []
    }
    
    files.value = filesRes.data?.rows || []
  } catch (error) {
    console.error('Failed to load KB data:', error)
  } finally {
    loading.value = false
  }
}

function handleFolderClick(folder: any) {
  currentFolderId.value = folder.id
  breadcrumbs.value.push({ id: folder.id, name: folder.name })
  loadData(folder.id)
}

function handleBreadcrumbClick(item: any, index: number) {
  currentFolderId.value = item.id
  breadcrumbs.value = breadcrumbs.value.slice(0, index + 1)
  loadData(item.id)
}

function handlePdfClick(pdf: any) {
  emit('select', pdf)
}

onMounted(() => {
  loadData()
})
</script>

<template>
  <div class="h-full flex flex-col p-6 md:p-10">
    <div class="max-w-6xl mx-auto w-full flex-1 flex flex-col">
      <div class="mb-8">
        <h1 class="text-3xl font-bold text-gray-800 dark:text-gray-100 flex items-center gap-3">
          <div class="w-12 h-12 rounded-2xl bg-purple-500 flex items-center justify-center shadow-lg shadow-purple-500/20">
            <SvgIcon icon="ri:layout-grid-fill" class="text-white text-2xl" />
          </div>
          知识卡片库
        </h1>
        <p class="mt-3 text-gray-500 dark:text-gray-400">选择一个 PDF 文件以开始探索结构化知识卡片</p>
      </div>

      <!-- Breadcrumbs -->
      <div class="flex items-center gap-2 mb-6 text-sm text-gray-500 overflow-x-auto pb-2">
        <template v-for="(item, index) in breadcrumbs" :key="item.id">
          <span 
            class="hover:text-primary cursor-pointer whitespace-nowrap transition-colors"
            @click="handleBreadcrumbClick(item, index)"
          >
            {{ item.name }}
          </span>
          <span v-if="index < breadcrumbs.length - 1" class="opacity-30">/</span>
        </template>
      </div>

      <div v-if="loading" class="flex-1 flex items-center justify-center">
        <div class="flex flex-col items-center gap-3">
          <div class="w-10 h-10 border-4 border-purple-500/20 border-t-purple-500 rounded-full animate-spin"></div>
          <span class="text-sm text-gray-400">加载知识库...</span>
        </div>
      </div>

      <div v-else-if="!folders.length && !files.length" class="flex-1 flex flex-col items-center justify-center text-gray-400">
        <SvgIcon icon="ri:folder-open-line" class="text-6xl mb-4 opacity-20" />
        <p>当前目录下暂无文件</p>
      </div>

      <div v-else class="flex-1 overflow-y-auto custom-scrollbar pr-2">
        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          <!-- Folders -->
          <div 
            v-for="folder in folders" 
            :key="folder.id"
            @click="handleFolderClick(folder)"
            class="group p-4 rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-[#151515] hover:border-purple-500/50 hover:shadow-xl hover:shadow-purple-500/5 transition-all cursor-pointer flex items-center gap-4"
          >
            <div class="w-12 h-12 rounded-xl bg-blue-500/10 flex items-center justify-center group-hover:bg-blue-500 group-hover:text-white transition-all">
              <SvgIcon icon="ri:folder-fill" class="text-2xl" />
            </div>
            <div class="flex-1 min-w-0">
              <div class="font-medium text-gray-800 dark:text-gray-200 truncate">{{ folder.name }}</div>
              <div class="text-xs text-gray-400 mt-1">文件夹</div>
            </div>
          </div>

          <!-- PDF Files -->
          <div 
            v-for="file in files" 
            :key="file.id"
            @click="handlePdfClick(file)"
            class="group p-4 rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-[#151515] hover:border-purple-500/50 hover:shadow-xl hover:shadow-purple-500/5 transition-all cursor-pointer flex flex-col gap-4 relative overflow-hidden"
          >
            <!-- Aurora Purple Marker for files that likely have cards -->
            <div class="absolute top-0 right-0 w-12 h-12 bg-purple-500/5 blur-xl -mr-6 -mt-6"></div>
            
            <div class="flex items-center gap-4">
              <div class="w-12 h-12 rounded-xl bg-purple-500/10 flex items-center justify-center group-hover:bg-purple-500 group-hover:text-white transition-all">
                <SvgIcon icon="ri:file-pdf-2-fill" class="text-2xl" />
              </div>
              <div class="flex-1 min-w-0">
                <div class="font-medium text-gray-800 dark:text-gray-200 truncate">{{ file.displayName || file.originalName }}</div>
                <div class="text-xs text-gray-400 mt-1 flex items-center gap-2">
                  <span>PDF 文件</span>
                  <span class="w-1 h-1 rounded-full bg-gray-300"></span>
                  <span class="px-1.5 py-0.5 rounded bg-purple-100 text-purple-600 dark:bg-purple-900/30 dark:text-purple-400 text-[10px] font-bold">可查看卡片</span>
                </div>
              </div>
            </div>
            
            <div class="mt-auto pt-4 border-t border-gray-50 dark:border-gray-800/50 flex items-center justify-between">
              <span class="text-[10px] text-gray-400">{{ new Date(file.createdAt).toLocaleDateString() }}</span>
              <div class="flex items-center gap-1 text-purple-500 text-xs font-bold opacity-0 group-hover:opacity-100 transition-opacity">
                进入探索 <SvgIcon icon="ri:arrow-right-line" />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
