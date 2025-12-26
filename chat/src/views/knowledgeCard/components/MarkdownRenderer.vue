<script setup lang="ts">
import { computed } from 'vue'
import MarkdownIt from 'markdown-it'
import mdKatex from '@traptitech/markdown-it-katex'
import mila from 'markdown-it-link-attributes'
import hljs from 'highlight.js'
import 'highlight.js/styles/atom-one-dark.css'
import 'katex/dist/katex.min.css'

interface Props {
  content: string
}

const props = defineProps<Props>()

const mdi = new MarkdownIt({
  html: false,
  linkify: true,
  highlight(code, language) {
    const validLang = !!(language && hljs.getLanguage(language))
    if (validLang) {
      const lang = language ?? ''
      return hljs.highlight(code, { language: lang }).value
    }
    return hljs.highlightAuto(code).value
  },
})

mdi.use(mila, { attrs: { target: '_blank', rel: 'noopener' } })
mdi.use(mdKatex, { blockClass: 'katex-block', errorColor: ' #cc0000' })

const renderedContent = computed(() => {
  if (!props.content) return ''
  
  // Pre-process: Convert $$...$$ to $...$ for better mobile display if needed, 
  // but the design says "convert block formula to inline for mobile". 
  // For now, let's keep it standard and handle via CSS.
  return mdi.render(props.content)
})
</script>

<template>
  <div class="markdown-body text-sm leading-relaxed" v-html="renderedContent"></div>
</template>

<style>
.markdown-body {
  word-break: break-word;
}

.markdown-body p {
  margin-bottom: 0.75rem;
}

.markdown-body p:last-child {
  margin-bottom: 0;
}

.markdown-body ul, .markdown-body ol {
  margin-bottom: 0.75rem;
  padding-left: 1.25rem;
}

.markdown-body li {
  margin-bottom: 0.25rem;
}

.markdown-body pre {
  background-color: #f6f8fa;
  border-radius: 6px;
  padding: 1rem;
  overflow: auto;
  margin-bottom: 0.75rem;
}

.dark .markdown-body pre {
  background-color: #161b22;
}

.markdown-body code {
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
  font-size: 85%;
  background-color: rgba(175, 184, 193, 0.2);
  padding: 0.2em 0.4em;
  border-radius: 6px;
}

.markdown-body blockquote {
  border-left: 4px solid #d0d7de;
  color: #57606a;
  padding-left: 1rem;
  margin-bottom: 0.75rem;
}

.dark .markdown-body blockquote {
  border-left-color: #30363d;
  color: #8b949e;
}

.katex-block {
  overflow-x: auto;
  overflow-y: hidden;
  padding: 0.5rem 0;
}
</style>
