# ArchiveX Tools

Utility scripts for data migration and management.

## memento2yaml.py

Convert Memento backup zip files to ArchiveX YAML database format.

### Usage

```bash
# Basic conversion (zip file only - for database records):
python tools/memento2yaml.py backup.zip --name "database_name" --output ./packages/web/data

# With CSV file for plaintext data:
python tools/memento2yaml.py backup.zip --name "contacts" --csv "data.csv"

# Specify table name (if multiple tables exist):
python tools/memento2yaml.py backup.zip --name "notes" --table "notes_table"

# Custom icon:
python tools/memento2yaml.py backup.zip --name "memories" --icon "image"
```

### Required Files

**Zip file only mode:**
- `memento.db` - SQLite database with records
- `files/` - Directory with files and index mapping

**Zip + CSV mode:**
- Zip file (containing database and files)
- CSV file with plaintext data that corresponds to the database records

---

## csv2yaml.py

Convert CSV files to ArchiveX YAML database format.

### Install Dependencies

```bash
pip install pyyaml pypinyin
```

### Usage

```bash
# Basic conversion (auto-detect field types):
python tools/csv2yaml.py data.csv --name "database_name" --output ./packages/web/data

# Specify field types manually:
python tools/csv2yaml.py data.csv --name "contacts" \
  --fields "name:text" "photo:image" "age:number" \
  --output ./packages/web/data

# With custom icon:
python tools/csv2yaml.py data.csv --name "albums" --icon "image"
```

### Field Types

- `text` - Text data (supports Chinese/English)
- `image` - Image file paths (extracts filename from `file:///` paths)
- `number` - Numeric values
