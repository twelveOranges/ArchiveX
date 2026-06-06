/**
 * ArchiveX Core Types
 * Shared data models used by both Web and Obsidian frontends.
 */

export type FieldType =
  | "text"
  | "image"
  | "video"
  | "audio"
  | "file"
  | "tags"
  | "number"
  | "integer"
  | "date"
  | "url"
  | "boolean"
  | "checkbox"
  | "select"
  | "multiselect";

export interface FieldDefinition {
  name: string;
  type: FieldType;
  label: string;
}

export interface DatabaseSchema {
  fields: FieldDefinition[];
}

export interface DatabaseRecord {
  [key: string]: string | number | boolean | string[] | null;
}

export interface Database {
  schema: DatabaseSchema;
  records: DatabaseRecord[];
}

export interface DatabaseInfo {
  filename: string;
  name: string;
  recordCount: number;
  fieldCount: number;
}

export interface UploadResult {
  path: string;
  hash: string;
  originalName: string;
  mimeType: string;
  size: number;
}

export interface ServerConfig {
  dataDir: string;
  port: number | string;
}

export interface UnreferencedFile {
  path: string;
  size: number;
  type: "image" | "video" | "file";
}

export interface RebuildResult {
  rehashed: number;
  totalFiles: number;
  unreferencedFiles: UnreferencedFile[];
}
