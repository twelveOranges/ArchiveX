import { pinyin } from "pinyin-pro";
import type { FieldType } from "./types";

/**
 * Convert a string to a filesystem-safe name.
 * Chinese characters are converted to pinyin; other characters are kept as-is.
 */
export function toSafeAssetName(name: string): string {
  if (/[\u4e00-\u9fa5]/.test(name)) {
    const result = pinyin(name, { toneType: "none", type: "array" });
    return result.join("").replace(/\s+/g, "_");
  }
  return name.replace(/\s+/g, "_");
}

/**
 * Generate a SHA-256 hash string from an ArrayBuffer (browser-compatible).
 */
export async function hashBufferBrowser(buffer: ArrayBuffer): Promise<string> {
  const hashBuf = await crypto.subtle.digest("SHA-256", buffer);
  const hashArray = Array.from(new Uint8Array(hashBuf));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Get the icon name for a field type (used with Icon component).
 */
export function getFieldIcon(type: string): string {
  const icons: Record<string, string> = {
    text: "file",
    integer: "hash",
    number: "hash",
    date: "calendar",
    select: "list",
    multiselect: "list",
    checkbox: "toggle",
    image: "image",
    video: "video",
    audio: "music",
    url: "link",
    tags: "tag",
    boolean: "toggle",
    file: "file",
  };
  return icons[type] || "file";
}

/**
 * Get the accept attribute value for file inputs based on field type.
 */
export function getAcceptType(type: string): string {
  switch (type) {
    case "image":
      return "image/*";
    case "video":
      return "video/*";
    case "audio":
      return "audio/*";
    default:
      return "*/*";
  }
}

/**
 * All supported field types with their metadata.
 */
export const FIELD_TYPES: { type: FieldType; icon: string; label: string }[] = [
  { type: "text", icon: "file", label: "Text" },
  { type: "integer", icon: "hash", label: "Integer" },
  { type: "number", icon: "hash", label: "Real Number" },
  { type: "date", icon: "calendar", label: "Date" },
  { type: "select", icon: "list", label: "Select" },
  { type: "multiselect", icon: "list", label: "Multi-Select" },
  { type: "checkbox", icon: "toggle", label: "Checkbox" },
  { type: "image", icon: "image", label: "Image" },
  { type: "video", icon: "video", label: "Video" },
  { type: "audio", icon: "music", label: "Audio" },
  { type: "url", icon: "link", label: "URL" },
  { type: "tags", icon: "tag", label: "Tags" },
];

/**
 * Escape HTML special characters.
 */
export function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
