<script setup lang="ts">
import { navigateTo } from "#imports";

await navigateTo("/settings/administration", {
  redirectCode: 302,
  replace: true,
});
</script>
