<script lang="ts">
  export let onClose: () => void;

  function handleOverlayClick(e: MouseEvent) {
    if (e.target === e.currentTarget) {
      onClose();
    }
  }
</script>

<!-- svelte-ignore a11y-no-noninteractive-element-interactions -->
<div class="archivex-modal-wrapper modal-overlay" on:click={handleOverlayClick} on:keypress={() => {}} role="dialog" tabindex="-1">
  <!-- svelte-ignore a11y-no-noninteractive-element-interactions -->
  <div class="modal-content" on:click|stopPropagation={() => {}} on:keypress={() => {}} role="document">
    <slot />
  </div>
</div>
