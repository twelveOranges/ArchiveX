import { ItemView, WorkspaceLeaf, TFile, TFolder, Notice, Modal, App } from "obsidian";
import { stringify } from "yaml";
import { pinyin } from "pinyin-pro";
import type ArchiveXPlugin from "../main";
import { parseYamlDatabase, Database, DatabaseRecord, FieldDefinition } from "../parser";
import { CardRenderer } from "./CardRenderer";

/**
 * Convert a string to a filesystem-safe name.
 * Chinese characters are converted to pinyin; other characters are kept as-is.
 * Spaces are replaced with underscores.
 */
function toSafeAssetName(name: string): string {
  // Check if the string contains Chinese characters
  if (/[\u4e00-\u9fa5]/.test(name)) {
    const result = pinyin(name, { toneType: "none", type: "array" });
    return result.join("").replace(/\s+/g, "_");
  }
  return name.replace(/\s+/g, "_");
}

/**
 * Generate a SHA-256 hash string from an ArrayBuffer.
 * The resulting filename has no extension, making it unrecognizable outside this app.
 */
async function hashBuffer(buffer: ArrayBuffer): Promise<string> {
  const hashBuf = await crypto.subtle.digest("SHA-256", buffer);
  const hashArray = Array.from(new Uint8Array(hashBuf));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

export const VIEW_TYPE_DATABASE = "archivex-database-view";
export const ARCHIVE_X_DIR = "archive-x";

export class DatabaseView extends ItemView {
  plugin: ArchiveXPlugin;
  private currentFile: TFile | null = null;
  private database: Database | null = null;
  private renderer: CardRenderer | null = null;
  private currentMode: string = "card";
  private cardSize: number = 120;
  private imagesFieldFilter: string[] = []; // empty = show all image fields

  constructor(leaf: WorkspaceLeaf, plugin: ArchiveXPlugin) {
    super(leaf);
    this.plugin = plugin;
    this.currentMode = plugin.settings.defaultView;
  }

  getViewType(): string {
    return VIEW_TYPE_DATABASE;
  }

  getDisplayText(): string {
    if (this.currentFile) {
      return `ArchiveX - ${this.currentFile.basename}`;
    }
    return "ArchiveX Database";
  }

  getIcon(): string {
    return "database";
  }

  async onOpen() {
    const container = this.containerEl.children[1] as HTMLElement;
    container.empty();
    container.addClass("archivex-view-container");

    await this.ensureArchiveDir();
    this.renderHomePage(container);
  }

  async onClose() {
    this.containerEl.empty();
  }

  private async ensureArchiveDir() {
    const dir = this.app.vault.getAbstractFileByPath(ARCHIVE_X_DIR);
    if (!dir) {
      await this.app.vault.createFolder(ARCHIVE_X_DIR);
    }
  }

  private getYamlFiles(): TFile[] {
    const dir = this.app.vault.getAbstractFileByPath(ARCHIVE_X_DIR);
    if (!dir || !(dir instanceof TFolder)) return [];

    return dir.children.filter(
      (f) => f instanceof TFile && (f.extension === "yaml" || f.extension === "yml")
    ) as TFile[];
  }

  // ==================== Home Page ====================
  private renderHomePage(container: HTMLElement) {
    container.empty();

    const header = container.createDiv({ cls: "archivex-home-header" });
    header.createEl("h2", { text: "ArchiveX Databases" });

    const grid = container.createDiv({ cls: "archivex-db-grid" });

    const yamlFiles = this.getYamlFiles();
    for (const file of yamlFiles) {
      this.renderDatabaseCard(grid, file, container);
    }

    // "+" create card
    this.renderCreateCard(grid, container);
  }

  private renderCreateCard(grid: HTMLElement, container: HTMLElement) {
    const card = grid.createDiv({ cls: "archivex-db-card archivex-db-card-create" });
    card.createDiv({ cls: "archivex-db-card-create-icon", text: "+" });
    card.createDiv({ cls: "archivex-db-card-create-text", text: "New Database" });

    card.addEventListener("click", () => {
      this.showCreateDatabaseDialog(container);
    });
  }

  private async renderDatabaseCard(grid: HTMLElement, file: TFile, homeContainer: HTMLElement) {
    const card = grid.createDiv({ cls: "archivex-db-card" });

    // Edit & Delete buttons (top-right corner)
    const cardActions = card.createDiv({ cls: "archivex-db-card-actions" });
    const editBtn = cardActions.createEl("button", { text: "✏️", cls: "archivex-db-card-action-btn", attr: { title: "Edit" } });
    const deleteBtn = cardActions.createEl("button", { text: "🗑️", cls: "archivex-db-card-action-btn archivex-db-card-delete-btn", attr: { title: "Delete" } });

    editBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      this.showEditDatabaseDialog(file, homeContainer);
    });

    deleteBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      this.confirmDeleteDatabase(file, homeContainer);
    });

    const icon = card.createDiv({ cls: "archivex-db-card-icon" });
    icon.createEl("span", { text: "🗄️" });

    const info = card.createDiv({ cls: "archivex-db-card-info" });
    info.createEl("h3", { text: file.basename });

    try {
      const content = await this.app.vault.read(file);
      const db = parseYamlDatabase(content);
      if (db) {
        info.createEl("p", { text: `${db.records.length} records · ${db.schema.fields.length} fields`, cls: "archivex-db-card-meta" });
      }
    } catch {
      info.createEl("p", { text: "Unable to read", cls: "archivex-db-card-meta" });
    }

    card.addEventListener("click", () => {
      this.openDatabase(file);
    });
  }

  // ==================== Database Detail Page ====================
  private async openDatabase(file: TFile) {
    this.currentFile = file;
    const content = await this.app.vault.read(file);
    this.database = parseYamlDatabase(content);

    if (!this.database) {
      new Notice("Failed to parse YAML database file.");
      return;
    }

    (this.leaf as any).updateHeader?.();

    const container = this.containerEl.children[1] as HTMLElement;
    container.empty();

    this.renderDatabaseToolbar(container);
    this.renderDatabaseContent(container);
  }

  private renderDatabaseToolbar(container: HTMLElement) {
    const header = container.createDiv({ cls: "archivex-detail-header" });

    // First line: database name centered
    if (this.currentFile) {
      header.createEl("h2", { text: this.currentFile.basename, cls: "archivex-detail-title" });
    }

    // Second line: back on left, controls on right
    const navBar = header.createDiv({ cls: "archivex-detail-nav" });

    const backBtn = navBar.createEl("button", { text: "← Back", cls: "archivex-btn-text" });
    backBtn.addEventListener("click", () => {
      this.currentFile = null;
      this.database = null;
      (this.leaf as any).updateHeader?.();
      const mainContainer = this.containerEl.children[1] as HTMLElement;
      this.renderHomePage(mainContainer);
    });

    const rightControls = navBar.createDiv({ cls: "archivex-nav-right" });

    // Card size +/- buttons
    const sizeControls = rightControls.createDiv({ cls: "archivex-size-controls" });
    const minusBtn = sizeControls.createEl("button", { text: "−", cls: "archivex-btn-text archivex-size-btn" });
    const sizeLabel = sizeControls.createEl("span", { cls: "archivex-size-label" });
    sizeLabel.setText(`${this.cardSize}`);
    const plusBtn = sizeControls.createEl("button", { text: "+", cls: "archivex-btn-text archivex-size-btn" });

    minusBtn.addEventListener("click", () => {
      if (this.cardSize > 60) {
        this.cardSize -= 20;
        sizeLabel.setText(`${this.cardSize}`);
        this.applyCardSize(container);
      }
    });
    plusBtn.addEventListener("click", () => {
      if (this.cardSize < 300) {
        this.cardSize += 20;
        sizeLabel.setText(`${this.cardSize}`);
        this.applyCardSize(container);
      }
    });

    // View mode dropdown
    const viewSelect = rightControls.createEl("select", { cls: "archivex-view-select" });
    const modes = [
      { value: "card", label: "Cards" },
      { value: "images", label: "Images" },
      { value: "table", label: "Table" },
      { value: "list", label: "List" },
    ];
    for (const mode of modes) {
      const opt = viewSelect.createEl("option", { text: mode.label, value: mode.value });
      opt.value = mode.value;
      if (mode.value === this.currentMode) opt.selected = true;
    }
    viewSelect.addEventListener("change", () => {
      this.currentMode = viewSelect.value;
      this.refreshContent(container);
    });
  }

  private applyCardSize(container: HTMLElement) {
    const grid = container.querySelector(".archivex-card-grid") as HTMLElement;
    if (grid) {
      grid.style.gridTemplateColumns = `repeat(auto-fill, minmax(${this.cardSize}px, 1fr))`;
    }
  }

  private setActiveButton(container: HTMLElement, activeBtn: HTMLElement) {
    container.querySelectorAll(".archivex-btn-text").forEach((btn) => {
      btn.removeClass("archivex-btn-text-active");
    });
    activeBtn.addClass("archivex-btn-text-active");
  }

  // ==================== Images View (flat image grid with field filter) ====================
  private renderImagesView(content: HTMLElement) {
    if (!this.database) return;
    const fields = this.database.schema.fields;
    const imageFields = fields.filter((f) => f.type === "image");

    if (imageFields.length === 0) {
      content.createDiv({ cls: "archivex-empty-hint", text: "No image fields in this database." });
      return;
    }

    // Filter bar: checkboxes for each image field
    const filterBar = content.createDiv({ cls: "archivex-images-filter" });
    filterBar.createEl("span", { text: "Show:", cls: "archivex-images-filter-label" });
    for (const field of imageFields) {
      const label = filterBar.createEl("label", { cls: "archivex-images-filter-item" });
      const cb = label.createEl("input", { type: "checkbox" }) as HTMLInputElement;
      cb.type = "checkbox";
      cb.checked = this.imagesFieldFilter.length === 0 || this.imagesFieldFilter.includes(field.name);
      label.createEl("span", { text: field.label || field.name });
      cb.addEventListener("change", () => {
        this.updateImagesFilter(imageFields, content);
      });
    }

    // Image grid
    this.renderImagesGrid(content, imageFields);
  }

  private updateImagesFilter(imageFields: FieldDefinition[], content: HTMLElement) {
    const checkboxes = content.querySelectorAll(".archivex-images-filter input[type=checkbox]") as NodeListOf<HTMLInputElement>;
    const selected: string[] = [];
    checkboxes.forEach((cb, idx) => {
      if (cb.checked && imageFields[idx]) {
        selected.push(imageFields[idx].name);
      }
    });
    // If all are checked, treat as "show all"
    this.imagesFieldFilter = selected.length === imageFields.length ? [] : selected;
    // Re-render grid only
    const oldGrid = content.querySelector(".archivex-card-grid");
    if (oldGrid) oldGrid.remove();
    this.renderImagesGrid(content, imageFields);
  }

  private renderImagesGrid(content: HTMLElement, imageFields: FieldDefinition[]) {
    if (!this.database) return;
    const fieldsToShow = this.imagesFieldFilter.length > 0
      ? imageFields.filter((f) => this.imagesFieldFilter.includes(f.name))
      : imageFields;

    // Collect all images with metadata
    const allImages: { path: string; fieldName: string; record: DatabaseRecord }[] = [];
    for (const record of this.database.records) {
      for (const field of fieldsToShow) {
        const value = record[field.name];
        if (value) {
          const paths = Array.isArray(value) ? value : [String(value)];
          for (const p of paths) {
            if (p) allImages.push({ path: String(p), fieldName: field.name, record });
          }
        }
      }
    }

    const grid = content.createDiv({ cls: "archivex-card-grid" });
    grid.style.gridTemplateColumns = `repeat(auto-fill, minmax(${this.cardSize}px, 1fr))`;

    for (let i = 0; i < allImages.length; i++) {
      const imgData = allImages[i];
      const item = grid.createDiv({ cls: "archivex-gallery-item" });
      const img = item.createEl("img", { cls: "archivex-gallery-img" });
      img.src = this.getResourcePath(imgData.path);
      img.alt = imgData.path;
      // Click to open lightbox
      const idx = i;
      item.addEventListener("click", () => {
        const lightbox = new ImageLightboxModal(
          this.app,
          allImages.map((im) => this.getResourcePath(im.path)),
          idx
        );
        lightbox.open();
      });
    }

    // "+" add card
    const addCard = grid.createDiv({ cls: "archivex-gallery-item archivex-db-card-create" });
    addCard.createDiv({ cls: "archivex-db-card-create-icon", text: "+" });
    addCard.addEventListener("click", () => {
      this.showAddRecordDialog();
    });
  }

  private renderDatabaseContent(container: HTMLElement) {
    const content = container.createDiv({ cls: "archivex-content" });
    if (!this.database) return;

    // Render records as cards with an "add" card at the end
    if (this.currentMode === "card") {
      this.renderCardViewWithAdd(content);
    } else if (this.currentMode === "images") {
      this.renderImagesView(content);
    } else {
      this.renderer = new CardRenderer(this.app, content, this.plugin.settings);
      this.renderer.render(this.database, {
        source: "",
        view: this.currentMode,
        columns: this.plugin.settings.defaultColumns,
        filter: "",
      });
    }
  }

  private renderCardViewWithAdd(content: HTMLElement) {
    if (!this.database) return;

    const grid = content.createDiv({ cls: "archivex-card-grid" });
    grid.style.gridTemplateColumns = `repeat(auto-fill, minmax(${this.cardSize}px, 1fr))`;

    // Render existing record cards
    for (const record of this.database.records) {
      this.renderRecordCard(grid, record);
    }

    // "+" add record card
    const addCard = grid.createDiv({ cls: "archivex-card archivex-db-card-create" });
    const addArea = addCard.createDiv({ cls: "archivex-card-cover-placeholder-area" });
    addArea.createDiv({ cls: "archivex-db-card-create-icon", text: "+" });
    addArea.createDiv({ cls: "archivex-db-card-create-text", text: "Add Record" });
    addCard.addEventListener("click", () => {
      this.showAddRecordDialog();
    });
  }

  private renderRecordCard(grid: HTMLElement, record: DatabaseRecord) {
    if (!this.database) return;
    const fields = this.database.schema.fields;
    const card = grid.createDiv({ cls: "archivex-card archivex-card-square" });

    // Find cover image field
    const imageField = fields.find((f) => f.type === "image");
    const coverContainer = card.createDiv({ cls: "archivex-card-cover" });
    if (imageField && record[imageField.name]) {
      const value = record[imageField.name];
      // Support multiple images - show first one as cover
      const firstPath = Array.isArray(value) ? value[0] : String(value);
      if (firstPath) {
        const img = coverContainer.createEl("img");
        const resourcePath = this.getResourcePath(String(firstPath));
        img.src = resourcePath;
        img.alt = String(firstPath);
      } else {
        coverContainer.createDiv({ cls: "archivex-card-cover-placeholder", text: "📄" });
      }
    } else {
      coverContainer.createDiv({ cls: "archivex-card-cover-placeholder", text: "📄" });
    }

    // Title line below image (centered)
    const body = card.createDiv({ cls: "archivex-card-body" });
    const titleField = fields.find((f) => f.type === "text");
    if (titleField && record[titleField.name]) {
      body.createEl("div", { text: String(record[titleField.name]), cls: "archivex-card-title" });
    }

    // Click card to open preview
    card.addEventListener("click", () => {
      this.showRecordPreview(record);
    });
  }

  // ==================== Record Preview ====================
  private showRecordPreview(record: DatabaseRecord) {
    if (!this.database || !this.currentFile) return;

    const modal = new RecordPreviewModal(this.app, this.database, record, this.currentFile.basename, {
      onEdit: () => {
        this.showEditRecordDialog(record);
      },
      onDelete: () => {
        this.confirmDeleteRecord(record);
      },
      getResourcePath: (path: string) => this.getResourcePath(path),
    });
    modal.open();
  }

  private confirmDeleteRecord(record: DatabaseRecord) {
    const modal = new ConfirmModal(this.app, "Delete Record", "Are you sure you want to delete this record?", async () => {
      await this.deleteRecord(record);
    });
    modal.open();
  }

  private async deleteRecord(record: DatabaseRecord) {
    if (!this.currentFile || !this.database) return;

    const index = this.database.records.indexOf(record);
    if (index === -1) return;

    this.database.records.splice(index, 1);

    const yamlContent = stringify({ schema: this.database.schema, records: this.database.records });
    await this.app.vault.modify(this.currentFile, yamlContent);

    const mainContainer = this.containerEl.children[1] as HTMLElement;
    this.refreshContent(mainContainer);
    new Notice("Record deleted.");
  }

  private showEditRecordDialog(record: DatabaseRecord) {
    if (!this.database || !this.currentFile) return;

    const dbName = this.currentFile.basename;
    const modal = new AddRecordModal(this.app, this.database.schema.fields, dbName, async (updatedRecord) => {
      await this.updateRecord(record, updatedRecord);
    }, record);
    modal.open();
  }

  private async updateRecord(oldRecord: DatabaseRecord, newRecord: DatabaseRecord) {
    if (!this.currentFile || !this.database) return;

    const index = this.database.records.indexOf(oldRecord);
    if (index === -1) return;

    this.database.records[index] = newRecord;

    const yamlContent = stringify({ schema: this.database.schema, records: this.database.records });
    await this.app.vault.modify(this.currentFile, yamlContent);

    const mainContainer = this.containerEl.children[1] as HTMLElement;
    this.refreshContent(mainContainer);
    new Notice("Record updated.");
  }

  private getResourcePath(relativePath: string): string {
    const file = this.app.vault.getAbstractFileByPath(relativePath);
    if (file && file instanceof TFile) {
      return this.app.vault.getResourcePath(file);
    }
    return relativePath;
  }

  private refreshContent(container: HTMLElement) {
    const content = container.querySelector(".archivex-content") as HTMLElement;
    if (!content || !this.database) return;
    content.empty();

    if (this.currentMode === "card") {
      this.renderCardViewWithAdd(content);
    } else if (this.currentMode === "images") {
      this.renderImagesView(content);
    } else {
      this.renderer = new CardRenderer(this.app, content, this.plugin.settings);
      this.renderer.render(this.database, {
        source: "",
        view: this.currentMode,
        columns: this.plugin.settings.defaultColumns,
        filter: "",
      });
    }
  }

  // ==================== Add Record ====================
  private showAddRecordDialog() {
    if (!this.database || !this.currentFile) return;

    const dbName = this.currentFile.basename;
    const modal = new AddRecordModal(this.app, this.database.schema.fields, dbName, async (record) => {
      await this.addRecordToFile(record);
    });
    modal.open();
  }

  private async addRecordToFile(record: DatabaseRecord) {
    if (!this.currentFile) return;

    const content = await this.app.vault.read(this.currentFile);
    const db = parseYamlDatabase(content);
    if (!db) return;

    db.records.push(record);

    // Serialize back to YAML
    const yamlContent = stringify({ schema: db.schema, records: db.records });
    await this.app.vault.modify(this.currentFile, yamlContent);

    new Notice("Record added successfully!");
    await this.openDatabase(this.currentFile);
  }

  // ==================== Edit/Delete Database ====================
  private showEditDatabaseDialog(file: TFile, homeContainer: HTMLElement) {
    const modal = new EditDatabaseModal(this.app, file, async () => {
      this.renderHomePage(homeContainer);
    });
    modal.open();
  }

  private confirmDeleteDatabase(file: TFile, homeContainer: HTMLElement) {
    const modal = new ConfirmDeleteModal(this.app, file.basename, async () => {
      await this.app.vault.delete(file);
      new Notice(`Database "${file.basename}" deleted.`);
      this.renderHomePage(homeContainer);
    });
    modal.open();
  }

  // ==================== Create Database ====================
  private showCreateDatabaseDialog(container: HTMLElement) {
    const modal = new CreateDatabaseModal(this.app, async (name, fields) => {
      let yaml = `schema:\n  fields:\n`;
      for (const field of fields) {
        yaml += `    - name: ${field.name}\n      type: ${field.type}\n      label: ${field.label}\n`;
      }
      yaml += `\nrecords: []\n`;

      const filePath = `${ARCHIVE_X_DIR}/${name}.yaml`;
      const existingFile = this.app.vault.getAbstractFileByPath(filePath);
      if (existingFile) {
        new Notice(`Database "${name}" already exists.`);
        return;
      }

      await this.app.vault.create(filePath, yaml);
      new Notice(`Database "${name}" created successfully!`);
      this.renderHomePage(container);
    });
    modal.open();
  }
}

