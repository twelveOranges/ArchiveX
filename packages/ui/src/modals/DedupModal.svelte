<script lang="ts">
  import type { Database, DatabaseRecord, FieldDefinition } from "@archivex/core";
  import { dataProvider } from "../stores";
  import Icon from "../components/Icon.svelte";
  import MergeRecordsModal from "./MergeRecordsModal.svelte";

  export let closeModal: () => void;
  export let database: Database & { name: string };
  export let openModal: (component: any, props?: any) => void;
  export let onMerged: (() => void) | undefined = undefined;

  // Selected fields for dedup comparison
  let selectedFields: string[] = [];
  let duplicateGroups: { key: string; indices: number[]; records: DatabaseRecord[] }[] = [];
  let searched = false;

  // Group UI state
  let expandedGroups: Set<number> = new Set();
  let selectedGroups: Set<number> = new Set();

  // All non-file fields that can be compared
  $: comparableFields = database.schema.fields.filter(
    (f: FieldDefinition) => !["image", "video", "audio", "file"].includes(f.type)
  );

  function toggleField(fieldName: string) {
    if (selectedFields.includes(fieldName)) {
      selectedFields = selectedFields.filter(f => f !== fieldName);
    } else {
      selectedFields = [...selectedFields, fieldName];
    }
    // Reset results when fields change
    searched = false;
    duplicateGroups = [];
    expandedGroups = new Set();
    selectedGroups = new Set();
  }

  function findDuplicates() {
    if (selectedFields.length === 0) return;

    const groups = new Map<string, { indices: number[]; records: DatabaseRecord[] }>();

    for (let i = 0; i < database.records.length; i++) {
      const record = database.records[i];
      // Build a key from selected fields
      const keyParts = selectedFields.map(fieldName => {
        const val = record[fieldName];
        if (val === null || val === undefined || val === "") return "__EMPTY__";
        if (Array.isArray(val)) return val.sort().join("|");
        return String(val).trim().toLowerCase();
      });
      const key = keyParts.join(":::");

      // Skip records where all selected fields are empty
      if (keyParts.every(p => p === "__EMPTY__")) continue;

      if (!groups.has(key)) {
        groups.set(key, { indices: [], records: [] });
      }
      groups.get(key)!.indices.push(i);
      groups.get(key)!.records.push(record);
    }

    // Only keep groups with more than 1 record (actual duplicates)
    duplicateGroups = Array.from(groups.entries())
      .filter(([_, g]) => g.indices.length > 1)
      .map(([key, g]) => ({ key, ...g }));

    searched = true;
    expandedGroups = new Set();
    selectedGroups = new Set();
  }

  function toggleExpand(gi: number) {
    const s = new Set(expandedGroups);
    if (s.has(gi)) {
      s.delete(gi);
    } else {
      s.add(gi);
    }
    expandedGroups = s;
  }

  function toggleGroupSelect(gi: number) {
    const s = new Set(selectedGroups);
    if (s.has(gi)) {
      s.delete(gi);
    } else {
      s.add(gi);
    }
    selectedGroups = s;
  }

  function selectAllGroups() {
    if (selectedGroups.size === duplicateGroups.length) {
      selectedGroups = new Set();
    } else {
      selectedGroups = new Set(duplicateGroups.map((_, i) => i));
    }
  }

  // Sequential merge: process selected groups one by one
  let mergeQueue: number[] = [];

  function startMergeSelected() {
    if (selectedGroups.size === 0) return;
    // Build queue of group indices to merge (sorted ascending)
    mergeQueue = Array.from(selectedGroups).sort((a, b) => a - b);
    closeModal();
    // Start processing the first group
    processNextMerge();
  }

  function processNextMerge() {
    if (mergeQueue.length === 0) {
      // All done, refresh
      if (onMerged) onMerged();
      return;
    }

    const groupIdx = mergeQueue.shift()!;
    const group = duplicateGroups[groupIdx];
    if (!group) {
      processNextMerge();
      return;
    }

    // Track whether onMerged was called (merge succeeded)
    let merged = false;

    openModal(MergeRecordsModal, {
      database,
      indices: group.indices,
      onMerged: () => {
        merged = true;
        // After merge completes, process next group
        setTimeout(() => processNextMerge(), 150);
      },
      // Override closeModal to also handle "Cancel" (skip to next group)
      onCancel: () => {
        if (!merged) {
          // User cancelled this group, move to next
          setTimeout(() => processNextMerge(), 150);
        }
      },
    });
  }

  function getFieldDisplay(record: DatabaseRecord, field: FieldDefinition): string {
    const val = record[field.name];
    if (val === null || val === undefined || val === "") return "-";
    if (Array.isArray(val)) return val.join(", ");
    return String(val);
  }

  function getRecordTitle(record: DatabaseRecord): string {
    const titleField = database.schema.fields.find((f) => f.type === "text");
    return titleField ? String(record[titleField.name] || "Record") : "Record";
  }

  function getAssetUrl(path: string): string {
    const provider = $dataProvider;
    if (!provider || !path) return "";
    return provider.getAssetUrl(path);
  }

  function getFirstImage(record: DatabaseRecord): string | null {
    const imgField = database.schema.fields.find(f => f.type === "image");
    if (!imgField) return null;
    const val = record[imgField.name];
    if (!val) return null;
    const path = Array.isArray(val) ? val[0] : String(val);
    return path ? getAssetUrl(path) : null;
  }
