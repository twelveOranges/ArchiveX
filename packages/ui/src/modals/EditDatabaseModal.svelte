<script lang="ts">
  import { dataProvider } from "../stores";
  import { FIELD_TYPES, getFieldIcon } from "@archivex/core";
  import type { FieldDefinition, FieldType } from "@archivex/core";

  export let closeModal: () => void;
  export let dbName: string;
  export let onSaved: () => void;

  let newName = dbName;
  let fields: FieldDefinition[] = [];
  let showTypeMenu = false;
  let loading = true;

  // Load database fields on mount
  import { onMount } from "svelte";
  onMount(async () => {
    const provider = $dataProvider;
    if (!provider) return;
    try {
      const db = await provider.getDatabase(dbName);
      fields = [...db.schema.fields];
    } catch (e) {
      alert("Failed to load database: " + (e as Error).message);
    }
    loading = false;
  });

  function addField(type: FieldType, label: string) {
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
    fields = [...fields, { name, type, label: finalLabel }];
    showTypeMenu = false;
  }

  function removeField(index: number) {
    fields = fields.filter((_, i) => i !== index);
  }

  async function handleSave() {
    if (!newName.trim()) { alert("Database name is required"); return; }
    if (fields.length === 0) { alert("At least one field is required"); return; }

    const provider = $dataProvider;
    if (!provider) return;

    try {
      await provider.updateDatabase(dbName, newName.trim() !== dbName ? newName.trim() : undefined, fields);
      closeModal();
      onSaved();
    } catch (e) {
      alert("Failed to save: " + (e as Error).message);
    }
  }
</script>

<div class="modal-title">Edit Database</div>
{#if loading}
  <p>Loading...</p>
{:else}
  <div class="modal-group">
    <label class="modal-label">Database Name</label>
    <input type="text" class="modal-input" bind:value={newName} />
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
          <div class="archivex-type-menu-item" on:click={() => addField(ft.type, ft.label)} on:keypress={() => addField(ft.type, ft.label)} role="button" tabindex="0">
            <span>{ft.icon}</span><span>{ft.label}</span>
          </div>
        {/each}
      </div>
    {/if}
  </div>
  <div class="modal-actions">
    <button class="archivex-btn" on:click={closeModal}>Cancel</button>
    <button class="archivex-btn archivex-btn-primary" on:click={handleSave}>Save</button>
  </div>
{/if}