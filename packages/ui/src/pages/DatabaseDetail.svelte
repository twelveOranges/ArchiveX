<script lang="ts">
  import { dataProvider, currentPage, currentDatabase, currentMode, cardSize, sortField, sortOrder, multiSelectMode, selectedIndices, platform } from "../stores";
  import type { DatabaseRecord } from "@archivex/core";
  import CardView from "../views/CardView.svelte";
  import ImagesView from "../views/ImagesView.svelte";
  import TableView from "../views/TableView.svelte";
  import ListView from "../views/ListView.svelte";
  import AddRecordModal from "../modals/AddRecordModal.svelte";
  import RecordPreviewModal from "../modals/RecordPreviewModal.svelte";
  import MergeRecordsModal from "../modals/MergeRecordsModal.svelte";
  import Icon from "../components/Icon.svelte";

  export let openModal: (component: any, props?: any) => void;
  export let closeModal: () => void;
  export let openLightbox: (images: string[], index: number) => void;

  // Sorted records with original indices
  $: sortedRecords = getSortedRecords($currentDatabase, $sortField, $sortOrder);

  function getSortedRecords(db: any, field: string, order: string): { record: DatabaseRecord; originalIndex: number }[] {
    if (!db || !db.records) return [];
    const indexed = db.records.map((record: DatabaseRecord, i: number) => ({ record, originalIndex: i }));
    if (field === "added") {
      // Sort by original index (add time)
      return order === "asc" ? indexed : [...indexed].reverse();
    }
    // Sort by field value
    return [...indexed].sort((a, b) => {
      const va = a.record[field] ?? "";
      const vb = b.record[field] ?? "";
      const strA = String(va).toLowerCase();
      const strB = String(vb).toLowerCase();
      const cmp = strA.localeCompare(strB);
      return order === "asc" ? cmp : -cmp;
    });
  }

  function goBack() {
    if ($platform === "web") {
      // Use browser history so back button works naturally
      history.back();
    } else {
      $currentPage = "home";
      $currentDatabase = null;
    }
    exitMultiSelect();
  }

  function decreaseSize() {
    if ($cardSize > 60) $cardSize -= 20;
  }

  function increaseSize() {
    if ($cardSize < 300) $cardSize += 20;
  }

  function toggleSortOrder() {
    $sortOrder = $sortOrder === "asc" ? "desc" : "asc";
  }

  function toggleMultiSelect() {
    $multiSelectMode = !$multiSelectMode;
    if (!$multiSelectMode) {
      $selectedIndices = new Set();
    }
  }

  function exitMultiSelect() {
    $multiSelectMode = false;
    $selectedIndices = new Set();
  }

  function toggleSelection(originalIndex: number) {
    const s = new Set($selectedIndices);
    if (s.has(originalIndex)) {
      s.delete(originalIndex);
    } else {
      s.add(originalIndex);
    }
    $selectedIndices = s;
  }

  async function batchDelete() {
    const count = $selectedIndices.size;
    if (count === 0) return;
    if (!confirm(`Are you sure you want to delete ${count} record(s)?`)) return;
    const provider = $dataProvider;
    const db = $currentDatabase;
    if (!provider || !db) return;
    try {
      await provider.deleteRecords(db.name, Array.from($selectedIndices));
      exitMultiSelect();
      await refreshDatabase();
    } catch (e) {
      alert("Failed to delete records: " + (e as Error).message);
    }
  }

  function batchMerge() {
    const count = $selectedIndices.size;
    if (count < 2) {
      alert("Please select at least 2 records to merge.");
      return;
    }
    const db = $currentDatabase;
    if (!db) return;
    openModal(MergeRecordsModal, {
      database: db,
      indices: Array.from($selectedIndices),
      onMerged: () => {
        exitMultiSelect();
        refreshDatabase();
      },
    });
  }

  function showAddRecord() {
    openModal(AddRecordModal, {
      database: $currentDatabase,
      onSaved: refreshDatabase,
    });
  }

  function showRecordPreview(record: DatabaseRecord, originalIndex: number) {
    if ($multiSelectMode) {
      toggleSelection(originalIndex);
      return;
    }
    openModal(RecordPreviewModal, {
      database: $currentDatabase,
      record,
      index: originalIndex,
      onEdit: (idx: number) => showEditRecord(idx),
      onDelete: (idx: number) => confirmDeleteRecord(idx),
      openLightbox,
    });
  }

  function showEditRecord(index: number) {
    closeModal();
    const db = $currentDatabase;
    if (!db) return;
    openModal(AddRecordModal, {
      database: db,
      editIndex: index,
      editRecord: db.records[index],
      onSaved: refreshDatabase,
    });
  }

  async function confirmDeleteRecord(index: number) {
    closeModal();
    if (!confirm("Are you sure you want to delete this record?")) return;
    const provider = $dataProvider;
    const db = $currentDatabase;
    if (!provider || !db) return;
    try {
      await provider.deleteRecord(db.name, index);
      await refreshDatabase();
    } catch (e) {
      alert("Failed to delete record: " + (e as Error).message);
    }
  }

  async function refreshDatabase() {
    const provider = $dataProvider;
    const db = $currentDatabase;
    if (!provider || !db) return;
    try {
      $currentDatabase = await provider.getDatabase(db.name);
    } catch (e) {
      console.error("Failed to refresh database:", e);
    }
  }
