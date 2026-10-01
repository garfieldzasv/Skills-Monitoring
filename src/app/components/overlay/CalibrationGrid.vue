<script setup lang="ts">
import { MAX_ROWS } from "@/core/engine/monitorEngine";
</script>

<template>
  <!-- Eight translucent bands with the same pitch as the member rows, to line up with the game. -->
  <div class="calibration" aria-hidden="true">
    <div v-for="n in MAX_ROWS" :key="n" class="band" :class="{ odd: n % 2 === 1 }">
      <span class="index">{{ n }}</span>
    </div>
  </div>
</template>

<style scoped>
.calibration {
  position: absolute;
  top: var(--offset-y);
  left: 0;
  right: 0;
  pointer-events: none;
}

.band {
  height: var(--row-pitch);
  box-sizing: border-box;
  border-top: 1px dashed rgb(255 214 77 / 90%);
  background: rgb(80 160 255 / 16%);
  display: flex;
  align-items: center;
  justify-content: var(--band-label-align);
}

.band.odd {
  background: rgb(80 160 255 / 28%);
}

.index {
  margin: 0 4px;
  color: #ffd64d;
  font-size: 11px;
  font-weight: 700;
  text-shadow: 0 0 2px #000;
}
</style>
