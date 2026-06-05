<script lang="ts">
  import { onMount } from "svelte";
  import { dataProvider } from "../stores";
  import type { ServerConfig } from "@archivex/core";

  export let closeModal: () => void;

  let config: ServerConfig | null = null;
  let restoreStatus = "";

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
</script>

<div class="modal-title">Settings</div>

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

<div class="modal-actions">
  <button class="archivex-btn" on:click={closeModal}>Close</button>
</div>
