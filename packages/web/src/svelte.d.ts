/// <reference types="svelte" />
/// <reference types="vite/client" />

declare module "*.svelte" {
  import type { ComponentType } from "svelte";
  const component: ComponentType;
  export default component;
}

// Allow importing from @archivex/ui subpaths
declare module "@archivex/ui/App.svelte" {
  import type { ComponentType } from "svelte";
  const component: ComponentType;
  export default component;
}

declare module "@archivex/ui/stores" {
  export { dataProvider } from "@archivex/ui";
}
