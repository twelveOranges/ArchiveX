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
 * Get the emoji icon for a field type.
 */
export function getFieldIcon(type: string): string {
  const icons: Record<string, string> = {
    text: "📝",
    integer: "🔢",
    number: "🔣",
    date: "📅",
    select: "📋",
    multiselect: "☑️",
    checkbox: "✅",
    image: "🖼️",
    video: "🎬",
    audio: "🎵",
    url: "🔗",
    tags: "🏷️",
    boolean: "✅",
    file: "📎",
  };
  return icons[type] || "📝";
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
  { type: "text", icon: "📝", label: "Text" },
  { type: "integer", icon: "🔢", label: "Integer" },
  { type: "number", icon: "🔣", label: "Real Number" },
  { type: "date", icon: "📅", label: "Date" },
  { type: "select", icon: "📋", label: "Select" },
  { type: "multiselect", icon: "☑️", label: "Multi-Select" },
  { type: "checkbox", icon: "✅", label: "Checkbox" },
  { type: "image", icon: "🖼️", label: "Image" },
  { type: "video", icon: "🎬", label: "Video" },
  { type: "audio", icon: "🎵", label: "Audio" },
  { type: "url", icon: "🔗", label: "URL" },
  { type: "tags", icon: "🏷️", label: "Tags" },
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
