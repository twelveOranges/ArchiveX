<script lang="ts">
  import { dataProvider } from "../stores";
  import type { Database, DatabaseRecord, FieldDefinition } from "@archivex/core";
  import Icon from "../components/Icon.svelte";

  export let database: Database & { name: string };
  export let onClose: () => void;
  export let openLightbox: (images: string[], index: number) => void;
  export let startRecordIndex: number = -1; // If >= 0, start at this record's slide

  // Collect all image fields
  $: imageFields = database.schema.fields.filter(
    (f) => f.type === "image" || f.type === "video"
  );

  // Build slides: each record becomes a slide with all its images
  $: slides = buildSlides(database.records, imageFields);

  let currentSlide = 0;
  let initialized = false;

  // Set initial slide based on startRecordIndex
  $: if (!initialized && slides.length > 0 && startRecordIndex >= 0) {
    const idx = slides.findIndex(s => s.recordIndex === startRecordIndex);
    if (idx >= 0) currentSlide = idx;
    initialized = true;
  }

  interface SlideImage {
    url: string;
    path: string;
    fieldLabel: string;
    isVideo: boolean;
  }

  interface Slide {
    recordIndex: number;
    title: string;
    images: SlideImage[];
  }

  function getAssetUrl(path: string): string {
    const provider = $dataProvider;
    if (!provider || !path) return "";
    return provider.getAssetUrl(path);
  }

  function buildSlides(records: DatabaseRecord[], fields: FieldDefinition[]): Slide[] {
    const result: Slide[] = [];
    const titleField = database.schema.fields.find((f) => f.type === "text");

    for (let i = 0; i < records.length; i++) {
      const record = records[i];
      const images: SlideImage[] = [];

      for (const field of fields) {
        const val = record[field.name];
        if (!val) continue;
        const paths = Array.isArray(val) ? val : [String(val)];
        for (const p of paths) {
          if (p) {
            images.push({
              url: getAssetUrl(String(p)),
              path: String(p),
              fieldLabel: field.label || field.name,
              isVideo: field.type === "video",
            });
          }
        }
      }

      // Only include records that have at least one image
      if (images.length > 0) {
        result.push({
          recordIndex: i,
          title: titleField ? String(record[titleField.name] || `Record ${i + 1}`) : `Record ${i + 1}`,
          images,
        });
      }
    }
    return result;
  }

  function prev() {
    if (slides.length === 0) return;
    currentSlide = (currentSlide - 1 + slides.length) % slides.length;
  }

  function next() {
    if (slides.length === 0) return;
    currentSlide = (currentSlide + 1) % slides.length;
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === "Escape") onClose();
    else if (e.key === "ArrowLeft") prev();
    else if (e.key === "ArrowRight") next();
  }

  function handleImageClick(slide: Slide, imgIndex: number) {
    const urls = slide.images.filter((img) => !img.isVideo).map((img) => img.url);
    const nonVideoIndex = slide.images.slice(0, imgIndex).filter((img) => !img.isVideo).length;
    if (urls.length > 0) {
      openLightbox(urls, nonVideoIndex);
    }
  }

  // Determine grid layout class based on image count
  function getLayoutClass(count: number): string {
    if (count === 1) return "layout-single";
    if (count === 2) return "layout-duo";
    if (count === 3) return "layout-trio";
    if (count === 4) return "layout-quad";
    if (count <= 6) return "layout-grid-6";
    return "layout-grid-many";
  }
</script>

<svelte:window on:keydown={handleKeydown} />

