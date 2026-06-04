import { App, TFile } from "obsidian";
import { Database, DatabaseRecord, FieldDefinition, filterRecords } from "../parser";
import { ArchiveXSettings } from "../settings";

interface RenderConfig {
  source: string;
  view: string;
  columns: number;
  filter: string;
}

export class CardRenderer {
  private app: App;
  private container: HTMLElement;
  private settings: ArchiveXSettings;

  constructor(app: App, container: HTMLElement, settings: ArchiveXSettings) {
    this.app = app;
    this.container = container;
    this.settings = settings;
  }

  render(database: Database, config: RenderConfig) {
    const records = filterRecords(database.records, config.filter);

    switch (config.view) {
      case "table":
        this.renderTable(database.schema.fields, records);
        break;
      case "list":
        this.renderList(database.schema.fields, records);
        break;
      case "card":
      default:
        this.renderCards(database.schema.fields, records, config.columns);
        break;
    }
  }

  // ==================== Card View ====================
  private renderCards(fields: FieldDefinition[], records: DatabaseRecord[], columns: number) {
    const grid = this.container.createDiv({ cls: "archivex-card-grid" });
    grid.style.gridTemplateColumns = `repeat(${columns}, 1fr)`;

    if (records.length === 0) {
      this.container.createEl("p", { text: "No records found.", cls: "archivex-empty" });
      return;
    }

    for (const record of records) {
      this.renderCard(grid, fields, record);
    }
  }

  private renderCard(container: HTMLElement, fields: FieldDefinition[], record: DatabaseRecord) {
    const card = container.createDiv({ cls: "archivex-card" });

    // Find cover image field
    const imageField = fields.find((f) => f.type === "image");
    if (imageField && record[imageField.name]) {
      const coverContainer = card.createDiv({ cls: "archivex-card-cover" });
      coverContainer.style.height = `${this.settings.cardImageHeight}px`;
      this.renderMediaField(coverContainer, "image", String(record[imageField.name]));
    }

    const body = card.createDiv({ cls: "archivex-card-body" });

    // Find title field (first text field)
    const titleField = fields.find((f) => f.type === "text");
    if (titleField && record[titleField.name]) {
      body.createEl("h3", { text: String(record[titleField.name]), cls: "archivex-card-title" });
    }

    // Render other fields
    for (const field of fields) {
      if (field === imageField || field === titleField) continue;
      if (!this.settings.showEmptyFields && !record[field.name]) continue;

      const value = record[field.name];
      if (value === null || value === undefined || value === "") continue;

      const fieldEl = body.createDiv({ cls: "archivex-card-field" });

      switch (field.type) {
        case "tags":
          this.renderTagsField(fieldEl, field, value as string[]);
          break;
        case "video":
          fieldEl.createEl("span", { text: field.label + ": ", cls: "archivex-field-label" });
          this.renderMediaField(fieldEl, "video", String(value));
          break;
        case "audio":
          fieldEl.createEl("span", { text: field.label + ": ", cls: "archivex-field-label" });
          this.renderMediaField(fieldEl, "audio", String(value));
          break;
        case "image":
          this.renderMediaField(fieldEl, "image", String(value));
          break;
        case "url":
          fieldEl.createEl("span", { text: field.label + ": ", cls: "archivex-field-label" });
          fieldEl.createEl("a", { text: String(value), href: String(value), cls: "archivex-link" });
          break;
        case "number":
          fieldEl.createEl("span", { text: field.label + ": ", cls: "archivex-field-label" });
          this.renderRating(fieldEl, Number(value));
          break;
        case "date":
          fieldEl.createEl("span", { text: field.label + ": ", cls: "archivex-field-label" });
          fieldEl.createEl("span", { text: String(value), cls: "archivex-date" });
          break;
        default:
          fieldEl.createEl("span", { text: field.label + ": ", cls: "archivex-field-label" });
          fieldEl.createEl("span", { text: String(value), cls: "archivex-field-value" });
      }
    }
  }

