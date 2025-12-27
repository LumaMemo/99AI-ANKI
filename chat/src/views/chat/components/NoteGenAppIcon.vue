<script setup lang="ts">
import { useRouter } from 'vue-router'
import { Notes } from '@icon-park/vue-next'
import { useChatStore } from '@/store'

const router = useRouter()
const chatStore = useChatStore()

async function handleClick() {
  // 创建/激活一个“笔记生成”对话组，让它立刻出现在左侧历史中（尽力而为，不阻断跳转）
  try {
    await chatStore.ensureNoteGenGroupActive()
  } catch {}
  router.push('/note-gen')
}
</script>

<template>
  <div
    class="absolute left-4 top-20 z-20 cursor-pointer group"
    title="笔记生成"
    @click="handleClick"
  >
    <div
      class="w-12 h-12 flex items-center justify-center rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 shadow-lg transition-all duration-300 group-hover:scale-110 group-hover:shadow-blue-500/50 active:scale-95 backdrop-blur-md border border-white/20"
    >
      <Notes theme="outline" size="24" fill="#fff" />
    </div>
    <span class="mt-1 text-[10px] text-gray-500 dark:text-gray-400 text-center block">
      笔记生成
    </span>
  </div>
</template>

<style scoped>
/* Squircle effect can be enhanced with custom clip-path if needed, but rounded-xl is usually enough for iOS style */
</style>
