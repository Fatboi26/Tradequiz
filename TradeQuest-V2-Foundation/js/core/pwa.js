/* TradeQuest PWA registration — keeps the app usable after a successful first visit. */
export function registerPWA() {
  if (!('serviceWorker' in navigator)) return;
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch((error) => {
      console.warn('Offline support could not be enabled:', error);
    });
  });
}
