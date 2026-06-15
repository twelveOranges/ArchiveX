<script lang="ts">
  import { dataProvider } from "../stores";
  import type { Database, DatabaseRecord } from "@archivex/core";
  import Icon from "../components/Icon.svelte";

  export let database: Database & { name: string };
  export let sortedRecords: { record: DatabaseRecord; originalIndex: number }[];
  export let cardSize: number;
  export let onRecordClick: (record: DatabaseRecord, index: number) => void;
  export let onAddClick: () => void;
  // @ts-ignore - openLightbox reserved for future use
  export let openLightbox: ((images: string[], index: number) => void) | undefined = undefined;
  export let multiSelect: boolean = false;
  export let selectedIndices: Set<number> = new Set();
  export let onToggleSelect: (index: number) => void = () => {};

  function getAssetUrl(path: string): string {
    const provider = $dataProvider;
    if (!provider || !path) return "";
    return provider.getAssetUrl(path);
  }

  function getCoverImage(record: DatabaseRecord): string | null {
    const imageField = database.schema.fields.find((f) => f.type === "image");
    if (!imageField) return null;
    const value = record[imageField.name];
    if (!value) return null;
    const firstPath = Array.isArray(value) ? value[0] : String(value);
    return firstPath ? getAssetUrl(firstPath) : null;
  }

  function getTitle(record: DatabaseRecord): string {
    const titleField = database.schema.fields.find((f) => f.type === "text");
    if (!titleField) return "";
    return String(record[titleField.name] || "");
  }

  function handleCardClick(record: DatabaseRecord, originalIndex: number) {
    onRecordClick(record, originalIndex);
  }
</script>

<div class="archivex-card-grid" style="grid-template-columns: repeat(auto-fill, minmax({cardSize}px, 1fr))">
  {#if !multiSelect}
    <div class="archivex-card archivex-add-card" on:click={onAddClick} on:keypress={onAddClick} role="button" tabindex="0">
      <div class="archivex-add-card-content">
        <div class="archivex-db-card-create-icon">+</div>
        <div class="archivex-db-card-create-text">Add Record</div>
      </div>
    </div>
  {/if}

  {#each sortedRecords as { record, originalIndex }}
    <div
      class="archivex-card"
      class:selected={multiSelect && selectedIndices.has(originalIndex)}
      on:click={() => handleCardClick(record, originalIndex)}
      on:keypress={() => handleCardClick(record, originalIndex)}
      role="button"
      tabindex="0"
    >
      {#if multiSelect}
        <!-- svelte-ignore a11y-click-events-have-key-events -->
        <!-- svelte-ignore a11y-no-static-element-interactions -->
        <div class="archivex-card-checkbox" on:click|stopPropagation={() => onToggleSelect(originalIndex)}>
          {#if selectedIndices.has(originalIndex)}
            <span class="archivex-checkbox-checked"><Icon name="check" size={12} /></span>
          {:else}
            <span class="archivex-checkbox-unchecked"></span>
          {/if}
        </div>
      {/if}
      <div class="archivex-card-cover">
        {#if getCoverImage(record)}
          <img src={getCoverImage(record)} alt="" on:error={(e) => { e.currentTarget.style.display = 'none'; }} />
        {:else}
          <div class="archivex-card-cover-placeholder"><Icon name="file" size={24} /></div>
        {/if}
      </div>
      <div class="archivex-card-body">
        {#if getTitle(record)}
          <div class="archivex-card-title">{getTitle(record)}</div>
        {/if}
      </div>
    </div>
  {/each}
</div>
