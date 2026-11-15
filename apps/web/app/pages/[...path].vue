<script setup lang="ts">
import { navigateTo } from "#imports";

await navigateTo("/", { redirectCode: 302, replace: true });
</script>
