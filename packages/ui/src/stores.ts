import { writable } from "svelte/store";
import type { DataProvider, Database, DatabaseInfo } from "@archivex/core";

// The active DataProvider instance (set by the host app: web or obsidian)
export const dataProvider = writable<DataProvider | null>(null);

// Platform identifier: "web" or "obsidian"
export const platform = writable<"web" | "obsidian">("web");

// Current page state
export const currentPage = writable<"home" | "detail">("home");

// Current database being viewed
export const currentDatabase = writable<(Database & { name: string }) | null>(null);

// Current view mode
export const currentMode = writable<"card" | "images" | "table" | "list">("card");

// Card size for grid views
export const cardSize = writable<number>(120);

// Sort state
export type SortField = "added" | string; // "added" = by index (add time), or field name
export type SortOrder = "asc" | "desc";
export const sortField = writable<SortField>("added");
export const sortOrder = writable<SortOrder>("asc");

// Multi-select state
export const multiSelectMode = writable<boolean>(false);
export const selectedIndices = writable<Set<number>>(new Set());