<script setup lang="ts">
import { navigateTo } from "#imports";

await navigateTo("/settings/plugins", { redirectCode: 302, replace: true });
</script>
