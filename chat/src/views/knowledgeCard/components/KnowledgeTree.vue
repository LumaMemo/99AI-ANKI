<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { fetchKbCardSearchAPI, fetchKbCardTreeAPI } from '@/api/kb'
import SvgIcon from '@/components/common/SvgIcon/index.vue'
import { useDebounceFn } from '@vueuse/core'
import TreeItem from './TreeItem.vue'

interface Props {
  pdfId: number
}

const props = defineProps<Props>()
const emit = defineEmits(['select'])

interface TreeNode {
  name: string
  path: string
  relativePath: string
  isFile: boolean
  children?: TreeNode[]
  isTopic?: boolean
  isOpen?: boolean
}

const treeData = ref<TreeNode[]>([])
const loading = ref(false)
const searching = ref(false)
const selectedPath = ref('')
const searchQuery = ref('')
const searchResults = ref<any[]>([])

// 过滤后的树数据 (目录匹配)
const filteredTreeData = computed(() => {
  if (!searchQuery.value)
    return treeData.value

  const query = searchQuery.value.toLowerCase()
  const filter = (nodes: TreeNode[]): TreeNode[] => {
    return nodes.reduce((acc: TreeNode[], node) => {
      const match = node.name.toLowerCase().includes(query)
      const filteredChildren = node.children ? filter(node.children) : []

      if (match || filteredChildren.length > 0) {
        acc.push({
          ...node,
          isOpen: searchQuery.value ? true : node.isOpen, // 搜索时自动展开
          children: filteredChildren,
        })
      }
      return acc
    }, [])
  }
  return filter(treeData.value)
})

const handleSearch = useDebounceFn(async () => {
  if (!searchQuery.value || searchQuery.value.trim().length < 1) {
    searchResults.value = []
    return
  }

  searching.value = true
  try {
    const res = await fetchKbCardSearchAPI({ 
      pdfId: props.pdfId, 
      keyword: searchQuery.value 
    })
    if (res.code === 200) {
      searchResults.value = res.data
    }
  } catch (error) {
    console.error('Deep search failed:', error)
  } finally {
    searching.value = false
  }
}, 500)

watch(searchQuery, () => {
  handleSearch()
})

async function loadTree() {
  if (!props.pdfId) return
  loading.value = true
  try {
    const res = await fetchKbCardTreeAPI({ pdfId: props.pdfId })
    if (res.code === 200) {
      treeData.value = processTreeData(res.data)
    }
  }
  catch (error) {
    console.error('Failed to load card tree:', error)
  }
  finally {
    loading.value = false
  }
}

function processTreeData(data: any[]): TreeNode[] {
  return data.map((node) => {
    const newNode: TreeNode = { ...node, isOpen: false }
    
    if (newNode.children && newNode.children.length > 0) {
      // Check if this folder is a Topic (contains base.json)
      const baseJsonIndex = newNode.children.findIndex(child => child.name === 'base.json')
      if (baseJsonIndex !== -1) {
        newNode.isTopic = true
        newNode.isLeaf = true // Mark as leaf for the dispatcher
        newNode.path = newNode.children[baseJsonIndex].path // Use base.json path for detail fetching
        // Remove base.json from children to keep UI clean
        newNode.children.splice(baseJsonIndex, 1)
      }
      
      if (newNode.children.length > 0) {
        newNode.children = processTreeData(newNode.children)
      }
    }
    
    return newNode
  }).filter(node => !node.isFile || node.name === 'base.json') // Only keep folders or base.json (which are handled above)
}

function toggleNode(node: TreeNode) {
  if (node.children && node.children.length > 0) {
    node.isOpen = !node.isOpen
  }
  
  selectNode(node)
}

function selectNode(node: TreeNode) {
  selectedPath.value = node.path
  emit('select', { ...node, keyword: searchQuery.value })
}

onMounted(() => {
  loadTree()
})

watch(() => props.pdfId, () => {
  loadTree()
})
</script>

<template>
  <div class="knowledge-tree flex flex-col h-full">
    <!-- Search Bar -->
    <div class="px-4 py-2 border-b border-gray-100 dark:border-gray-800">
      <div class="relative">
        <input
          v-model="searchQuery"
          type="text"
          placeholder="搜索目录或知识点..."
          class="w-full pl-8 pr-3 py-1.5 text-sm bg-gray-100 dark:bg-gray-800 border-none rounded-md focus:ring-1 focus:ring-primary outline-none transition-all"
        />
        <SvgIcon icon="ri:search-line" class="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
      </div>
    </div>

    <div class="flex-1 overflow-y-auto py-2">
      <div v-if="loading" class="p-4 text-center text-gray-400 text-sm">
        <div class="animate-spin inline-block w-4 h-4 border-2 border-current border-t-transparent rounded-full mb-2"></div>
        <p>加载目录中...</p>
      </div>
      
      <div v-else class="px-2">
        <!-- Search Results (Content Matches) -->
        <div v-if="searchQuery" class="mb-4">
          <div class="px-2 py-1 text-[10px] font-bold text-gray-400 uppercase tracking-wider flex items-center justify-between">
            <span>内容匹配</span>
            <div v-if="searching" class="animate-spin w-3 h-3 border border-current border-t-transparent rounded-full"></div>
          </div>
          
          <div v-if="searchResults.length > 0" class="space-y-1 mt-1">
            <div 
              v-for="result in searchResults" 
              :key="result.path"
              class="group px-3 py-2 rounded-lg hover:bg-primary/5 cursor-pointer transition-all border border-transparent hover:border-primary/10"
              @click="emit('select', { ...result, isTopic: true, isLeaf: true, name: result.topic, keyword: searchQuery })"
            >
              <div class="flex items-center gap-2 mb-1">
                <SvgIcon icon="ri:file-text-line" class="text-primary text-xs" />
                <span class="text-xs font-medium text-gray-700 dark:text-gray-300 truncate group-hover:text-primary">
                  {{ result.topic }}
                </span>
              </div>
              <div v-if="result.snippet" class="text-[10px] text-gray-400 line-clamp-2 pl-5 italic">
                {{ result.snippet }}
              </div>
            </div>
          </div>
          <div v-else-if="!searching" class="px-3 py-2 text-[10px] text-gray-400 italic">
            未发现内容匹配
          </div>
        </div>

        <!-- Directory Tree -->
        <div v-if="searchQuery" class="px-2 py-1 text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">
          目录匹配
        </div>

        <div v-if="filteredTreeData.length === 0 && !searching && searchResults.length === 0" class="p-8 text-center text-gray-400 text-sm">
          <SvgIcon icon="ri:inbox-line" class="text-3xl mb-2 mx-auto opacity-20" />
          <p>{{ searchQuery ? '未找到匹配内容' : '暂无知识卡片' }}</p>
        </div>

        <TreeItem 
          v-for="node in filteredTreeData" 
          :key="node.path" 
          :node="node" 
          :depth="0"
          :selected-path="selectedPath"
          @toggle="toggleNode"
          @select="selectNode"
        />
      </div>
    </div>
  </div>
</template>

<style scoped>
.knowledge-tree {
  user-select: none;
}
</style>
