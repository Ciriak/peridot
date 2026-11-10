import tailwindcss from "@tailwindcss/vite";

export default defineNuxtConfig({
  compatibilityDate: "2026-11-10",
  devtools: { enabled: false },
  css: ["~/assets/css/tailwind.css"],
  vite: { plugins: [tailwindcss()] },
  app: {
    head: {
      htmlAttrs: { class: "dark" },
      title: "Peridot — Your music. Your space.",
      meta: [
        { name: "description", content: "Your self-hosted music library." },
      ],
    },
  },
});
