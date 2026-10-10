import { useSyncExternalStore } from "react";

function subscribe(cb: () => void) {
  const obs = new MutationObserver(cb);
  obs.observe(document.documentElement, { attributes: true, attributeFilter: ["data-atlas-extension"] });
  return () => obs.disconnect();
}

/** True when the Atlas Chrome extension has attached to this tab (it sets a flag on the page). */
export function useExtensionReady() {
  return useSyncExternalStore(
    subscribe,
    () => document.documentElement.dataset.atlasExtension === "ready",
    () => false,
  );
}