// ==================== Field type definitions ====================
interface FieldItem {
  name: string;
  type: string;
  label: string;
  originalName?: string; // Track original name for record key migration
}

const FIELD_TYPES: { type: string; label: string; icon: string }[] = [
  { type: "text", label: "Text", icon: "📝" },
  { type: "integer", label: "Integer", icon: "🔢" },
  { type: "number", label: "Real Number", icon: "🔣" },
  { type: "date", label: "Date", icon: "📅" },
  { type: "select", label: "Single Select", icon: "📋" },
  { type: "multiselect", label: "Multi Select", icon: "☑️" },
  { type: "checkbox", label: "Checkbox", icon: "✅" },
  { type: "image", label: "Image", icon: "🖼️" },
  { type: "video", label: "Video", icon: "🎬" },
  { type: "audio", label: "Audio", icon: "🎵" },
  { type: "url", label: "URL", icon: "🔗" },
  { type: "tags", label: "Tags", icon: "🏷️" },
];

// ==================== Create Database Modal ====================
class CreateDatabaseModal extends Modal {
  private fields: FieldItem[] = [];
  private onSubmit: (name: string, fields: FieldItem[]) => void;
  private fieldListEl: HTMLElement | null = null;
  private nameInput: HTMLInputElement | null = null;

  constructor(app: App, onSubmit: (name: string, fields: FieldItem[]) => void) {
    super(app);
    this.onSubmit = onSubmit;
    this.fields = [{ name: "title", type: "text", label: "Title" }];
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass("archivex-modal");

    contentEl.createEl("h2", { text: "Create New Database", cls: "archivex-modal-title" });

    // Database name
    const nameGroup = contentEl.createDiv({ cls: "archivex-modal-group" });
    nameGroup.createEl("label", { text: "Database Name", cls: "archivex-modal-label" });
    this.nameInput = nameGroup.createEl("input", {
      type: "text",
      placeholder: "Enter database name...",
      cls: "archivex-modal-input",
    });

    // Fields section
    const fieldsSection = contentEl.createDiv({ cls: "archivex-modal-group" });
    fieldsSection.createEl("label", { text: "Fields", cls: "archivex-modal-label" });

    this.fieldListEl = fieldsSection.createDiv({ cls: "archivex-field-list" });
    this.renderFieldList();

    // Add field button
    const addBtnContainer = fieldsSection.createDiv({ cls: "archivex-add-field-container" });
    const addBtn = addBtnContainer.createDiv({ cls: "archivex-add-field-btn" });
    addBtn.createSpan({ text: "+", cls: "archivex-add-field-icon" });
    addBtn.createSpan({ text: "Add Field" });

    addBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      e.preventDefault();
      this.showFieldTypeMenu(addBtnContainer);
    });

    // Actions
    const actions = contentEl.createDiv({ cls: "archivex-modal-actions" });
    const cancelBtn = actions.createEl("button", { text: "Cancel", cls: "archivex-btn" });
    const createBtn = actions.createEl("button", { text: "Create", cls: "archivex-btn archivex-btn-primary" });

    cancelBtn.addEventListener("click", () => this.close());
    createBtn.addEventListener("click", () => {
      const name = this.nameInput?.value.trim();
      if (!name) {
        new Notice("Please enter a database name.");
        return;
      }
      if (this.fields.length === 0) {
        new Notice("Please add at least one field.");
        return;
      }
      this.onSubmit(name, this.fields);
      this.close();
    });
  }

  onClose() {
    this.contentEl.empty();
  }

  private renderFieldList() {
    if (!this.fieldListEl) return;
    this.fieldListEl.empty();

    for (let i = 0; i < this.fields.length; i++) {
      this.renderFieldRow(this.fieldListEl, this.fields[i], i);
    }
  }

  private renderFieldRow(container: HTMLElement, field: FieldItem, index: number) {
    const row = container.createDiv({ cls: "archivex-field-row" });

    const typeInfo = FIELD_TYPES.find((t) => t.type === field.type);
    row.createSpan({ text: typeInfo?.icon || "📝", cls: "archivex-field-row-icon" });
    row.createSpan({ text: field.name, cls: "archivex-field-row-label" });
    row.createSpan({ text: typeInfo?.label || field.type, cls: "archivex-field-row-type" });

    const actions = row.createDiv({ cls: "archivex-field-row-actions" });

    const editBtn = actions.createEl("button", { text: "Edit", cls: "archivex-field-action-btn archivex-field-edit-btn" });
    const deleteBtn = actions.createEl("button", { text: "Delete", cls: "archivex-field-action-btn archivex-field-delete-btn" });

    editBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      this.showEditFieldDialog(field, index);
    });

    deleteBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      this.fields.splice(index, 1);
      this.renderFieldList();
    });
  }

  private showFieldTypeMenu(anchorEl: HTMLElement) {
    // Remove existing menu
    const existingMenu = this.contentEl.querySelector(".archivex-type-menu");
    if (existingMenu) {
      existingMenu.remove();
      return;
    }

    const menu = anchorEl.createDiv({ cls: "archivex-type-menu" });

    for (const fieldType of FIELD_TYPES) {
      const item = menu.createDiv({ cls: "archivex-type-menu-item" });
      item.createSpan({ text: fieldType.icon, cls: "archivex-type-menu-icon" });
      item.createSpan({ text: fieldType.label });

      item.addEventListener("click", (e) => {
        e.stopPropagation();
        menu.remove();
        this.promptFieldName(fieldType.type);
      });
    }

    // Close menu when clicking outside
    const closeHandler = (e: MouseEvent) => {
      if (!menu.contains(e.target as Node) && !anchorEl.contains(e.target as Node)) {
        menu.remove();
        document.removeEventListener("click", closeHandler);
      }
    };
    setTimeout(() => document.addEventListener("click", closeHandler), 10);
  }

  private promptFieldName(type: string) {
    const existing = this.contentEl.querySelector(".archivex-edit-field-dialog");
    if (existing) existing.remove();

    const dialog = this.contentEl.createDiv({ cls: "archivex-edit-field-dialog" });
    dialog.createEl("h4", { text: "New Field" });

    const nameGroup = dialog.createDiv({ cls: "archivex-modal-group" });
    nameGroup.createEl("label", { text: "Field Name", cls: "archivex-modal-label" });
    const nameInput = nameGroup.createEl("input", { type: "text", cls: "archivex-modal-input", attr: { placeholder: "Enter field name..." } });

    const actions = dialog.createDiv({ cls: "archivex-modal-actions" });
    const cancelBtn = actions.createEl("button", { text: "Cancel", cls: "archivex-btn" });
    const addBtn = actions.createEl("button", { text: "Add", cls: "archivex-btn archivex-btn-primary" });

    cancelBtn.addEventListener("click", () => dialog.remove());
    addBtn.addEventListener("click", () => {
      const name = nameInput.value.trim();
      if (!name) {
        new Notice("Please enter a field name.");
        return;
      }
      if (this.fields.some((f) => f.name === name)) {
        new Notice("Field name already exists.");
        return;
      }
      this.fields.push({ name, type, label: name });
      dialog.remove();
      this.renderFieldList();
    });

    nameInput.focus();
    nameInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") addBtn.click();
    });
  }

  private showEditFieldDialog(field: FieldItem, index: number) {
    const existing = this.contentEl.querySelector(".archivex-edit-field-dialog");
    if (existing) existing.remove();

    const dialog = this.contentEl.createDiv({ cls: "archivex-edit-field-dialog" });

    dialog.createEl("h4", { text: "Edit Field" });

    const nameGroup = dialog.createDiv({ cls: "archivex-modal-group" });
    nameGroup.createEl("label", { text: "Field Name", cls: "archivex-modal-label" });
    const nameInput = nameGroup.createEl("input", { type: "text", cls: "archivex-modal-input" });
    nameInput.value = field.name;

    const typeGroup = dialog.createDiv({ cls: "archivex-modal-group" });
    typeGroup.createEl("label", { text: "Type", cls: "archivex-modal-label" });
    const typeSelect = typeGroup.createEl("select", { cls: "archivex-modal-input" });
    for (const ft of FIELD_TYPES) {
      const opt = typeSelect.createEl("option", { text: `${ft.icon} ${ft.label}`, value: ft.type });
      if (ft.type === field.type) opt.selected = true;
    }

    const actions = dialog.createDiv({ cls: "archivex-modal-actions" });
    const cancelBtn = actions.createEl("button", { text: "Cancel", cls: "archivex-btn" });
    const saveBtn = actions.createEl("button", { text: "Save", cls: "archivex-btn archivex-btn-primary" });

    cancelBtn.addEventListener("click", () => dialog.remove());
    saveBtn.addEventListener("click", () => {
      const newName = nameInput.value.trim();
      if (!newName) {
        new Notice("Field name cannot be empty.");
        return;
      }
      this.fields[index] = { name: newName, type: typeSelect.value, label: newName };
      dialog.remove();
      this.renderFieldList();
    });
  }
}

