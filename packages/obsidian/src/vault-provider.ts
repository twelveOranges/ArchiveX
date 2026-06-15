import { stringify } from "yaml";
import type { DataProvider, DatabaseInfo, Database, FieldDefinition, DatabaseRecord, UploadResult, ServerConfig, RebuildResult } from "@archivex/core";
import { parseYamlDatabase, toSafeAssetName, hashBufferBrowser } from "@archivex/core";
import type { App as ObsidianApp, DataAdapter } from "obsidian";

const ARCHIVE_X_DIR = ".archive-x";
const TRASH_DIR = `${ARCHIVE_X_DIR}/.trash`;

/**
 * VaultDataProvider - implements DataProvider via Obsidian Vault Adapter API.
 * Uses adapter (filesystem-level) instead of Vault API to support hidden folders.
 */
export class VaultDataProvider implements DataProvider {
  private app: ObsidianApp;
  private adapter: DataAdapter;

  constructor(app: ObsidianApp) {
    this.app = app;
    this.adapter = app.vault.adapter;
  }

  private async ensureDir(dirPath: string) {
    const exists = await this.adapter.exists(dirPath);
    if (!exists) {
      await this.adapter.mkdir(dirPath);
    }
  }

  private async getYamlFiles(): Promise<string[]> {
    const exists = await this.adapter.exists(ARCHIVE_X_DIR);
    if (!exists) return [];
    const listing = await this.adapter.list(ARCHIVE_X_DIR);
    return listing.files.filter(
      (f) => f.endsWith(".yaml") || f.endsWith(".yml")
    );
  }

  async listDatabases(): Promise<DatabaseInfo[]> {
    await this.ensureDir(ARCHIVE_X_DIR);
    const files = await this.getYamlFiles();
    const databases: DatabaseInfo[] = [];

    for (const filePath of files) {
      const content = await this.adapter.read(filePath);
      const db = parseYamlDatabase(content);
      const filename = filePath.split("/").pop() || "";
      const name = filename.replace(/\.(yaml|yml)$/, "");
      databases.push({
        filename,
        name,
        recordCount: db ? db.records.length : 0,
        fieldCount: db ? db.schema.fields.length : 0,
        icon: db && db.schema.icon ? db.schema.icon : undefined,
      });
    }

    return databases;
  }

  async getDatabase(name: string): Promise<Database & { name: string }> {
    const filePath = `${ARCHIVE_X_DIR}/${name}.yaml`;
    const exists = await this.adapter.exists(filePath);
    if (!exists) {
      throw new Error(`Database not found: ${name}`);
    }
    const content = await this.adapter.read(filePath);
    const db = parseYamlDatabase(content);
    if (!db) throw new Error("Failed to parse database");
    return { name, ...db };
  }

  private async saveDatabase(name: string, db: Database) {
    const filePath = `${ARCHIVE_X_DIR}/${name}.yaml`;
    const content = stringify({ schema: db.schema, records: db.records });
    await this.adapter.write(filePath, content);
  }

  async createDatabase(name: string, fields: FieldDefinition[], icon?: string): Promise<void> {
    await this.ensureDir(ARCHIVE_X_DIR);
    const filePath = `${ARCHIVE_X_DIR}/${name}.yaml`;
    const exists = await this.adapter.exists(filePath);
    if (exists) throw new Error("Database already exists");

    const schema: any = { fields };
    if (icon) schema.icon = icon;
    const database: Database = { schema, records: [] };
    await this.saveDatabase(name, database);

    // Create assets directory
    const assetsDir = `${ARCHIVE_X_DIR}/${toSafeAssetName(name)}_assets`;
    await this.ensureDir(assetsDir);
  }

