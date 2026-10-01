<script setup lang="ts">
import { ref } from "vue";
import { defaultSettings } from "@/core/settings/schema";
import { exportSettings, importSettings } from "@/core/settings/transfer";
import { useSettings } from "@/app/composables/useSettings";

const settings = useSettings();
const exported = ref("");
const importText = ref("");
const message = ref<{ kind: "ok" | "error"; text: string }>();

async function copy(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Embedded browsers may deny the async clipboard API; fall back to a selected textarea.
    const el = document.createElement("textarea");
    el.value = text;
    document.body.append(el);
    el.select();
    const ok = document.execCommand("copy");
    el.remove();
    return ok;
  }
}

async function doExport() {
  exported.value = exportSettings(settings.state.value);
  const ok = await copy(exported.value);
  message.value = { kind: "ok", text: ok ? "已复制到剪贴板" : "已生成，请手动复制下方文本" };
}

function doImport() {
  try {
    settings.replace(importSettings(importText.value, settings.state.value));
    message.value = { kind: "ok", text: "导入成功" };
    importText.value = "";
  } catch (err) {
    message.value = { kind: "error", text: err instanceof Error ? err.message : "导入失败" };
  }
}

function resetAll() {
  if (!window.confirm("恢复全部默认设置？技能槽、技能参数、排序和手动顺序都会被清除（布局不受影响）。")) return;
  settings.replace(defaultSettings());
  message.value = { kind: "ok", text: "已恢复默认设置" };
}
</script>

<template>
  <div class="transfer">
    <section>
      <h4>导出</h4>
      <p class="muted">包含技能槽、技能参数和排序设置，不包含布局和手动顺序。</p>
      <button type="button" class="btn primary" @click="doExport">导出并复制</button>
      <textarea v-if="exported" :value="exported" readonly rows="4" />
    </section>
    <section>
      <h4>导入</h4>
      <p class="muted">粘贴本工具导出的文本。手动顺序不受影响。</p>
      <textarea v-model="importText" rows="4" placeholder="粘贴导出文本" />
      <button type="button" class="btn primary" :disabled="!importText.trim()" @click="doImport">导入</button>
    </section>
    <section>
      <h4>恢复默认</h4>
      <button type="button" class="btn danger" @click="resetAll">恢复全部默认设置</button>
    </section>
    <div v-if="message" class="message" :class="message.kind">
      {{ message.text }}
    </div>
  </div>
</template>

<style scoped>
.transfer {
  display: grid;
  gap: 18px;
  max-width: 720px;
}

section {
  display: grid;
  gap: 8px;
  justify-items: start;
}

h4 {
  margin: 0;
  font-size: 13px;
}

textarea {
  width: 100%;
  font-family: ui-monospace, monospace;
  font-size: 12px;
}

.muted {
  margin: 0;
  color: var(--text-muted);
  font-size: 12px;
}

.message {
  padding: 8px 12px;
  border-radius: 6px;
}

.message.ok {
  background: rgb(60 160 90 / 20%);
}

.message.error {
  background: rgb(220 70 70 / 20%);
}
</style>
