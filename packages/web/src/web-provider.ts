import type { DataProvider, DatabaseInfo, Database, FieldDefinition, DatabaseRecord, UploadResult, ServerConfig } from "@archivex/core";

/**
 * WebDataProvider - implements DataProvider via REST API calls to the Express server.
 */
export class WebDataProvider implements DataProvider {
  private baseUrl: string;

  constructor(baseUrl: string = "") {
    this.baseUrl = baseUrl;
  }

  private async api(method: string, path: string, body?: any): Promise<any> {
    const opts: RequestInit = { method, headers: {} };
    if (body && !(body instanceof FormData)) {
      (opts.headers as Record<string, string>)["Content-Type"] = "application/json";
      opts.body = JSON.stringify(body);
    } else if (body instanceof FormData) {
      opts.body = body;
    }
    const res = await fetch(`${this.baseUrl}${path}`, opts);
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: res.statusText }));
      throw new Error(err.error || "Request failed");
    }
    return res.json();
  }

  async listDatabases(): Promise<DatabaseInfo[]> {
    return this.api("GET", "/api/databases");
  }

  async getDatabase(name: string): Promise<Database & { name: string }> {
    return this.api("GET", `/api/databases/${encodeURIComponent(name)}`);
  }

  async createDatabase(name: string, fields: FieldDefinition[]): Promise<void> {
    await this.api("POST", "/api/databases", { name, fields });
  }

  async updateDatabase(name: string, newName?: string, fields?: FieldDefinition[]): Promise<void> {
    await this.api("PUT", `/api/databases/${encodeURIComponent(name)}`, { newName, fields });
  }

  async deleteDatabase(name: string): Promise<void> {
    await this.api("DELETE", `/api/databases/${encodeURIComponent(name)}`);
  }

  async addRecord(dbName: string, record: DatabaseRecord): Promise<void> {
    await this.api("POST", `/api/databases/${encodeURIComponent(dbName)}/records`, record);
  }

  async updateRecord(dbName: string, index: number, record: DatabaseRecord): Promise<void> {
    await this.api("PUT", `/api/databases/${encodeURIComponent(dbName)}/records/${index}`, record);
  }

  async deleteRecord(dbName: string, index: number): Promise<void> {
    await this.api("DELETE", `/api/databases/${encodeURIComponent(dbName)}/records/${index}`);
  }

  async deleteRecords(dbName: string, indices: number[]): Promise<void> {
    await this.api("POST", `/api/databases/${encodeURIComponent(dbName)}/records/batch-delete`, { indices });
  }

  async mergeRecords(dbName: string, indices: number[]): Promise<void> {
    await this.api("POST", `/api/databases/${encodeURIComponent(dbName)}/records/merge`, { indices });
  }

  async uploadFile(dbName: string, file: File): Promise<UploadResult> {
    const formData = new FormData();
    formData.append("file", file);
    return this.api("POST", `/api/databases/${encodeURIComponent(dbName)}/upload`, formData);
  }

  getAssetUrl(relativePath: string): string {
    if (!relativePath) return "";
    if (relativePath.startsWith("http")) return relativePath;
    // Strip 'archive-x/' or '.archive-x/' prefix if present
    let cleanPath = relativePath;
    if (cleanPath.startsWith("archive-x/")) {
      cleanPath = cleanPath.slice("archive-x/".length);
    } else if (cleanPath.startsWith(".archive-x/")) {
      cleanPath = cleanPath.slice(".archive-x/".length);
    }
    return `${this.baseUrl}/api/assets/${cleanPath}`;
  }

  getBackupUrl(): string {
    return `${this.baseUrl}/api/backup`;
  }

  async restore(file: File): Promise<void> {
    const formData = new FormData();
    formData.append("backup", file);
    const result = await this.api("POST", "/api/restore", formData);
    if (!result.success) {
      throw new Error(result.error || "Restore failed");
    }
  }

  async getConfig(): Promise<ServerConfig> {
    return this.api("GET", "/api/config");
  }
}
