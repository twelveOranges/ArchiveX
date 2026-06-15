# ArchiveX Tools

Utility scripts for data migration and management.

## csv2yaml.py

Convert CSV files to ArchiveX YAML database format.

### Install Dependencies

```bash
pip install pyyaml pypinyin
```

### Data Types

The tool handles 3 types of CSV data:

| CSV Data | Detected Type | Behavior |
|----------|---------------|----------|
| `file:///path/to/image.jpg` | `image` | Extracts filename, combines with `{db}_assets/` prefix |
| `42`, `3.14` | `number` | Stored as integer or float |
| Any other text | `text` | Stored as-is (supports Chinese/English) |

> **Auto-detection**: When `--fields` is not specified, the tool automatically detects types by scanning data content.

### Usage

```bash
# Basic (auto-detect types from data):
python tools/csv2yaml.py data.csv --name "my_database" --output ./packages/web/data

# Specify field types manually:
python tools/csv2yaml.py data.csv --name "contacts" \
  --fields "名字:text" "照片:image" "年龄:number" \
  --output ./packages/web/data

# With custom icon:
python tools/csv2yaml.py data.csv --name "albums" --icon "image"

# Override asset directory name (if pinyin conversion differs):
python tools/csv2yaml.py data.csv --name "test的" --asset-prefix "testde_assets"
```

### Options

| Option | Description |
|--------|-------------|
| `--name`, `-n` | Database name (required) |
| `--output`, `-o` | Output directory (default: `.`) |
| `--fields`, `-f` | Field definitions as `name:type` or `name:type:label` |
| `--icon`, `-i` | Database icon (default: `book`) |
| `--delimiter`, `-d` | CSV delimiter (default: `,`) |
| `--encoding`, `-e` | CSV file encoding (default: `utf-8`) |
| `--asset-prefix` | Override asset directory name |

### Image Files

For `file:///` paths in CSV:
- The tool only extracts the **filename** (last path component)
- It combines the filename with the database assets directory: `{db_name}_assets/{filename}`
- **You need to manually place the image files** into the assets directory

If you provide local file paths (not `file:///`), the tool will:
- Compute SHA-256 hash of the file
- Copy the file to assets directory with hash as filename
- This ensures deterministic naming: same file content → same hash name

### Example

Input CSV (`data.csv`):
```csv
name,cover,year
Album A,file:///Users/me/pics/cover1.jpg,2020
Album B,file:///Users/me/pics/cover2.png,2021
```

Run:
```bash
python tools/csv2yaml.py data.csv --name "albums" --output ./packages/web/data
```

Output (`albums.yaml`):
```yaml
schema:
  fields:
  - name: name
    type: text
    label: name
  - name: cover
    type: image
    label: cover
  - name: year
    type: number
    label: year
  icon: book
records:
- name: Album A
  cover: albums_assets/cover1.jpg
  year: 2020
- name: Album B
  cover: albums_assets/cover2.png
  year: 2021
```

Then place your image files:
```
packages/web/data/albums_assets/cover1.jpg
packages/web/data/albums_assets/cover2.png
```