  async updateDatabase(name: string, newName?: string, fields?: FieldDefinition[], renamedFields?: Record<string, string>, icon?: string): Promise<void> {
    const db = await this.getDatabase(name);

    // Update icon if provided
    if (icon !== undefined) {
      if (icon) {
        db.schema.icon = icon;
      } else {
        delete db.schema.icon;
      }
    }

    if (fields) {
      const oldFields = db.schema.fields;
      db.schema.fields = fields;

      // Apply field renames first: migrate data from old key to new key
      if (renamedFields) {
        for (const record of db.records) {
          for (const [oldKey, newKey] of Object.entries(renamedFields)) {
            if (oldKey !== newKey && record[oldKey] !== undefined) {
              record[newKey] = record[oldKey];
              delete record[oldKey];
            }
          }
        }
      }

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
      const oldFilePath = `${ARCHIVE_X_DIR}/${name}.yaml`;
      if (await this.adapter.exists(oldFilePath)) {
        await this.adapter.remove(oldFilePath);
      }

      // Rename assets folder
      if (await this.adapter.exists(oldAssetsDir)) {
        await this.adapter.rename(oldAssetsDir, newAssetsDir);
      }
    } else {
      await this.saveDatabase(name, db);
    }
  }

  async deleteDatabase(name: string): Promise<void> {
    const timestamp = Date.now();
    await this.ensureDir(TRASH_DIR);

    // Move yaml file to trash
    const filePath = `${ARCHIVE_X_DIR}/${name}.yaml`;
    if (await this.adapter.exists(filePath)) {
      const content = await this.adapter.read(filePath);
      await this.adapter.write(`${TRASH_DIR}/${timestamp}_${name}.yaml`, content);
      await this.adapter.remove(filePath);
    }

    // Move assets directory to trash
    const assetsDir = `${ARCHIVE_X_DIR}/${toSafeAssetName(name)}_assets`;
    if (await this.adapter.exists(assetsDir)) {
      const trashAssetsDir = `${TRASH_DIR}/${timestamp}_${toSafeAssetName(name)}_assets`;
      await this.copyDir(assetsDir, trashAssetsDir);
      await this.removeDir(assetsDir);
    }
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

    // Move record and its assets to trash
    await this.trashRecord(dbName, db.records[index], db.schema);

    db.records.splice(index, 1);
    await this.saveDatabase(dbName, db);
  }

