import { TFile, TFolder } from "obsidian";
import { stringify } from "yaml";
import type { DataProvider, DatabaseInfo, Database, FieldDefinition, DatabaseRecord, UploadResult, ServerConfig } from "@archivex/core";
import { parseYamlDatabase, toSafeAssetName, hashBufferBrowser } from "@archivex/core";
import type { App as ObsidianApp } from "obsidian";

const ARCHIVE_X_DIR = "archive-x";

/**
 * VaultDataProvider - implements DataProvider via Obsidian Vault API.
 */
export class VaultDataProvider implements DataProvider {
  private app: ObsidianApp;

  constructor(app: ObsidianApp) {
    this.app = app;
  }

  private async ensureDir(dirPath: string) {
    const dir = this.app.vault.getAbstractFileByPath(dirPath);
    if (!dir) {
      await this.app.vault.createFolder(dirPath);
    }
  }

  private getYamlFiles(): TFile[] {
    const dir = this.app.vault.getAbstractFileByPath(ARCHIVE_X_DIR);
    if (!dir || !(dir instanceof TFolder)) return [];
    return dir.children.filter(
      (f) => f instanceof TFile && (f.extension === "yaml" || f.extension === "yml")
    ) as TFile[];
  }

  async listDatabases(): Promise<DatabaseInfo[]> {
    await this.ensureDir(ARCHIVE_X_DIR);
    const files = this.getYamlFiles();
    const databases: DatabaseInfo[] = [];

    for (const file of files) {
      const content = await this.app.vault.read(file);
      const db = parseYamlDatabase(content);
      databases.push({
        filename: file.name,
        name: file.basename,
        recordCount: db ? db.records.length : 0,
        fieldCount: db ? db.schema.fields.length : 0,
      });
    }

    return databases;
  }

  async getDatabase(name: string): Promise<Database & { name: string }> {
    const filePath = `${ARCHIVE_X_DIR}/${name}.yaml`;
    const file = this.app.vault.getAbstractFileByPath(filePath);
    if (!file || !(file instanceof TFile)) {
      throw new Error(`Database not found: ${name}`);
    }
    const content = await this.app.vault.read(file);
    const db = parseYamlDatabase(content);
    if (!db) throw new Error("Failed to parse database");
    return { name, ...db };
  }

  private async saveDatabase(name: string, db: Database) {
    const filePath = `${ARCHIVE_X_DIR}/${name}.yaml`;
    const content = stringify({ schema: db.schema, records: db.records });
    const file = this.app.vault.getAbstractFileByPath(filePath);
    if (file && file instanceof TFile) {
      await this.app.vault.modify(file, content);
    } else {
      await this.app.vault.create(filePath, content);
    }
  }

  async createDatabase(name: string, fields: FieldDefinition[]): Promise<void> {
    await this.ensureDir(ARCHIVE_X_DIR);
    const filePath = `${ARCHIVE_X_DIR}/${name}.yaml`;
    const existing = this.app.vault.getAbstractFileByPath(filePath);
    if (existing) throw new Error("Database already exists");

    const database: Database = { schema: { fields }, records: [] };
    await this.saveDatabase(name, database);

    // Create assets directory
    const assetsDir = `${ARCHIVE_X_DIR}/${toSafeAssetName(name)}_assets`;
    await this.ensureDir(assetsDir);
  }

