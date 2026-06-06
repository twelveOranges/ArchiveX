<script lang="ts">
  import { onMount } from "svelte";
  import { dataProvider } from "../stores";
  import type { ServerConfig, UnreferencedFile } from "@archivex/core";

  export let closeModal: () => void;
  export let openModal: ((component: any, props?: any) => void) | undefined = undefined;

  let config: ServerConfig | null = null;
  let restoreStatus = "";

  // Rebuild state
  let rebuildLoading = false;
  let rebuildStatus = "";
  let rehashed = 0;
  let totalFiles = 0;
  let unreferencedFiles: UnreferencedFile[] = [];
  let selectedFiles: Set<string> = new Set();
  let selectAll = false;
  let showRebuildResults = false;
  let deleting = false;

  $: imageFiles = unreferencedFiles.filter((f) => f.type === "image");
  $: videoFiles = unreferencedFiles.filter((f) => f.type === "video");
  $: otherFiles = unreferencedFiles.filter((f) => f.type === "file");

  onMount(async () => {
    const provider = $dataProvider;
    if (!provider) return;
    try {
      config = await provider.getConfig();
    } catch (e) {
      console.error("Failed to load config:", e);
    }
  });

  function getBackupUrl(): string {
    const provider = $dataProvider;
    if (!provider) return "#";
    return provider.getBackupUrl();
  }

  async function handleRestore(e: Event) {
    const input = e.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    const provider = $dataProvider;
    if (!provider) return;

    restoreStatus = "Restoring...";
    try {
      await provider.restore(file);
      restoreStatus = "✅ Restore completed! Refreshing...";
      setTimeout(() => {
        closeModal();
        window.location.reload();
      }, 1500);
    } catch (e) {
      restoreStatus = "❌ Restore failed: " + (e as Error).message;
    }
  }

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

  async function handleRebuild() {
    const provider = $dataProvider;
    if (!provider) return;

    rebuildLoading = true;
    rebuildStatus = "Scanning and rehashing files...";
    showRebuildResults = false;

    try {
      const result = await provider.rebuild();
      rehashed = result.rehashed;
      totalFiles = result.totalFiles;
      unreferencedFiles = result.unreferencedFiles;
      selectedFiles = new Set();
      selectAll = false;
      showRebuildResults = true;

      if (rehashed > 0) {
        rebuildStatus = `✅ Rehashed ${rehashed} files. `;
      } else {
        rebuildStatus = "✅ All file hashes are correct. ";
      }

      if (unreferencedFiles.length > 0) {
        rebuildStatus += `Found ${unreferencedFiles.length} unreferenced file(s).`;
      } else {
        rebuildStatus += "No unreferenced files found.";
      }
    } catch (e) {
      rebuildStatus = "❌ Rebuild failed: " + (e as Error).message;
    }

    rebuildLoading = false;
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
      rebuildStatus = `✅ Deleted successfully. ${unreferencedFiles.length} unreferenced file(s) remaining.`;
      if (unreferencedFiles.length === 0) {
        showRebuildResults = false;
      }
    } catch (e) {
      rebuildStatus = "❌ Delete failed: " + (e as Error).message;
    }
    deleting = false;
  }

  function getTotalSelectedSize(): string {
    const total = unreferencedFiles
      .filter((f) => selectedFiles.has(f.path))
      .reduce((sum, f) => sum + f.size, 0);
    return formatSize(total);
  }
</script>

{#if !showRebuildResults}
  <!-- Settings view -->
  <div class="modal-title">⚙️ Settings</div>

  <div class="settings-section">
    <h3>Data Path</h3>
    <p style="margin-bottom:8px;color:var(--text-muted);font-size:0.9em">Current data storage path:</p>
    <code style="display:block;padding:8px 12px;background:var(--bg-secondary);border-radius:4px;margin-bottom:8px;word-break:break-all">
      {config ? config.dataDir : "Loading..."}
    </code>
  </div>

  <div class="settings-section">
    <h3>Backup</h3>
    <p style="margin-bottom:12px;color:var(--text-muted);font-size:0.9em">Download all databases and assets as a .tar.gz archive.</p>
    <a href={getBackupUrl()} class="archivex-btn archivex-btn-primary" style="text-decoration:none;display:inline-block">⬇️ Download Backup</a>
  </div>

  <div class="settings-section">
    <h3>Restore</h3>
    <p style="margin-bottom:12px;color:var(--text-muted);font-size:0.9em">Upload a previously exported .tar.gz backup to restore data.</p>
    <input type="file" id="restore-file-input" style="display:none" accept=".tar.gz,.tgz,.gz" on:change={handleRestore} />
    <button class="archivex-btn" on:click={() => document.getElementById('restore-file-input')?.click()}>⬆️ Upload Backup</button>
    {#if restoreStatus}
      <div style="margin-top:12px">{restoreStatus}</div>
    {/if}
  </div>

  <div class="settings-section">
    <h3>Rebuild</h3>
    <p style="margin-bottom:12px;color:var(--text-muted);font-size:0.9em">
      Recalculate file hashes and find unreferenced files in asset directories.
    </p>
    <button
      class="archivex-btn archivex-btn-primary"
      on:click={handleRebuild}
      disabled={rebuildLoading}
    >
      {rebuildLoading ? "⏳ Processing..." : "🔄 Rebuild"}
    </button>

    {#if rebuildStatus && !showRebuildResults}
      <div style="margin-top:12px;padding:10px 14px;background:var(--bg-secondary);border-radius:8px;font-size:0.9em">
        {rebuildStatus}
      </div>
    {/if}
  </div>

  <div class="modal-actions">
    <button class="archivex-btn" on:click={closeModal}>Close</button>
  </div>

{:else}
  <!-- Rebuild results view (shown as popup-like within the same modal) -->
  <div class="modal-title">🔄 Rebuild Results</div>

  <div class="rebuild-modal-summary">
    {rebuildStatus}
  </div>

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
    <button class="archivex-btn" on:click={() => { showRebuildResults = false; }}>← Back</button>
    <button class="archivex-btn" on:click={closeModal}>Close</button>
  </div>
{/if}
