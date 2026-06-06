import express from "express";
import multer from "multer";
import path from "path";
import fs from "fs";
import crypto from "crypto";
import yaml from "yaml";
import { pinyin } from "pinyin-pro";
import { fileURLToPath } from "url";
import { execSync } from "child_process";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ==================== Configuration ====================
const PORT = process.env.PORT || 3000;
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, "data");

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Detect file type by reading magic bytes
function detectFileType(filePath) {
  try {
    const fd = fs.openSync(filePath, "r");
    const buf = Buffer.alloc(12);
    fs.readSync(fd, buf, 0, 12, 0);
    fs.closeSync(fd);

    // Image signatures
    if (buf[0] === 0xFF && buf[1] === 0xD8 && buf[2] === 0xFF) return "image"; // JPEG
    if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4E && buf[3] === 0x47) return "image"; // PNG
    if (buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46) return "image"; // GIF
    if (buf[0] === 0x42 && buf[1] === 0x4D) return "image"; // BMP
    if (buf.toString("ascii", 0, 4) === "RIFF" && buf.toString("ascii", 8, 12) === "WEBP") return "image"; // WebP
    if (buf.toString("utf8", 0, 5) === "<?xml" || buf.toString("utf8", 0, 4) === "<svg") return "image"; // SVG

    // Video signatures
    if (buf.toString("ascii", 4, 8) === "ftyp") return "video"; // MP4/MOV
    if (buf[0] === 0x1A && buf[1] === 0x45 && buf[2] === 0xDF && buf[3] === 0xA3) return "video"; // MKV/WebM
    if (buf.toString("ascii", 0, 4) === "RIFF" && buf.toString("ascii", 8, 12) === "AVI ") return "video"; // AVI
    if (buf[0] === 0x00 && buf[1] === 0x00 && buf[2] === 0x01 && (buf[3] === 0xBA || buf[3] === 0xB3)) return "video"; // MPEG

    return "file";
  } catch {
    return "file";
  }
}

// Serve built frontend files
app.use(express.static(path.join(__dirname, "dist/client")));

// Serve asset files
app.use("/assets", express.static(DATA_DIR));

// ==================== Utility Functions ====================

function toSafeAssetName(name) {
  if (/[\u4e00-\u9fa5]/.test(name)) {
    const result = pinyin(name, { toneType: "none", type: "array" });
    return result.join("").replace(/\s+/g, "_");
  }
  return name.replace(/\s+/g, "_");
}

