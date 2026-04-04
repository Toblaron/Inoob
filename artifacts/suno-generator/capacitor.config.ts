import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.toblaron.inoob",
  appName: "inoob",
  webDir: "dist/public",
  server: {
    androidScheme: "https",
    // Set VITE_API_BASE_URL at build time to point to your deployed API server.
    // Example: API_URL=https://your-server.com pnpm build:mobile
    // For local dev with a running API server on port 3000, set:
    // API_URL=http://10.0.2.2:3000 (Android emulator) or your LAN IP
  },
  android: {
    backgroundColor: "#000000",
    allowMixedContent: true,
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 800,
      backgroundColor: "#000000",
      showSpinner: false,
    },
    StatusBar: {
      style: "dark",
      backgroundColor: "#000000",
    },
    Keyboard: {
      resize: "body",
      style: "dark",
    },
  },
};

export default config;
