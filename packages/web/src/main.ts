import { App, dataProvider } from "@archivex/ui";
import { WebDataProvider } from "./web-provider";
import "./styles.css";

// Initialize the WebDataProvider and set it in the store
const provider = new WebDataProvider("");
dataProvider.set(provider);

// Mount the Svelte app
const app = new App({
  target: document.getElementById("app")!,
});

export default app;