<div class="slideshow-overlay">
  <div class="slideshow-header">
    <div class="slideshow-title">
      {#if slides.length > 0}
        <span class="slideshow-record-name">{slides[currentSlide]?.title}</span>
        <span class="slideshow-counter">{currentSlide + 1} / {slides.length}</span>
      {:else}
        <span class="slideshow-record-name">No images found</span>
      {/if}
    </div>
    <button class="slideshow-close-btn" on:click={onClose}>
      <Icon name="x" size={20} />
    </button>
  </div>

  {#if slides.length > 0}
    <div class="slideshow-body">
      <button class="slideshow-nav slideshow-nav-prev" on:click={prev} disabled={slides.length <= 1}>
        <Icon name="arrow-left" size={24} />
      </button>

      <div class="slideshow-content">
        {#each [slides[currentSlide]] as slide (currentSlide)}
          <div class="slideshow-grid {getLayoutClass(slide.images.length)}">
            {#each slide.images as img, idx}
              <div
                class="slideshow-image-item"
                on:click={() => handleImageClick(slide, idx)}
                on:keypress={() => handleImageClick(slide, idx)}
                role="button"
                tabindex="0"
              >
                {#if img.isVideo}
                  <video class="slideshow-media" src={img.url} controls preload="metadata">
                    <track kind="captions" />
                  </video>
                  <span class="slideshow-media-badge"><Icon name="video" size={12} /> Video</span>
                {:else}
                  <img class="slideshow-media" src={img.url} alt="" />
                {/if}
                <span class="slideshow-field-badge">{img.fieldLabel}</span>
              </div>
            {/each}
          </div>
        {/each}
      </div>

      <button class="slideshow-nav slideshow-nav-next" on:click={next} disabled={slides.length <= 1}>
        <Icon name="arrow-right" size={24} />
      </button>
    </div>
  {:else}
    <div class="slideshow-empty">
      <Icon name="image" size={64} />
      <p>No images in this database.</p>
    </div>
  {/if}
</div>

<style>
  .slideshow-overlay {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.92);
    z-index: 9999;
    display: flex;
    flex-direction: column;
    color: #fff;
  }

  .slideshow-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 16px 24px;
    flex-shrink: 0;
  }

  .slideshow-title {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .slideshow-record-name {
    font-size: 1.2em;
    font-weight: 600;
  }

  .slideshow-counter {
    font-size: 0.9em;
    opacity: 0.6;
    background: rgba(255, 255, 255, 0.1);
    padding: 2px 10px;
    border-radius: 12px;
  }

  .slideshow-close-btn {
    background: rgba(255, 255, 255, 0.1);
    border: none;
    color: #fff;
    width: 40px;
    height: 40px;
    border-radius: 50%;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: background 0.2s;
  }

  .slideshow-close-btn:hover {
    background: rgba(255, 255, 255, 0.2);
  }

  .slideshow-body {
    flex: 1;
    display: flex;
    align-items: center;
    overflow: hidden;
    min-height: 0;
  }

  .slideshow-nav {
    flex-shrink: 0;
    background: rgba(255, 255, 255, 0.08);
    border: none;
    color: #fff;
    width: 48px;
    height: 48px;
    border-radius: 50%;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    margin: 0 16px;
    transition: background 0.2s, opacity 0.2s;
  }

  .slideshow-nav:hover:not(:disabled) {
    background: rgba(255, 255, 255, 0.2);
  }

  .slideshow-nav:disabled {
    opacity: 0.3;
    cursor: default;
  }

  .slideshow-content {
    flex: 1;
    height: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 16px 0;
    min-width: 0;
    overflow: auto;
  }

  .slideshow-grid {
    display: grid;
    gap: 8px;
    width: 100%;
    height: 100%;
    max-width: 90vw;
    max-height: calc(100vh - 120px);
  }

  /* Adaptive layouts based on image count */
  .layout-single {
    grid-template-columns: 1fr;
    grid-template-rows: 1fr;
  }

  .layout-duo {
    grid-template-columns: 1fr 1fr;
    grid-template-rows: 1fr;
  }

  .layout-trio {
    grid-template-columns: 2fr 1fr;
    grid-template-rows: 1fr 1fr;
  }

  .layout-trio .slideshow-image-item:first-child {
    grid-row: 1 / -1;
  }

  .layout-quad {
    grid-template-columns: 1fr 1fr;
    grid-template-rows: 1fr 1fr;
  }

  .layout-grid-6 {
    grid-template-columns: repeat(3, 1fr);
    grid-template-rows: 1fr 1fr;
  }

  .layout-grid-many {
    grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
    grid-auto-rows: minmax(150px, 1fr);
  }

  .slideshow-image-item {
    position: relative;
    border-radius: 8px;
    overflow: hidden;
    cursor: pointer;
    background: rgba(255, 255, 255, 0.05);
    transition: transform 0.2s;
    min-height: 0;
  }

  .slideshow-image-item:hover {
    transform: scale(1.01);
  }

  .slideshow-media {
    width: 100%;
    height: 100%;
    object-fit: contain;
    display: block;
  }

  .slideshow-field-badge {
    position: absolute;
    bottom: 8px;
    left: 8px;
    background: rgba(0, 0, 0, 0.7);
    color: #fff;
    font-size: 0.72em;
    padding: 2px 8px;
    border-radius: 10px;
    opacity: 0;
    transition: opacity 0.2s;
  }

  .slideshow-image-item:hover .slideshow-field-badge {
    opacity: 1;
  }

  .slideshow-media-badge {
    position: absolute;
    top: 8px;
    right: 8px;
    background: rgba(0, 0, 0, 0.7);
    color: #fff;
    font-size: 0.75em;
    padding: 3px 8px;
    border-radius: 10px;
    display: flex;
    align-items: center;
    gap: 4px;
  }

  .slideshow-empty {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    opacity: 0.5;
    gap: 16px;
  }

  .slideshow-empty p {
    font-size: 1.1em;
  }
</style>
