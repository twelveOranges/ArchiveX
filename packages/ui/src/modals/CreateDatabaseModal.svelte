<script lang="ts">
  import { dataProvider } from "../stores";
  import { FIELD_TYPES, getFieldIcon } from "@archivex/core";
  import type { FieldDefinition, FieldType } from "@archivex/core";

  export let closeModal: () => void;
  export let onCreated: () => void;

  let dbName = "";
  let fields: FieldDefinition[] = [{ name: "title", type: "text", label: "Title" }];

  // Add field popup state
  let showAddFieldPopup = false;
  let newFieldName = "";
  let newFieldType: FieldType = "text";

  // Rename state
  let renamingIndex: number | null = null;
  let renameValue = "";

  function openAddFieldPopup() {
    newFieldName = "";
    newFieldType = "text";
    showAddFieldPopup = true;
  }

  function confirmAddField() {
    const label = newFieldName.trim() || FIELD_TYPES.find(ft => ft.type === newFieldType)?.label || newFieldType;
    let baseName = label.toLowerCase().replace(/\s+/g, "_");
    let name = baseName;
    let suffix = 1;
    while (fields.some((f) => f.name === name)) {
      suffix++;
      name = `${baseName}${suffix}`;
    }
    let finalLabel = label;
    if (suffix > 1) {
      finalLabel = `${label} ${suffix}`;
    }
    fields = [...fields, { name, type: newFieldType, label: finalLabel }];
    showAddFieldPopup = false;
  }

  function cancelAddField() {
    showAddFieldPopup = false;
  }

  function startRename(index: number) {
    renamingIndex = index;
    renameValue = fields[index].label || fields[index].name;
  }

  function confirmRename() {
    if (renamingIndex === null) return;
    const newLabel = renameValue.trim();
    if (!newLabel) { renamingIndex = null; return; }

    let baseName = newLabel.toLowerCase().replace(/\s+/g, "_");
    let name = baseName;
    let suffix = 1;
    while (fields.some((f, i) => i !== renamingIndex && f.name === name)) {
      suffix++;
      name = `${baseName}${suffix}`;
    }
    let finalLabel = newLabel;
    if (suffix > 1) {
      finalLabel = `${newLabel} ${suffix}`;
    }

    fields[renamingIndex] = { ...fields[renamingIndex], name, label: finalLabel };
    fields = [...fields];
    renamingIndex = null;
  }

  function cancelRename() {
    renamingIndex = null;
  }

  function removeField(index: number) {
    fields = fields.filter((_, i) => i !== index);
  }

  async function handleCreate() {
    if (!dbName.trim()) { alert("Database name is required"); return; }
    if (fields.length === 0) { alert("At least one field is required"); return; }

    const provider = $dataProvider;
    if (!provider) return;

    try {
      await provider.createDatabase(dbName.trim(), fields);
      closeModal();
      onCreated();
    } catch (e) {
      alert("Failed to create database: " + (e as Error).message);
    }
  }
</script>

<div class="modal-title">Create New Database</div>
<div class="modal-group">
  <label class="modal-label">Database Name</label>
  <input type="text" class="modal-input" bind:value={dbName} placeholder="Enter database name..." />
</div>
<div class="modal-group">
  <label class="modal-label">Fields</label>
  <div class="archivex-field-list">
    {#each fields as field, i}
      <div class="archivex-field-row">
        <span class="archivex-field-row-icon">{getFieldIcon(field.type)}</span>
        {#if renamingIndex === i}
          <input
            type="text"
            class="archivex-field-rename-input"
            bind:value={renameValue}
            on:keydown={(e) => { if (e.key === 'Enter') confirmRename(); if (e.key === 'Escape') cancelRename(); }}
            on:blur={confirmRename}
          />
        {:else}
          <span class="archivex-field-row-label archivex-field-row-label-clickable" on:click={() => startRename(i)} on:keypress={() => startRename(i)} role="button" tabindex="0">{field.label || field.name}</span>
        {/if}
        <span class="archivex-field-row-type">{field.type}</span>
        <div class="archivex-field-row-actions">
          <button class="archivex-field-action-btn archivex-field-delete-btn" on:click={() => removeField(i)}>✕</button>
        </div>
      </div>
    {/each}
  </div>
  <button class="archivex-add-field-btn" on:click={openAddFieldPopup}>
    <span>+</span> Add Field
  </button>
</div>

{#if showAddFieldPopup}
  <div class="archivex-popup-overlay" on:click={cancelAddField} on:keypress={cancelAddField} role="button" tabindex="0">
    <div class="archivex-popup" on:click|stopPropagation on:keypress|stopPropagation role="dialog">
      <div class="archivex-popup-title">Add Field</div>
      <div class="modal-group">
        <label class="modal-label">Field Name</label>
        <input
          type="text"
          class="modal-input"
          bind:value={newFieldName}
          placeholder="Leave empty for default name..."
          on:keydown={(e) => { if (e.key === 'Enter') confirmAddField(); if (e.key === 'Escape') cancelAddField(); }}
        />
      </div>
      <div class="modal-group">
        <label class="modal-label">Field Type</label>
        <div class="archivex-type-grid">
          {#each FIELD_TYPES as ft}
            <div
              class="archivex-type-grid-item"
              class:selected={newFieldType === ft.type}
              on:click={() => newFieldType = ft.type}
              on:keypress={() => newFieldType = ft.type}
              role="button"
              tabindex="0"
            >
              <span class="archivex-type-grid-icon">{ft.icon}</span>
              <span class="archivex-type-grid-label">{ft.label}</span>
            </div>
          {/each}
        </div>
      </div>
      <div class="modal-actions">
        <button class="archivex-btn" on:click={cancelAddField}>Cancel</button>
        <button class="archivex-btn archivex-btn-primary" on:click={confirmAddField}>Add</button>
      </div>
    </div>
  </div>
{/if}

<div class="modal-actions">
  <button class="archivex-btn" on:click={closeModal}>Cancel</button>
  <button class="archivex-btn archivex-btn-primary" on:click={handleCreate}>Create</button>
</div>
