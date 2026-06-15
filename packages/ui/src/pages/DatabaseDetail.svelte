<script lang="ts">
  import { dataProvider, currentPage, currentDatabase, currentMode, cardSize, sortField, sortOrder, multiSelectMode, selectedIndices, platform } from "../stores";
  import type { DatabaseRecord, FieldDefinition } from "@archivex/core";
  import CardView from "../views/CardView.svelte";
  import ImagesView from "../views/ImagesView.svelte";
  import TableView from "../views/TableView.svelte";
  import ListView from "../views/ListView.svelte";
  import SlideshowView from "../views/SlideView.svelte";
  import AddRecordModal from "../modals/AddRecordModal.svelte";
  import RecordPreviewModal from "../modals/RecordPreviewModal.svelte";
  import MergeRecordsModal from "../modals/MergeRecordsModal.svelte";
  import Icon from "../components/Icon.svelte";

  export let openModal: (component: any, props?: any) => void;
  export let closeModal: () => void;
  export let openLightbox: (images: string[], index: number) => void;

  // Filter state: fieldName -> selected option values
  let filterValues: Record<string, string[]> = {};
  let showFilterPanel = false;

  // Search state
  let searchQuery = "";

  // Get select/multiselect fields that have options
  $: filterableFields = ($currentDatabase?.schema.fields || []).filter(
    (f: FieldDefinition) => (f.type === "select" || f.type === "multiselect") && f.options && f.options.length > 0
  );

  // Check if any filter is active
  $: hasActiveFilter = Object.values(filterValues).some(v => v.length > 0);

  // Sorted + filtered + searched records
  $: sortedRecords = getFilteredRecords($currentDatabase, $sortField, $sortOrder, filterValues, searchQuery);

  function getFilteredRecords(db: any, field: string, order: string, filters: Record<string, string[]>, search: string): { record: DatabaseRecord; originalIndex: number }[] {
    if (!db || !db.records) return [];
    let indexed = db.records.map((record: DatabaseRecord, i: number) => ({ record, originalIndex: i }));

    // Apply filter
    for (const [fieldName, selectedOpts] of Object.entries(filters)) {
      if (selectedOpts.length === 0) continue;
      indexed = indexed.filter(({ record }) => {
        const val = record[fieldName];
        if (Array.isArray(val)) {
          // multiselect: record has array, check if any selected option is in it
          return val.some((v: any) => selectedOpts.includes(String(v)));
        }
        // select: single value
        return val !== null && val !== undefined && selectedOpts.includes(String(val));
      });
    }

    // Apply search - supports Chinese, numbers, case-insensitive
    // Exclude file-type fields (image, video, audio, file) whose values are hashes/filenames
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      const fileTypeFields = new Set(
        (db.schema.fields || [])
          .filter((f: FieldDefinition) => ["image", "video", "audio", "file"].includes(f.type))
          .map((f: FieldDefinition) => f.name)
      );
      indexed = indexed.filter(({ record }) => {
        for (const key of Object.keys(record)) {
          // Skip file-type fields (their values are hashes/paths, not user-searchable content)
          if (fileTypeFields.has(key)) continue;
          const val = record[key];
          if (val === null || val === undefined) continue;
          if (Array.isArray(val)) {
            if (val.some((v: any) => String(v).toLowerCase().includes(q))) return true;
          } else if (typeof val === "number") {
            if (String(val).includes(q)) return true;
          } else {
            if (String(val).toLowerCase().includes(q)) return true;
          }
        }
        return false;
      });
    }

    // Sort
    if (field === "added") {
      return order === "asc" ? indexed : [...indexed].reverse();
    }
    return [...indexed].sort((a, b) => {
      const va = a.record[field] ?? "";
      const vb = b.record[field] ?? "";
      const strA = String(va).toLowerCase();
      const strB = String(vb).toLowerCase();
      const cmp = strA.localeCompare(strB);
      return order === "asc" ? cmp : -cmp;
    });
  }

  function toggleFilterOption(fieldName: string, option: string) {
    const current = filterValues[fieldName] || [];
    if (current.includes(option)) {
      filterValues = { ...filterValues, [fieldName]: current.filter(o => o !== option) };
    } else {
      filterValues = { ...filterValues, [fieldName]: [...current, option] };
    }
  }

  function clearAllFilters() {
    filterValues = {};
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

        <!-- Filter button -->
        {#if filterableFields.length > 0}
          <button
            class="archivex-btn-icon"
            class:active={showFilterPanel || hasActiveFilter}
            on:click={() => showFilterPanel = !showFilterPanel}
            title="Filter"
          ><Icon name="filter" size={14} /></button>
        {/if}

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
          <option value="slide">Slide</option>
        </select>

        <!-- Search box -->
        <div class="archivex-search-box">
          <Icon name="search" size={14} />
          <input
            type="text"
            class="archivex-search-input"
            placeholder="Search..."
            bind:value={searchQuery}
          />
          {#if searchQuery}
            <span class="archivex-search-count">{sortedRecords.length} results</span>
            <button class="archivex-search-clear" on:click={() => searchQuery = ""}>×</button>
          {/if}
        </div>
      </div>
    </div>
  </div>

  <!-- Filter panel -->
  {#if showFilterPanel && filterableFields.length > 0}
    <div class="archivex-filter-panel">
      <div class="archivex-filter-panel-header">
        <span class="archivex-filter-panel-title">Filter</span>
        {#if hasActiveFilter}
          <button class="archivex-btn-text archivex-filter-clear" on:click={clearAllFilters}>Clear All</button>
        {/if}
      </div>
      {#each filterableFields as field}
        <div class="archivex-filter-group">
          <span class="archivex-filter-group-label">{field.label || field.name}</span>
          <div class="archivex-filter-options">
            {#each (field.options || []) as opt}
              <button
                class="archivex-filter-chip"
                class:active={(filterValues[field.name] || []).includes(opt)}
                on:click={() => toggleFilterOption(field.name, opt)}
              >{opt}</button>
            {/each}
          </div>
        </div>
      {/each}
    </div>
  {/if}

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
      <TableView database={$currentDatabase} {sortedRecords} onRecordClick={showRecordPreview} />
    {:else if $currentMode === "list"}
      <ListView database={$currentDatabase} {sortedRecords} onRecordClick={showRecordPreview} />
    {:else if $currentMode === "slide"}
      <SlideshowView database={$currentDatabase} onClose={() => { $currentMode = "card"; }} {openLightbox} />
    {/if}
  </div>
{/if}
