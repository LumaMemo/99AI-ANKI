<script setup lang="ts">
import BadWordsDialog from '@/components/Dialogs/BadWordsDialog.vue'
import Login from '@/components/Login/Login.vue'
import MobileSettingsDialog from '@/components/MobileSettingsDialog.vue'
import SettingsDialog from '@/components/SettingsDialog.vue'
import { useBasicLayout } from '@/hooks/useBasicLayout'
import { useAppStore, useAuthStore, useChatStore, useGlobalStoreWithOut } from '@/store'
import { message } from '@/utils/message'
import { computed, onMounted, provide, watch } from 'vue'
import Sider from './components/sider/index.vue'
import { useRouter } from 'vue-router'

const ms = message()
const appStore = useAppStore()
const chatStore = useChatStore()
const authStore = useAuthStore()
// 聊天模块：将 640–767 也视为移动端（<md）
const { isSmallMd: isMobile } = useBasicLayout()
const isLogin = computed(() => authStore.isLogin)
const collapsed = computed(() => appStore.siderCollapsed)
// const startX = ref(0)
// const endX = ref(0)

const isModelInherited = computed(() => Number(authStore.globalConfig?.isModelInherited) === 1)
const isStreamIn = computed(() => {
  return chatStore.isStreamIn !== undefined ? chatStore.isStreamIn : false
})

const isKnowledgeCard = computed(() => router.currentRoute.value.name === 'KnowledgeCard')

watch(isLogin, async (newVal, oldVal) => {
  if (newVal && !oldVal) {
    await chatStore.queryMyGroup()
    // 检查 URL 是否包含查询参数或哈希值
  }
})

const getMobileClass = computed(() => {
  if (isMobile.value) return ['rounded-none', 'shadow-none']
  // 桌面端：去掉外层“底板框”，避免与内层 glass-card 形成双层框
  return []
})

const getPagePaddingClass = computed(() => {
  if (isMobile.value || isKnowledgeCard.value) return ''
  return 'p-3 md:p-4'
})

const getContainerClass = computed(() => {
  return [
    isKnowledgeCard.value ? 'min-h-full' : 'h-full',
    'transition-[padding]',
    'duration-300',
    { 'pl-[260px]': !isMobile.value && !collapsed.value && !isKnowledgeCard.value },
  ]
})

/* 新增一个对话 */
async function createNewChatGroup() {
  if (isStreamIn.value) {
    ms.info('AI回复中，请稍后再试')
    return
  }

  chatStore.setStreamIn(false)
  try {
    const { modelInfo } = chatStore.activeConfig
    if (modelInfo && isModelInherited.value && chatStore.activeGroupAppId === 0) {
      const config = {
        modelInfo,
      }
      await chatStore.addNewChatGroup(0, config)
    } else {
      await chatStore.addNewChatGroup()
    }
    chatStore.setUsingPlugin(null)

    if (isMobile.value) {
      appStore.setSiderCollapsed(true)
    }

    // 明确跳转到聊天页
    if (router.currentRoute.value.name !== 'Chat') {
      router.push('/')
    }
  } catch (error) {}
}

// function handleTouchStart(event: any) {
//   startX.value = event.touches[0].clientX
// }

// function handleTouchEnd(event: any) {
//   endX.value = event.changedTouches[0].clientX
//   if (endX.value - startX.value > 100) {
//     if (isMobile.value) {
//       appStore.setSiderCollapsed(false)
//     }
//   }
// }

onMounted(() => {
  // 移除强制重定向逻辑，以支持 /note-gen 等路由
})

const useGlobalStore = useGlobalStoreWithOut()
const loginDialog = computed(() => authStore.loginDialog)
const badWordsDialog = computed(() => useGlobalStore.BadWordsDialog)
const settingsDialog = computed(() => useGlobalStore.settingsDialog)
const mobileSettingsDialog = computed(() => useGlobalStore.mobileSettingsDialog)

const router = useRouter()
// 监听激活的对话组变化，决定跳转到聊天页还是笔记生成页
watch(() => chatStore.active, (newActive) => {
  // 如果当前已经在知识卡片页，不进行自动跳转
  if (router.currentRoute.value.name === 'KnowledgeCard') return

  const activeConfig = chatStore.activeConfig
  if (activeConfig?.isNoteGen) {
    if (router.currentRoute.value.name !== 'NoteGen') {
      router.push('/note-gen')
    }
  }
  else if (newActive !== 0) {
    // 如果切换到了一个明确的普通对话组，且当前在笔记生成页，则跳回首页
    if (router.currentRoute.value.name === 'NoteGen') {
      router.push('/')
    }
  }
}, { immediate: true })

provide('createNewChatGroup', createNewChatGroup)
</script>

<template>
  <div class="h-full transition-all" :class="getPagePaddingClass">
    <div class="h-full" :class="[getMobileClass, isKnowledgeCard ? 'overflow-auto' : 'overflow-hidden']">
      <div class="z-40 flex" :class="getContainerClass">
        <Sider v-if="!isKnowledgeCard" class="h-full" />
        <router-view v-slot="{ Component }">
          <component :is="Component" class="w-full flex-1 transition-[margin] duration-500" />
        </router-view>
      </div>
    </div>
    <div class="overflow-hidden">
      <Login :visible="loginDialog" />
      <BadWordsDialog :visible="badWordsDialog" />
      <SettingsDialog v-if="!isMobile" :visible="settingsDialog" />
      <MobileSettingsDialog v-else :visible="mobileSettingsDialog" />
    </div>
  </div>
</template>
