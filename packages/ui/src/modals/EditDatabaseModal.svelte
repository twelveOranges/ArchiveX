<script lang="ts">
  import { dataProvider } from "../stores";
  import { FIELD_TYPES, DATABASE_ICONS, getFieldIcon } from "@archivex/core";
  import type { FieldDefinition, FieldType } from "@archivex/core";
  import Icon from "../components/Icon.svelte";

  export let closeModal: () => void;
  export let dbName: string;
  export let onSaved: () => void;

  let newName = dbName;
  let dbIcon = "folder";
  let fields: FieldDefinition[] = [];
  let loading = true;

  // Track field renames: oldName -> newName
  let renamedFields: Record<string, string> = {};
  let originalFieldNames: string[] = [];

  // Add field popup state
  let showAddFieldPopup = false;
  let newFieldName = "";
  let newFieldType: FieldType = "text";
  let newFieldOptions = "";

  // Rename state
  let renamingIndex: number | null = null;
  let renameValue = "";

  // Edit options state
  let editingOptionsIndex: number | null = null;
  let editingOptionsValue = "";

  import { onMount } from "svelte";
  onMount(async () => {
    const provider = $dataProvider;
    if (!provider) return;
    try {
      const db = await provider.getDatabase(dbName);
      fields = [...db.schema.fields];
      originalFieldNames = db.schema.fields.map(f => f.name);
      dbIcon = db.schema.icon || "folder";
    } catch (e) {
      alert("Failed to load database: " + (e as Error).message);
    }
    loading = false;
  });

  function openAddFieldPopup() {
    newFieldName = "";
    newFieldType = "text";
    newFieldOptions = "";
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

    const field: FieldDefinition = { name, type: newFieldType, label: finalLabel };

    // Add options for select/multiselect
    if (newFieldType === "select" || newFieldType === "multiselect") {
      const opts = newFieldOptions.split(",").map(s => s.trim()).filter(Boolean);
      if (opts.length === 0) {
        alert("Please provide at least one option for select/multiselect field");
        return;
      }
      field.options = opts;
    }

    fields = [...fields, field];
    showAddFieldPopup = false;
  }

  function cancelAddField() {
    showAddFieldPopup = false;
  }

  function startEditOptions(index: number) {
    editingOptionsIndex = index;
    editingOptionsValue = (fields[index].options || []).join(", ");
  }

  function confirmEditOptions() {
    if (editingOptionsIndex === null) return;
    const opts = editingOptionsValue.split(",").map(s => s.trim()).filter(Boolean);
    if (opts.length === 0) {
      alert("Please provide at least one option");
      return;
    }
    fields[editingOptionsIndex] = { ...fields[editingOptionsIndex], options: opts };
    fields = [...fields];
    editingOptionsIndex = null;
  }

  function cancelEditOptions() {
    editingOptionsIndex = null;
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

    const oldName = fields[renamingIndex].name;
    fields[renamingIndex] = { ...fields[renamingIndex], name, label: finalLabel };
    fields = [...fields];

    // Track the rename: find the original name for this field
    if (oldName !== name) {
      const origKey = Object.entries(renamedFields).find(([_, v]) => v === oldName)?.[0];
      if (origKey) {
        renamedFields[origKey] = name;
      } else if (originalFieldNames.includes(oldName)) {
        renamedFields[oldName] = name;
      }
    }
    renamingIndex = null;
  }

  function cancelRename() {
    renamingIndex = null;
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
      const renameMap = Object.keys(renamedFields).length > 0 ? renamedFields : undefined;
      await provider.updateDatabase(dbName, newName.trim() !== dbName ? newName.trim() : undefined, fields, renameMap, dbIcon);
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
    <label class="modal-label" for="edit-db-name">Database Name</label>
    <input type="text" id="edit-db-name" class="modal-input" bind:value={newName} />
  </div>

  <div class="modal-group">
    <span class="modal-label">Icon</span>
    <div class="archivex-icon-grid">
      {#each DATABASE_ICONS as iconItem}
        <div
          class="archivex-icon-grid-item"
          class:selected={dbIcon === iconItem.name}
          on:click={() => dbIcon = iconItem.name}
          on:keypress={() => dbIcon = iconItem.name}
          role="button"
          tabindex="0"
          title={iconItem.label}
        >
          <Icon name={iconItem.name} size={20} />
        </div>
      {/each}
    </div>
  </div>

  <div class="modal-group">
    <span class="modal-label">Fields</span>
    <div class="archivex-field-list">
      {#each fields as field, i}
        <div class="archivex-field-row">
          <span class="archivex-field-row-icon"><Icon name={getFieldIcon(field.type)} size={14} /></span>
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
          {#if field.options}
            <!-- svelte-ignore a11y-click-events-have-key-events -->
            <span class="archivex-field-row-options archivex-field-row-options-clickable" title="Click to edit options" on:click={() => startEditOptions(i)} role="button" tabindex="0">({field.options.join(", ")})</span>
          {/if}
          <div class="archivex-field-row-actions">
            {#if (field.type === 'select' || field.type === 'multiselect') && !field.options}
              <button class="archivex-field-action-btn" on:click={() => startEditOptions(i)} title="Add options"><Icon name="list" size={12} /></button>
            {/if}
            <button class="archivex-field-action-btn archivex-field-delete-btn" on:click={() => removeField(i)}><Icon name="x" size={12} /></button>
          </div>
        </div>
      {/each}
    </div>
    <button class="archivex-add-field-btn" on:click={openAddFieldPopup}>
      <span>+</span> Add Field
    </button>
  </div>

  {#if editingOptionsIndex !== null}
    <div class="archivex-popup-overlay" on:click={cancelEditOptions} on:keypress={cancelEditOptions} role="button" tabindex="0">
      <!-- svelte-ignore a11y-no-noninteractive-element-interactions -->
      <div class="archivex-popup" on:click|stopPropagation on:keypress|stopPropagation role="dialog">
        <div class="archivex-popup-title">Edit Options - {fields[editingOptionsIndex].label || fields[editingOptionsIndex].name}</div>
        <div class="modal-group">
          <label class="modal-label" for="edit-options-input">Options (comma separated)</label>
          <input
            type="text"
            id="edit-options-input"
            class="modal-input"
            bind:value={editingOptionsValue}
            placeholder="Option1, Option2, Option3..."
            on:keydown={(e) => { if (e.key === 'Enter') confirmEditOptions(); if (e.key === 'Escape') cancelEditOptions(); }}
          />
        </div>
        <div class="modal-actions">
          <button class="archivex-btn" on:click={cancelEditOptions}>Cancel</button>
          <button class="archivex-btn archivex-btn-primary" on:click={confirmEditOptions}>Save</button>
        </div>
      </div>
    </div>
  {/if}

  {#if showAddFieldPopup}
    <div class="archivex-popup-overlay" on:click={cancelAddField} on:keypress={cancelAddField} role="button" tabindex="0">
      <!-- svelte-ignore a11y-no-noninteractive-element-interactions -->
      <div class="archivex-popup" on:click|stopPropagation on:keypress|stopPropagation role="dialog">
        <div class="archivex-popup-title">Add Field</div>
        <div class="modal-group">
          <label class="modal-label" for="add-field-name">Field Name</label>
          <input
            type="text"
            id="add-field-name"
            class="modal-input"
            bind:value={newFieldName}
            placeholder="Leave empty for default name..."
            on:keydown={(e) => { if (e.key === 'Enter') confirmAddField(); if (e.key === 'Escape') cancelAddField(); }}
          />
        </div>
        <div class="modal-group">
          <span class="modal-label">Field Type</span>
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
              <span class="archivex-type-grid-icon"><Icon name={ft.icon} size={16} /></span>
                <span class="archivex-type-grid-label">{ft.label}</span>
              </div>
            {/each}
          </div>
        </div>
        {#if newFieldType === "select" || newFieldType === "multiselect"}
          <div class="modal-group">
            <label class="modal-label" for="edit-field-options">Options (comma separated)</label>
            <input
              type="text"
              id="edit-field-options"
              class="modal-input"
              bind:value={newFieldOptions}
              placeholder="Option1, Option2, Option3..."
            />
          </div>
        {/if}
        <div class="modal-actions">
          <button class="archivex-btn" on:click={cancelAddField}>Cancel</button>
          <button class="archivex-btn archivex-btn-primary" on:click={confirmAddField}>Add</button>
        </div>
      </div>
    </div>
  {/if}

  <div class="modal-actions">
    <button class="archivex-btn" on:click={closeModal}>Cancel</button>
    <button class="archivex-btn archivex-btn-primary" on:click={handleSave}>Save</button>
  </div>
{/if}