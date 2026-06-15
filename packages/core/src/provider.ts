import type { DatabaseInfo, Database, FieldDefinition, DatabaseRecord, UploadResult, ServerConfig, RebuildResult } from "./types";

/**
 * DataProvider interface - abstracts data access for both Web (REST API) and Obsidian (Vault API).
 */
export interface DataProvider {
  listDatabases(): Promise<DatabaseInfo[]>;
  getDatabase(name: string): Promise<Database & { name: string }>;
  createDatabase(name: string, fields: FieldDefinition[], icon?: string): Promise<void>;
  updateDatabase(name: string, newName?: string, fields?: FieldDefinition[], renamedFields?: Record<string, string>, icon?: string): Promise<void>;
  deleteDatabase(name: string): Promise<void>;
  addRecord(dbName: string, record: DatabaseRecord): Promise<void>;
  updateRecord(dbName: string, index: number, record: DatabaseRecord): Promise<void>;
  deleteRecord(dbName: string, index: number): Promise<void>;
  deleteRecords(dbName: string, indices: number[]): Promise<void>;
  mergeRecords(dbName: string, indices: number[]): Promise<void>;
  uploadFile(dbName: string, file: File): Promise<UploadResult>;
  getAssetUrl(relativePath: string): string;
  getBackupUrl(): string;
  restore(file: File): Promise<void>;
  getConfig(): Promise<ServerConfig>;
  rebuild(yamlPath?: string): Promise<RebuildResult>;
  cleanupFiles(files: string[]): Promise<void>;
}