// ==================== Add Record Modal ====================
class AddRecordModal extends Modal {
  private fields: FieldDefinition[];
  private onSubmit: (record: DatabaseRecord) => void;
  private dbName: string;
  private mediaFiles: Map<string, ArrayBuffer> = new Map();
  private mediaFileNames: Map<string, string> = new Map();
  private multiMediaFiles: Map<string, { buffer: ArrayBuffer; name: string }[]> = new Map();
  private existingRecord: DatabaseRecord | null;

  constructor(app: App, fields: FieldDefinition[], dbName: string, onSubmit: (record: DatabaseRecord) => void, existingRecord?: DatabaseRecord) {
    super(app);
    this.fields = fields;
    this.dbName = dbName;
    this.onSubmit = onSubmit;
    this.existingRecord = existingRecord || null;
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass("archivex-modal");

    contentEl.createEl("h2", { text: this.existingRecord ? "Edit Record" : "Add New Record", cls: "archivex-modal-title" });

    const inputs: Map<string, HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement> = new Map();

    for (const field of this.fields) {
      const group = contentEl.createDiv({ cls: "archivex-modal-group" });
      group.createEl("label", { text: field.label, cls: "archivex-modal-label" });

      switch (field.type) {
        case "image":
        case "video":
        case "audio": {
          this.renderMediaField(group, field, inputs);
          break;
        }
        case "text":
        case "url":
        case "file": {
          const input = group.createEl("input", {
            type: "text",
            placeholder: `Enter ${field.label.toLowerCase()}...`,
            cls: "archivex-modal-input",
          });
          inputs.set(field.name, input);
          break;
        }
        case "integer":
        case "number": {
          const input = group.createEl("input", {
            type: "number",
            placeholder: `Enter ${field.label.toLowerCase()}...`,
            cls: "archivex-modal-input",
          });
          if (field.type === "integer") input.step = "1";
          else input.step = "any";
          inputs.set(field.name, input);
          break;
        }
        case "date": {
          const input = group.createEl("input", {
            type: "date",
            cls: "archivex-modal-input",
          });
          inputs.set(field.name, input);
          break;
        }
        case "checkbox":
        case "boolean": {
          const wrapper = group.createDiv({ cls: "archivex-checkbox-wrapper" });
          const input = wrapper.createEl("input", { type: "checkbox" });
          input.id = `field-${field.name}`;
          wrapper.createEl("label", { text: "Enabled", attr: { for: `field-${field.name}` } });
          inputs.set(field.name, input);
          break;
        }
        case "tags":
        case "multiselect": {
          const input = group.createEl("input", {
            type: "text",
            placeholder: "Comma separated values...",
            cls: "archivex-modal-input",
          });
          inputs.set(field.name, input);
          break;
        }
        case "select": {
          const input = group.createEl("input", {
            type: "text",
            placeholder: `Enter ${field.label.toLowerCase()}...`,
            cls: "archivex-modal-input",
          });
          inputs.set(field.name, input);
          break;
        }
        default: {
          const input = group.createEl("input", {
            type: "text",
            placeholder: `Enter ${field.label.toLowerCase()}...`,
            cls: "archivex-modal-input",
          });
          inputs.set(field.name, input);
        }
      }
    }

    // Pre-fill values in edit mode
    if (this.existingRecord) {
      for (const field of this.fields) {
        const input = inputs.get(field.name);
        if (!input) continue;
        const value = this.existingRecord[field.name];
        if (value === null || value === undefined) continue;

        if (field.type === "checkbox" || field.type === "boolean") {
          (input as HTMLInputElement).checked = Boolean(value);
        } else if (field.type === "tags" || field.type === "multiselect") {
          if (Array.isArray(value)) {
            (input as HTMLInputElement).value = value.join(", ");
          }
        } else {
          (input as HTMLInputElement).value = String(value);
        }
      }
    }

    // Actions
    const actions = contentEl.createDiv({ cls: "archivex-modal-actions" });
    const cancelBtn = actions.createEl("button", { text: "Cancel", cls: "archivex-btn" });
    const saveBtn = actions.createEl("button", { text: "Save", cls: "archivex-btn archivex-btn-primary" });

    cancelBtn.addEventListener("click", () => this.close());
    saveBtn.addEventListener("click", async () => {
      const record: DatabaseRecord = {};

      // First, save all media files to the assets folder
      const assetsDir = `${ARCHIVE_X_DIR}/${toSafeAssetName(this.dbName)}_assets`;
      await this.ensureAssetsDir(assetsDir);

      for (const field of this.fields) {
        if ((field.type === "image" || field.type === "video" || field.type === "audio")) {
          const mediaList = this.multiMediaFiles.get(field.name);
          if (mediaList && mediaList.length > 0) {
            const paths: string[] = [];
            for (const entry of mediaList) {
              // Use content hash as filename without extension for privacy
              const hash = await hashBuffer(entry.buffer);
              const filePath = `${assetsDir}/${hash}`;
              const existing = this.app.vault.getAbstractFileByPath(filePath);
              if (!existing) {
                await this.app.vault.createBinary(filePath, entry.buffer);
              }
              paths.push(filePath);
            }
            record[field.name] = paths.length === 1 ? paths[0] : paths;
          } else {
            // Keep existing value if no new files added
            const input = inputs.get(field.name);
            if (input && input.value) {
              record[field.name] = input.value;
            } else {
              record[field.name] = this.existingRecord ? this.existingRecord[field.name] || null : null;
            }
          }
          continue;
        }

        const input = inputs.get(field.name);
        if (!input) {
          record[field.name] = null;
          continue;
        }

        switch (field.type) {
          case "checkbox":
          case "boolean":
            record[field.name] = (input as HTMLInputElement).checked;
            break;
          case "integer":
            record[field.name] = input.value ? parseInt(input.value) : null;
            break;
          case "number":
            record[field.name] = input.value ? parseFloat(input.value) : null;
            break;
          case "tags":
          case "multiselect":
            record[field.name] = input.value
              ? input.value.split(",").map((s) => s.trim()).filter((s) => s)
              : [];
            break;
          default:
            record[field.name] = input.value || "";
        }
      }

      this.onSubmit(record);
      this.close();
    });
  }

