<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { fetchKbCardTreeAPI } from '@/api/kb'
import SvgIcon from '@/components/common/SvgIcon/index.vue'
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
const selectedPath = ref('')
const searchQuery = ref('')

// 过滤后的树数据
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
  emit('select', node)
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
      
      <div v-else-if="filteredTreeData.length === 0" class="p-8 text-center text-gray-400 text-sm">
        <SvgIcon icon="ri:inbox-line" class="text-3xl mb-2 mx-auto opacity-20" />
        <p>{{ searchQuery ? '未找到匹配内容' : '暂无知识卡片' }}</p>
      </div>

      <div v-else class="px-2">
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
