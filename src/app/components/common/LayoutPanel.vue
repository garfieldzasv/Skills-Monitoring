<script setup lang="ts">
import { LAYOUT_LIMITS, defaultLayout, type LayoutSettings } from "@/core/settings/schema";
import { useLayout } from "@/app/composables/useSettings";

const layout = useLayout();

type NumericKey = keyof typeof LAYOUT_LIMITS;

const FIELDS: { key: NumericKey; label: string; unit?: string }[] = [
  { key: "iconSize", label: "图标尺寸", unit: "px" },
  { key: "rowPitch", label: "行距", unit: "px" },
  { key: "iconGap", label: "图标间距", unit: "px" },
  { key: "offsetX", label: "水平偏移", unit: "px" },
  { key: "offsetY", label: "垂直偏移", unit: "px" },
  { key: "textScale", label: "文字缩放" },
  { key: "opacity", label: "不透明度" },
];

function set<K extends keyof LayoutSettings>(key: K, value: LayoutSettings[K]) {
  layout.update((d) => {
    d[key] = value;
  });
}

function onNumber(key: NumericKey, e: Event) {
  const value = Number((e.target as HTMLInputElement).value);
  if (Number.isFinite(value)) set(key, value);
}
</script>

<template>
  <div class="layout-panel">
    <label v-for="f in FIELDS" :key="f.key" class="field">
      <span class="label">{{ f.label }}</span>
      <input
        type="range"
        :min="LAYOUT_LIMITS[f.key].min"
        :max="LAYOUT_LIMITS[f.key].max"
        :step="LAYOUT_LIMITS[f.key].step"
        :value="layout.state.value[f.key]"
        @input="onNumber(f.key, $event)"
      />
      <input
        type="number"
        class="num"
        :min="LAYOUT_LIMITS[f.key].min"
        :max="LAYOUT_LIMITS[f.key].max"
        :step="LAYOUT_LIMITS[f.key].step"
        :value="layout.state.value[f.key]"
        @change="onNumber(f.key, $event)"
      />
      <span class="unit">{{ f.unit }}</span>
    </label>
    <label class="field">
      <span class="label">排列方向</span>
      <select
        :value="layout.state.value.direction"
        @change="set('direction', ($event.target as HTMLSelectElement).value as LayoutSettings['direction'])"
      >
        <option value="ltr">从左往右</option>
        <option value="rtl">从右往左</option>
      </select>
    </label>
    <label class="field">
      <span class="label">显示持续时间</span>
      <input
        type="checkbox"
        :checked="layout.state.value.showDuration"
        @change="set('showDuration', ($event.target as HTMLInputElement).checked)"
      />
    </label>
    <p class="hint">行距 = 游戏小队列表中第 1 人到第 8 人的距离 ÷ 7。</p>
    <button type="button" class="btn" @click="layout.replace(defaultLayout())">恢复默认布局</button>
  </div>
</template>

<style scoped>
.layout-panel {
  display: grid;
  gap: 6px;
}

.field {
  display: grid;
  grid-template-columns: 84px 1fr 64px 20px;
  align-items: center;
  gap: 6px;
}

.label {
  color: var(--text-muted);
}

.num {
  width: 100%;
}

.field input[type="checkbox"] {
  justify-self: start;
}

.unit {
  color: var(--text-muted);
  font-size: 11px;
}

.hint {
  margin: 4px 0 0;
  color: var(--text-muted);
  font-size: 11px;
}
</style>