function hashBuffer(buffer) {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

function parseYamlDatabase(content) {
  try {
    const parsed = yaml.parse(content);
    if (!parsed || !parsed.schema || !parsed.records) return null;
    const schema = {
      fields: (parsed.schema.fields || []).map((f) => ({
        name: f.name || "",
        type: f.type || "text",
        label: f.label || f.name || "",
      })),
    };
    const records = (parsed.records || []).map((r) => {
      const record = {};
      for (const field of schema.fields) {
        record[field.name] = r[field.name] ?? null;
      }
      return record;
    });
    return { schema, records };
  } catch (e) {
    console.error("Failed to parse YAML:", e);
    return null;
  }
}

function getYamlFiles() {
  if (!fs.existsSync(DATA_DIR)) return [];
  return fs.readdirSync(DATA_DIR).filter((f) => f.endsWith(".yaml") || f.endsWith(".yml"));
}

function readDatabase(filename) {
  const filePath = path.join(DATA_DIR, filename);
  if (!fs.existsSync(filePath)) return null;
  const content = fs.readFileSync(filePath, "utf-8");
  return parseYamlDatabase(content);
}

function saveDatabase(filename, database) {
  const filePath = path.join(DATA_DIR, filename);
  const content = yaml.stringify({
    schema: database.schema,
    records: database.records,
  });
  fs.writeFileSync(filePath, content, "utf-8");
}

// ==================== API Routes ====================

// Get server config info
app.get("/api/config", (req, res) => {
  res.json({
    dataDir: DATA_DIR,
    port: PORT,
  });
});

// List all databases
app.get("/api/databases", (req, res) => {
  const files = getYamlFiles();
  const databases = files.map((filename) => {
    const db = readDatabase(filename);
    const basename = filename.replace(/\.(yaml|yml)$/, "");
    return {
      filename,
      name: basename,
      recordCount: db ? db.records.length : 0,
      fieldCount: db ? db.schema.fields.length : 0,
    };
  });
  res.json(databases);
});

// Get a single database
app.get("/api/databases/:name", (req, res) => {
  const filename = `${req.params.name}.yaml`;
  const db = readDatabase(filename);
  if (!db) return res.status(404).json({ error: "Database not found" });
  res.json({ name: req.params.name, ...db });
});

// Create a new database
app.post("/api/databases", (req, res) => {
  const { name, fields } = req.body;
  if (!name) return res.status(400).json({ error: "Name is required" });

  const filename = `${name}.yaml`;
  const filePath = path.join(DATA_DIR, filename);
  if (fs.existsSync(filePath)) {
    return res.status(409).json({ error: "Database already exists" });
  }

  const database = {
    schema: {
      fields: fields || [{ name: "title", type: "text", label: "Title" }],
    },
    records: [],
  };

  // Create assets directory
  const assetsDir = path.join(DATA_DIR, `${toSafeAssetName(name)}_assets`);
  if (!fs.existsSync(assetsDir)) {
    fs.mkdirSync(assetsDir, { recursive: true });
  }

  saveDatabase(filename, database);
  res.status(201).json({ name, filename });
});

// Update database (rename, update fields)
app.put("/api/databases/:name", (req, res) => {
  const oldFilename = `${req.params.name}.yaml`;
  const oldPath = path.join(DATA_DIR, oldFilename);
  if (!fs.existsSync(oldPath)) {
    return res.status(404).json({ error: "Database not found" });
  }

  const { newName, fields } = req.body;
  const db = readDatabase(oldFilename);
  if (!db) return res.status(500).json({ error: "Failed to read database" });

  // Update fields if provided
  if (fields) {
    const oldFields = db.schema.fields;
    db.schema.fields = fields;

    for (const record of db.records) {
      for (const newField of fields) {
        const oldField = oldFields.find((f) => f.name === newField.name);
        if (!oldField && record[newField.name] === undefined) {
          record[newField.name] = null;
        }
      }
      for (const key of Object.keys(record)) {
        if (!fields.find((f) => f.name === key)) {
          delete record[key];
        }
      }
    }
  }

  // Rename if needed
  if (newName && newName !== req.params.name) {
    const newFilename = `${newName}.yaml`;
    const newPath = path.join(DATA_DIR, newFilename);
    if (fs.existsSync(newPath)) {
      return res.status(409).json({ error: "A database with that name already exists" });
    }

    const oldAssetsDir = path.join(DATA_DIR, `${toSafeAssetName(req.params.name)}_assets`);
    const newAssetsDir = path.join(DATA_DIR, `${toSafeAssetName(newName)}_assets`);
    if (fs.existsSync(oldAssetsDir)) {
      fs.renameSync(oldAssetsDir, newAssetsDir);
      const oldPrefix = `${toSafeAssetName(req.params.name)}_assets`;
      const newPrefix = `${toSafeAssetName(newName)}_assets`;
      for (const record of db.records) {
        for (const key of Object.keys(record)) {
          const val = record[key];
          if (typeof val === "string" && val.includes(oldPrefix)) {
            record[key] = val.replace(new RegExp(oldPrefix, "g"), newPrefix);
          } else if (Array.isArray(val)) {
            record[key] = val.map((v) =>
              typeof v === "string" && v.includes(oldPrefix)
                ? v.replace(new RegExp(oldPrefix, "g"), newPrefix)
                : v
            );
          }
        }
      }
    }

    saveDatabase(newFilename, db);
    fs.unlinkSync(oldPath);
    res.json({ name: newName, filename: newFilename });
  } else {
    saveDatabase(oldFilename, db);
    res.json({ name: req.params.name, filename: oldFilename });
  }
});

// Delete a database
app.delete("/api/databases/:name", (req, res) => {
  const filename = `${req.params.name}.yaml`;
  const filePath = path.join(DATA_DIR, filename);
  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: "Database not found" });
  }

  fs.unlinkSync(filePath);

  const assetsDir = path.join(DATA_DIR, `${toSafeAssetName(req.params.name)}_assets`);
  if (fs.existsSync(assetsDir)) {
    fs.rmSync(assetsDir, { recursive: true, force: true });
  }

  res.json({ success: true });
});

// Add a record
app.post("/api/databases/:name/records", (req, res) => {
  const filename = `${req.params.name}.yaml`;
  const db = readDatabase(filename);
  if (!db) return res.status(404).json({ error: "Database not found" });

  const record = req.body;
  db.records.push(record);
  saveDatabase(filename, db);
  res.status(201).json(record);
});

// Update a record
app.put("/api/databases/:name/records/:index", (req, res) => {
  const filename = `${req.params.name}.yaml`;
  const db = readDatabase(filename);
  if (!db) return res.status(404).json({ error: "Database not found" });

  const index = parseInt(req.params.index);
  if (index < 0 || index >= db.records.length) {
    return res.status(404).json({ error: "Record not found" });
  }

  db.records[index] = req.body;
  saveDatabase(filename, db);
  res.json(db.records[index]);
});

