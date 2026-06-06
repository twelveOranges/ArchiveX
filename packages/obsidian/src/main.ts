import { Plugin, WorkspaceLeaf, ItemView, PluginSettingTab, Setting, Notice } from "obsidian";
import { App as SvelteApp, dataProvider, platform } from "@archivex/ui";
import { VaultDataProvider } from "./vault-provider";

const VIEW_TYPE_ARCHIVEX = "archivex-database-view";

class ArchiveXView extends ItemView {
  private svelteApp: any = null;
  private plugin: ArchiveXPlugin;

  constructor(leaf: WorkspaceLeaf, plugin: ArchiveXPlugin) {
    super(leaf);
    this.plugin = plugin;
  }

  getViewType(): string {
    return VIEW_TYPE_ARCHIVEX;
  }

  getDisplayText(): string {
    return "ArchiveX Database";
  }

  getIcon(): string {
    return "database";
  }

  async onOpen() {
    const container = this.containerEl.children[1] as HTMLElement;
    container.empty();
    container.addClass("archivex-view-container");

    // Set the data provider and platform
    const provider = new VaultDataProvider(this.app);
    dataProvider.set(provider);
    platform.set("obsidian");

    // Mount Svelte app
    this.svelteApp = new SvelteApp({
      target: container,
    });
  }

  async onClose() {
    if (this.svelteApp) {
      this.svelteApp.$destroy();
      this.svelteApp = null;
    }
  }
}

class ArchiveXSettingTab extends PluginSettingTab {
  plugin: ArchiveXPlugin;

  constructor(app: any, plugin: ArchiveXPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    containerEl.createEl("h2", { text: "ArchiveX Settings" });

    // Data Path section
    const dataPathSection = containerEl.createDiv();
    dataPathSection.createEl("h3", { text: "Data Path" });
    const vaultPath = (this.app.vault.adapter as any).getBasePath?.() || "Obsidian Vault";
    const pathEl = dataPathSection.createEl("code", { text: `${vaultPath}/.archive-x` });
    pathEl.style.display = "block";
    pathEl.style.padding = "8px 12px";
    pathEl.style.background = "var(--background-secondary)";
    pathEl.style.borderRadius = "4px";
    pathEl.style.marginBottom = "16px";
    pathEl.style.wordBreak = "break-all";

    // Rebuild section
    const rebuildSection = containerEl.createDiv();
    rebuildSection.createEl("h3", { text: "Rebuild" });
    rebuildSection.createEl("p", {
      text: "Recalculate file hashes and find unreferenced files in asset directories.",
      cls: "setting-item-description",
    });

    const rebuildStatusEl = rebuildSection.createDiv();
    rebuildStatusEl.style.marginTop = "8px";
    rebuildStatusEl.style.marginBottom = "12px";

    const rebuildResultEl = rebuildSection.createDiv();

    new Setting(rebuildSection)
      .addButton((btn) =>
        btn
          .setButtonText("🔄 Rebuild")
          .setCta()
          .onClick(async () => {
            btn.setDisabled(true);
            btn.setButtonText("⏳ Processing...");
            rebuildStatusEl.setText("Scanning and rehashing files...");
            rebuildResultEl.empty();

            try {
              const provider = new VaultDataProvider(this.app);
              const result = await provider.rebuild();

              let status = "";
              if (result.rehashed > 0) {
                status = `✅ Rehashed ${result.rehashed} files. `;
              } else {
                status = "✅ All file hashes are correct. ";
              }

              if (result.unreferencedFiles.length > 0) {
                status += `Found ${result.unreferencedFiles.length} unreferenced file(s).`;
                this.renderUnreferencedFiles(rebuildResultEl, result.unreferencedFiles);
              } else {
                status += "No unreferenced files found.";
              }

              rebuildStatusEl.setText(status);
            } catch (e) {
              rebuildStatusEl.setText("❌ Rebuild failed: " + (e as Error).message);
            }

            btn.setDisabled(false);
            btn.setButtonText("🔄 Rebuild");
          })
      );

    // Backup section
    const backupSection = containerEl.createDiv();
    backupSection.createEl("h3", { text: "Backup & Restore" });
    backupSection.createEl("p", {
      text: "Backup and restore are managed through the file system. Your data is stored in the .archive-x folder within your vault.",
      cls: "setting-item-description",
    });
  }

