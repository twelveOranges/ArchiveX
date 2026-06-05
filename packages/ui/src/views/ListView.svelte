<script lang="ts">
  import { dataProvider } from "../stores";
  import type { Database, DatabaseRecord } from "@archivex/core";

  export let database: Database & { name: string };
  export let onRecordClick: (record: DatabaseRecord, index: number) => void;

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
</script>

{#if database.records.length === 0}
  <div class="archivex-empty-state"><p>No records yet.</p></div>
{:else}
  <div class="archivex-list">
    {#each database.records as record, i}
      <div class="archivex-list-item" on:click={() => onRecordClick(record, i)} on:keypress={() => onRecordClick(record, i)} role="button" tabindex="0">
        {#if getCoverImage(record)}
          <div class="archivex-list-thumb">
            <img src={getCoverImage(record)} alt="" />
          </div>
        {/if}
        <div class="archivex-list-content">
          {#if getTitle(record)}
            <h4 class="archivex-list-title">{getTitle(record)}</h4>
          {/if}
          <div class="archivex-list-meta">
            {#each database.schema.fields as field}
              {#if field.type !== "image" && field.type !== "video" && field.type !== "audio" && field.type !== "text"}
                {#if record[field.name]}
                  {#if field.type === "tags" && Array.isArray(record[field.name])}
                    {#each record[field.name] as tag}
                      <span class="archivex-tag">{tag}</span>
                    {/each}
                  {:else}
                    <span class="archivex-list-meta-item">{field.label}: {record[field.name]}</span>
                  {/if}
                {/if}
              {/if}
            {/each}
          </div>
        </div>
      </div>
    {/each}
  </div>
{/if}
