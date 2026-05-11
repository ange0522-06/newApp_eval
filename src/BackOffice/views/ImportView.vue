<template>
  <div class="import-view">
    <ImportTab />
  </div>
</template>

<script>
import ImportTab from '../components/ImportTab.vue';

export default {
  name: 'ImportView',
  components: {
    ImportTab
  }
};
</script>

<style scoped>
.import-view {
  width: 100%;
  min-height: 100vh;
  background: #f5f5f5;
  padding: 20px 0;
}
</style>
