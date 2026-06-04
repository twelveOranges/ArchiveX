import { App, PluginSettingTab, Setting, Notice } from "obsidian";
import type ArchiveXPlugin from "./main";
import { ARCHIVE_X_DIR } from "./views/DatabaseView";

// Node.js modules available in Obsidian (Electron)
import { execSync } from "child_process";
import * as path from "path";
import * as fs from "fs";

export interface ArchiveXSettings {
  defaultView: "card" | "table" | "list";
  defaultColumns: number;
  cardImageHeight: number;
  showEmptyFields: boolean;
}

export const DEFAULT_SETTINGS: ArchiveXSettings = {
  defaultView: "card",
  defaultColumns: 3,
  cardImageHeight: 200,
  showEmptyFields: false,
};

export class ArchiveXSettingTab extends PluginSettingTab {
  plugin: ArchiveXPlugin;

  constructor(app: App, plugin: ArchiveXPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    containerEl.createEl("h2", { text: "ArchiveX Settings" });

    new Setting(containerEl)
      .setName("Default View")
      .setDesc("Choose the default display mode for database entries")
      .addDropdown((dropdown) =>
        dropdown
          .addOption("card", "Card View")
          .addOption("table", "Table View")
          .addOption("list", "List View")
          .setValue(this.plugin.settings.defaultView)
          .onChange(async (value) => {
            this.plugin.settings.defaultView = value as "card" | "table" | "list";
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Default Columns")
      .setDesc("Number of columns in card view (1-6)")
      .addSlider((slider) =>
        slider
          .setLimits(1, 6, 1)
          .setValue(this.plugin.settings.defaultColumns)
          .setDynamicTooltip()
          .onChange(async (value) => {
            this.plugin.settings.defaultColumns = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Card Image Height")
      .setDesc("Height of cover images in card view (px)")
      .addSlider((slider) =>
        slider
          .setLimits(100, 400, 20)
          .setValue(this.plugin.settings.cardImageHeight)
          .setDynamicTooltip()
          .onChange(async (value) => {
            this.plugin.settings.cardImageHeight = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Show Empty Fields")
      .setDesc("Display fields even when they have no value")
      .addToggle((toggle) =>
        toggle.setValue(this.plugin.settings.showEmptyFields).onChange(async (value) => {
          this.plugin.settings.showEmptyFields = value;
          await this.plugin.saveSettings();
        })
      );

    // ==================== Backup & Restore ====================
    containerEl.createEl("h2", { text: "Backup & Restore" });

    new Setting(containerEl)
      .setName("Backup Database")
      .setDesc("Export all databases and assets as a timestamped .tar.gz archive")
      .addButton((btn) =>
        btn.setButtonText("Backup").setCta().onClick(async () => {
          await this.performBackup();
        })
      );

    new Setting(containerEl)
      .setName("Restore Database")
      .setDesc("Import a previously exported .tar.gz backup archive")
      .addButton((btn) =>
        btn.setButtonText("Restore").onClick(async () => {
          await this.performRestore();
        })
      );
  }

  /**
   * Backup: tar.gz the entire archive-x directory with a timestamp name
   */
  private async performBackup() {
    try {
      // Get the vault's base path on disk
      const vaultPath = (this.app.vault.adapter as any).getBasePath();
      const archiveDir = path.join(vaultPath, ARCHIVE_X_DIR);

      if (!fs.existsSync(archiveDir)) {
        new Notice("No archive-x directory found. Nothing to backup.");
        return;
      }

      // Generate timestamp filename
      const now = new Date();
      const timestamp = now.toISOString().replace(/[:.]/g, "-").replace("T", "_").slice(0, 19);
      const defaultFileName = `archivex_backup_${timestamp}.tar.gz`;

      // Use Electron dialog to choose save location
      const { remote } = require("electron");
      const dialog = remote ? remote.dialog : require("@electron/remote").dialog;
      const result = await dialog.showSaveDialog({
        title: "Save ArchiveX Backup",
        defaultPath: defaultFileName,
        filters: [{ name: "Tar Archive", extensions: ["tar.gz"] }],
      });

      if (result.canceled || !result.filePath) {
        return;
      }

      const outputPath = result.filePath;

      // Create tar.gz using system tar command
      execSync(`tar -czf "${outputPath}" -C "${vaultPath}" "${ARCHIVE_X_DIR}"`, {
        timeout: 60000,
      });

      new Notice(`Backup saved to: ${path.basename(outputPath)}`);
    } catch (e) {
      console.error("ArchiveX backup error:", e);
      new Notice(`Backup failed: ${(e as Error).message}`);
    }
  }

  /**
   * Restore: extract a tar.gz archive into the vault, overwriting archive-x directory
   */
  private async performRestore() {
    try {
      const vaultPath = (this.app.vault.adapter as any).getBasePath();

      // Use Electron dialog to choose file
      const { remote } = require("electron");
      const dialog = remote ? remote.dialog : require("@electron/remote").dialog;
      const result = await dialog.showOpenDialog({
        title: "Select ArchiveX Backup to Restore",
        filters: [{ name: "Tar Archive", extensions: ["tar.gz", "tgz"] }],
        properties: ["openFile"],
      });

      if (result.canceled || !result.filePaths || result.filePaths.length === 0) {
        return;
      }

      const inputPath = result.filePaths[0];

      // Verify it's a valid tar.gz containing archive-x
      try {
        const listing = execSync(`tar -tzf "${inputPath}"`, { timeout: 30000 }).toString();
        if (!listing.includes(ARCHIVE_X_DIR)) {
          new Notice("Invalid backup: archive does not contain archive-x directory.");
          return;
        }
      } catch {
        new Notice("Invalid backup file: cannot read archive.");
        return;
      }

      // Extract tar.gz to vault root (will overwrite existing archive-x)
      execSync(`tar -xzf "${inputPath}" -C "${vaultPath}"`, {
        timeout: 60000,
      });

      new Notice("Restore completed! Please reload the plugin to see changes.");
    } catch (e) {
      console.error("ArchiveX restore error:", e);
      new Notice(`Restore failed: ${(e as Error).message}`);
    }
  }
}
