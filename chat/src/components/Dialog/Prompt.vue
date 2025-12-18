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
        <div
          class="absolute inset-0 bg-[color:var(--overlay-mask)] backdrop-blur-sm"
          @click="handleCancel"
        ></div>

        <div class="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
          <div class="w-[92vw] max-w-[420px] glass-card aurora-border rounded-2xl overflow-hidden" @click.stop>
            <div class="p-4 border-b border-[color:var(--glass-border)]">
              <h3 class="text-lg font-medium text-[color:var(--text-primary)]">
                {{ options.title }}
              </h3>
              <div v-if="options.content" class="mt-1 text-sm text-[color:var(--text-tertiary)] whitespace-pre-line">
                {{ options.content }}
              </div>
            </div>

            <div class="p-4">
              <div class="input-capsule px-4 py-3">
                <input
                  ref="inputRef"
                  v-model="value"
                  type="text"
                  class="w-full bg-transparent outline-none text-[color:var(--text-primary)] placeholder:text-[color:var(--text-tertiary)]"
                  :placeholder="options.placeholder"
                  :maxlength="options.maxLength"
                  @keydown.enter.prevent="handleConfirm"
                />
              </div>

              <div v-if="options.hint" class="mt-2 text-xs text-[color:var(--text-tertiary)] whitespace-pre-line">
                {{ options.hint }}
              </div>
            </div>

            <div class="flex justify-end gap-2 px-4 py-3 border-t border-[color:var(--glass-border)]">
              <button
                class="px-4 py-2 text-sm rounded-md glass text-[color:var(--text-secondary)] hover:shadow-md"
                @click="handleCancel"
              >
                {{ options.negativeText }}
              </button>
              <button
                class="px-4 py-2 text-sm rounded-md btn-pill-active"
                :class="{ 'opacity-60 cursor-not-allowed': confirmDisabled }"
                :disabled="confirmDisabled"
                @click="handleConfirm"
              >
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
import type { PromptDialogOptions } from '@/utils/dialog'
import { computed, nextTick, ref } from 'vue'

const visible = ref(false)
const resolvePromise: any = ref(null)
const inputRef = ref<HTMLInputElement | null>(null)

const options = ref<PromptDialogOptions>({
  title: '',
  content: '',
  hint: '',
  placeholder: '请输入',
  defaultValue: '',
  positiveText: '确认',
  negativeText: '取消',
  maxLength: 255,
  required: true,
})

const value = ref('')

const confirmDisabled = computed(() => {
  if (!options.value.required) return false
  return !String(value.value || '').trim()
})

const showDialog = async (dialogOptions: PromptDialogOptions) => {
  options.value = {
    ...options.value,
    ...dialogOptions,
  }
  value.value = String(options.value.defaultValue ?? '')
  visible.value = true
  await nextTick()
  inputRef.value?.focus()
  inputRef.value?.select()

  return new Promise<string | null>(resolve => {
    resolvePromise.value = resolve
  })
}

const handleConfirm = () => {
  if (confirmDisabled.value) return
  visible.value = false
  resolvePromise.value(String(value.value ?? '').trim())
}

const handleCancel = () => {
  visible.value = false
  resolvePromise.value(null)
}

defineExpose({
  showDialog,
})
</script>
