<script setup lang="ts">
import { navigateTo } from "#imports";

await navigateTo("/settings/account", {
  redirectCode: 302,
  replace: true,
});
</script>
