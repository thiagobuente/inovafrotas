let unregister: (() => void) | undefined;

export function registerPwa() {
  if (!("serviceWorker" in navigator)) return;

  const isDev = !import.meta.env.PROD;
  const isIframe = window.self !== window.top;
  const hostname = window.location.hostname;
  const search = window.location.search;

  const isPreviewHost =
    hostname.startsWith("id-preview--") ||
    hostname.startsWith("preview--") ||
    hostname === "lovableproject.com" ||
    hostname.endsWith(".lovableproject.com") ||
    hostname === "lovableproject-dev.com" ||
    hostname.endsWith(".lovableproject-dev.com") ||
    hostname === "beta.lovable.dev" ||
    hostname.endsWith(".beta.lovable.dev");

  const isDisabled = search.includes("sw=off");

  if (isDev || isIframe || isPreviewHost || isDisabled) {
    navigator.serviceWorker
      .getRegistrations()
      .then((regs) =>
        Promise.all(
          regs
            .filter((r) => {
              try {
                return new URL(r.scope).pathname === "/";
              } catch {
                return false;
              }
            })
            .map((r) => r.unregister()),
        ),
      )
      .catch(() => undefined);
    return;
  }

  import("virtual:pwa-register")
    .then(({ registerSW }) => {
      unregister = registerSW({ immediate: true });
    })
    .catch(() => undefined);
}

export function unregisterPwa() {
  unregister?.();
}
