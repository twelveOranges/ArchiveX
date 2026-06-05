<script lang="ts">
  import { dataProvider } from "../stores";
  import { FIELD_TYPES, getFieldIcon } from "@archivex/core";
  import type { FieldDefinition, FieldType } from "@archivex/core";

  export let closeModal: () => void;
  export let onCreated: () => void;

  let dbName = "";
  let fields: FieldDefinition[] = [{ name: "title", type: "text", label: "Title" }];
  let showTypeMenu = false;
  let pendingFieldType: FieldType | null = null;
  let pendingFieldDefaultLabel = "";
  let customFieldName = "";

  function startAddField(type: FieldType, label: string) {
    pendingFieldType = type;
    pendingFieldDefaultLabel = label;
    customFieldName = "";
    showTypeMenu = false;
  }

  function confirmAddField() {
    if (!pendingFieldType) return;
    const inputLabel = customFieldName.trim() || pendingFieldDefaultLabel;
    let baseName = inputLabel.toLowerCase().replace(/\s+/g, "_");
    let name = baseName;
    let suffix = 1;
    while (fields.some((f) => f.name === name)) {
      suffix++;
      name = `${baseName}${suffix}`;
    }
    let finalLabel = inputLabel;
    if (suffix > 1) {
      finalLabel = `${inputLabel} ${suffix}`;
    }
    fields = [...fields, { name, type: pendingFieldType, label: finalLabel }];
    pendingFieldType = null;
    pendingFieldDefaultLabel = "";
    customFieldName = "";
  }

  function cancelAddField() {
    pendingFieldType = null;
    pendingFieldDefaultLabel = "";
    customFieldName = "";
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
        <span class="archivex-field-row-label">{field.label || field.name}</span>
        <span class="archivex-field-row-type">{field.type}</span>
        <div class="archivex-field-row-actions">
          <button class="archivex-field-action-btn archivex-field-delete-btn" on:click={() => removeField(i)}>Delete</button>
        </div>
      </div>
    {/each}
  </div>
  <button class="archivex-add-field-btn" on:click={() => showTypeMenu = !showTypeMenu}>
    <span>+</span> Add Field
  </button>
  {#if showTypeMenu}
    <div class="archivex-type-menu">
      {#each FIELD_TYPES as ft}
        <div class="archivex-type-menu-item" on:click={() => startAddField(ft.type, ft.label)} on:keypress={() => startAddField(ft.type, ft.label)} role="button" tabindex="0">
          <span>{ft.icon}</span><span>{ft.label}</span>
        </div>
      {/each}
    </div>
  {/if}
  {#if pendingFieldType}
    <div class="archivex-field-name-input">
      <input
        type="text"
        class="modal-input"
        bind:value={customFieldName}
        placeholder="Field name (leave empty for '{pendingFieldDefaultLabel}')"
        on:keydown={(e) => { if (e.key === 'Enter') confirmAddField(); if (e.key === 'Escape') cancelAddField(); }}
      />
      <div style="display:flex;gap:6px;margin-top:6px">
        <button class="archivex-btn archivex-btn-primary" on:click={confirmAddField}>OK</button>
        <button class="archivex-btn" on:click={cancelAddField}>Cancel</button>
      </div>
    </div>
  {/if}
</div>
<div class="modal-actions">
  <button class="archivex-btn" on:click={closeModal}>Cancel</button>
  <button class="archivex-btn archivex-btn-primary" on:click={handleCreate}>Create</button>
</div>