</script>

<div class="dedup-modal">
  <div class="modal-title">Find Duplicates</div>

  <div class="dedup-field-select">
    <span class="dedup-label">Select fields to compare:</span>
    <div class="dedup-fields">
      {#each comparableFields as field}
        <button
          class="archivex-filter-chip"
          class:active={selectedFields.includes(field.name)}
          on:click={() => toggleField(field.name)}
        >{field.label || field.name}</button>
      {/each}
    </div>
  </div>

  <div class="dedup-actions">
    <button
      class="archivex-btn archivex-btn-primary"
      disabled={selectedFields.length === 0}
      on:click={findDuplicates}
    ><Icon name="search" size={14} /> Find Duplicates</button>
    {#if searched && duplicateGroups.length > 0}
      <button
        class="archivex-btn"
        on:click={selectAllGroups}
      >{selectedGroups.size === duplicateGroups.length ? "Deselect All" : "Select All"}</button>
      <button
        class="archivex-btn archivex-btn-primary"
        disabled={selectedGroups.size === 0}
        on:click={startMergeSelected}
      ><Icon name="link" size={14} /> Merge Selected ({selectedGroups.size})</button>
    {/if}
    <button class="archivex-btn" on:click={closeModal}>Close</button>
  </div>

  {#if searched}
    <div class="dedup-results">
      {#if duplicateGroups.length === 0}
        <div class="dedup-empty">No duplicates found.</div>
      {:else}
        <div class="dedup-summary">{duplicateGroups.length} duplicate group(s) found ({duplicateGroups.reduce((sum, g) => sum + g.records.length, 0)} records total)</div>
        <div class="dedup-groups">
          {#each duplicateGroups as group, gi}
            <div class="dedup-group" class:selected={selectedGroups.has(gi)}>
              <div class="dedup-group-header" on:click={() => toggleExpand(gi)} on:keypress={() => toggleExpand(gi)} role="button" tabindex="0">
                <!-- Checkbox -->
                <label class="dedup-group-checkbox" on:click|stopPropagation on:keypress|stopPropagation>
                  <input
                    type="checkbox"
                    checked={selectedGroups.has(gi)}
                    on:change={() => toggleGroupSelect(gi)}
                  />
                </label>
                <!-- Expand/collapse arrow -->
                <span class="dedup-group-arrow" class:expanded={expandedGroups.has(gi)}>▶</span>
                <span class="dedup-group-title">Group {gi + 1}</span>
                <span class="dedup-group-count">{group.records.length} records</span>
                <!-- Show first record title as hint -->
                <span class="dedup-group-hint">{getRecordTitle(group.records[0])}</span>
              </div>
              {#if expandedGroups.has(gi)}
                <div class="dedup-group-items">
                  {#each group.records as record, ri}
                    <div class="dedup-item">
                      {#if getFirstImage(record)}
                        <img class="dedup-item-thumb" src={getFirstImage(record)} alt="" />
                      {/if}
                      <div class="dedup-item-info">
                        <span class="dedup-item-title">{getRecordTitle(record)}</span>
                        <span class="dedup-item-index">#{group.indices[ri] + 1}</span>
                        <div class="dedup-item-fields">
                          {#each selectedFields as fieldName}
                            {@const field = database.schema.fields.find(f => f.name === fieldName)}
                            {#if field}
                              <span class="dedup-item-field">
                                <span class="dedup-item-field-label">{field.label || field.name}:</span>
                                {getFieldDisplay(record, field)}
                              </span>
                            {/if}
                          {/each}
                        </div>
                      </div>
                    </div>
                  {/each}
                </div>
              {/if}
            </div>
          {/each}
        </div>
      {/if}
    </div>
  {/if}
</div>

<style>
  .dedup-modal {
    max-height: 70vh;
    overflow-y: auto;
  }

  .dedup-field-select {
    margin: 12px 0;
  }

  .dedup-label {
    font-size: 0.85em;
    font-weight: 600;
    color: var(--text-muted);
    display: block;
    margin-bottom: 8px;
  }

  .dedup-fields {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }

  .dedup-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin: 12px 0;
    padding-bottom: 12px;
    border-bottom: 1px solid var(--background-modifier-border, #e0e0e0);
  }

  .dedup-results {
    margin-top: 12px;
  }

  .dedup-empty {
    text-align: center;
    color: var(--text-muted);
    padding: 20px;
    font-size: 0.9em;
  }

  .dedup-summary {
    font-size: 0.85em;
    color: var(--text-muted);
    margin-bottom: 12px;
    font-weight: 600;
  }

  .dedup-groups {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .dedup-group {
    border: 1px solid var(--background-modifier-border, #e0e0e0);
    border-radius: 6px;
    overflow: hidden;
    transition: border-color 0.15s;
  }

  .dedup-group.selected {
    border-color: var(--accent, #3b82f6);
    box-shadow: 0 0 0 1px var(--accent, #3b82f6);
  }

  .dedup-group-header {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 12px;
    background: var(--background-secondary, #f5f5f5);
    border-bottom: 1px solid var(--background-modifier-border, #e0e0e0);
    cursor: pointer;
    user-select: none;
  }

  .dedup-group-header:hover {
    background: var(--bg-hover, rgba(0, 0, 0, 0.05));
  }

  .dedup-group-checkbox {
    display: flex;
    align-items: center;
    cursor: pointer;
  }

  .dedup-group-checkbox input {
    cursor: pointer;
    width: 16px;
    height: 16px;
  }

  .dedup-group-arrow {
    font-size: 0.7em;
    color: var(--text-muted);
    transition: transform 0.2s;
    display: inline-block;
  }

  .dedup-group-arrow.expanded {
    transform: rotate(90deg);
  }

  .dedup-group-title {
    font-size: 0.85em;
    font-weight: 600;
    white-space: nowrap;
  }

  .dedup-group-count {
    font-size: 0.75em;
    color: var(--text-muted);
    background: var(--background-modifier-border, #e0e0e0);
    padding: 2px 8px;
    border-radius: 10px;
    white-space: nowrap;
  }

  .dedup-group-hint {
    font-size: 0.8em;
    color: var(--text-muted);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    flex: 1;
    min-width: 0;
  }

  .dedup-group-items {
    display: flex;
    flex-direction: column;
  }

  .dedup-item {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 8px 12px 8px 40px;
    border-bottom: 1px solid var(--background-modifier-border, #e0e0e0);
  }

  .dedup-item:last-child {
    border-bottom: none;
  }

  .dedup-item-thumb {
    width: 40px;
    height: 40px;
    border-radius: 4px;
    object-fit: cover;
    flex-shrink: 0;
  }

  .dedup-item-info {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 6px;
  }

  .dedup-item-title {
    font-size: 0.85em;
    font-weight: 600;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 150px;
  }

  .dedup-item-index {
    font-size: 0.72em;
    color: var(--text-muted);
    background: var(--background-modifier-border, #e0e0e0);
    padding: 1px 6px;
    border-radius: 8px;
  }

  .dedup-item-fields {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
    width: 100%;
    margin-top: 2px;
  }

  .dedup-item-field {
    font-size: 0.75em;
    color: var(--text-muted);
    background: var(--background-secondary, #f5f5f5);
    padding: 2px 6px;
    border-radius: 4px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 200px;
  }

  .dedup-item-field-label {
    font-weight: 600;
    margin-right: 2px;
  }
</style>
