<script setup lang="ts">
import SvgIcon from '@/components/common/SvgIcon/index.vue'

interface TreeNode {
  name: string
  path: string
  relativePath: string
  isFile: boolean
  children?: TreeNode[]
  isTopic?: boolean
  isOpen?: boolean
}

interface Props {
  node: TreeNode
  depth: number
  selectedPath: string
}

const props = defineProps<Props>()
const emit = defineEmits(['toggle', 'select'])

function handleToggle() {
  emit('toggle', props.node)
}

function handleSelect() {
  emit('select', props.node)
}
</script>

<template>
  <div class="tree-item-container">
    <div
      class="group relative flex items-center py-1.5 px-2 rounded-md cursor-pointer transition-colors duration-200"
      :class="[
        selectedPath === node.path ? 'bg-primary/10 text-primary' : 'hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-700 dark:text-gray-300'
      ]"
      :style="{ paddingLeft: `${depth * 12 + 8}px` }"
      @click="handleToggle"
    >
      <!-- Left Accent Color Bar -->
      <div 
        v-if="selectedPath === node.path"
        class="absolute left-0 top-1 bottom-1 w-0.5 bg-primary rounded-full"
      ></div>

      <!-- Expand/Collapse Icon -->
      <div class="w-5 h-5 flex items-center justify-center mr-1">
        <SvgIcon
          v-if="node.children && node.children.length > 0"
          :icon="node.isOpen ? 'ri:arrow-down-s-line' : 'ri:arrow-right-s-line'"
          class="text-lg opacity-50 group-hover:opacity-100 transition-transform"
        />
      </div>

      <!-- Node Icon -->
      <div class="mr-2">
        <SvgIcon
          v-if="node.isTopic"
          icon="ri:file-list-2-line"
          class="text-lg"
          :class="selectedPath === node.path ? 'text-primary' : 'text-amber-500'"
        />
        <SvgIcon
          v-else
          icon="ri:folder-line"
          class="text-lg text-blue-400"
        />
      </div>

      <!-- Node Name -->
      <span class="text-sm truncate flex-1" :class="{ 'font-medium': node.isTopic || node.isOpen }">
        {{ node.name }}
      </span>
    </div>

    <!-- Children -->
    <div v-if="node.isOpen && node.children && node.children.length > 0" class="tree-children">
      <TreeItem
        v-for="child in node.children"
        :key="child.path"
        :node="child"
        :depth="depth + 1"
        :selected-path="selectedPath"
        @toggle="(n) => $emit('toggle', n)"
        @select="(n) => $emit('select', n)"
      />
    </div>
  </div>
</template>

<style scoped>
.tree-item-container {
  width: 100%;
}
</style>
