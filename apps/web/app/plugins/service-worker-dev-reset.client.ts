export default defineNuxtPlugin(() => {
  if (!import.meta.dev || !("serviceWorker" in navigator)) return;

  void navigator.serviceWorker
    .getRegistrations()
    .then((registrations) =>
      Promise.all(
        registrations.map((registration) => registration.unregister()),
      ),
    );

  if ("caches" in window) {
    void caches
      .keys()
      .then((keys) => Promise.all(keys.map((key) => caches.delete(key))));
  }
});
