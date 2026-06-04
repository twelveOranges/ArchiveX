import { Plugin, WorkspaceLeaf, TFile, MarkdownView } from "obsidian";
import { ArchiveXSettingTab, ArchiveXSettings, DEFAULT_SETTINGS } from "./settings";
import { DatabaseView, VIEW_TYPE_DATABASE, ARCHIVE_X_DIR } from "./views/DatabaseView";
import { parseYamlDatabase } from "./parser";

export default class ArchiveXPlugin extends Plugin {
  settings: ArchiveXSettings = DEFAULT_SETTINGS;

  async onload() {
    await this.loadSettings();

    // Register the database view type
    this.registerView(VIEW_TYPE_DATABASE, (leaf) => new DatabaseView(leaf, this));

    // Add ribbon icon (left sidebar button) to open database view
    this.addRibbonIcon("database", "Open ArchiveX Database", async () => {
      await this.activateView();
    });

    // Register the code block processor for rendering inline
    this.registerMarkdownCodeBlockProcessor("archivex", async (source, el, ctx) => {
      await this.renderDatabaseBlock(source, el, ctx.sourcePath);
    });

    // Add command to open database view
    this.addCommand({
      id: "open-database-view",
      name: "Open Database View",
      callback: () => {
        this.activateView();
      },
    });

    // Add command to create a sample YAML database
    this.addCommand({
      id: "create-sample-database",
      name: "Create Sample YAML Database",
      callback: () => {
        this.createSampleDatabase();
      },
    });

    // Add settings tab
    this.addSettingTab(new ArchiveXSettingTab(this.app, this));
  }

  onunload() {}

  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }

  async activateView() {
    const { workspace } = this.app;

    let leaf: WorkspaceLeaf | null = null;
    const leaves = workspace.getLeavesOfType(VIEW_TYPE_DATABASE);

    if (leaves.length > 0) {
      // Check if the existing leaf is in the main area (root split)
      leaf = leaves[0];
      const root = workspace.rootSplit;
      let isInMain = false;
      workspace.iterateAllLeaves((l) => {
        if (l === leaf && l.getRoot() === root) {
          isInMain = true;
        }
      });

      if (!isInMain) {
        // It's in sidebar, close it and reopen in main area
        leaf.detach();
        leaf = workspace.getLeaf("tab");
        await leaf.setViewState({ type: VIEW_TYPE_DATABASE, active: true });
      }
    } else {
      // Open in a new tab in the main workspace area
      leaf = workspace.getLeaf("tab");
      await leaf.setViewState({ type: VIEW_TYPE_DATABASE, active: true });
    }

    if (leaf) {
      workspace.revealLeaf(leaf);
    }
  }

  async renderDatabaseBlock(source: string, container: HTMLElement, sourcePath: string) {
    try {
      const config = parseCodeBlockConfig(source);
      const file = this.app.vault.getAbstractFileByPath(config.source);

      if (!file || !(file instanceof TFile)) {
        container.createEl("p", { text: `Database file not found: ${config.source}`, cls: "archivex-error" });
        return;
      }

      const content = await this.app.vault.read(file);
      const database = parseYamlDatabase(content);

      if (!database) {
        container.createEl("p", { text: "Failed to parse YAML database.", cls: "archivex-error" });
        return;
      }

      const { CardRenderer } = await import("./views/CardRenderer");
      const renderer = new CardRenderer(this.app, container, this.settings);
      renderer.render(database, config);
    } catch (e) {
      container.createEl("p", { text: `Error: ${(e as Error).message}`, cls: "archivex-error" });
    }
  }

  async createSampleDatabase() {
    // Ensure .archive-x directory exists
    const dir = this.app.vault.getAbstractFileByPath(ARCHIVE_X_DIR);
    if (!dir) {
      await this.app.vault.createFolder(ARCHIVE_X_DIR);
    }

    const sampleContent = `schema:
  fields:
    - name: title
      type: text
      label: Title
    - name: cover
      type: image
      label: Cover Image
    - name: description
      type: text
      label: Description
    - name: tags
      type: tags
      label: Tags
    - name: rating
      type: number
      label: Rating
    - name: video
      type: video
      label: Video
    - name: created
      type: date
      label: Created Date

records:
  - title: "Sample Entry 1"
    cover: "attachments/sample1.png"
    description: "This is a sample entry demonstrating the ArchiveX plugin."
    tags: ["demo", "sample"]
    rating: 5
    video: ""
    created: "2024-01-15"

  - title: "Sample Entry 2"
    cover: "attachments/sample2.jpg"
    description: "Another sample entry with different data."
    tags: ["example", "test"]
    rating: 4
    video: "attachments/demo.mp4"
    created: "2024-02-20"

  - title: "Sample Entry 3"
    cover: ""
    description: "An entry without a cover image to show fallback behavior."
    tags: ["minimal"]
    rating: 3
    video: ""
    created: "2024-03-10"
`;

    const filePath = `${ARCHIVE_X_DIR}/sample-database.yaml`;
    const existingFile = this.app.vault.getAbstractFileByPath(filePath);
    if (existingFile) {
      // File already exists
      return;
    }
    await this.app.vault.create(filePath, sampleContent);
  }
}

function parseCodeBlockConfig(source: string): { source: string; view: string; columns: number; filter: string } {
  const lines = source.trim().split("\n");
  const config: { source: string; view: string; columns: number; filter: string } = {
    source: "",
    view: "card",
    columns: 3,
    filter: "",
  };

  for (const line of lines) {
    const [key, ...valueParts] = line.split(":");
    const value = valueParts.join(":").trim();
    switch (key.trim()) {
      case "source":
        config.source = value;
        break;
      case "view":
        config.view = value;
        break;
      case "columns":
        config.columns = parseInt(value) || 3;
        break;
      case "filter":
        config.filter = value;
        break;
    }
  }

  return config;
}
