<script lang="ts">
  import { onMount } from "svelte";
  import { dataProvider, platform, currentPage, currentDatabase } from "../stores";
  import type { DatabaseInfo } from "@archivex/core";
  import CreateDatabaseModal from "../modals/CreateDatabaseModal.svelte";
  import EditDatabaseModal from "../modals/EditDatabaseModal.svelte";
  import BackupRestoreModal from "../modals/BackupRestoreModal.svelte";
  import Icon from "../components/Icon.svelte";

  export let openModal: (component: any, props?: any) => void;
  // @ts-ignore - closeModal passed from parent but used only for child modals
  export let closeModal: (() => void) | undefined = undefined;

  let databases: DatabaseInfo[] = [];
  let longPressTimer: ReturnType<typeof setTimeout> | null = null;
  let activeCardName: string | null = null;

  onMount(() => {
    loadDatabases();
    // Dismiss actions when tapping elsewhere
    document.addEventListener("click", dismissActions);
    return () => document.removeEventListener("click", dismissActions);
  });

  function dismissActions() {
    if (activeCardName) {
      activeCardName = null;
    }
  }

  function handleTouchStart(name: string) {
    longPressTimer = setTimeout(() => {
      activeCardName = name;
    }, 500);
  }

  function handleTouchEnd() {
    if (longPressTimer) {
      clearTimeout(longPressTimer);
      longPressTimer = null;
    }
  }

  onMount(() => {
    loadDatabases();
  });

  async function loadDatabases() {
    const provider = $dataProvider;
    if (!provider) return;
    try {
      databases = await provider.listDatabases();
    } catch (e) {
      console.error("Failed to load databases:", e);
    }
  }

  async function openDatabase(name: string) {
    const provider = $dataProvider;
    if (!provider) return;
    try {
      const db = await provider.getDatabase(name);
      $currentDatabase = db;
      $currentPage = "detail";
    } catch (e) {
      alert("Failed to open database: " + (e as Error).message);
    }
  }

  function showCreateDialog() {
    openModal(CreateDatabaseModal, { onCreated: loadDatabases });
  }

  function showEditDialog(name: string) {
    openModal(EditDatabaseModal, { dbName: name, onSaved: loadDatabases });
  }

  async function confirmDelete(name: string) {
    if (!confirm(`Are you sure you want to delete "${name}"? This action cannot be undone.`)) return;
    const provider = $dataProvider;
    if (!provider) return;
    try {
      await provider.deleteDatabase(name);
      await loadDatabases();
    } catch (e) {
      alert("Failed to delete: " + (e as Error).message);
    }
  }

  function showSettings() {
    openModal(BackupRestoreModal);
  }
</script>

<div class="archivex-home-header">
  <h2>ArchiveX Databases</h2>
  <div class="archivex-home-actions">
    {#if $platform === "web"}
      <button class="archivex-btn" on:click={showSettings}><Icon name="settings" size={14} /> Settings</button>
    {/if}
  </div>
</div>

<div class="archivex-db-grid">
  {#each databases as db}
    <div
      class="archivex-db-card"
      class:show-actions={activeCardName === db.name}
      on:click={() => openDatabase(db.name)}
      on:keypress={() => openDatabase(db.name)}
      on:touchstart={() => handleTouchStart(db.name)}
      on:touchend={handleTouchEnd}
      on:touchmove={handleTouchEnd}
      role="button"
      tabindex="0"
    >
      <div class="archivex-db-card-actions">
        <button class="archivex-db-card-action-btn" title="Edit" on:click|stopPropagation={() => showEditDialog(db.name)}><Icon name="edit" size={14} /></button>
        <button class="archivex-db-card-action-btn archivex-db-card-delete-btn" title="Delete" on:click|stopPropagation={() => confirmDelete(db.name)}><Icon name="trash" size={14} /></button>
      </div>
      <div class="archivex-db-card-icon"><Icon name="folder" size={28} /></div>
      <div class="archivex-db-card-info">
        <h3>{db.name}</h3>
        <div class="archivex-db-card-meta">{db.recordCount} records · {db.fieldCount} fields</div>
      </div>
    </div>
  {/each}

  <div class="archivex-db-card archivex-db-card-create" on:click={showCreateDialog} on:keypress={showCreateDialog} role="button" tabindex="0">
    <div class="archivex-db-card-create-icon">+</div>
    <div class="archivex-db-card-create-text">New Database</div>
  </div>
</div>
