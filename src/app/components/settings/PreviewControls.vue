<script setup lang="ts">
import { sendOverlayCommand, usePreviewFlags, type PreviewFlags } from "@/app/composables/useOverlayBridge";

const preview = usePreviewFlags();

function toggle(key: keyof PreviewFlags, e: Event) {
  const checked = (e.target as HTMLInputElement).checked;
  preview.update((d) => {
    d[key] = checked;
  });
}
</script>

<template>
  <section class="preview">
    <h4>悬浮窗预览</h4>
    <p class="muted">校准网格和演示小队只在悬浮窗解锁时显示；没有小队时，解锁后会自动使用演示小队。</p>
    <label>
      <input type="checkbox" :checked="preview.state.value.calibrate" @change="toggle('calibrate', $event)" />
      显示校准网格
    </label>
    <label>
      <input type="checkbox" :checked="preview.state.value.forceDemo" @change="toggle('forceDemo', $event)" />
      始终使用演示小队
    </label>
    <div class="actions">
      <button type="button" class="btn" @click="sendOverlayCommand('castAll')">模拟全部释放</button>
      <button type="button" class="btn" @click="sendOverlayCommand('reset')">重置冷却</button>
    </div>
  </section>
</template>

<style scoped>
.preview {
  display: grid;
  gap: 6px;
  padding-bottom: 12px;
  border-bottom: 1px solid var(--border);
}

h4 {
  margin: 0;
  font-size: 13px;
}

.actions {
  display: flex;
  gap: 8px;
}

.muted {
  margin: 0;
  color: var(--text-muted);
  font-size: 12px;
}
</style>
