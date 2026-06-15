#!/usr/bin/env python3
"""
csv2yaml.py - Convert CSV files to ArchiveX YAML database format.

Usage:
    python csv2yaml.py input.csv --name "database_name" [options]

The tool will:
1. Read the CSV file and infer field types from a config or column names.
2. For image/file fields, compute SHA-256 hash of each file and copy it to the assets directory.
3. Output a .yaml file compatible with ArchiveX.

Requirements:
    pip install pyyaml pypinyin
"""

from __future__ import annotations

import argparse
import csv
import hashlib
import os
import shutil
import sys
from pathlib import Path
from typing import Optional

try:
    import yaml
except ImportError:
    print("Error: PyYAML is required. Install with: pip install pyyaml")
    sys.exit(1)

try:
    from pypinyin import pinyin, Style
    HAS_PYPINYIN = True
except ImportError:
    HAS_PYPINYIN = False


# Supported field types
VALID_TYPES = [
    "text", "image", "video", "audio", "file",
    "tags", "number", "integer", "date", "url",
    "boolean", "checkbox", "select", "multiselect"
]


def to_safe_asset_name(name: str) -> str:
    """Convert a database name to a filesystem-safe asset directory name.
    Chinese characters are converted to pinyin (matching the JS pinyin-pro implementation).
    If pypinyin is not installed, falls back to removing non-ASCII characters."""
    import re
    if re.search(r'[\u4e00-\u9fa5]', name):
        if HAS_PYPINYIN:
            result = pinyin(name, style=Style.NORMAL)
            return "".join([item[0] for item in result]).replace(" ", "_")
        else:
            # Fallback: keep ASCII chars, remove Chinese
            print("Warning: pypinyin not installed. Use --asset-prefix to specify asset directory name.")
            print("  Install with: pip install pypinyin")
            return re.sub(r'[^\w]', '_', name)
    return name.replace(" ", "_")


def hash_file(filepath: str) -> str:
    """Compute SHA-256 hash of a file. Deterministic for the same file content."""
    sha256 = hashlib.sha256()
    with open(filepath, "rb") as f:
        while True:
            chunk = f.read(8192)
            if not chunk:
                break
            sha256.update(chunk)
    return sha256.hexdigest()


def parse_field_config(config_str: str) -> dict:
    """Parse a field config string like 'column_name:type' or 'column_name:type:label'."""
    parts = config_str.split(":")
    if len(parts) == 1:
        return {"name": parts[0], "type": "text", "label": parts[0]}
    elif len(parts) == 2:
        return {"name": parts[0], "type": parts[1], "label": parts[0]}
    else:
        return {"name": parts[0], "type": parts[1], "label": parts[2]}


def process_file_uri(value: str, asset_prefix: str) -> str | None:
    """Process a file:/// URI value.
    Extracts the filename from the URI and combines it with the asset prefix.
    The user is responsible for placing the actual files in the assets directory.
    - value: a file:/// URI (e.g., 'file:///path/to/image.jpg')
    - Returns: the relative asset path (e.g., 'dbname_assets/filename') or None
    """
    if not value or not value.strip():
        return None

    # Support multiple paths separated by semicolons
    paths = [v.strip() for v in value.split(";") if v.strip()]
    results = []

    for file_uri in paths:
        # Strip file:/// prefix and get just the filename
        if file_uri.startswith("file:///"):
            file_path = file_uri[7:]  # Remove 'file:///' prefix
        elif file_uri.startswith("file://"):
            file_path = file_uri[7:]
        else:
            file_path = file_uri

        # Extract just the filename (last component)
        filename = os.path.basename(file_path)
        if not filename:
            print(f"  Warning: Could not extract filename from: {file_uri}, skipping.")
            continue

        results.append(f"{asset_prefix}/{filename}")

    if not results:
        return None
    if len(results) == 1:
        return results[0]
    return results


def process_image_field(value: str, assets_dir: str, base_dir: str, asset_prefix: str) -> str | None:
    """Process an image/file field value (non-URI paths).
    - value: the file path (relative to base_dir or absolute)
    - Returns: the relative asset path (e.g., 'dbname_assets/sha256hash') or None
    """
    if not value or not value.strip():
        return None

    # Support multiple paths separated by semicolons
    paths = [v.strip() for v in value.split(";") if v.strip()]
    results = []

    for file_path in paths:
        # Resolve relative paths against base_dir
        if not os.path.isabs(file_path):
            file_path = os.path.join(base_dir, file_path)

        if not os.path.exists(file_path):
            print(f"  Warning: File not found: {file_path}, skipping.")
            continue

        # Compute deterministic hash
        file_hash = hash_file(file_path)
        dest_path = os.path.join(assets_dir, file_hash)

        # Copy file to assets dir (only if not already there)
        if not os.path.exists(dest_path):
            shutil.copy2(file_path, dest_path)
            print(f"  Copied: {os.path.basename(file_path)} -> {file_hash}")
        else:
            print(f"  Exists: {os.path.basename(file_path)} -> {file_hash}")

        results.append(f"{asset_prefix}/{file_hash}")

    if not results:
        return None
    if len(results) == 1:
        return results[0]
    return results


