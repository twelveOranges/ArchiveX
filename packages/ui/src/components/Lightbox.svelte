<script lang="ts">
  export let images: string[];
  export let index: number;
  export let onClose: () => void;

  function prev() {
    index = (index - 1 + images.length) % images.length;
  }

  function next() {
    index = (index + 1) % images.length;
  }
</script>

<div class="lightbox" on:click={onClose} on:keypress={() => {}} role="dialog" tabindex="-1">
  <button class="lightbox-close" on:click|stopPropagation={onClose}>×</button>
  <button class="lightbox-nav lightbox-prev" on:click|stopPropagation={prev}>‹</button>
  <button class="lightbox-nav lightbox-next" on:click|stopPropagation={next}>›</button>
  <div class="lightbox-img-container" on:click|stopPropagation={() => {}} on:keypress={() => {}} role="img">
    <img class="lightbox-img" src={images[index]} alt="" />
  </div>
  <div class="lightbox-counter">{index + 1} / {images.length}</div>
</div>
