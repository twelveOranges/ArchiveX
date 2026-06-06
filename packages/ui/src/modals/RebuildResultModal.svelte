<script lang="ts">
  import { dataProvider } from "../stores";
  import type { UnreferencedFile } from "@archivex/core";

  export let closeModal: () => void;
  export let unreferencedFiles: UnreferencedFile[];
  export let rehashed: number;
  export let totalFiles: number;

  let selectedFiles: Set<string> = new Set();
  let selectAll = false;
  let deleting = false;
  let statusMsg = "";

  $: imageFiles = unreferencedFiles.filter((f) => f.type === "image");
  $: videoFiles = unreferencedFiles.filter((f) => f.type === "video");
  $: otherFiles = unreferencedFiles.filter((f) => f.type === "file");

  function formatSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  function getAssetUrl(filePath: string): string {
    const provider = $dataProvider;
    if (!provider || !filePath) return "";
    return provider.getAssetUrl(filePath);
  }

  function toggleSelectAll() {
    selectAll = !selectAll;
    if (selectAll) {
      selectedFiles = new Set(unreferencedFiles.map((f) => f.path));
    } else {
      selectedFiles = new Set();
    }
  }

  function toggleFile(filePath: string) {
    if (selectedFiles.has(filePath)) {
      selectedFiles.delete(filePath);
    } else {
      selectedFiles.add(filePath);
    }
    selectedFiles = new Set(selectedFiles);
    selectAll = selectedFiles.size === unreferencedFiles.length;
  }

  function getTotalSelectedSize(): string {
    const total = unreferencedFiles
      .filter((f) => selectedFiles.has(f.path))
      .reduce((sum, f) => sum + f.size, 0);
    return formatSize(total);
  }

  async function handleDeleteFiles() {
    if (selectedFiles.size === 0) return;
    if (!confirm(`Are you sure you want to delete ${selectedFiles.size} file(s)? This cannot be undone.`)) return;

    const provider = $dataProvider;
    if (!provider) return;

    deleting = true;
    try {
      await provider.cleanupFiles(Array.from(selectedFiles));
      unreferencedFiles = unreferencedFiles.filter((f) => !selectedFiles.has(f.path));
      selectedFiles = new Set();
      selectAll = false;
      statusMsg = `✅ Deleted successfully. ${unreferencedFiles.length} unreferenced file(s) remaining.`;
      if (unreferencedFiles.length === 0) {
        setTimeout(() => closeModal(), 1500);
      }
    } catch (e) {
      statusMsg = "❌ Delete failed: " + (e as Error).message;
    }
    deleting = false;
  }
</script>

<div class="modal-title">🔄 Rebuild Results</div>

<div class="rebuild-modal-summary">
  {#if rehashed > 0}
    <span>✅ Rehashed {rehashed} / {totalFiles} files.</span>
  {:else}
    <span>✅ All {totalFiles} file hashes are correct.</span>
  {/if}
  <span style="margin-left:8px">Found <strong>{unreferencedFiles.length}</strong> unreferenced file(s).</span>
</div>

{#if statusMsg}
  <div class="rebuild-modal-status">{statusMsg}</div>
{/if}

{#if unreferencedFiles.length > 0}
  <div class="rebuild-modal-toolbar">
    <label class="rebuild-modal-select-all">
      <input type="checkbox" checked={selectAll} on:change={toggleSelectAll} />
      <span>Select All</span>
    </label>
    <div class="rebuild-modal-toolbar-right">
      {#if selectedFiles.size > 0}
        <span class="rebuild-modal-selected-info">
          {selectedFiles.size} selected ({getTotalSelectedSize()})
        </span>
      {/if}
      <button
        class="archivex-btn archivex-btn-danger"
        on:click={handleDeleteFiles}
        disabled={selectedFiles.size === 0 || deleting}
      >
        {deleting ? "Deleting..." : "🗑️ Delete Selected"}
      </button>
    </div>
  </div>

  <div class="rebuild-modal-content">
    <!-- Images section -->
    {#if imageFiles.length > 0}
      <div class="rebuild-section">
        <h4 class="rebuild-section-title">🖼️ Images ({imageFiles.length})</h4>
        <div class="rebuild-thumb-grid">
          {#each imageFiles as file}
            <div
              class="rebuild-thumb-item"
              class:selected={selectedFiles.has(file.path)}
              on:click={() => toggleFile(file.path)}
              on:keypress={() => toggleFile(file.path)}
              role="checkbox"
              aria-checked={selectedFiles.has(file.path)}
              tabindex="0"
            >
              <div class="rebuild-thumb-check">
                <input type="checkbox" checked={selectedFiles.has(file.path)} tabindex="-1" />
              </div>
              <img class="rebuild-thumb-img" src={getAssetUrl(file.path)} alt="" />
              <div class="rebuild-thumb-size">{formatSize(file.size)}</div>
            </div>
          {/each}
        </div>
      </div>
    {/if}

    <!-- Videos section -->
    {#if videoFiles.length > 0}
      <div class="rebuild-section">
        <h4 class="rebuild-section-title">🎬 Videos ({videoFiles.length})</h4>
        <div class="rebuild-thumb-grid">
          {#each videoFiles as file}
            <div
              class="rebuild-thumb-item rebuild-thumb-video"
              class:selected={selectedFiles.has(file.path)}
              on:click={() => toggleFile(file.path)}
              on:keypress={() => toggleFile(file.path)}
              role="checkbox"
              aria-checked={selectedFiles.has(file.path)}
              tabindex="0"
            >
              <div class="rebuild-thumb-check">
                <input type="checkbox" checked={selectedFiles.has(file.path)} tabindex="-1" />
              </div>
              <video class="rebuild-thumb-img" src={getAssetUrl(file.path)} muted preload="metadata">
                <track kind="captions" />
              </video>
              <div class="rebuild-thumb-size">{formatSize(file.size)}</div>
            </div>
          {/each}
        </div>
      </div>
    {/if}

    <!-- Other files section -->
    {#if otherFiles.length > 0}
      <div class="rebuild-section">
        <h4 class="rebuild-section-title">📎 Other Files ({otherFiles.length})</h4>
        <div class="rebuild-file-list-compact">
          {#each otherFiles as file}
            <div class="rebuild-file-row" class:selected={selectedFiles.has(file.path)}>
              <label class="rebuild-file-row-label">
                <input
                  type="checkbox"
                  checked={selectedFiles.has(file.path)}
                  on:change={() => toggleFile(file.path)}
                />
                <span class="rebuild-file-row-path">{file.path}</span>
              </label>
              <span class="rebuild-file-row-size">{formatSize(file.size)}</span>
            </div>
          {/each}
        </div>
      </div>
    {/if}
  </div>
{:else}
  <div class="rebuild-modal-empty">🎉 No unreferenced files found. Everything is clean!</div>
{/if}

<div class="modal-actions">
  <button class="archivex-btn" on:click={closeModal}>Close</button>
</div>