def _detect_column_type(rows: list[dict], col: str) -> str:
    """Auto-detect column type by sampling data values.
    Rules:
    - If any value starts with 'file:///' -> image
    - If all non-empty values are numeric (int or float) -> number
    - Otherwise -> text
    """
    has_file_uri = False
    all_numeric = True
    sample_count = 0

    for row in rows:
        val = row.get(col, "").strip() if row.get(col) else ""
        if not val:
            continue
        sample_count += 1

        if val.startswith("file:///") or val.startswith("file://"):
            has_file_uri = True
            all_numeric = False
            break

        # Check if numeric
        try:
            float(val)
        except ValueError:
            all_numeric = False

    if has_file_uri:
        return "image"
    if sample_count > 0 and all_numeric:
        return "number"
    return "text"


def convert_csv_to_yaml(
    csv_path: str,
    db_name: str,
    output_dir: str,
    field_configs: list[str] | None = None,
    icon: str = "book",
    delimiter: str = ",",
    encoding: str = "utf-8",
    select_options: dict[str, list[str]] | None = None,
    asset_prefix_override: str | None = None,
):
    """Convert a CSV file to ArchiveX YAML format.

    Args:
        csv_path: Path to the input CSV file
        db_name: Database name (used for output filename and asset directory)
        output_dir: Directory to write the output .yaml and assets
        field_configs: List of field config strings like 'col:type' or 'col:type:label'
        icon: Database icon name
        delimiter: CSV delimiter character
        encoding: CSV file encoding
        select_options: Dict mapping field name to list of options for select/multiselect fields
    """
    csv_path = os.path.abspath(csv_path)
    base_dir = os.path.dirname(csv_path)
    output_dir = os.path.abspath(output_dir)

    # Create asset directory
    safe_name = to_safe_asset_name(db_name)
    if asset_prefix_override:
        asset_prefix = asset_prefix_override
    else:
        asset_prefix = f"{safe_name}_assets"
    assets_dir = os.path.join(output_dir, asset_prefix)
    os.makedirs(assets_dir, exist_ok=True)
    os.makedirs(output_dir, exist_ok=True)

    # Read CSV
    with open(csv_path, "r", encoding=encoding, newline="") as f:
        reader = csv.DictReader(f, delimiter=delimiter)
        csv_columns = reader.fieldnames
        if not csv_columns:
            print("Error: CSV file has no headers.")
            sys.exit(1)

        rows = list(reader)

    print(f"Read {len(rows)} rows from {csv_path}")
    print(f"Columns: {csv_columns}")

    # Build field definitions
    fields = []
    field_type_map = {}  # column_name -> type

    if field_configs:
        # Use explicit field configs
        for config in field_configs:
            fd = parse_field_config(config)
            if fd["type"] not in VALID_TYPES:
                print(f"Warning: Unknown type '{fd['type']}' for field '{fd['name']}', defaulting to 'text'")
                fd["type"] = "text"
            field_def = {"name": fd["name"], "type": fd["type"], "label": fd["label"]}
            # Add options for select/multiselect
            if fd["type"] in ("select", "multiselect") and select_options and fd["name"] in select_options:
                field_def["options"] = select_options[fd["name"]]
            fields.append(field_def)
            field_type_map[fd["name"]] = fd["type"]
    else:
        # Auto-detect field types from data content
        for col in csv_columns:
            detected_type = _detect_column_type(rows, col)
            fields.append({"name": col, "type": detected_type, "label": col})
            field_type_map[col] = detected_type
            print(f"  Auto-detected: '{col}' -> {detected_type}")

    # Build records
    records = []
    file_types = {"image", "video", "audio", "file"}

    for i, row in enumerate(rows):
        record = {}
        for field in fields:
            col_name = field["name"]
            raw_value = row.get(col_name, "").strip() if row.get(col_name) else ""

            if not raw_value:
                # Skip empty values (they become null/absent in YAML)
                continue

            ftype = field_type_map.get(col_name, "text")

            if ftype in file_types:
                # Check if it's a file:/// URI
                if raw_value.startswith("file:///") or raw_value.startswith("file://"):
                    result = process_file_uri(raw_value, asset_prefix)
                else:
                    result = process_image_field(raw_value, assets_dir, base_dir, asset_prefix)
                if result is not None:
                    record[col_name] = result
            elif ftype == "number":
                try:
                    # Store as int if it's a whole number, otherwise float
                    float_val = float(raw_value)
                    if float_val == int(float_val) and "." not in raw_value:
                        record[col_name] = int(float_val)
                    else:
                        record[col_name] = float_val
                except ValueError:
                    record[col_name] = raw_value
            elif ftype == "integer":
                try:
                    record[col_name] = int(raw_value)
                except ValueError:
                    record[col_name] = raw_value
            elif ftype == "boolean" or ftype == "checkbox":
                record[col_name] = raw_value.lower() in ("true", "1", "yes", "是")
            elif ftype == "tags" or ftype == "multiselect":
                # Split by semicolons or commas
                items = [v.strip() for v in raw_value.replace(";", ",").split(",") if v.strip()]
                record[col_name] = items
            else:
                record[col_name] = raw_value

        if record:
            records.append(record)

        if (i + 1) % 100 == 0:
            print(f"  Processed {i + 1}/{len(rows)} records...")

    # Auto-detect select options from data if not provided
    for field in fields:
        if field["type"] in ("select", "multiselect") and "options" not in field:
            col_name = field["name"]
            options_set = set()
            for record in records:
                val = record.get(col_name)
                if val:
                    if isinstance(val, list):
                        options_set.update(val)
                    else:
                        options_set.add(str(val))
            if options_set:
                field["options"] = sorted(options_set)

    # Build YAML structure
    db = {
        "schema": {
            "fields": fields,
            "icon": icon,
        },
        "records": records,
    }

    # Write YAML
    output_file = os.path.join(output_dir, f"{safe_name}.yaml")
    with open(output_file, "w", encoding="utf-8") as f:
        yaml.dump(db, f, allow_unicode=True, default_flow_style=False, sort_keys=False)

    print(f"\nDone!")
    print(f"  Output: {output_file}")
    print(f"  Assets: {assets_dir}")
    print(f"  Records: {len(records)}")
    print(f"  Fields: {len(fields)}")