  async updateDatabase(name: string, newName?: string, fields?: FieldDefinition[]): Promise<void> {
    const db = await this.getDatabase(name);

    if (fields) {
      const oldFields = db.schema.fields;
      db.schema.fields = fields;
      for (const record of db.records) {
        for (const newField of fields) {
          if (!oldFields.find((f) => f.name === newField.name) && record[newField.name] === undefined) {
            record[newField.name] = null;
          }
        }
        for (const key of Object.keys(record)) {
          if (!fields.find((f) => f.name === key)) {
            delete record[key];
          }
        }
      }
    }

    if (newName && newName !== name) {
      // Rename: save new, delete old
      const oldAssetsDir = `${ARCHIVE_X_DIR}/${toSafeAssetName(name)}_assets`;
      const newAssetsDir = `${ARCHIVE_X_DIR}/${toSafeAssetName(newName)}_assets`;

      // Update asset paths in records
      const oldPrefix = `${toSafeAssetName(name)}_assets`;
      const newPrefix = `${toSafeAssetName(newName)}_assets`;
      for (const record of db.records) {
        for (const key of Object.keys(record)) {
          const val = record[key];
          if (typeof val === "string" && val.includes(oldPrefix)) {
            record[key] = val.replace(new RegExp(oldPrefix, "g"), newPrefix);
          } else if (Array.isArray(val)) {
            record[key] = val.map((v) =>
              typeof v === "string" && v.includes(oldPrefix)
                ? v.replace(new RegExp(oldPrefix, "g"), newPrefix)
                : v
            );
          }
        }
      }

      await this.saveDatabase(newName, db);

      // Delete old file
      const oldFile = this.app.vault.getAbstractFileByPath(`${ARCHIVE_X_DIR}/${name}.yaml`);
      if (oldFile) await this.app.vault.delete(oldFile);

      // Rename assets folder
      const oldDir = this.app.vault.getAbstractFileByPath(oldAssetsDir);
      if (oldDir) {
        await this.app.vault.rename(oldDir, newAssetsDir);
      }
    } else {
      await this.saveDatabase(name, db);
    }
  }

  async deleteDatabase(name: string): Promise<void> {
    const filePath = `${ARCHIVE_X_DIR}/${name}.yaml`;
    const file = this.app.vault.getAbstractFileByPath(filePath);
    if (file) await this.app.vault.delete(file);

    const assetsDir = `${ARCHIVE_X_DIR}/${toSafeAssetName(name)}_assets`;
    const dir = this.app.vault.getAbstractFileByPath(assetsDir);
    if (dir) await this.app.vault.delete(dir, true);
  }

  async addRecord(dbName: string, record: DatabaseRecord): Promise<void> {
    const db = await this.getDatabase(dbName);
    db.records.push(record);
    await this.saveDatabase(dbName, db);
  }

  async updateRecord(dbName: string, index: number, record: DatabaseRecord): Promise<void> {
    const db = await this.getDatabase(dbName);
    if (index < 0 || index >= db.records.length) throw new Error("Record not found");
    db.records[index] = record;
    await this.saveDatabase(dbName, db);
  }

  async deleteRecord(dbName: string, index: number): Promise<void> {
    const db = await this.getDatabase(dbName);
    if (index < 0 || index >= db.records.length) throw new Error("Record not found");
    db.records.splice(index, 1);
    await this.saveDatabase(dbName, db);
  }

  async uploadFile(dbName: string, file: File): Promise<UploadResult> {
    const buffer = await file.arrayBuffer();
    const hash = await hashBufferBrowser(buffer);

    const assetsDir = `${ARCHIVE_X_DIR}/${toSafeAssetName(dbName)}_assets`;
    await this.ensureDir(assetsDir);

    const filePath = `${assetsDir}/${hash}`;
    const existing = this.app.vault.getAbstractFileByPath(filePath);
    if (!existing) {
      await this.app.vault.createBinary(filePath, buffer);
    }

    return {
      path: `${toSafeAssetName(dbName)}_assets/${hash}`,
      hash,
      originalName: file.name,
      mimeType: file.type,
      size: file.size,
    };
  }

  getAssetUrl(relativePath: string): string {
    if (!relativePath) return "";
    if (relativePath.startsWith("http")) return relativePath;
    // Use Obsidian's resource path
    const fullPath = `${ARCHIVE_X_DIR}/${relativePath}`;
    return this.app.vault.adapter.getResourcePath(fullPath);
  }

  getBackupUrl(): string {
    // Not applicable for Obsidian - backup is handled differently
    return "#";
  }

  async restore(_file: File): Promise<void> {
    // For Obsidian, restore would need to use the vault API
    throw new Error("Restore is not supported in Obsidian plugin. Use the settings tab backup/restore instead.");
  }

  async getConfig(): Promise<ServerConfig> {
    const vaultPath = (this.app.vault.adapter as any).getBasePath?.() || "Obsidian Vault";
    return {
      dataDir: `${vaultPath}/${ARCHIVE_X_DIR}`,
      port: 0,
    };
  }
}