  private renderUnreferencedFiles(container: HTMLElement, files: { path: string; size: number }[]) {
    container.empty();
    container.style.marginTop = "12px";

    const header = container.createDiv();
    header.style.display = "flex";
    header.style.alignItems = "center";
    header.style.justifyContent = "space-between";
    header.style.marginBottom = "8px";

    header.createEl("span", { text: `Unreferenced Files (${files.length})`, cls: "setting-item-name" });

    const selectedPaths = new Set<string>();

    const deleteBtn = header.createEl("button", { text: "🗑️ Delete Selected", cls: "mod-warning" });
    deleteBtn.style.fontSize = "0.85em";
    deleteBtn.disabled = true;

    const listEl = container.createDiv();
    listEl.style.maxHeight = "300px";
    listEl.style.overflowY = "auto";
    listEl.style.border = "1px solid var(--background-modifier-border)";
    listEl.style.borderRadius = "8px";
    listEl.style.background = "var(--background-secondary)";

    // Select all
    const selectAllRow = listEl.createDiv();
    selectAllRow.style.padding = "8px 12px";
    selectAllRow.style.borderBottom = "1px solid var(--background-modifier-border)";
    selectAllRow.style.position = "sticky";
    selectAllRow.style.top = "0";
    selectAllRow.style.background = "var(--background-secondary-alt)";
    selectAllRow.style.zIndex = "1";

    const selectAllLabel = selectAllRow.createEl("label");
    selectAllLabel.style.display = "flex";
    selectAllLabel.style.alignItems = "center";
    selectAllLabel.style.gap = "8px";
    selectAllLabel.style.cursor = "pointer";

    const selectAllCb = selectAllLabel.createEl("input", { type: "checkbox" });
    selectAllLabel.createEl("span", { text: "Select All" }).style.fontWeight = "600";

    const checkboxes: HTMLInputElement[] = [];

    for (const file of files) {
      const row = listEl.createDiv();
      row.style.display = "flex";
      row.style.alignItems = "center";
      row.style.justifyContent = "space-between";
      row.style.padding = "6px 12px";
      row.style.borderBottom = "1px solid var(--background-modifier-border)";

      const label = row.createEl("label");
      label.style.display = "flex";
      label.style.alignItems = "center";
      label.style.gap = "8px";
      label.style.cursor = "pointer";
      label.style.flex = "1";
      label.style.minWidth = "0";

      const cb = label.createEl("input", { type: "checkbox" });
      checkboxes.push(cb);

      // Show thumbnail for image files
      const ext = file.path.split(".").pop()?.toLowerCase() || "";
      const isImage = ["jpg", "jpeg", "png", "gif", "webp", "bmp", "svg"].includes(ext);

      if (isImage) {
        const vaultPath = `.archive-x/${file.path}`;
        const imgFile = this.app.vault.getAbstractFileByPath(vaultPath);
        if (imgFile) {
          const thumb = label.createEl("img");
          thumb.style.width = "40px";
          thumb.style.height = "40px";
          thumb.style.objectFit = "cover";
          thumb.style.borderRadius = "4px";
          thumb.style.flexShrink = "0";
          thumb.src = this.app.vault.getResourcePath(imgFile as any);
        }
      }

      const pathSpan = label.createEl("span", { text: file.path });
      pathSpan.style.fontSize = "0.85em";
      pathSpan.style.fontFamily = "monospace";
      pathSpan.style.overflow = "hidden";
      pathSpan.style.textOverflow = "ellipsis";
      pathSpan.style.whiteSpace = "nowrap";

      const sizeSpan = row.createEl("span", { text: this.formatSize(file.size) });
      sizeSpan.style.fontSize = "0.8em";
      sizeSpan.style.color = "var(--text-muted)";
      sizeSpan.style.whiteSpace = "nowrap";
      sizeSpan.style.marginLeft = "12px";
      sizeSpan.style.flexShrink = "0";

      cb.addEventListener("change", () => {
        if (cb.checked) {
          selectedPaths.add(file.path);
        } else {
          selectedPaths.delete(file.path);
        }
        deleteBtn.disabled = selectedPaths.size === 0;
        selectAllCb.checked = selectedPaths.size === files.length;
      });
    }

    selectAllCb.addEventListener("change", () => {
      const checked = selectAllCb.checked;
      for (let i = 0; i < checkboxes.length; i++) {
        checkboxes[i].checked = checked;
        if (checked) {
          selectedPaths.add(files[i].path);
        } else {
          selectedPaths.delete(files[i].path);
        }
      }
      deleteBtn.disabled = selectedPaths.size === 0;
    });

    deleteBtn.addEventListener("click", async () => {
      if (selectedPaths.size === 0) return;
      const confirmed = confirm(`Are you sure you want to delete ${selectedPaths.size} file(s)? This cannot be undone.`);
      if (!confirmed) return;

      deleteBtn.disabled = true;
      deleteBtn.textContent = "Deleting...";

      try {
        const provider = new VaultDataProvider(this.app);
        await provider.cleanupFiles(Array.from(selectedPaths));
        new Notice(`Deleted ${selectedPaths.size} file(s)`);
        // Re-render
        const remaining = files.filter((f) => !selectedPaths.has(f.path));
        if (remaining.length > 0) {
          this.renderUnreferencedFiles(container, remaining);
        } else {
          container.empty();
          container.createEl("p", { text: "✅ All unreferenced files have been deleted." });
        }
      } catch (e) {
        new Notice("❌ Delete failed: " + (e as Error).message);
        deleteBtn.disabled = false;
        deleteBtn.textContent = "🗑️ Delete Selected";
      }
    });
  }

  private formatSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }
}

export default class ArchiveXPlugin extends Plugin {
  async onload() {
    // Register the database view type
    this.registerView(VIEW_TYPE_ARCHIVEX, (leaf) => new ArchiveXView(leaf, this));

    // Add settings tab
    this.addSettingTab(new ArchiveXSettingTab(this.app, this));

    // Add ribbon icon
    this.addRibbonIcon("database", "Open ArchiveX Database", async () => {
      await this.activateView();
    });

    // Add command
    this.addCommand({
      id: "open-database-view",
      name: "Open Database View",
      callback: () => {
        this.activateView();
      },
    });
  }

  onunload() {}

  async activateView() {
    const { workspace } = this.app;

    let leaf: WorkspaceLeaf | null = null;
    const leaves = workspace.getLeavesOfType(VIEW_TYPE_ARCHIVEX);

    if (leaves.length > 0) {
      leaf = leaves[0];
    } else {
      leaf = workspace.getLeaf("tab");
      await leaf.setViewState({ type: VIEW_TYPE_ARCHIVEX, active: true });
    }

    if (leaf) {
      workspace.revealLeaf(leaf);
    }
  }
}
