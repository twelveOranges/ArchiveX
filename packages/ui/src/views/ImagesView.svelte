<script lang="ts">
  import { dataProvider } from "../stores";
  import type { Database, DatabaseRecord, FieldDefinition } from "@archivex/core";
  import Icon from "../components/Icon.svelte";

  export let database: Database & { name: string };
  export let cardSize: number;
  export let onAddClick: () => void;
  export let openLightbox: (images: string[], index: number) => void;

  let fieldFilter: string[] = [];

  $: imageFields = database.schema.fields.filter((f) => f.type === "image");
  $: fieldsToShow = fieldFilter.length > 0 ? imageFields.filter((f) => fieldFilter.includes(f.name)) : imageFields;
  $: allImages = collectImages(database.records, fieldsToShow);

  function getAssetUrl(path: string): string {
    const provider = $dataProvider;
    if (!provider || !path) return "";
    return provider.getAssetUrl(path);
  }

  function collectImages(records: DatabaseRecord[], fields: FieldDefinition[]) {
    const images: { path: string; url: string }[] = [];
    for (const record of records) {
      for (const field of fields) {
        const value = record[field.name];
        if (value) {
          const paths = Array.isArray(value) ? value : [String(value)];
          for (const p of paths) {
            if (p) images.push({ path: String(p), url: getAssetUrl(String(p)) });
          }
        }
      }
    }
    return images;
  }

  function toggleFilter(fieldName: string, checked: boolean) {
    if (checked) {
      fieldFilter = [...fieldFilter, fieldName];
    } else {
      fieldFilter = fieldFilter.filter((f) => f !== fieldName);
    }
    // If all are selected, reset to empty (show all)
    if (fieldFilter.length === imageFields.length) {
      fieldFilter = [];
    }
  }

  function handleImageClick(index: number) {
    openLightbox(allImages.map((img) => img.url), index);
  }
</script>

{#if imageFields.length === 0}
  <div class="archivex-empty-state">
    <div class="archivex-empty-icon"><Icon name="image" size={48} /></div>
    <p>No image fields in this database.</p>
  </div>
{:else}
  <div class="archivex-images-filter">
    <span class="archivex-images-filter-label">Show:</span>
    {#each imageFields as field}
      <label class="archivex-images-filter-item">
        <input
          type="checkbox"
          checked={fieldFilter.length === 0 || fieldFilter.includes(field.name)}
          on:change={(e) => toggleFilter(field.name, e.currentTarget.checked)}
        />
        <span>{field.label || field.name}</span>
      </label>
    {/each}
  </div>

  <div class="archivex-card-grid" style="grid-template-columns: repeat(auto-fill, minmax({cardSize}px, 1fr))">
    <div class="archivex-gallery-item archivex-db-card-create" on:click={onAddClick} on:keypress={onAddClick} role="button" tabindex="0">
      <div class="archivex-db-card-create-icon">+</div>
    </div>

    {#each allImages as img, i}
      <div class="archivex-gallery-item" on:click={() => handleImageClick(i)} on:keypress={() => handleImageClick(i)} role="button" tabindex="0">
        <img class="archivex-gallery-img" src={img.url} alt="" />
      </div>
    {/each}
  </div>
{/if}