</script>

{#if $currentDatabase}
  <div class="archivex-detail-header">
    <h2 class="archivex-detail-title">{$currentDatabase.name}</h2>
    <div class="archivex-detail-nav">
      <button class="archivex-btn-text" on:click={goBack}><Icon name="arrow-left" size={14} /> Back</button>
      <div class="archivex-nav-right">
        <!-- Sort controls -->
        <div class="archivex-sort-controls">
          <select class="archivex-sort-select" bind:value={$sortField}>
            <option value="added">Add Time</option>
            {#each $currentDatabase.schema.fields as field}
              <option value={field.name}>{field.label || field.name}</option>
            {/each}
          </select>
          <button class="archivex-sort-order-btn" on:click={toggleSortOrder} title={$sortOrder === "asc" ? "Ascending" : "Descending"}>
            {$sortOrder === "asc" ? "↑" : "↓"}
          </button>
        </div>

        <!-- Multi-select toggle -->
        <button
          class="archivex-btn-icon"
          class:active={$multiSelectMode}
          on:click={toggleMultiSelect}
          title="Multi-select"
        ><Icon name="check" size={14} /></button>

        <!-- Size controls -->
        <div class="archivex-size-controls">
          <button class="archivex-size-btn" on:click={decreaseSize}>−</button>
          <button class="archivex-size-btn" on:click={increaseSize}>+</button>
        </div>

        <select class="archivex-view-select" bind:value={$currentMode}>
          <option value="card">Cards</option>
          <option value="images">Images</option>
          <option value="table">Table</option>
          <option value="list">List</option>
        </select>
      </div>
    </div>
  </div>

  <!-- Multi-select action bar -->
  {#if $multiSelectMode}
    <div class="archivex-multiselect-bar">
      <span class="archivex-multiselect-count">{$selectedIndices.size} selected</span>
      <div class="archivex-multiselect-actions">
        <button class="archivex-btn archivex-btn-danger" on:click={batchDelete} disabled={$selectedIndices.size === 0}>
          <Icon name="trash" size={14} /> Delete
        </button>
        <button class="archivex-btn archivex-btn-primary" on:click={batchMerge} disabled={$selectedIndices.size < 2}>
          <Icon name="link" size={14} /> Merge
        </button>
        <button class="archivex-btn" on:click={exitMultiSelect}>Cancel</button>
      </div>
    </div>
  {/if}

  <div id="db-content">
    {#if $currentMode === "card"}
      <CardView database={$currentDatabase} {sortedRecords} cardSize={$cardSize} onRecordClick={showRecordPreview} onAddClick={showAddRecord} {openLightbox} multiSelect={$multiSelectMode} selectedIndices={$selectedIndices} onToggleSelect={toggleSelection} />
    {:else if $currentMode === "images"}
      <ImagesView database={$currentDatabase} cardSize={$cardSize} onAddClick={showAddRecord} {openLightbox} />
    {:else if $currentMode === "table"}
      <TableView database={$currentDatabase} onRecordClick={showRecordPreview} />
    {:else if $currentMode === "list"}
      <ListView database={$currentDatabase} onRecordClick={showRecordPreview} />
    {/if}
  </div>
{/if}