// Batch delete records
app.post("/api/databases/:name/records/batch-delete", (req, res) => {
  const filename = `${req.params.name}.yaml`;
  const db = readDatabase(filename);
  if (!db) return res.status(404).json({ error: "Database not found" });

  const { indices } = req.body;
  if (!Array.isArray(indices) || indices.length === 0) {
    return res.status(400).json({ error: "indices array is required" });
  }

  // Sort indices in descending order to remove from end first
  const sorted = [...indices].sort((a, b) => b - a);
  for (const idx of sorted) {
    if (idx >= 0 && idx < db.records.length) {
      db.records.splice(idx, 1);
    }
  }

  saveDatabase(filename, db);
  res.json({ success: true });
});

// Merge records - combines multiple records into one, keeping first non-null value for each field
app.post("/api/databases/:name/records/merge", (req, res) => {
  const filename = `${req.params.name}.yaml`;
  const db = readDatabase(filename);
  if (!db) return res.status(404).json({ error: "Database not found" });

  const { indices } = req.body;
  if (!Array.isArray(indices) || indices.length < 2) {
    return res.status(400).json({ error: "At least 2 indices are required for merge" });
  }

  // Validate all indices
  for (const idx of indices) {
    if (idx < 0 || idx >= db.records.length) {
      return res.status(400).json({ error: `Invalid index: ${idx}` });
    }
  }

  // Merge: for each field, collect all non-null values
  const merged = {};
  for (const field of db.schema.fields) {
    const values = indices.map((idx) => db.records[idx][field.name]).filter((v) => v != null);
    if (field.type === "image" || field.type === "video" || field.type === "audio" || field.type === "tags" || field.type === "multiselect") {
      // For array-like fields, merge all values
      const allValues = [];
      for (const v of values) {
        if (Array.isArray(v)) {
          allValues.push(...v);
        } else if (v) {
          allValues.push(v);
        }
      }
      merged[field.name] = allValues.length > 0 ? (allValues.length === 1 ? allValues[0] : allValues) : null;
    } else {
      // For scalar fields, keep the first non-null value
      merged[field.name] = values.length > 0 ? values[0] : null;
    }
  }

  // Remove old records (from end first) and insert merged at the position of the first selected
  const sortedDesc = [...indices].sort((a, b) => b - a);
  const insertAt = Math.min(...indices);
  for (const idx of sortedDesc) {
    db.records.splice(idx, 1);
  }
  db.records.splice(insertAt, 0, merged);

  saveDatabase(filename, db);
  res.json({ success: true, record: merged });
});

// Delete a record
app.delete("/api/databases/:name/records/:index", (req, res) => {
  const filename = `${req.params.name}.yaml`;
  const db = readDatabase(filename);
  if (!db) return res.status(404).json({ error: "Database not found" });

  const index = parseInt(req.params.index);
  if (index < 0 || index >= db.records.length) {
    return res.status(404).json({ error: "Record not found" });
  }

  db.records.splice(index, 1);
  saveDatabase(filename, db);
  res.json({ success: true });
});

// Upload file
const upload = multer({ storage: multer.memoryStorage() });
app.post("/api/databases/:name/upload", upload.single("file"), (req, res) => {
  if (!req.file) return res.status(400).json({ error: "No file provided" });

  const dbName = req.params.name;
  const assetsDir = path.join(DATA_DIR, `${toSafeAssetName(dbName)}_assets`);
  if (!fs.existsSync(assetsDir)) {
    fs.mkdirSync(assetsDir, { recursive: true });
  }

  const hash = hashBuffer(req.file.buffer);
  const filePath = path.join(assetsDir, hash);
  fs.writeFileSync(filePath, req.file.buffer);

  const relativePath = `${toSafeAssetName(dbName)}_assets/${hash}`;
  res.json({
    path: relativePath,
    hash,
    originalName: req.file.originalname,
    mimeType: req.file.mimetype,
    size: req.file.size,
  });
});

// Get asset file with mime type detection
app.get("/api/assets/*", (req, res) => {
  let relativePath = req.params[0];
  const dataBaseName = path.basename(DATA_DIR);
  if (relativePath.startsWith(dataBaseName + "/")) {
    relativePath = relativePath.slice(dataBaseName.length + 1);
  }
  if (relativePath.startsWith("." + dataBaseName + "/")) {
    relativePath = relativePath.slice(dataBaseName.length + 2);
  }
  const filePath = path.join(DATA_DIR, relativePath);
  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: "File not found" });
  }
  const buffer = fs.readFileSync(filePath);
  const mimeType = detectMimeType(buffer);
  res.setHeader("Content-Type", mimeType);
  res.send(buffer);
});