  async uploadFile(dbName: string, file: File): Promise<UploadResult> {
    const buffer = await file.arrayBuffer();
    const hash = await hashBufferBrowser(buffer);

    const assetsDir = `${ARCHIVE_X_DIR}/${toSafeAssetName(dbName)}_assets`;
    await this.ensureDir(assetsDir);

    const filePath = `${assetsDir}/${hash}`;
    const exists = await this.adapter.exists(filePath);
    if (!exists) {
      await this.adapter.writeBinary(filePath, buffer);
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
    // Use adapter's resource path for hidden folder files
    const fullPath = `${ARCHIVE_X_DIR}/${relativePath}`;
    return this.adapter.getResourcePath(fullPath);
  }

  getBackupUrl(): string {
    // Not applicable for Obsidian - backup is handled differently
    return "#";
  }

  async restore(_file: File): Promise<void> {
    throw new Error("Restore is not supported in Obsidian plugin. Use the settings tab backup/restore instead.");
  }

  async getConfig(): Promise<ServerConfig> {
    const vaultPath = (this.adapter as any).getBasePath?.() || "Obsidian Vault";
    return {
      dataDir: `${vaultPath}/${ARCHIVE_X_DIR}`,
      port: 0,
    };
  }

  async deleteRecords(dbName: string, indices: number[]): Promise<void> {
    const db = await this.getDatabase(dbName);

    // Trash each record before removing
    for (const idx of indices) {
      if (idx >= 0 && idx < db.records.length) {
        await this.trashRecord(dbName, db.records[idx], db.schema);
      }
    }

    const sorted = [...indices].sort((a, b) => b - a);
    for (const idx of sorted) {
      if (idx >= 0 && idx < db.records.length) {
        db.records.splice(idx, 1);
      }
    }
    await this.saveDatabase(dbName, db);
  }

  async mergeRecords(dbName: string, indices: number[]): Promise<void> {
    const db = await this.getDatabase(dbName);
    if (indices.length < 2) throw new Error("At least 2 records required for merge");

    const merged: DatabaseRecord = {};
    for (const field of db.schema.fields) {
      const values = indices.map((idx) => db.records[idx][field.name]).filter((v) => v != null);
      if (field.type === "image" || field.type === "video" || field.type === "audio" || field.type === "tags" || field.type === "multiselect") {
        const allValues: string[] = [];
        for (const v of values) {
          if (Array.isArray(v)) {
            allValues.push(...(v as string[]));
          } else if (v) {
            allValues.push(v as string);
          }
        }
        merged[field.name] = allValues.length > 0 ? (allValues.length === 1 ? allValues[0] : allValues) : null;
      } else {
        merged[field.name] = values.length > 0 ? values[0] : null;
      }
    }

    const sortedDesc = [...indices].sort((a, b) => b - a);
    const insertAt = Math.min(...indices);
    for (const idx of sortedDesc) {
      db.records.splice(idx, 1);
    }
    db.records.splice(insertAt, 0, merged);
    await this.saveDatabase(dbName, db);
  }

  async rebuild(): Promise<RebuildResult> {
    await this.ensureDir(ARCHIVE_X_DIR);
    const exists = await this.adapter.exists(ARCHIVE_X_DIR);
    if (!exists) {
      return { rehashed: 0, totalFiles: 0, unreferencedFiles: [] };
    }

    const yamlFiles = await this.getYamlFiles();
    const referencedFiles = new Set<string>();
    let rehashed = 0;

    for (const yamlFilePath of yamlFiles) {
      const content = await this.adapter.read(yamlFilePath);
      const db = parseYamlDatabase(content);
      if (!db) continue;

      const filename = yamlFilePath.split("/").pop() || "";
      const dbName = filename.replace(/\.(yaml|yml)$/, "");
      let modified = false;

      for (const record of db.records) {
        for (const field of db.schema.fields) {
          if (field.type === "image" || field.type === "video" || field.type === "audio" || field.type === "file") {
            const value = record[field.name];
            if (!value) continue;

            const paths = Array.isArray(value) ? (value as string[]) : [value as string];
            const newPaths: string[] = [];

            for (const p of paths) {
              if (!p) continue;
              referencedFiles.add(p);

              const fullPath = `${ARCHIVE_X_DIR}/${p}`;
              if (await this.adapter.exists(fullPath)) {
                const buffer = await this.adapter.readBinary(fullPath);
                const newHash = await hashBufferBrowser(buffer);
                const fileName = p.split("/").pop() || "";
                const dirPart = p.substring(0, p.lastIndexOf("/"));

                if (fileName !== newHash) {
                  const newRelPath = `${dirPart}/${newHash}`;
                  const newFullPath = `${ARCHIVE_X_DIR}/${newRelPath}`;
                  if (!(await this.adapter.exists(newFullPath))) {
                    await this.adapter.rename(fullPath, newFullPath);
                  } else {
                    await this.adapter.remove(fullPath);
                  }
                  newPaths.push(newRelPath);
                  referencedFiles.delete(p);
                  referencedFiles.add(newRelPath);
                  rehashed++;
                  modified = true;
                } else {
                  newPaths.push(p);
                }
              } else {
                newPaths.push(p);
              }
            }

            if (modified) {
              record[field.name] = Array.isArray(value)
                ? newPaths
                : (newPaths.length > 0 ? newPaths[0] : null);
            }
          }
        }
      }

      if (modified) {
        const saveName = filename.replace(/\.(yaml|yml)$/, "");
        await this.saveDatabase(saveName, db);
      }
    }

    // Scan all *_assets directories for unreferenced files
    const unreferencedFiles: { path: string; size: number; type: "image" | "video" | "file" }[] = [];
    let totalFiles = 0;

    const listing = await this.adapter.list(ARCHIVE_X_DIR);
    for (const folder of listing.folders) {
      const folderName = folder.split("/").pop() || "";
      if (folderName.endsWith("_assets")) {
        const assetListing = await this.adapter.list(folder);
        for (const filePath of assetListing.files) {
          totalFiles++;
          const fileName = filePath.split("/").pop() || "";
          const relativePath = `${folderName}/${fileName}`;
          if (!referencedFiles.has(relativePath)) {
            const fileType = await this.detectFileType(filePath);
            const stat = await this.adapter.stat(filePath);
            unreferencedFiles.push({
              path: relativePath,
              size: stat?.size || 0,
              type: fileType,
            });
          }
        }
      }
    }

    return { rehashed, totalFiles, unreferencedFiles };
  }

  private async detectFileType(filePath: string): Promise<"image" | "video" | "file"> {
    try {
      const buffer = await this.adapter.readBinary(filePath);
      const bytes = new Uint8Array(buffer, 0, Math.min(12, buffer.byteLength));

      // Image signatures
      if (bytes[0] === 0xFF && bytes[1] === 0xD8 && bytes[2] === 0xFF) return "image"; // JPEG
      if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4E && bytes[3] === 0x47) return "image"; // PNG
      if (bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46) return "image"; // GIF
      if (bytes[0] === 0x42 && bytes[1] === 0x4D) return "image"; // BMP
      const ascii4 = String.fromCharCode(bytes[0], bytes[1], bytes[2], bytes[3]);
      const ascii8_12 = bytes.length >= 12 ? String.fromCharCode(bytes[8], bytes[9], bytes[10], bytes[11]) : "";
      if (ascii4 === "RIFF" && ascii8_12 === "WEBP") return "image"; // WebP

      // Video signatures
      if (bytes.length >= 8) {
        const ftyp = String.fromCharCode(bytes[4], bytes[5], bytes[6], bytes[7]);
        if (ftyp === "ftyp") return "video"; // MP4/MOV
      }
      if (bytes[0] === 0x1A && bytes[1] === 0x45 && bytes[2] === 0xDF && bytes[3] === 0xA3) return "video"; // MKV/WebM
      if (ascii4 === "RIFF" && ascii8_12 === "AVI ") return "video"; // AVI

      return "file";
    } catch {
      return "file";
    }
  }

