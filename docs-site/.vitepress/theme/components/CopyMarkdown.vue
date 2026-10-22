<script setup lang="ts">
import { ref } from 'vue'

const state = ref<'idle' | 'loading' | 'done' | 'error'>('idle')

async function copy() {
  state.value = 'loading'
  try {
    const path = location.pathname.replace(/\/$/, '/index').replace(/\.html$/, '') + '.md'
    const res = await fetch(path)
    if (!res.ok) throw new Error(String(res.status))
    await navigator.clipboard.writeText(await res.text())
    state.value = 'done'
  } catch {
    state.value = 'error'
  }
  setTimeout(() => (state.value = 'idle'), 2000)
}
</script>

<template>
  <div class="copy-md">
    <button type="button" :disabled="state === 'loading'" @click="copy">
      {{ state === 'done' ? '已复制' : state === 'error' ? '复制失败' : '复制为 Markdown' }}
    </button>
  </div>
</template>
