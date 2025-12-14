<template>
  <Teleport to="body" :disabled="!visible">
    <Transition
      enter-active-class="transition duration-300 ease-out"
      enter-from-class="transform opacity-0"
      enter-to-class="opacity-100"
      leave-active-class="transition duration-200 ease-in"
      leave-from-class="opacity-100"
      leave-to-class="transform opacity-0"
    >
      <div v-if="visible" class="fixed inset-0 z-[9999]">
        <!-- 遮罩层 -->
        <div
          class="absolute inset-0 bg-[color:var(--overlay-mask)] backdrop-blur-sm"
          @click="handleCancel"
        ></div>

        <!-- 对话框 -->
        <div class="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
          <div
            class="w-[92vw] max-w-[400px] glass-card aurora-border rounded-2xl overflow-hidden"
            @click.stop
          >
            <!-- 标题 -->
            <div class="p-4 border-b border-[color:var(--glass-border)]">
              <h3 class="text-lg font-medium text-[color:var(--text-primary)]">
                {{ options.title }}
              </h3>
            </div>

            <!-- 内容 -->
            <div class="p-4 text-[color:var(--text-secondary)]">
              {{ options.content }}
            </div>

            <!-- 按钮 -->
            <div class="flex justify-end gap-2 px-4 py-3">
              <button
                class="px-4 py-2 text-sm rounded-md glass text-[color:var(--text-secondary)] hover:shadow-md"
                @click="handleCancel"
              >
                {{ options.negativeText }}
              </button>
              <button class="px-4 py-2 text-sm rounded-md btn-pill-active" @click="handleConfirm">
                {{ options.positiveText }}
              </button>
            </div>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import type { DialogOptions } from '@/utils/dialog'
import { ref } from 'vue'

const visible = ref(false)
const resolvePromise: any = ref(null)
const options = ref<DialogOptions>({
  title: '',
  content: '',
  positiveText: '确认',
  negativeText: '取消',
})

const showDialog = (dialogOptions: DialogOptions) => {
  options.value = {
    ...options.value,
    ...dialogOptions,
  }
  visible.value = true
  return new Promise(resolve => {
    resolvePromise.value = resolve
  })
}

const handleConfirm = async () => {
  try {
    if (options.value.onPositiveClick) {
      await options.value.onPositiveClick()
    }
    visible.value = false
    resolvePromise.value(true)
  } catch (e) {
    resolvePromise.value(false)
  }
}

const handleCancel = () => {
  visible.value = false
  resolvePromise.value(false)
}

defineExpose({
  showDialog,
})
</script>
