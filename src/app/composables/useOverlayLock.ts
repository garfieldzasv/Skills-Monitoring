import { readonly, ref } from "vue";
import { getConnectionMode } from "@/core/overlay/overlayApi";
import { urlParams } from "./useUrlParams";

/**
 * Edit mode = overlay unlocked. Inside OverlayPlugin the lock state arrives as the DOM event
 * `onOverlayStateUpdate`. Outside of it (plain browser / WebSocket mode) there is no lock toggle,
 * so edit mode is on unless `?edit=0` is given.
 */
const { edit, demo } = urlParams;
const embedded = getConnectionMode() === "embedded";
const unlocked = ref(edit === "1" || demo || (edit !== "0" && !embedded));

document.addEventListener("onOverlayStateUpdate", (e) => {
  const detail = (e as CustomEvent<{ isLocked?: boolean }>).detail;
  unlocked.value = detail?.isLocked === false;
});

export function useOverlayLock() {
  return { unlocked: readonly(unlocked) };
}