  onClose() {
    this.contentEl.empty();
    this.mediaFiles.clear();
    this.mediaFileNames.clear();
    this.multiMediaFiles.clear();
  }

  private async ensureAssetsDir(path: string) {
    const dir = this.app.vault.getAbstractFileByPath(path);
    if (!dir) {
      await this.app.vault.createFolder(path);
    }
  }

  private renderMediaField(group: HTMLElement, field: FieldDefinition, inputs: Map<string, HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) {
    const isImage = field.type === "image";
    const acceptMap: Record<string, string> = {
      image: "image/*",
      video: "video/*",
      audio: "audio/*",
    };

    // Hidden path input (stores comma-separated paths)
    const pathInput = group.createEl("input", { type: "hidden" });
    inputs.set(field.name, pathInput);

    // Container for multiple file previews
    const previewList = group.createDiv({ cls: "archivex-media-list" });

    // Track multiple files
    const mediaFilesList: { buffer: ArrayBuffer; name: string }[] = [];
    if (!this.multiMediaFiles) this.multiMediaFiles = new Map();
    this.multiMediaFiles.set(field.name, mediaFilesList);

    // Drop zone (always visible for adding more)
    const dropZone = group.createDiv({ cls: "archivex-media-dropzone" });
    const dropIcon = dropZone.createDiv({ cls: "archivex-media-dropzone-icon" });
    dropIcon.setText(isImage ? "🖼️" : field.type === "video" ? "🎬" : "🎵");
    const dropText = dropZone.createDiv({ cls: "archivex-media-dropzone-text" });
    dropText.setText("Drop files here or click to select");

    // File input (hidden, allow multiple)
    const fileInput = group.createEl("input", { type: "file", cls: "archivex-hidden-file-input" });
    fileInput.accept = acceptMap[field.type] || "*/*";
    fileInput.multiple = true;
    fileInput.style.display = "none";

    // Click to select
    dropZone.addEventListener("click", () => {
      fileInput.click();
    });

    // File selected
    fileInput.addEventListener("change", () => {
      const files = fileInput.files;
      if (files) {
        for (let i = 0; i < files.length; i++) {
          this.addMediaFileToList(files[i], field, previewList, mediaFilesList);
        }
      }
      fileInput.value = "";
    });

    // Drag and drop
    dropZone.addEventListener("dragover", (e) => {
      e.preventDefault();
      e.stopPropagation();
      dropZone.addClass("archivex-media-dropzone-active");
    });

    dropZone.addEventListener("dragleave", (e) => {
      e.preventDefault();
      e.stopPropagation();
      dropZone.removeClass("archivex-media-dropzone-active");
    });

    dropZone.addEventListener("drop", (e) => {
      e.preventDefault();
      e.stopPropagation();
      dropZone.removeClass("archivex-media-dropzone-active");

      const files = e.dataTransfer?.files;
      if (files) {
        for (let i = 0; i < files.length; i++) {
          this.addMediaFileToList(files[i], field, previewList, mediaFilesList);
        }
      }
    });
  }

