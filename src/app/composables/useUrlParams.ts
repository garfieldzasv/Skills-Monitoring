import { savedPosition, SETTINGS_WINDOW, settingsWindowFeatures } from "@/app/settingsWindow";

/**
 * Reads URL parameters from both the query string and the hash query (`#/settings?x=1`), since
 * OverlayPlugin URLs are often written either way.
 */
function readParams(): URLSearchParams {
  const params = new URLSearchParams(window.location.search);
  const hashQuery = window.location.hash.split("?")[1];
  if (hashQuery) new URLSearchParams(hashQuery).forEach((v, k) => params.set(k, v));
  return params;
}

const params = readParams();

export const urlParams = {
  /** Separate layout storage per overlay instance. */
  profile: params.get("profile") ?? undefined,
  /** Force edit mode + demo party, for development in a normal browser. */
  demo: params.get("demo") === "1",
  /** "1" forces edit mode, "0" forces display mode; otherwise it follows the overlay lock. */
  edit: params.get("edit") ?? undefined,
};

/** URL of the settings page, keeping connection-related query parameters. */
function settingsUrl(): string {
  return `${window.location.pathname}${window.location.search}#/settings`;
}

/** Opens (or brings back) the settings window, at the place it was last closed at. */
export function openSettingsWindow(): void {
  window.open(settingsUrl(), SETTINGS_WINDOW.name, settingsWindowFeatures(savedPosition(window.localStorage)));
}
