const express = require("express");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const yaml = require("yaml");
const { pinyin } = require("pinyin-pro");

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

// Serve static frontend files
app.use(express.static(path.join(__dirname, "public")));

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

    // Migrate records: rename fields that changed name
    for (const record of db.records) {
      for (const newField of fields) {
        const oldField = oldFields.find((f) => f.name === newField.name);
        if (!oldField && record[newField.name] === undefined) {
          record[newField.name] = null;
        }
      }
      // Remove fields that no longer exist
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

    // Rename assets directory
    const oldAssetsDir = path.join(DATA_DIR, `${toSafeAssetName(req.params.name)}_assets`);
    const newAssetsDir = path.join(DATA_DIR, `${toSafeAssetName(newName)}_assets`);
    if (fs.existsSync(oldAssetsDir)) {
      fs.renameSync(oldAssetsDir, newAssetsDir);
      // Update asset paths in records
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

  // Delete assets directory
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

// Upload file (image/video/audio)
const upload = multer({ storage: multer.memoryStorage() });
app.post("/api/databases/:name/upload", upload.single("file"), (req, res) => {
  if (!req.file) return res.status(400).json({ error: "No file provided" });

  const dbName = req.params.name;
  const assetsDir = path.join(DATA_DIR, `${toSafeAssetName(dbName)}_assets`);
  if (!fs.existsSync(assetsDir)) {
    fs.mkdirSync(assetsDir, { recursive: true });
  }

  // Hash the file content for filename (no extension for privacy)
  const hash = hashBuffer(req.file.buffer);
  const filePath = path.join(assetsDir, hash);
  fs.writeFileSync(filePath, req.file.buffer);

  // Return the relative path for storage in YAML
  const relativePath = `${toSafeAssetName(dbName)}_assets/${hash}`;
  res.json({
    path: relativePath,
    hash,
    originalName: req.file.originalname,
    mimeType: req.file.mimetype,
    size: req.file.size,
  });
});

// Get asset file (serve with proper content-type detection)
app.get("/api/assets/*", (req, res) => {
  let relativePath = req.params[0];
  // Handle paths from Obsidian backups that include the 'archive-x/' prefix
  const dataBaseName = path.basename(DATA_DIR);
  if (relativePath.startsWith(dataBaseName + "/")) {
    relativePath = relativePath.slice(dataBaseName.length + 1);
  }
  // Also handle .archive-x/ prefix variant
  if (relativePath.startsWith("." + dataBaseName + "/")) {
    relativePath = relativePath.slice(dataBaseName.length + 2);
  }
  const filePath = path.join(DATA_DIR, relativePath);
  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: "File not found" });
  }
  // Try to detect mime type from file content (magic bytes)
  const buffer = fs.readFileSync(filePath);
  const mimeType = detectMimeType(buffer);
  res.setHeader("Content-Type", mimeType);
  res.send(buffer);
});

// Backup: create tar.gz
app.get("/api/backup", (req, res) => {
  const { execSync } = require("child_process");
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-").replace("T", "_").slice(0, 19);
  const backupName = `archivex_backup_${timestamp}.tar.gz`;
  const tmpPath = path.join("/tmp", backupName);

  try {
    // Pack DATA_DIR contents under 'archive-x/' prefix for compatibility with Obsidian plugin
    execSync(`tar -czf "${tmpPath}" -C "${DATA_DIR}" .`, { timeout: 60000 });
    res.download(tmpPath, backupName, () => {
      // Clean up temp file
      if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath);
    });
  } catch (e) {
    res.status(500).json({ error: "Backup failed: " + e.message });
  }
});

// Restore: upload and extract tar.gz
const restoreUpload = multer({ dest: "/tmp" });
app.post("/api/restore", restoreUpload.single("backup"), (req, res) => {
  if (!req.file) return res.status(400).json({ error: "No backup file provided" });

  const { execSync } = require("child_process");
  try {
    // List archive contents to determine structure
    const listing = execSync(`tar -tzf "${req.file.path}"`, { timeout: 30000 }).toString();

    // Determine if archive has an archive-x/ top-level directory
    const hasArchiveXDir = listing.split("\n").some((l) => l.startsWith("archive-x/"));

    if (hasArchiveXDir) {
      // Extract to a temp location first, then move contents into DATA_DIR
      const tmpExtract = path.join("/tmp", `archivex_restore_${Date.now()}`);
      fs.mkdirSync(tmpExtract, { recursive: true });
      execSync(`tar -xzf "${req.file.path}" -C "${tmpExtract}"`, { timeout: 60000 });

      // Copy contents of archive-x/ into DATA_DIR
      const extractedDir = path.join(tmpExtract, "archive-x");
      if (fs.existsSync(extractedDir)) {
        // Copy all files from extracted archive-x/ to DATA_DIR
        execSync(`cp -rf "${extractedDir}/"* "${DATA_DIR}/" 2>/dev/null || true`, { timeout: 60000 });
        // Also copy hidden files
        execSync(`cp -rf "${extractedDir}"/.[!.]* "${DATA_DIR}/" 2>/dev/null || true`, { timeout: 60000 });
      }
      // Clean up temp
      fs.rmSync(tmpExtract, { recursive: true, force: true });
    } else {
      // No archive-x prefix, extract directly into DATA_DIR
      execSync(`tar -xzf "${req.file.path}" -C "${DATA_DIR}"`, { timeout: 60000 });
    }

    fs.unlinkSync(req.file.path);
    res.json({ success: true, message: "Restore completed" });
  } catch (e) {
    if (fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
    res.status(500).json({ error: "Restore failed: " + e.message });
  }
});

// ==================== Mime Type Detection ====================
function detectMimeType(buffer) {
  // Check magic bytes
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
