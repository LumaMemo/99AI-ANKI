import ConfirmDialog from '@/components/Dialog/Confirm.vue'
import PromptDialog from '@/components/Dialog/Prompt.vue'
import { createVNode, render } from 'vue'

export interface DialogOptions {
  title: string
  content: string
  positiveText?: string
  negativeText?: string
  onPositiveClick?: () => Promise<void> | void
}

export interface PromptDialogOptions {
  title: string
  content?: string
  hint?: string
  placeholder?: string
  defaultValue?: string
  positiveText?: string
  negativeText?: string
  maxLength?: number
  required?: boolean
}

export function dialog() {
  return {
    warning: async (options: DialogOptions) => {
      const container = document.createElement('div')
      const vnode = createVNode(ConfirmDialog)
      render(vnode, container)
      document.body.appendChild(container)
      const dialog = vnode.component?.exposed as {
        showDialog: (options: DialogOptions) => Promise<boolean>
      }

      try {
        const confirmed = await dialog.showDialog(options)
        if (confirmed) {
          return Promise.resolve()
        }
        return Promise.reject()
      } finally {
        render(null, container)
        container.remove()
      }
    },

    prompt: async (options: PromptDialogOptions) => {
      const container = document.createElement('div')
      const vnode = createVNode(PromptDialog)
      render(vnode, container)
      document.body.appendChild(container)

      const dialog = vnode.component?.exposed as {
        showDialog: (options: PromptDialogOptions) => Promise<string | null>
      }

      try {
        return await dialog.showDialog(options)
      } finally {
        render(null, container)
        container.remove()
      }
    },
  }
}
