import type { CapacitorConfig } from "@capacitor/cli";

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
};

export default config;