  async cleanupFiles(files: string[]): Promise<void> {
    for (const relativePath of files) {
      const fullPath = `${ARCHIVE_X_DIR}/${relativePath}`;
      if (await this.adapter.exists(fullPath)) {
        await this.adapter.remove(fullPath);
      }
    }
  }

  /**
   * Move a record's assets to .trash and save a mini yaml for recovery.
   */
  private async trashRecord(dbName: string, record: DatabaseRecord, schema: Database["schema"]): Promise<void> {
    const timestamp = Date.now();
    const trashDbDir = `${TRASH_DIR}/${dbName}_${timestamp}`;
    await this.ensureDir(trashDbDir);

    // Save a mini yaml with just this record
    const miniDb = { schema, records: [record] };
    const yamlContent = stringify(miniDb);
    await this.adapter.write(`${trashDbDir}/${dbName}.yaml`, yamlContent);

    // Copy referenced asset files to trash
    const assetsTrashDir = `${trashDbDir}/${toSafeAssetName(dbName)}_assets`;
    for (const field of schema.fields) {
      if (field.type === "image" || field.type === "video" || field.type === "audio" || field.type === "file") {
        const value = record[field.name];
        if (!value) continue;
        const paths = Array.isArray(value) ? (value as string[]) : [value as string];
        for (const p of paths) {
          if (!p) continue;
          const fullPath = `${ARCHIVE_X_DIR}/${String(p)}`;
          if (await this.adapter.exists(fullPath)) {
            await this.ensureDir(assetsTrashDir);
            const buffer = await this.adapter.readBinary(fullPath);
            const fileName = String(p).split("/").pop() || "";
            await this.adapter.writeBinary(`${assetsTrashDir}/${fileName}`, buffer);
          }
        }
      }
    }
  }

  /**
   * Recursively copy a directory.
   */
  private async copyDir(src: string, dest: string): Promise<void> {
    await this.ensureDir(dest);
    const listing = await this.adapter.list(src);
    for (const file of listing.files) {
      const fileName = file.split("/").pop() || "";
      const buffer = await this.adapter.readBinary(file);
      await this.adapter.writeBinary(`${dest}/${fileName}`, buffer);
    }
    for (const folder of listing.folders) {
      const folderName = folder.split("/").pop() || "";
      await this.copyDir(folder, `${dest}/${folderName}`);
    }
  }

  /**
   * Recursively remove a directory.
   */
  private async removeDir(dirPath: string): Promise<void> {
    const listing = await this.adapter.list(dirPath);
    for (const file of listing.files) {
      await this.adapter.remove(file);
    }
    for (const folder of listing.folders) {
      await this.removeDir(folder);
    }
    await this.adapter.rmdir(dirPath, false);
  }
}