  private async addMediaFileToList(file: File, field: FieldDefinition, previewList: HTMLElement, mediaFilesList: { buffer: ArrayBuffer; name: string }[]) {
    const buffer = await file.arrayBuffer();
    const entry = { buffer, name: file.name };
    mediaFilesList.push(entry);

    // Create preview item
    const item = previewList.createDiv({ cls: "archivex-media-list-item" });

    if (field.type === "image") {
      const url = URL.createObjectURL(new Blob([buffer]));
      const img = item.createEl("img", { cls: "archivex-media-list-thumb" });
      img.src = url;
    } else {
      const icon = item.createDiv({ cls: "archivex-media-list-icon" });
      icon.setText(field.type === "video" ? "🎬" : "🎵");
    }

    const nameEl = item.createDiv({ cls: "archivex-media-list-name" });
    nameEl.setText(file.name);

    const removeBtn = item.createEl("button", { text: "×", cls: "archivex-media-list-remove" });
    removeBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      const idx = mediaFilesList.indexOf(entry);
      if (idx !== -1) mediaFilesList.splice(idx, 1);
      item.remove();
    });
  }

}

// ==================== Image Crop Modal ====================
class ImageCropModal extends Modal {
  private buffer: ArrayBuffer;
  private onCrop: (croppedBuffer: ArrayBuffer, fileName: string) => void;
  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private img: HTMLImageElement | null = null;
  private cropRect = { x: 0, y: 0, w: 0, h: 0 };
  private isDragging = false;
  private dragStart = { x: 0, y: 0 };
  private dragMode: "move" | "resize-br" | "resize-tl" | "resize-tr" | "resize-bl" | "none" = "none";
  private scale = 1;

  constructor(app: App, buffer: ArrayBuffer, onCrop: (croppedBuffer: ArrayBuffer, fileName: string) => void) {
    super(app);
    this.buffer = buffer;
    this.onCrop = onCrop;
  }

  async onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass("archivex-modal");
    contentEl.addClass("archivex-crop-modal");

    contentEl.createEl("h2", { text: "Crop Image", cls: "archivex-modal-title" });
    contentEl.createEl("p", { text: "Drag to select crop area. Drag corners to resize.", cls: "archivex-crop-hint" });

    // Canvas container
    const canvasContainer = contentEl.createDiv({ cls: "archivex-crop-canvas-container" });
    this.canvas = canvasContainer.createEl("canvas", { cls: "archivex-crop-canvas" });
    this.ctx = this.canvas.getContext("2d");

    // Load image
    this.img = new Image();
    const url = URL.createObjectURL(new Blob([this.buffer]));
    this.img.src = url;

    await new Promise<void>((resolve) => {
      this.img!.onload = () => {
        URL.revokeObjectURL(url);
        resolve();
      };
    });

    // Set canvas size (fit within modal, max 600x400)
    const maxW = 600;
    const maxH = 400;
    const imgW = this.img.naturalWidth;
    const imgH = this.img.naturalHeight;
    this.scale = Math.min(maxW / imgW, maxH / imgH, 1);

    const displayW = Math.round(imgW * this.scale);
    const displayH = Math.round(imgH * this.scale);

    this.canvas.width = displayW;
    this.canvas.height = displayH;

    // Initialize crop rect to full image
    this.cropRect = { x: 0, y: 0, w: displayW, h: displayH };

    this.drawCanvas();
    this.setupCanvasEvents();

    // Actions
    const actions = contentEl.createDiv({ cls: "archivex-modal-actions" });
    const cancelBtn = actions.createEl("button", { text: "Cancel", cls: "archivex-btn" });
    const cropBtn = actions.createEl("button", { text: "✂️ Apply Crop", cls: "archivex-btn archivex-btn-primary" });