  // ==================== Table View ====================
  private renderTable(fields: FieldDefinition[], records: DatabaseRecord[]) {
    if (records.length === 0) {
      this.container.createEl("p", { text: "No records found.", cls: "archivex-empty" });
      return;
    }

    const tableWrapper = this.container.createDiv({ cls: "archivex-table-wrapper" });
    const table = tableWrapper.createEl("table", { cls: "archivex-table" });

    // Header
    const thead = table.createEl("thead");
    const headerRow = thead.createEl("tr");
    for (const field of fields) {
      headerRow.createEl("th", { text: field.label });
    }

    // Body
    const tbody = table.createEl("tbody");
    for (const record of records) {
      const row = tbody.createEl("tr");
      for (const field of fields) {
        const cell = row.createEl("td");
        const value = record[field.name];

        if (value === null || value === undefined || value === "") {
          cell.createEl("span", { text: "—", cls: "archivex-empty-cell" });
          continue;
        }

        switch (field.type) {
          case "image":
            this.renderMediaField(cell, "image", String(value), true);
            break;
          case "video":
            cell.createEl("span", { text: "🎬 " + String(value), cls: "archivex-file-ref" });
            break;
          case "audio":
            cell.createEl("span", { text: "🎵 " + String(value), cls: "archivex-file-ref" });
            break;
          case "tags":
            this.renderTagsField(cell, field, value as string[]);
            break;
          case "url":
            cell.createEl("a", { text: String(value), href: String(value) });
            break;
          case "number":
            this.renderRating(cell, Number(value));
            break;
          default:
            cell.createEl("span", { text: String(value) });
        }
      }
    }
  }

  // ==================== List View ====================
  private renderList(fields: FieldDefinition[], records: DatabaseRecord[]) {
    if (records.length === 0) {
      this.container.createEl("p", { text: "No records found.", cls: "archivex-empty" });
      return;
    }

    const list = this.container.createDiv({ cls: "archivex-list" });

    for (const record of records) {
      const item = list.createDiv({ cls: "archivex-list-item" });

      // Find image for thumbnail
      const imageField = fields.find((f) => f.type === "image");
      if (imageField && record[imageField.name]) {
        const thumb = item.createDiv({ cls: "archivex-list-thumb" });
        this.renderMediaField(thumb, "image", String(record[imageField.name]));
      }

      const content = item.createDiv({ cls: "archivex-list-content" });

      // Title
      const titleField = fields.find((f) => f.type === "text");
      if (titleField && record[titleField.name]) {
        content.createEl("h4", { text: String(record[titleField.name]), cls: "archivex-list-title" });
      }

      // Other fields as inline
      const meta = content.createDiv({ cls: "archivex-list-meta" });
      for (const field of fields) {
        if (field === imageField || field === titleField) continue;
        const value = record[field.name];
        if (!value) continue;

        if (field.type === "tags") {
          this.renderTagsField(meta, field, value as string[]);
        } else if (field.type !== "video" && field.type !== "audio") {
          meta.createEl("span", { text: `${field.label}: ${value}`, cls: "archivex-list-meta-item" });
        }
      }
    }
  }

  // ==================== Helper Methods ====================
  private renderMediaField(container: HTMLElement, type: "image" | "video" | "audio", path: string, thumbnail = false) {
    if (!path) return;

    const resourcePath = this.getResourcePath(path);

    switch (type) {
      case "image": {
        const img = container.createEl("img", { cls: thumbnail ? "archivex-thumbnail" : "archivex-image" });
        img.src = resourcePath;
        img.alt = path;
        img.addEventListener("error", () => {
          img.style.display = "none";
          container.createEl("span", { text: "📷 " + path, cls: "archivex-file-ref" });
        });
        break;
      }
      case "video": {
        const video = container.createEl("video", { cls: "archivex-video" });
        video.src = resourcePath;
        video.controls = true;
        video.preload = "metadata";
        break;
      }
      case "audio": {
        const audio = container.createEl("audio", { cls: "archivex-audio" });
        audio.src = resourcePath;
        audio.controls = true;
        break;
      }
    }
  }

  private renderTagsField(container: HTMLElement, field: FieldDefinition, tags: string[]) {
    if (!Array.isArray(tags)) return;
    const tagsContainer = container.createDiv({ cls: "archivex-tags" });
    for (const tag of tags) {
      tagsContainer.createEl("span", { text: tag, cls: "archivex-tag" });
    }
  }

  private renderRating(container: HTMLElement, value: number) {
    const ratingEl = container.createSpan({ cls: "archivex-rating" });
    const maxStars = 5;
    const filled = Math.min(Math.max(Math.round(value), 0), maxStars);
    for (let i = 0; i < maxStars; i++) {
      ratingEl.createSpan({ text: i < filled ? "★" : "☆", cls: i < filled ? "archivex-star-filled" : "archivex-star-empty" });
    }
  }

  private getResourcePath(relativePath: string): string {
    // Try to resolve the file in the vault
    const file = this.app.vault.getAbstractFileByPath(relativePath);
    if (file && file instanceof TFile) {
      return this.app.vault.getResourcePath(file);
    }
    // Fallback: return as-is (might be an external URL)
    return relativePath;
  }
}
