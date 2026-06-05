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

  function formatCellValue(field: any, value: any): string {
    if (value === null || value === undefined || value === "") return "—";
    if (field.type === "image" || field.type === "video" || field.type === "audio") {
      return Array.isArray(value) ? `${value.length} files` : "1 file";
    }
    if (field.type === "tags" && Array.isArray(value)) {
      return value.join(", ");
    }
    return String(value);
  }
</script>

{#if database.records.length === 0}
  <div class="archivex-empty-state"><p>No records yet.</p></div>
{:else}
  <div class="archivex-table-wrapper">
    <table class="archivex-table">
      <thead>
        <tr>
          {#each database.schema.fields as field}
            <th>{field.label || field.name}</th>
          {/each}
        </tr>
      </thead>
      <tbody>
        {#each database.records as record, i}
          <tr on:click={() => onRecordClick(record, i)} style="cursor:pointer">
            {#each database.schema.fields as field}
              <td>
                {#if field.type === "tags" && Array.isArray(record[field.name])}
                  {#each record[field.name] as tag}
                    <span class="archivex-tag">{tag}</span>
                  {/each}
                {:else}
                  {formatCellValue(field, record[field.name])}
                {/if}
              </td>
            {/each}
          </tr>
        {/each}
      </tbody>
    </table>
  </div>
{/if}