    cancelBtn.addEventListener("click", () => this.close());
    cropBtn.addEventListener("click", () => {
      this.applyCrop();
    });
  }

  onClose() {
    this.contentEl.empty();
  }

  private drawCanvas() {
    if (!this.ctx || !this.canvas || !this.img) return;

    const ctx = this.ctx;
    const w = this.canvas.width;
    const h = this.canvas.height;

    // Draw image
    ctx.clearRect(0, 0, w, h);
    ctx.drawImage(this.img, 0, 0, w, h);

    // Draw dark overlay outside crop area
    ctx.fillStyle = "rgba(0, 0, 0, 0.5)";
    // Top
    ctx.fillRect(0, 0, w, this.cropRect.y);
    // Bottom
    ctx.fillRect(0, this.cropRect.y + this.cropRect.h, w, h - this.cropRect.y - this.cropRect.h);
    // Left
    ctx.fillRect(0, this.cropRect.y, this.cropRect.x, this.cropRect.h);
    // Right
    ctx.fillRect(this.cropRect.x + this.cropRect.w, this.cropRect.y, w - this.cropRect.x - this.cropRect.w, this.cropRect.h);

    // Draw crop border
    ctx.strokeStyle = "#fff";
    ctx.lineWidth = 2;
    ctx.strokeRect(this.cropRect.x, this.cropRect.y, this.cropRect.w, this.cropRect.h);

    // Draw corner handles
    const handleSize = 8;
    ctx.fillStyle = "#fff";
    // Top-left
    ctx.fillRect(this.cropRect.x - handleSize / 2, this.cropRect.y - handleSize / 2, handleSize, handleSize);
    // Top-right
    ctx.fillRect(this.cropRect.x + this.cropRect.w - handleSize / 2, this.cropRect.y - handleSize / 2, handleSize, handleSize);
    // Bottom-left
    ctx.fillRect(this.cropRect.x - handleSize / 2, this.cropRect.y + this.cropRect.h - handleSize / 2, handleSize, handleSize);
    // Bottom-right
    ctx.fillRect(this.cropRect.x + this.cropRect.w - handleSize / 2, this.cropRect.y + this.cropRect.h - handleSize / 2, handleSize, handleSize);

    // Draw grid lines (rule of thirds)
    ctx.strokeStyle = "rgba(255, 255, 255, 0.3)";
    ctx.lineWidth = 1;
    const thirdW = this.cropRect.w / 3;
    const thirdH = this.cropRect.h / 3;
    for (let i = 1; i <= 2; i++) {
      ctx.beginPath();
      ctx.moveTo(this.cropRect.x + thirdW * i, this.cropRect.y);
      ctx.lineTo(this.cropRect.x + thirdW * i, this.cropRect.y + this.cropRect.h);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(this.cropRect.x, this.cropRect.y + thirdH * i);
      ctx.lineTo(this.cropRect.x + this.cropRect.w, this.cropRect.y + thirdH * i);
      ctx.stroke();
    }
  }

  private setupCanvasEvents() {
    if (!this.canvas) return;

    const canvas = this.canvas;
    const handleSize = 12;

    const getPos = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      return { x: e.clientX - rect.left, y: e.clientY - rect.top };
    };

    const isNearCorner = (px: number, py: number, cx: number, cy: number) => {
      return Math.abs(px - cx) < handleSize && Math.abs(py - cy) < handleSize;
    };

    canvas.addEventListener("mousedown", (e) => {
      const pos = getPos(e);
      const r = this.cropRect;

      if (isNearCorner(pos.x, pos.y, r.x, r.y)) {
        this.dragMode = "resize-tl";
      } else if (isNearCorner(pos.x, pos.y, r.x + r.w, r.y)) {
        this.dragMode = "resize-tr";
      } else if (isNearCorner(pos.x, pos.y, r.x, r.y + r.h)) {
        this.dragMode = "resize-bl";
      } else if (isNearCorner(pos.x, pos.y, r.x + r.w, r.y + r.h)) {
        this.dragMode = "resize-br";
      } else if (pos.x >= r.x && pos.x <= r.x + r.w && pos.y >= r.y && pos.y <= r.y + r.h) {
        this.dragMode = "move";
      } else {
        // Start new selection
        this.cropRect = { x: pos.x, y: pos.y, w: 0, h: 0 };
        this.dragMode = "resize-br";
      }

      this.isDragging = true;
      this.dragStart = pos;
    });

    canvas.addEventListener("mousemove", (e) => {
      if (!this.isDragging) return;

      const pos = getPos(e);
      const dx = pos.x - this.dragStart.x;
      const dy = pos.y - this.dragStart.y;
      const canvasW = canvas.width;
      const canvasH = canvas.height;

      switch (this.dragMode) {
        case "move": {
          let newX = this.cropRect.x + dx;
          let newY = this.cropRect.y + dy;
          newX = Math.max(0, Math.min(newX, canvasW - this.cropRect.w));
          newY = Math.max(0, Math.min(newY, canvasH - this.cropRect.h));
          this.cropRect.x = newX;
          this.cropRect.y = newY;
          break;
        }
        case "resize-br": {
          this.cropRect.w = Math.max(20, Math.min(pos.x - this.cropRect.x, canvasW - this.cropRect.x));
          this.cropRect.h = Math.max(20, Math.min(pos.y - this.cropRect.y, canvasH - this.cropRect.y));
          break;
        }
        case "resize-tl": {
          const newX = Math.max(0, Math.min(pos.x, this.cropRect.x + this.cropRect.w - 20));
          const newY = Math.max(0, Math.min(pos.y, this.cropRect.y + this.cropRect.h - 20));
          this.cropRect.w += this.cropRect.x - newX;
          this.cropRect.h += this.cropRect.y - newY;
          this.cropRect.x = newX;
          this.cropRect.y = newY;
          break;
        }
        case "resize-tr": {
          const newY = Math.max(0, Math.min(pos.y, this.cropRect.y + this.cropRect.h - 20));
          this.cropRect.w = Math.max(20, Math.min(pos.x - this.cropRect.x, canvasW - this.cropRect.x));
          this.cropRect.h += this.cropRect.y - newY;
          this.cropRect.y = newY;
          break;
        }
        case "resize-bl": {
          const newX = Math.max(0, Math.min(pos.x, this.cropRect.x + this.cropRect.w - 20));
          this.cropRect.w += this.cropRect.x - newX;
          this.cropRect.x = newX;
          this.cropRect.h = Math.max(20, Math.min(pos.y - this.cropRect.y, canvasH - this.cropRect.y));
          break;
        }
      }

      this.dragStart = pos;
      this.drawCanvas();
    });

    canvas.addEventListener("mouseup", () => {
      this.isDragging = false;
      this.dragMode = "none";
    });

    canvas.addEventListener("mouseleave", () => {
      this.isDragging = false;
      this.dragMode = "none";
    });
  }

  private async applyCrop() {
    if (!this.img) return;

    // Convert crop rect from display coordinates to actual image coordinates
    const actualX = Math.round(this.cropRect.x / this.scale);
    const actualY = Math.round(this.cropRect.y / this.scale);
    const actualW = Math.round(this.cropRect.w / this.scale);
    const actualH = Math.round(this.cropRect.h / this.scale);

    // Create offscreen canvas for cropping
    const offCanvas = document.createElement("canvas");
    offCanvas.width = actualW;
    offCanvas.height = actualH;
    const offCtx = offCanvas.getContext("2d")!;

    offCtx.drawImage(this.img, actualX, actualY, actualW, actualH, 0, 0, actualW, actualH);

    // Convert to blob
    const blob = await new Promise<Blob>((resolve) => {
      offCanvas.toBlob((b) => resolve(b!), "image/png");
    });

    const croppedBuffer = await blob.arrayBuffer();
    const fileName = `cropped_${Date.now()}.png`;

    this.onCrop(croppedBuffer, fileName);
    this.close();
  }
}

// ==================== Edit Database Modal ====================
class EditDatabaseModal extends Modal {
  private file: TFile;
  private onDone: () => void;
  private fields: FieldItem[] = [];
  private fieldListEl: HTMLElement | null = null;
  private nameInput: HTMLInputElement | null = null;

  constructor(app: App, file: TFile, onDone: () => void) {
    super(app);
    this.file = file;
    this.onDone = onDone;
  }

  async onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass("archivex-modal");

    contentEl.createEl("h2", { text: "Edit Database", cls: "archivex-modal-title" });

    const content = await this.app.vault.read(this.file);
    const db = parseYamlDatabase(content);

    if (!db) {
      contentEl.createEl("p", { text: "Failed to parse database." });
      return;
    }

    // Load existing fields (track original name for record key migration)
    this.fields = db.schema.fields.map((f) => ({
      name: f.name,
      type: f.type,
      label: f.label,
      originalName: f.name,
    }));

    // Database name
    const nameGroup = contentEl.createDiv({ cls: "archivex-modal-group" });
    nameGroup.createEl("label", { text: "Database Name", cls: "archivex-modal-label" });
    this.nameInput = nameGroup.createEl("input", { type: "text", cls: "archivex-modal-input" });
    this.nameInput.value = this.file.basename;

    // Fields section (editable, same as create)
    const fieldsSection = contentEl.createDiv({ cls: "archivex-modal-group" });
    fieldsSection.createEl("label", { text: "Fields", cls: "archivex-modal-label" });

    this.fieldListEl = fieldsSection.createDiv({ cls: "archivex-field-list" });
    this.renderFieldList();

    // Add field button
    const addBtnContainer = fieldsSection.createDiv({ cls: "archivex-add-field-container" });
    const addBtn = addBtnContainer.createDiv({ cls: "archivex-add-field-btn" });
    addBtn.createSpan({ text: "+", cls: "archivex-add-field-icon" });
    addBtn.createSpan({ text: "Add Field" });

    addBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      e.preventDefault();
      this.showFieldTypeMenu(addBtnContainer);
    });

    // Actions
    const actions = contentEl.createDiv({ cls: "archivex-modal-actions" });
    const cancelBtn = actions.createEl("button", { text: "Cancel", cls: "archivex-btn" });
    const saveBtn = actions.createEl("button", { text: "Save", cls: "archivex-btn archivex-btn-primary" });

    cancelBtn.addEventListener("click", () => this.close());
    saveBtn.addEventListener("click", async () => {
      const newName = this.nameInput?.value.trim();
      if (!newName) {
        new Notice("Name cannot be empty.");
        return;
      }
      if (this.fields.length === 0) {
        new Notice("Please add at least one field.");
        return;
      }

      // Read current DB to preserve records
      const currentContent = await this.app.vault.read(this.file);
      const currentDb = parseYamlDatabase(currentContent);
      const records = currentDb?.records || [];

      // Sync records: rename keys when field names change, remove deleted fields, add new fields
      const updatedRecords = records.map((record) => {
        const newRecord: DatabaseRecord = {};
        for (const field of this.fields) {
          if (field.originalName && field.originalName !== field.name) {
            // Field was renamed: migrate data from old key to new key
            newRecord[field.name] = record[field.originalName] ?? null;
          } else if (field.originalName) {
            // Field name unchanged, keep value
            newRecord[field.name] = record[field.name] ?? null;
          } else {
            // New field, set null
            newRecord[field.name] = null;
          }
        }
        return newRecord;
      });

      // Build new YAML with updated schema
      const newSchema = { fields: this.fields.map((f) => ({ name: f.name, type: f.type, label: f.label })) };

      // Rename if needed
      if (newName !== this.file.basename) {
        const oldBaseName = this.file.basename;
        const newAssetsSafeName = toSafeAssetName(newName);
        const newAssetsDir = `${ARCHIVE_X_DIR}/${newAssetsSafeName}_assets`;

        // Strategy: find ALL possible old assets dirs from both records and filesystem
        // 1. Detect from record paths
        const detectedAssetsDirs = new Set<string>();
        const assetsDirPattern = new RegExp(`^(${ARCHIVE_X_DIR}/.+_assets)/`);
        for (const record of updatedRecords) {
          for (const value of Object.values(record)) {
            if (typeof value === "string") {
              const match = value.match(assetsDirPattern);
              if (match) detectedAssetsDirs.add(match[1]);
            } else if (Array.isArray(value)) {
              for (const v of value) {
                if (typeof v === "string") {
                  const match = v.match(assetsDirPattern);
                  if (match) detectedAssetsDirs.add(match[1]);
                }
              }
            }
          }
        }

        // 2. Also scan the archive-x directory for any _assets folders
        const archiveDir = this.app.vault.getAbstractFileByPath(ARCHIVE_X_DIR);
        if (archiveDir && archiveDir instanceof TFolder) {
          for (const child of archiveDir.children) {
            if (child instanceof TFolder && child.name.endsWith("_assets")) {
              detectedAssetsDirs.add(child.path);
            }
          }
        }

        // 3. Also check filesystem for basename_assets and pinyin variants
        const fsAssetsPath = `${ARCHIVE_X_DIR}/${oldBaseName}_assets`;
        const fsSafeAssetsPath = `${ARCHIVE_X_DIR}/${toSafeAssetName(oldBaseName)}_assets`;
        for (const p of [fsAssetsPath, fsSafeAssetsPath]) {
          const f = this.app.vault.getAbstractFileByPath(p);
          if (f) detectedAssetsDirs.add(p);
        }

        // Update media paths in records: replace all detected old paths with new path
        const finalRecords = updatedRecords.map((record) => {
          const newRecord: DatabaseRecord = {};
          for (const [key, value] of Object.entries(record)) {
            if (typeof value === "string") {
              let replaced = value;
              for (const oldDir of detectedAssetsDirs) {
                if (replaced.startsWith(oldDir)) {
                  replaced = replaced.replace(oldDir, newAssetsDir);
                  break;
                }
              }
              newRecord[key] = replaced;
            } else if (Array.isArray(value)) {
              newRecord[key] = value.map((v) => {
                if (typeof v === "string") {
                  for (const oldDir of detectedAssetsDirs) {
                    if (v.startsWith(oldDir)) {
                      return v.replace(oldDir, newAssetsDir);
                    }
                  }
                }
                return v;
              });
            } else {
              newRecord[key] = value;
            }
          }
          return newRecord;
        });

        const yamlContent = stringify({ schema: newSchema, records: finalRecords });
        await this.app.vault.modify(this.file, yamlContent);

        // Rename all detected assets folders on filesystem to new name
        for (const oldDir of detectedAssetsDirs) {
          const folder = this.app.vault.getAbstractFileByPath(oldDir);
          if (folder && oldDir !== newAssetsDir) {
            try {
              await this.app.fileManager.renameFile(folder, newAssetsDir);
            } catch (e) {
              console.warn(`Failed to rename assets folder ${oldDir}:`, e);
            }
            break; // Only one physical folder can be renamed to the target
          }
        }

        // Rename YAML file
        const newPath = `${ARCHIVE_X_DIR}/${newName}.yaml`;
        await this.app.fileManager.renameFile(this.file, newPath);
        new Notice(`Database renamed to "${newName}".`);
      } else {
        const yamlContent = stringify({ schema: newSchema, records: updatedRecords });
        await this.app.vault.modify(this.file, yamlContent);
        new Notice("Database updated.");
      }

      this.close();
      this.onDone();
    });
  }

  onClose() {
    this.contentEl.empty();
  }

  private renderFieldList() {
    if (!this.fieldListEl) return;
    this.fieldListEl.empty();

    for (let i = 0; i < this.fields.length; i++) {
      this.renderFieldRow(this.fieldListEl, this.fields[i], i);
    }
  }

  private renderFieldRow(container: HTMLElement, field: FieldItem, index: number) {
    const row = container.createDiv({ cls: "archivex-field-row" });

    const typeInfo = FIELD_TYPES.find((t) => t.type === field.type);
    row.createSpan({ text: typeInfo?.icon || "📝", cls: "archivex-field-row-icon" });
    row.createSpan({ text: field.name, cls: "archivex-field-row-label" });
    row.createSpan({ text: typeInfo?.label || field.type, cls: "archivex-field-row-type" });

    const actions = row.createDiv({ cls: "archivex-field-row-actions" });

    const editBtn = actions.createEl("button", { text: "Edit", cls: "archivex-field-action-btn archivex-field-edit-btn" });
    const deleteBtn = actions.createEl("button", { text: "Delete", cls: "archivex-field-action-btn archivex-field-delete-btn" });

    editBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      this.showEditFieldDialog(field, index);
    });

    deleteBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      this.fields.splice(index, 1);
      this.renderFieldList();
    });
  }

  private showFieldTypeMenu(anchorEl: HTMLElement) {
    const existingMenu = this.contentEl.querySelector(".archivex-type-menu");
    if (existingMenu) {
      existingMenu.remove();
      return;
    }

    const menu = anchorEl.createDiv({ cls: "archivex-type-menu" });

    for (const fieldType of FIELD_TYPES) {
      const item = menu.createDiv({ cls: "archivex-type-menu-item" });
      item.createSpan({ text: fieldType.icon, cls: "archivex-type-menu-icon" });
      item.createSpan({ text: fieldType.label });

      item.addEventListener("click", (e) => {
        e.stopPropagation();
        menu.remove();
        this.promptFieldName(fieldType.type);
      });
    }

    const closeHandler = (e: MouseEvent) => {
      if (!menu.contains(e.target as Node) && !anchorEl.contains(e.target as Node)) {
        menu.remove();
        document.removeEventListener("click", closeHandler);
      }
    };
    setTimeout(() => document.addEventListener("click", closeHandler), 10);
  }

  private promptFieldName(type: string) {
    const existing = this.contentEl.querySelector(".archivex-edit-field-dialog");
    if (existing) existing.remove();

    const dialog = this.contentEl.createDiv({ cls: "archivex-edit-field-dialog" });
    dialog.createEl("h4", { text: "New Field" });

    const nameGroup = dialog.createDiv({ cls: "archivex-modal-group" });
    nameGroup.createEl("label", { text: "Field Name", cls: "archivex-modal-label" });
    const nameInput = nameGroup.createEl("input", { type: "text", cls: "archivex-modal-input", attr: { placeholder: "Enter field name..." } });

    const actions = dialog.createDiv({ cls: "archivex-modal-actions" });
    const cancelBtn = actions.createEl("button", { text: "Cancel", cls: "archivex-btn" });
    const addBtn = actions.createEl("button", { text: "Add", cls: "archivex-btn archivex-btn-primary" });

    cancelBtn.addEventListener("click", () => dialog.remove());
    addBtn.addEventListener("click", () => {
      const name = nameInput.value.trim();
      if (!name) {
        new Notice("Please enter a field name.");
        return;
      }
      if (this.fields.some((f) => f.name === name)) {
        new Notice("Field name already exists.");
        return;
      }
      this.fields.push({ name, type, label: name });
      dialog.remove();
      this.renderFieldList();
    });

    nameInput.focus();
    nameInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") addBtn.click();
    });
  }

  private showEditFieldDialog(field: FieldItem, index: number) {
    const editModal = new EditFieldModal(this.app, field, (newName, newType) => {
      // Preserve originalName to track the original field key in records
      const origName = field.originalName || field.name;
      this.fields[index] = { name: newName, type: newType, label: newName, originalName: origName };
      this.renderFieldList();
    });
    editModal.open();
  }
}

// ==================== Edit Field Modal ====================
class EditFieldModal extends Modal {
  private field: FieldItem;
  private onSave: (name: string, type: string) => void;

  constructor(app: App, field: FieldItem, onSave: (name: string, type: string) => void) {
    super(app);
    this.field = field;
    this.onSave = onSave;
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass("archivex-modal");

    contentEl.createEl("h2", { text: "Edit Field", cls: "archivex-modal-title" });

    const nameGroup = contentEl.createDiv({ cls: "archivex-modal-group" });
    nameGroup.createEl("label", { text: "Field Name", cls: "archivex-modal-label" });
    const nameInput = nameGroup.createEl("input", { type: "text", cls: "archivex-modal-input" });
    nameInput.value = this.field.name;

    const typeGroup = contentEl.createDiv({ cls: "archivex-modal-group" });
    typeGroup.createEl("label", { text: "Type", cls: "archivex-modal-label" });
    const typeSelect = typeGroup.createEl("select", { cls: "archivex-modal-input" });
    for (const ft of FIELD_TYPES) {
      const opt = typeSelect.createEl("option", { text: `${ft.icon} ${ft.label}`, value: ft.type });
      if (ft.type === this.field.type) opt.selected = true;
    }

    const actions = contentEl.createDiv({ cls: "archivex-modal-actions" });
    const cancelBtn = actions.createEl("button", { text: "Cancel", cls: "archivex-btn" });
    const saveBtn = actions.createEl("button", { text: "Save", cls: "archivex-btn archivex-btn-primary" });

    cancelBtn.addEventListener("click", () => this.close());
    saveBtn.addEventListener("click", () => {
      const newName = nameInput.value.trim();
      if (!newName) {
        new Notice("Field name cannot be empty.");
        return;
      }
      this.onSave(newName, typeSelect.value);
      this.close();
    });

    nameInput.focus();
    nameInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") saveBtn.click();
    });
  }

  onClose() {
    this.contentEl.empty();
  }
}

