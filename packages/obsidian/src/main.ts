import { Plugin, WorkspaceLeaf, ItemView } from "obsidian";
import { App as SvelteApp, dataProvider } from "@archivex/ui";
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

    // Set the data provider
    const provider = new VaultDataProvider(this.app);
    dataProvider.set(provider);

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

export default class ArchiveXPlugin extends Plugin {
  async onload() {
    // Register the database view type
    this.registerView(VIEW_TYPE_ARCHIVEX, (leaf) => new ArchiveXView(leaf, this));

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
