<script lang="ts">
  import { dataProvider } from "../stores";
  import type { Database, DatabaseRecord } from "@archivex/core";

  export let closeModal: () => void;
  export let database: Database & { name: string };
  export let record: DatabaseRecord;
  export let index: number;
  export let onEdit: (index: number) => void;
  export let onDelete: (index: number) => void;
  export let openLightbox: (images: string[], index: number) => void;

  function getAssetUrl(path: string): string {
    const provider = $dataProvider;
    if (!provider || !path) return "";
    return provider.getAssetUrl(path);
  }

  function getTitle(): string {
    const titleField = database.schema.fields.find((f) => f.type === "text");
    return titleField ? String(record[titleField.name] || "Record") : "Record";
  }
</script>

<div class="preview-header">
  <div class="modal-title" style="margin:0">{getTitle()}</div>
  <div class="preview-actions">
    <button class="archivex-btn" on:click={() => { closeModal(); onEdit(index); }}>✏️ Edit</button>
    <button class="archivex-btn archivex-btn-danger" on:click={() => { onDelete(index); }}>🗑️ Delete</button>
  </div>
</div>
<div class="preview-body">
  {#each database.schema.fields as field}
    {#if record[field.name] !== null && record[field.name] !== undefined && record[field.name] !== ""}
      <div class="preview-field">
        <div class="preview-field-label">{field.label || field.name}</div>

        {#if field.type === "image"}
          <div class="preview-media">
            {#each (Array.isArray(record[field.name]) ? record[field.name] : [String(record[field.name])]) as path, pi}
              {#if path}
                <img
                  class="preview-img"
                  src={getAssetUrl(String(path))}
                  alt=""
                  on:click|stopPropagation={() => openLightbox([getAssetUrl(String(path))], 0)}
                  on:keypress={() => {}}
                  role="button"
                  tabindex="0"
                />
              {/if}
            {/each}
          </div>
        {:else if field.type === "video"}
          <div class="preview-media">
            {#each (Array.isArray(record[field.name]) ? record[field.name] : [String(record[field.name])]) as path}
              {#if path}
                <video class="preview-video" src={getAssetUrl(String(path))} controls>
                  <track kind="captions" />
                </video>
              {/if}
            {/each}
          </div>
        {:else if field.type === "audio"}
          <div class="preview-media">
            {#each (Array.isArray(record[field.name]) ? record[field.name] : [String(record[field.name])]) as path}
              {#if path}
                <audio class="preview-audio" src={getAssetUrl(String(path))} controls></audio>
              {/if}
            {/each}
          </div>
        {:else if (field.type === "tags" || field.type === "multiselect") && Array.isArray(record[field.name])}
          <div class="archivex-tags">
            {#each record[field.name] as tag}
              <span class="archivex-tag">{tag}</span>
            {/each}
          </div>
        {:else if field.type === "checkbox"}
          <div class="preview-field-value">{record[field.name] ? "✅ Yes" : "❌ No"}</div>
        {:else if field.type === "url"}
          <div class="preview-field-value">
            <a href={String(record[field.name])} target="_blank" style="color:var(--accent)">{record[field.name]}</a>
          </div>
        {:else}
          <div class="preview-field-value">{record[field.name]}</div>
        {/if}
      </div>
    {/if}
  {/each}
</div>