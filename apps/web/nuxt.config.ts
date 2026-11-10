export default defineNuxtConfig({
  compatibilityDate: "2026-11-10",
  devtools: { enabled: false },
  css: ["@peridot/ui/tokens.css"],
  app: {
    head: {
      title: "Peridot — Your music. Your space.",
      meta: [
        { name: "description", content: "Your self-hosted music library." },
      ],
    },
  },
});