// ==================== Record Preview Modal ====================
interface PreviewCallbacks {
  onEdit: () => void;
  onDelete: () => void;
  getResourcePath: (path: string) => string;
}

class RecordPreviewModal extends Modal {
  private database: Database;
  private record: DatabaseRecord;
  private dbName: string;
  private callbacks: PreviewCallbacks;

  constructor(app: App, database: Database, record: DatabaseRecord, dbName: string, callbacks: PreviewCallbacks) {
    super(app);
    this.database = database;
    this.record = record;
    this.dbName = dbName;
    this.callbacks = callbacks;
  }

  onOpen() {
    const { contentEl, modalEl } = this;
    contentEl.empty();
    contentEl.addClass("archivex-modal");
    contentEl.addClass("archivex-preview-modal");
    modalEl.addClass("archivex-preview-modal-container");

    // Header with title and action buttons
    const header = contentEl.createDiv({ cls: "archivex-preview-header" });
    const titleField = this.database.schema.fields.find((f) => f.type === "text");
    const title = titleField && this.record[titleField.name] ? String(this.record[titleField.name]) : "Record";
    header.createEl("h2", { text: title, cls: "archivex-modal-title" });

    const actionBtns = header.createDiv({ cls: "archivex-preview-actions" });
    const editBtn = actionBtns.createEl("button", { text: "✏️ Edit", cls: "archivex-btn" });
    const deleteBtn = actionBtns.createEl("button", { text: "🗑️ Delete", cls: "archivex-btn archivex-field-delete-btn" });

    editBtn.addEventListener("click", () => {
      this.close();
      this.callbacks.onEdit();
    });
    deleteBtn.addEventListener("click", () => {
      this.close();
      this.callbacks.onDelete();
    });

    // Content: display all fields
    const body = contentEl.createDiv({ cls: "archivex-preview-body" });

    for (const field of this.database.schema.fields) {
      const value = this.record[field.name];
      if (value === null || value === undefined) continue;
      // Allow empty strings for text fields to show the field exists
      if (value === "" && field.type !== "text") continue;

      const fieldEl = body.createDiv({ cls: "archivex-preview-field" });
      fieldEl.createEl("div", { text: field.name, cls: "archivex-preview-field-label" });

      if (field.type === "image") {
        const mediaContainer = fieldEl.createDiv({ cls: "archivex-preview-media" });
        const paths = Array.isArray(value) ? value : [String(value)];
        for (const p of paths) {
          const img = mediaContainer.createEl("img", { cls: "archivex-preview-img" });
          img.src = this.callbacks.getResourcePath(String(p));
          img.alt = String(p);
        }
      } else if (field.type === "video") {
        const mediaContainer = fieldEl.createDiv({ cls: "archivex-preview-media" });
        const paths = Array.isArray(value) ? value : [String(value)];
        for (const p of paths) {
          const video = mediaContainer.createEl("video", { cls: "archivex-preview-video" });
          video.src = this.callbacks.getResourcePath(String(p));
          video.controls = true;
        }
      } else if (field.type === "audio") {
        const mediaContainer = fieldEl.createDiv({ cls: "archivex-preview-media" });
        const paths = Array.isArray(value) ? value : [String(value)];
        for (const p of paths) {
          const audio = mediaContainer.createEl("audio", { cls: "archivex-preview-audio" });
          audio.src = this.callbacks.getResourcePath(String(p));
          audio.controls = true;
        }
      } else if (field.type === "checkbox" || field.type === "boolean") {
        fieldEl.createEl("div", { text: value ? "✅ Yes" : "❌ No", cls: "archivex-preview-field-value" });
      } else if (field.type === "tags" || field.type === "multiselect") {
        if (Array.isArray(value)) {
          const tagsEl = fieldEl.createDiv({ cls: "archivex-preview-tags" });
          for (const tag of value) {
            tagsEl.createEl("span", { text: String(tag), cls: "archivex-tag" });
          }
        } else {
          fieldEl.createEl("div", { text: String(value), cls: "archivex-preview-field-value" });
        }
      } else {
        fieldEl.createEl("div", { text: String(value), cls: "archivex-preview-field-value" });
      }
    }

    // If no fields were rendered, show a message
    if (body.children.length === 0) {
      body.createEl("div", { text: "No data to display.", cls: "archivex-preview-field-value" });
    }
  }

  onClose() {
    this.contentEl.empty();
  }
}

// ==================== Confirm Delete Modal ====================
class ConfirmDeleteModal extends Modal {
  private dbName: string;
  private onConfirm: () => void;

  constructor(app: App, dbName: string, onConfirm: () => void) {
    super(app);
    this.dbName = dbName;
    this.onConfirm = onConfirm;
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass("archivex-modal");

    contentEl.createEl("h2", { text: "Delete Database", cls: "archivex-modal-title" });
    contentEl.createEl("p", { text: `Are you sure you want to delete "${this.dbName}"? This action cannot be undone.` });

    const actions = contentEl.createDiv({ cls: "archivex-modal-actions" });
    const cancelBtn = actions.createEl("button", { text: "Cancel", cls: "archivex-btn" });
    const deleteBtn = actions.createEl("button", { text: "Delete", cls: "archivex-btn archivex-field-delete-btn" });

    cancelBtn.addEventListener("click", () => this.close());
    deleteBtn.addEventListener("click", () => {
      this.onConfirm();
      this.close();
    });
  }

  onClose() {
    this.contentEl.empty();
  }
}

// ==================== Generic Confirm Modal ====================
class ConfirmModal extends Modal {
  private title: string;
  private message: string;
  private onConfirm: () => void;

  constructor(app: App, title: string, message: string, onConfirm: () => void) {
    super(app);
    this.title = title;
    this.message = message;
    this.onConfirm = onConfirm;
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass("archivex-modal");

    contentEl.createEl("h2", { text: this.title, cls: "archivex-modal-title" });
    contentEl.createEl("p", { text: this.message });

    const actions = contentEl.createDiv({ cls: "archivex-modal-actions" });
    const cancelBtn = actions.createEl("button", { text: "Cancel", cls: "archivex-btn" });
    const confirmBtn = actions.createEl("button", { text: "Confirm", cls: "archivex-btn archivex-field-delete-btn" });

    cancelBtn.addEventListener("click", () => this.close());
    confirmBtn.addEventListener("click", () => {
      this.onConfirm();
      this.close();
    });
  }

  onClose() {
    this.contentEl.empty();
  }
}

// ==================== Image Lightbox Modal ====================
class ImageLightboxModal extends Modal {
  private images: string[];
  private currentIndex: number;
  private imgEl: HTMLImageElement | null = null;
  private counterEl: HTMLElement | null = null;
  private boundKeyHandler: (e: KeyboardEvent) => void;

  constructor(app: App, images: string[], startIndex: number) {
    super(app);
    this.images = images;
    this.currentIndex = startIndex;
    this.boundKeyHandler = this.handleKey.bind(this);
  }

  onOpen() {
    const { contentEl, modalEl } = this;
    contentEl.empty();
    modalEl.addClass("archivex-lightbox-modal");
    contentEl.addClass("archivex-lightbox-content");

    // Navigation: left arrow
    const prevBtn = contentEl.createEl("button", { text: "‹", cls: "archivex-lightbox-nav archivex-lightbox-prev" });
    prevBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      this.showPrev();
    });

    // Image container
    const imgContainer = contentEl.createDiv({ cls: "archivex-lightbox-img-container" });
    this.imgEl = imgContainer.createEl("img", { cls: "archivex-lightbox-img" });
    this.updateImage();

    // Navigation: right arrow
    const nextBtn = contentEl.createEl("button", { text: "›", cls: "archivex-lightbox-nav archivex-lightbox-next" });
    nextBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      this.showNext();
    });

    // Counter
    this.counterEl = contentEl.createDiv({ cls: "archivex-lightbox-counter" });
    this.updateCounter();

    // Click background to close
    imgContainer.addEventListener("click", (e) => {
      if (e.target === imgContainer) this.close();
    });

    // Keyboard navigation
    document.addEventListener("keydown", this.boundKeyHandler);
  }

  private handleKey(e: KeyboardEvent) {
    if (e.key === "ArrowLeft") {
      this.showPrev();
    } else if (e.key === "ArrowRight") {
      this.showNext();
    } else if (e.key === "Escape") {
      this.close();
    }
  }

  private showPrev() {
    if (this.images.length <= 1) return;
    this.currentIndex = (this.currentIndex - 1 + this.images.length) % this.images.length;
    this.updateImage();
    this.updateCounter();
  }

  private showNext() {
    if (this.images.length <= 1) return;
    this.currentIndex = (this.currentIndex + 1) % this.images.length;
    this.updateImage();
    this.updateCounter();
  }

  private updateImage() {
    if (this.imgEl) {
      this.imgEl.src = this.images[this.currentIndex];
    }
  }

  private updateCounter() {
    if (this.counterEl) {
      this.counterEl.setText(`${this.currentIndex + 1} / ${this.images.length}`);
    }
  }

  onClose() {
    document.removeEventListener("keydown", this.boundKeyHandler);
    this.contentEl.empty();
  }
}