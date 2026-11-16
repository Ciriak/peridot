import type { CapacitorConfig } from "@capacitor/cli";

const clientVersion =
  process.env.PERIDOT_CLIENT_VERSION?.trim() || "0.0.0-local.0";

const config: CapacitorConfig = {
  appId: "app.peridot.android",
  appName: "Peridot",
  webDir: "../web/.output/public",
  backgroundColor: "#0A0A0A",
  android: {
    backgroundColor: "#0A0A0A",
    loggingBehavior: "none",
    webContentsDebuggingEnabled: false,
  },
  server: {
    hostname: "localhost",
    androidScheme: "http",
  },
  plugins: {
    CapacitorUpdater: {
      appReadyTimeout: 15_000,
      autoDeleteFailed: true,
      autoDeletePrevious: true,
      autoUpdate: false,
      channelUrl: "",
      nativeUpdatePrompt: false,
      periodCheckDelay: 0,
      publicKey:
        "-----BEGIN RSA PUBLIC KEY-----\nMIIBCgKCAQEAvToKrHj8QuAm+1qLRgueZbtX9u0G1JpMEhEKMmaeiFx7xfF9+NWh\nW8fNr5ZgfqZjBIJoB5vFPtVUiPSrpe6yVu3iUuzaUj6cYemwrDunAnXjpafEJASl\nQKmCVUyLuxSq6hX/cB8D46Y/qa94KDY5pL7Q9XAYnj/8xT5DjtLFfR/Vb1uVtayh\nS6LAYydmKoIq4gmbCvyX1ngFaHPPWRO2cuMTE71hoitDaYbLqBRAhulilj/C/SOx\nLXCVBLmqM9ZBlyyHlb3cSyOoRAlLod/XIJEs2LJluGdDE4uneZ/jNirFjL5RyDK3\nyIsaqAppC3jO0fCkFf7XKzta0zeFSA1OtQIDAQAB\n-----END RSA PUBLIC KEY-----\n",
      resetWhenUpdate: true,
      statsUrl: "",
      updateUrl: "",
      version: clientVersion,
    },
  },
};

export default config;
