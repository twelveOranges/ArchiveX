<script lang="ts">
  import { dataProvider, currentPage, currentDatabase, currentMode, cardSize } from "./stores";
  import HomePage from "./pages/HomePage.svelte";
  import DatabaseDetail from "./pages/DatabaseDetail.svelte";
  import Modal from "./components/Modal.svelte";
  import Lightbox from "./components/Lightbox.svelte";

  // Modal state
  let showModal = false;
  let modalComponent: any = null;
  let modalProps: any = {};

  // Lightbox state
  let showLightbox = false;
  let lightboxImages: string[] = [];
  let lightboxIndex = 0;

  export function openModal(component: any, props: any = {}) {
    modalComponent = component;
    modalProps = props;
    showModal = true;
  }

  export function closeModal() {
    showModal = false;
    modalComponent = null;
    modalProps = {};
  }

  export function openLightbox(images: string[], index: number) {
    lightboxImages = images;
    lightboxIndex = index;
    showLightbox = true;
  }

  export function closeLightbox() {
    showLightbox = false;
  }

  function handleKeydown(e: KeyboardEvent) {
    if (showLightbox) {
      if (e.key === "Escape") closeLightbox();
      if (e.key === "ArrowLeft") lightboxIndex = (lightboxIndex - 1 + lightboxImages.length) % lightboxImages.length;
      if (e.key === "ArrowRight") lightboxIndex = (lightboxIndex + 1) % lightboxImages.length;
    } else if (showModal && e.key === "Escape") {
      closeModal();
    }
  }
</script>

<svelte:window on:keydown={handleKeydown} />

<div class="archivex-app">
  <div class="archivex-view-container">
    {#if $currentPage === "home"}
      <HomePage {openModal} {closeModal} />
    {:else if $currentPage === "detail"}
      <DatabaseDetail {openModal} {closeModal} {openLightbox} />
    {/if}
  </div>

  {#if showModal && modalComponent}
    <Modal onClose={closeModal}>
      <svelte:component this={modalComponent} {...modalProps} {closeModal} {openLightbox} />
    </Modal>
  {/if}

  {#if showLightbox}
    <Lightbox images={lightboxImages} bind:index={lightboxIndex} onClose={closeLightbox} />
  {/if}
</div>