// Backup
app.get("/api/backup", (req, res) => {
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-").replace("T", "_").slice(0, 19);
  const backupName = `archivex_backup_${timestamp}.tar.gz`;
  const tmpPath = path.join("/tmp", backupName);

  try {
    execSync(`tar -czf "${tmpPath}" -C "${DATA_DIR}" .`, { timeout: 60000 });
    res.download(tmpPath, backupName, () => {
      if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath);
    });
  } catch (e) {
    res.status(500).json({ error: "Backup failed: " + e.message });
  }
});

// Restore
const restoreUpload = multer({ dest: "/tmp" });
app.post("/api/restore", restoreUpload.single("backup"), (req, res) => {
  if (!req.file) return res.status(400).json({ error: "No backup file provided" });
  try {
    const listing = execSync(`tar -tzf "${req.file.path}"`, { timeout: 30000 }).toString();
    const hasArchiveXDir = listing.split("\n").some((l) => l.startsWith("archive-x/"));

    if (hasArchiveXDir) {
      const tmpExtract = path.join("/tmp", `archivex_restore_${Date.now()}`);
      fs.mkdirSync(tmpExtract, { recursive: true });
      execSync(`tar -xzf "${req.file.path}" -C "${tmpExtract}"`, { timeout: 60000 });

      const extractedDir = path.join(tmpExtract, "archive-x");
      if (fs.existsSync(extractedDir)) {
        execSync(`cp -rf "${extractedDir}/"* "${DATA_DIR}/" 2>/dev/null || true`, { timeout: 60000 });
        execSync(`cp -rf "${extractedDir}"/.[!.]* "${DATA_DIR}/" 2>/dev/null || true`, { timeout: 60000 });
      }
      fs.rmSync(tmpExtract, { recursive: true, force: true });
    } else {
      execSync(`tar -xzf "${req.file.path}" -C "${DATA_DIR}"`, { timeout: 60000 });
    }

    fs.unlinkSync(req.file.path);
    res.json({ success: true, message: "Restore completed" });
  } catch (e) {
    if (fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
    res.status(500).json({ error: "Restore failed: " + e.message });
  }
});

// Rebuild - recalculate file hashes and find unreferenced files
app.post("/api/rebuild", (req, res) => {
  const { yamlPath } = req.body;
  const targetDir = yamlPath || DATA_DIR;

  // Verify the directory exists
  if (!fs.existsSync(targetDir)) {
    return res.status(400).json({ error: `Directory not found: ${targetDir}` });
  }

  try {
    // 1. Find all YAML files in the target directory
    const yamlFiles = fs.readdirSync(targetDir).filter((f) => f.endsWith(".yaml") || f.endsWith(".yml"));

    // 2. Collect all referenced file paths from all databases
    const referencedFiles = new Set();
    let rehashed = 0;

    for (const yamlFile of yamlFiles) {
      const filePath = path.join(targetDir, yamlFile);
      const content = fs.readFileSync(filePath, "utf-8");
      const db = parseYamlDatabase(content);
      if (!db) continue;

      const dbName = yamlFile.replace(/\.(yaml|yml)$/, "");
      const assetsDir = path.join(targetDir, `${toSafeAssetName(dbName)}_assets`);

      // Check each record for file references
      let modified = false;
      for (const record of db.records) {
        for (const field of db.schema.fields) {
          if (field.type === "image" || field.type === "video" || field.type === "audio" || field.type === "file") {
            const value = record[field.name];
            if (!value) continue;

            const paths = Array.isArray(value) ? value : [value];
            const newPaths = [];

            for (const p of paths) {
              if (!p) continue;
              const strPath = String(p);
              referencedFiles.add(strPath);

              // Try to rehash: if the file exists, recalculate its hash
              const fullFilePath = path.join(targetDir, strPath);
              if (fs.existsSync(fullFilePath)) {
                const buffer = fs.readFileSync(fullFilePath);
                const newHash = hashBuffer(buffer);
                const fileName = path.basename(strPath);
                const dirName = path.dirname(strPath);

                if (fileName !== newHash) {
                  // File name doesn't match its hash - rename it
                  const newFilePath = path.join(targetDir, dirName, newHash);
                  if (!fs.existsSync(newFilePath)) {
                    fs.renameSync(fullFilePath, newFilePath);
                  } else {
                    // Hash file already exists, just remove the old one
                    fs.unlinkSync(fullFilePath);
                  }
                  const newRelPath = `${dirName}/${newHash}`;
                  newPaths.push(newRelPath);
                  referencedFiles.delete(strPath);
                  referencedFiles.add(newRelPath);
                  rehashed++;
                  modified = true;
                } else {
                  newPaths.push(strPath);
                }
              } else {
                newPaths.push(strPath);
              }
            }

            // Update record if paths changed
            if (modified) {
              record[field.name] = Array.isArray(value)
                ? newPaths
                : (newPaths.length > 0 ? newPaths[0] : null);
            }
          }
        }
      }

      // Save database if modified
      if (modified) {
        saveDatabase(yamlFile, db);
      }
    }

    // 3. Scan all *_assets directories for unreferenced files
    const unreferencedFiles = [];
    let totalFiles = 0;

    const allEntries = fs.readdirSync(targetDir);
    const assetsDirs = allEntries.filter((d) => {
      const fullPath = path.join(targetDir, d);
      return d.endsWith("_assets") && fs.statSync(fullPath).isDirectory();
    });

    for (const assetsDir of assetsDirs) {
      const assetsDirPath = path.join(targetDir, assetsDir);
      const files = fs.readdirSync(assetsDirPath);

      for (const file of files) {
        if (file.startsWith(".")) continue; // Skip hidden files
        totalFiles++;
        const relativePath = `${assetsDir}/${file}`;

        if (!referencedFiles.has(relativePath)) {
          const fullPath = path.join(assetsDirPath, file);
          const stat = fs.statSync(fullPath);
          unreferencedFiles.push({
            path: relativePath,
            size: stat.size,
            type: detectFileType(fullPath),
          });
        }
      }
    }

    res.json({
      rehashed,
      totalFiles,
      unreferencedFiles,
    });
  } catch (e) {
    res.status(500).json({ error: "Rebuild failed: " + e.message });
  }
});

// Cleanup - delete selected unreferenced files
app.post("/api/rebuild/cleanup", (req, res) => {
  const { files, yamlPath } = req.body;
  const targetDir = yamlPath || DATA_DIR;

  if (!Array.isArray(files) || files.length === 0) {
    return res.status(400).json({ error: "files array is required" });
  }

  let deleted = 0;
  const errors = [];

  for (const relativePath of files) {
    const fullPath = path.join(targetDir, relativePath);
    try {
      if (fs.existsSync(fullPath)) {
        fs.unlinkSync(fullPath);
        deleted++;
      }
    } catch (e) {
      errors.push({ path: relativePath, error: e.message });
    }
  }

  res.json({ success: true, deleted, errors });
});

// SPA fallback - serve index.html for non-API routes
app.get("*", (req, res) => {
  if (!req.path.startsWith("/api/")) {
    res.sendFile(path.join(__dirname, "dist/client/index.html"));
  }
});

// ==================== Mime Type Detection ====================
function detectMimeType(buffer) {
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return "image/jpeg";
  if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47) return "image/png";
  if (buffer[0] === 0x47 && buffer[1] === 0x49 && buffer[2] === 0x46) return "image/gif";
  if (buffer[0] === 0x52 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x46) {
    if (buffer[8] === 0x57 && buffer[9] === 0x45 && buffer[10] === 0x42 && buffer[11] === 0x50) return "image/webp";
    return "audio/wav";
  }
  if (buffer[0] === 0x00 && buffer[1] === 0x00 && buffer[2] === 0x00 && (buffer[3] === 0x18 || buffer[3] === 0x1c || buffer[3] === 0x20)) return "video/mp4";
  if (buffer[4] === 0x66 && buffer[5] === 0x74 && buffer[6] === 0x79 && buffer[7] === 0x70) return "video/mp4";
  if (buffer[0] === 0x1a && buffer[1] === 0x45 && buffer[2] === 0xdf && buffer[3] === 0xa3) return "video/webm";
  if (buffer[0] === 0x49 && buffer[1] === 0x44 && buffer[2] === 0x33) return "audio/mpeg";
  if (buffer[0] === 0xff && buffer[1] === 0xfb) return "audio/mpeg";
  if (buffer[0] === 0x66 && buffer[1] === 0x4c && buffer[2] === 0x61 && buffer[3] === 0x43) return "audio/flac";
  return "application/octet-stream";
}

// ==================== Start Server ====================
app.listen(PORT, "0.0.0.0", () => {
  console.log(`\n🗄️  ArchiveX Web Server running at:`);
  console.log(`   Local:   http://localhost:${PORT}`);
  console.log(`   Data:    ${DATA_DIR}\n`);
});
