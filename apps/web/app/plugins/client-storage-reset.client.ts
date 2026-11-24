import { defineNuxtPlugin } from "#imports";
import { resetLegacyClientMetadata } from "../lib/client-storage-reset";

export default defineNuxtPlugin(() => {
  void resetLegacyClientMetadata();
});