def main():
    parser = argparse.ArgumentParser(
        description="Convert CSV to ArchiveX YAML database format.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  # Basic conversion (all fields as text):
  python csv2yaml.py data.csv --name "my_database"

  # Specify field types:
  python csv2yaml.py data.csv --name "contacts" \\
    --fields "名字:text:Name" "照片:image:Photo" "年龄:integer:Age"

  # With custom output directory and icon:
  python csv2yaml.py data.csv --name "albums" \\
    --output ./data --icon "image" \\
    --fields "title:text" "cover:image" "genre:select"

  # Custom delimiter (e.g., tab-separated):
  python csv2yaml.py data.tsv --name "records" --delimiter "\\t"

Notes:
  - For image/file fields, the CSV should contain file paths (relative to CSV location or absolute).
  - Multiple files per cell can be separated by semicolons.
  - File hashes are deterministic (SHA-256): same file content always produces the same hash.
  - You can place image files in any directory and reference them in the CSV.
        """,
    )

    parser.add_argument("csv", help="Path to the input CSV file")
    parser.add_argument("--name", "-n", required=True, help="Database name")
    parser.add_argument("--output", "-o", default=".", help="Output directory (default: current directory)")
    parser.add_argument("--fields", "-f", nargs="+",
                        help="Field definitions as 'name:type' or 'name:type:label'. "
                             "Types: text, image, video, audio, file, tags, number, integer, "
                             "date, url, boolean, checkbox, select, multiselect")
    parser.add_argument("--icon", "-i", default="book",
                        help="Database icon (default: book). Options: book, folder, user, image, music, etc.")
    parser.add_argument("--delimiter", "-d", default=",", help="CSV delimiter (default: comma)")
    parser.add_argument("--encoding", "-e", default="utf-8", help="CSV file encoding (default: utf-8)")
    parser.add_argument("--asset-prefix", default=None,
                        help="Override the asset directory name (e.g., 'testde_assets'). "
                             "Use this if pypinyin produces different results than pinyin-pro.")

    args = parser.parse_args()

    if not os.path.exists(args.csv):
        print(f"Error: CSV file not found: {args.csv}")
        sys.exit(1)

    convert_csv_to_yaml(
        csv_path=args.csv,
        db_name=args.name,
        output_dir=args.output,
        field_configs=args.fields,
        icon=args.icon,
        delimiter=args.delimiter,
        encoding=args.encoding,
        asset_prefix_override=args.asset_prefix,
    )


if __name__ == "__main__":
    main()
