<script setup lang="ts">
import { ref } from "vue";
import LayoutPanel from "@/app/components/common/LayoutPanel.vue";
import OverrideEditor from "@/app/components/settings/OverrideEditor.vue";
import PreviewControls from "@/app/components/settings/PreviewControls.vue";
import SlotEditor from "@/app/components/settings/SlotEditor.vue";
import SortEditor from "@/app/components/settings/SortEditor.vue";
import TransferPanel from "@/app/components/settings/TransferPanel.vue";
import { urlParams } from "@/app/composables/useUrlParams";

// Ordered by how often each is used.
const TABS = [
  { key: "sort", label: "小队排序", component: SortEditor },
  { key: "slots", label: "技能槽", component: SlotEditor },
  { key: "layout", label: "布局", component: LayoutPanel },
  { key: "overrides", label: "技能参数", component: OverrideEditor },
  { key: "transfer", label: "导入导出", component: TransferPanel },
] as const;

const active = ref<(typeof TABS)[number]["key"]>(TABS[0].key);
</script>

<template>
  <div class="settings">
    <header>
      <h1>小队技能监控 · 设置</h1>
      <span class="muted">修改自动保存并实时同步到悬浮窗。请从悬浮窗右键打开本页，不要用系统浏览器打开。</span>
    </header>
    <nav>
      <button v-for="t in TABS" :key="t.key" type="button" :class="{ active: t.key === active }" @click="active = t.key">
        {{ t.label }}
      </button>
    </nav>
    <main>
      <template v-for="t in TABS" :key="t.key">
        <div v-if="t.key === active" :class="{ narrow: t.key === 'layout' }">
          <template v-if="t.key === 'layout'">
            <PreviewControls />
            <p class="muted">
              当前布局档案：{{ urlParams.profile ?? "默认" }}。不同悬浮窗可以在网址里加 <code>?profile=名称</code> 使用独立的布局。
            </p>
          </template>
          <component :is="t.component" />
        </div>
      </template>
    </main>
  </div>
</template>

<style scoped>
.settings {
  min-height: 100vh;
  display: grid;
  grid-template-rows: auto auto 1fr;
  background: var(--panel);
  color: var(--text);
}

header {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 4px 12px;
  padding: 12px 16px 6px;
}

h1 {
  margin: 0;
  font-size: 17px;
}

nav {
  display: flex;
  gap: 2px;
  padding: 0 16px;
  border-bottom: 1px solid var(--border);
}

nav button {
  padding: 8px 12px;
  border: none;
  border-bottom: 2px solid transparent;
  background: none;
  color: var(--text-muted);
  font: inherit;
  cursor: pointer;
}

nav button.active {
  border-bottom-color: var(--accent);
  color: var(--text);
}

main {
  min-width: 0;
  padding: 14px 16px;
  overflow: auto;
}

.narrow {
  max-width: 480px;
  display: grid;
  gap: 10px;
}

.muted {
  margin: 0;
  color: var(--text-muted);
  font-size: 12px;
}
</style>
