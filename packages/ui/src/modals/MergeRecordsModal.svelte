<script lang="ts">
  import { dataProvider } from "../stores";
  import type { Database, DatabaseRecord, FieldDefinition } from "@archivex/core";
  import Icon from "../components/Icon.svelte";

  export let closeModal: () => void;
  export let database: Database & { name: string };
  export let indices: number[];
  export let onMerged: () => void;
  export let onCancel: (() => void) | undefined = undefined;

  const records = indices.map((i) => database.records[i]);
  const fields = database.schema.fields;

  // For each field, track which record indices are selected (supports multi-select for all fields)
  let selections: Record<string, number[]> = {};

  // Initialize selections: default to first non-null value for all fields
  for (const field of fields) {
    if (isMediaField(field)) {
      // For media fields, default select all that have values
      const selected: number[] = [];
      for (let i = 0; i < records.length; i++) {
        const val = records[i][field.name];
        if (val !== null && val !== undefined && val !== "") {
          selected.push(i);
        }
      }
      selections[field.name] = selected.length > 0 ? selected : [0];
    } else {
      // For non-media fields, default to first non-null; if all empty, select first record
      let found = -1;
      for (let i = 0; i < records.length; i++) {
        const val = records[i][field.name];
        if (val !== null && val !== undefined && val !== "") {
          found = i;
          break;
        }
      }
      selections[field.name] = [found >= 0 ? found : 0];
    }
  }

  function isMediaField(field: FieldDefinition): boolean {
    return field.type === "image" || field.type === "video" || field.type === "audio";
  }

  function getAssetUrl(path: string): string {
    const provider = $dataProvider;
    if (!provider || !path) return "";
    return provider.getAssetUrl(path);
  }

  function getMediaPaths(record: DatabaseRecord, fieldName: string): string[] {
    const val = record[fieldName];
    if (!val) return [];
    if (Array.isArray(val)) return val.filter(Boolean) as string[];
    return [String(val)];
  }

  function formatSize(bytes: number): string {
    if (bytes <= 0) return "";
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  function selectField(fieldName: string, recordIdx: number) {
    const field = fields.find((f) => f.name === fieldName);
    if (!field) return;

    // All fields now support toggle (multi-select)
    const current = selections[fieldName] || [];
    if (current.includes(recordIdx)) {
      // Deselect: allow removing even the last selection
      selections = { ...selections, [fieldName]: current.filter((i) => i !== recordIdx) };
    } else {
      selections = { ...selections, [fieldName]: [...current, recordIdx] };
    }
  }

  function isSelected(fieldName: string, recordIdx: number): boolean {
    return (selections[fieldName] || []).includes(recordIdx);
  }

  function getDisplayValue(record: DatabaseRecord, field: FieldDefinition): string {
    const val = record[field.name];
    if (val === null || val === undefined || val === "") return "—";
    if (field.type === "checkbox") return val ? "Yes" : "No";
    if (field.type === "tags" || field.type === "multiselect") {
      if (Array.isArray(val)) return val.join(", ");
    }
    return String(val);
  }

  let merging = false;

  function handleCancel() {
    if (onCancel) onCancel();
    closeModal();
  }

  async function doMerge() {
    const provider = $dataProvider;
    if (!provider) return;

    merging = true;
    try {
      // Build merged record
      const merged: DatabaseRecord = {};
      for (const field of fields) {
        const selectedIndices = selections[field.name] || [];
        if (isMediaField(field)) {
          const allPaths: string[] = [];
          for (const idx of selectedIndices) {
            const paths = getMediaPaths(records[idx], field.name);
            allPaths.push(...paths);
          }
          merged[field.name] = allPaths.length === 0 ? null : (allPaths.length === 1 ? allPaths[0] : allPaths);
        } else {
          if (selectedIndices.length === 0) {
            merged[field.name] = null;
          } else if (selectedIndices.length === 1) {
            merged[field.name] = records[selectedIndices[0]]?.[field.name] ?? null;
          } else {
            // Multiple selections: join values with semicolon
            const values = selectedIndices
              .map((idx) => records[idx]?.[field.name])
              .filter((v) => v !== null && v !== undefined && v !== "")
              .map((v) => String(v));
            merged[field.name] = values.join("; ");
          }
        }
      }

      // Delete original records and add merged one
      // Sort indices descending so deletion doesn't shift indices
      const sortedIndices = [...indices].sort((a, b) => b - a);
      const insertAt = Math.min(...indices);

      await provider.deleteRecords(database.name, indices);
      await provider.addRecord(database.name, merged);

      onMerged();
      closeModal();
    } catch (e) {
      alert("Failed to merge: " + (e as Error).message);
    }
    merging = false;
  }
</script>

<div class="merge-modal">
  <div class="modal-title">Merge {records.length} Records</div>
  <p class="merge-hint">Click to select/deselect values for each field. Multiple selections will be joined with semicolons.</p>

  <div class="merge-table-wrapper">
    <table class="merge-table">
      <thead>
        <tr>
          <th class="merge-field-header">Field</th>
          {#each records as _, ri}
            <th class="merge-record-header">Record {ri + 1}</th>
          {/each}
        </tr>
      </thead>
      <tbody>
        {#each fields as field}
          <tr class="merge-row">
            <td class="merge-field-name">
              <span class="merge-field-label">{field.label || field.name}</span>
              <span class="merge-field-type">{field.type}</span>
            </td>
            {#each records as record, ri}
              <td
                class="merge-cell"
                class:selected={(selections[field.name] || []).includes(ri)}
                on:click|stopPropagation={() => selectField(field.name, ri)}
                on:keypress|stopPropagation={() => selectField(field.name, ri)}
                role="button"
                tabindex="0"
              >
                <div class="merge-cell-inner">
                  {#if isMediaField(field)}
                    {@const paths = getMediaPaths(record, field.name)}
                    {#if paths.length > 0}
                      <div class="merge-media-grid">
                        {#each paths as path}
                          {#if field.type === "video"}
                            <div class="merge-media-item">
                              <video class="merge-thumb" src={getAssetUrl(path)} muted preload="metadata">
                                <track kind="captions" />
                              </video>
                              <span class="merge-media-icon"><Icon name="video" size={10} /></span>
                            </div>
                          {:else if field.type === "audio"}
                            <div class="merge-media-item merge-audio-item">
                              <Icon name="music" size={16} />
                            </div>
                          {:else}
                            <div class="merge-media-item">
                              <img class="merge-thumb" src={getAssetUrl(path)} alt="" />
                            </div>
                          {/if}
                        {/each}
                      </div>
                      <span class="merge-media-count">{paths.length} file{paths.length > 1 ? "s" : ""}</span>
                    {:else}
                      <span class="merge-empty">—</span>
                    {/if}
                  {:else}
                    <span class="merge-text-value">{getDisplayValue(record, field)}</span>
                  {/if}
                </div>
                <div class="merge-check">
                  {#if (selections[field.name] || []).includes(ri)}
                    <Icon name="check-circle" size={16} />
                  {:else}
                    <span class="merge-uncheck"></span>
                  {/if}
                </div>
              </td>
            {/each}
          </tr>
        {/each}
      </tbody>
    </table>
  </div>

  <div class="merge-actions">
    <button class="archivex-btn" on:click={handleCancel} disabled={merging}>Cancel</button>
    <button class="archivex-btn archivex-btn-primary" on:click={doMerge} disabled={merging}>
      {#if merging}
        Merging...
      {:else}
        <Icon name="link" size={14} /> Confirm Merge
      {/if}
    </button>
  </div>
</div>

<style>
  .merge-modal {
    max-width: 90vw;
    max-height: 80vh;
    display: flex;
    flex-direction: column;
  }

  .merge-hint {
    font-size: 0.85em;
    color: var(--text-muted, #888);
    margin: 0 0 16px 0;
  }

  .merge-table-wrapper {
    overflow: auto;
    flex: 1;
    border: 1px solid var(--border-color, #e0e0e0);
    border-radius: 8px;
  }

  .merge-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 0.9em;
  }

  .merge-table thead {
    position: sticky;
    top: 0;
    z-index: 2;
    background: var(--bg-secondary, #f5f5f5);
  }

  .merge-table th {
    padding: 10px 12px;
    text-align: left;
    font-weight: 600;
    border-bottom: 2px solid var(--border-color, #e0e0e0);
    white-space: nowrap;
  }

  .merge-field-header {
    min-width: 120px;
    position: sticky;
    left: 0;
    background: var(--bg-secondary, #f5f5f5);
    z-index: 3;
  }

  .merge-record-header {
    min-width: 160px;
    text-align: center !important;
  }

  .merge-row {
    border-bottom: 1px solid var(--border-color, #e0e0e0);
  }

  .merge-row:last-child {
    border-bottom: none;
  }

  .merge-field-name {
    padding: 10px 12px;
    position: sticky;
    left: 0;
    background: var(--bg-primary, #fff);
    z-index: 1;
    vertical-align: top;
  }

  .merge-field-label {
    display: block;
    font-weight: 500;
  }

  .merge-field-type {
    display: block;
    font-size: 0.75em;
    color: var(--text-muted, #888);
    margin-top: 2px;
  }

  .merge-cell {
    padding: 8px 12px;
    cursor: pointer;
    position: relative;
    vertical-align: top;
    transition: background 0.15s;
    border-left: 1px solid var(--border-color, #e0e0e0);
  }

  .merge-cell:hover {
    background: var(--bg-hover, rgba(0, 0, 0, 0.03));
  }

  .merge-cell.selected {
    background: var(--accent-bg, rgba(59, 130, 246, 0.08));
    outline: 2px solid var(--accent, #3b82f6);
    outline-offset: -2px;
    border-radius: 4px;
  }

  .merge-cell-inner {
    min-height: 24px;
  }

  .merge-check {
    position: absolute;
    top: 6px;
    right: 6px;
    color: var(--accent, #3b82f6);
  }

  .merge-uncheck {
    display: inline-block;
    width: 16px;
    height: 16px;
    border: 2px solid var(--border-color, #ccc);
    border-radius: 50%;
  }

  .merge-text-value {
    word-break: break-word;
    line-height: 1.4;
  }

  .merge-empty {
    color: var(--text-muted, #aaa);
  }

  .merge-media-grid {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
  }

  .merge-media-item {
    position: relative;
    width: 48px;
    height: 48px;
    border-radius: 4px;
    overflow: hidden;
    background: var(--bg-secondary, #f0f0f0);
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .merge-audio-item {
    color: var(--text-muted, #888);
  }

  .merge-thumb {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .merge-media-icon {
    position: absolute;
    bottom: 2px;
    right: 2px;
    background: rgba(0, 0, 0, 0.6);
    color: white;
    border-radius: 3px;
    padding: 1px 3px;
    line-height: 1;
  }

  .merge-media-count {
    display: block;
    font-size: 0.75em;
    color: var(--text-muted, #888);
    margin-top: 4px;
  }

  .merge-actions {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    margin-top: 16px;
    padding-top: 12px;
    border-top: 1px solid var(--border-color, #e0e0e0);
  }
</style>
