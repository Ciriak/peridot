<script setup lang="ts">
import { navigateTo } from "#imports";

await navigateTo("/settings/overview", {
  redirectCode: 302,
  replace: true,
});
</script>
