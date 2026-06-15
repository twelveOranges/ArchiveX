#!/usr/bin/env python3
"""
memento2yaml.py - Convert Memento backup zip files to ArchiveX YAML database format.

Usage:
    python memento2yaml.py backup.zip --name "database_name" [options]

The tool will:
1. Extract the zip file to a temporary directory
2. Read the memento.db SQLite database
3. Parse the index file to map numeric file names to original paths
4. Convert records to ArchiveX YAML format
5. Copy and rename files to the assets directory

Requirements:
    pip install pyyaml pypinyin
"""

from __future__ import annotations

import argparse
import json
import os
import sqlite3
import tempfile
import zipfile
from pathlib import Path
from typing import Optional, Dict, List, Any

try:
    import yaml
except ImportError:
    print("Error: PyYAML is required. Install with: pip install pyyaml")
    exit(1)

try:
    from pypinyin import lazy_pinyin
except ImportError:
    print("Error: pypinyin is required. Install with: pip install pypinyin")
    exit(1)

# AES decryption for Memento data
def decrypt_memento_data_aes(encrypted_data: str, aes_key_hex: str) -> str:
    """AES decryption for Memento encrypted data"""
    if not encrypted_data or not aes_key_hex or len(encrypted_data) % 2 != 0:
        return encrypted_data
    
    try:
        # Convert hex strings to bytes
        encrypted_bytes = bytes.fromhex(encrypted_data)
        aes_key_bytes = bytes.fromhex(aes_key_hex)
        
        # Memento uses AES-256-CBC with zero IV
        from Crypto.Cipher import AES
        from Crypto.Util.Padding import unpad
        
        # Use zero IV (16 bytes of zeros)
        iv = b'\x00' * 16
        
        # Create AES cipher
        cipher = AES.new(aes_key_bytes, AES.MODE_CBC, iv)
        
        # Decrypt and unpad
        decrypted_bytes = cipher.decrypt(encrypted_bytes)
        decrypted_bytes = unpad(decrypted_bytes, AES.block_size)
        
        # Try to decode as UTF-8
        return decrypted_bytes.decode('utf-8', errors='ignore')
    except ImportError:
        print("Warning: PyCryptodome not installed. Install with: pip install pycryptodome")
        return encrypted_data
    except Exception as e:
        # Fallback to simple XOR if AES fails
        return decrypt_memento_data_xor(encrypted_data)

# Simple XOR decryption as fallback
def decrypt_memento_data_xor(encrypted_data: str) -> str:
    """Simple XOR decryption for Memento encrypted data"""
    if not encrypted_data or len(encrypted_data) % 2 != 0:
        return encrypted_data
    
    try:
        # Convert hex string to bytes
        encrypted_bytes = bytes.fromhex(encrypted_data)
        
        # Simple XOR with key 0x55
        decrypted_bytes = bytes(b ^ 0x55 for b in encrypted_bytes)
        
        # Try to decode as UTF-8
        return decrypted_bytes.decode('utf-8', errors='ignore')
    except:
        return encrypted_data

def to_safe_asset_name(name: str) -> str:
    """Convert database name to safe asset directory name"""
    # Convert Chinese characters to pinyin
    pinyin_name = ''.join(lazy_pinyin(name))
    # Remove or replace unsafe characters
    safe_name = ''.join(c if c.isalnum() else '_' for c in pinyin_name)
    return safe_name.lower()

def get_field_type_from_template(type_code: str) -> str:
    """Convert Memento field type to ArchiveX field type"""
    type_mapping = {
        'ft_string': 'text',
        'ft_img': 'image',
        'ft_str_list': 'multiselect',
        'ft_number': 'number',
        'ft_bool': 'boolean',
        'ft_date': 'datetime'
    }
    return type_mapping.get(type_code, 'text')

def parse_file_paths(file_paths_str: str) -> List[str]:
    """Parse file:/// paths from string, handling comma or newline separation"""
    if not file_paths_str:
        return []
    
    paths = []
    # Split by 'file:///' to handle both comma-separated and newline-separated formats
    parts = file_paths_str.split('file:///')
    for part in parts:
        part = part.strip().rstrip(',').strip()
        if part:
            paths.append('file:///' + part)
    
    return paths

def decrypt_memento_value(value: str, field_type: str, aes_key_hex: str = None) -> str:
    """Decrypt Memento data if it appears to be encrypted"""
    if not value:
        return value
    
    # If it's a file path (starts with file://), keep it as is
    if value.startswith('file://'):
        return value
    
    # Check if it looks like hex-encoded encrypted data
    if len(value) >= 32 and all(c in '0123456789abcdef' for c in value.lower()):
        # Try AES decryption first if key is available
        if aes_key_hex:
            decrypted = decrypt_memento_data_aes(value, aes_key_hex)
            # If AES decryption produces readable text, use it
            if decrypted and decrypted != value and any(c.isalpha() or c.isdigit() for c in decrypted):
                return decrypted.strip()
        
        # Fallback to XOR decryption
        decrypted = decrypt_memento_data_xor(value)
        # If decryption produces readable text, use it
        if decrypted and decrypted != value and any(c.isalpha() or c.isdigit() for c in decrypted):
            return decrypted.strip()
    
    return value

def read_csv_data(csv_path: str) -> List[Dict[str, str]]:
    """Read CSV file and return list of dictionaries with field data"""
    import csv
    
    try:
        with open(csv_path, 'r', encoding='utf-8') as f:
            csv_reader = csv.DictReader(f)
            return list(csv_reader)
    except Exception as e:
        print(f"Error reading CSV file: {e}")
        return []

def parse_index_file(index_path: str) -> Dict[int, Dict[str, Any]]:
    """Parse the index.json file to create a mapping from numeric IDs to file info"""
    try:
        with open(index_path, 'r', encoding='utf-8') as f:
            index_data = json.load(f)
    except Exception as e:
        print(f"Error reading index file: {e}")
        return {}
    
    file_map = {}
    for item in index_data:
        i = item.get('i')
        if i is not None:
            file_map[i] = {
                'original_path': item.get('path', ''),
                'filename': os.path.basename(item.get('path', '')),
                'time': item.get('time'),
                'crc': item.get('crc')
            }
    
    print(f"Parsed index file: {len(file_map)} files mapped")
    return file_map

def convert_memento_to_yaml(
    zip_path: str,
    db_name: str,
    output_dir: str = ".",
    table_name: Optional[str] = None,
    icon: str = "book",
    asset_prefix_override: Optional[str] = None,
    csv_path: Optional[str] = None
) -> None:
    """Convert Memento backup to ArchiveX YAML format"""
    
    # Check if CSV file is provided for plaintext data
    csv_data = None
    if csv_path and os.path.exists(csv_path):
        print(f"Using CSV file: {csv_path}")
        csv_data = read_csv_data(csv_path)
    
    # Extract zip file
    print(f"Extracting {zip_path} to temporary directory...")
    with tempfile.TemporaryDirectory() as temp_dir:
        with zipfile.ZipFile(zip_path, 'r') as zip_ref:
            zip_ref.extractall(temp_dir)
        
        db_path = os.path.join(temp_dir, "memento.db")
        files_dir = os.path.join(temp_dir, "files")
        index_path = os.path.join(files_dir, "index")
        
        if not os.path.exists(db_path):
            print(f"Error: memento.db not found in {zip_path}")
            return
        
        if not os.path.exists(files_dir):
            print(f"Error: files directory not found in {zip_path}")
            return
        
        # Parse index file
        file_map = parse_index_file(index_path)
        
        # Connect to database
        conn = sqlite3.connect(db_path)
        cursor = conn.cursor()
        
        # Get library information
        cursor.execute("SELECT UUID, TITLE FROM tbl_library LIMIT 1")
        library_info = cursor.fetchone()
        if not library_info:
            print("Error: No library found in database")
            return
        
        library_uuid, library_title = library_info
        print(f"Library: {library_title} (UUID: {library_uuid})")
        
        # Get AES key for this library
        cursor.execute("SELECT aes FROM tbl_library_aes_keys WHERE lib_uuid = ?", (library_uuid,))
        aes_key_result = cursor.fetchone()
        aes_key_hex = aes_key_result[0] if aes_key_result else None
        
        if aes_key_hex:
            print(f"Found AES key for library (length: {len(aes_key_hex)})")
        else:
            print("Warning: No AES key found for library, using fallback decryption")
        
        # Get field templates
        cursor.execute("SELECT UUID, title, type_code FROM tbl_flex_template")
        templates = cursor.fetchall()
        
        field_templates = {}
        for template_uuid, title, type_code in templates:
            field_templates[template_uuid] = {
                'title': title,
                'type': get_field_type_from_template(type_code)
            }
        
        print(f"Found {len(field_templates)} field templates")
        
        # Get library items
        cursor.execute("SELECT UUID FROM tbl_library_item WHERE REMOVED = 0")
        library_items = cursor.fetchall()
        
        print(f"Found {len(library_items)} library items")
        
        # Prepare output directories
        safe_name = to_safe_asset_name(db_name)
        if asset_prefix_override:
            asset_prefix = asset_prefix_override
        else:
            asset_prefix = f"{safe_name}_assets"
        
        assets_dir = os.path.join(output_dir, asset_prefix)
        os.makedirs(assets_dir, exist_ok=True)
        os.makedirs(output_dir, exist_ok=True)
        
        # Build schema
        schema_fields = []
        for template_uuid, template_info in field_templates.items():
            schema_fields.append({
                'name': template_info['title'],
                'type': template_info['type'],
                'label': template_info['title']
            })
        
        # Build records
        records = []
        copied_files = set()
        
        # Use CSV data if available, otherwise use database data
        if csv_data:
            print("Using CSV data for plaintext records")
            for csv_row in csv_data:
                record = {}
                
                for field_title, value in csv_row.items():
                    if value and value.strip():
                        # Handle file paths
                        if 'file:///' in value:
                            file_paths = parse_file_paths(value)
                            converted_paths = []
                            
                            for file_path in file_paths:
                                # Extract filename from path
                                filename = os.path.basename(file_path)
                                
                                # Find matching file in index
                                matched_file_id = None
                                for file_id, file_info in file_map.items():
                                    if file_info['filename'] == filename:
                                        matched_file_id = file_id
                                        break
                                
                                if matched_file_id is not None:
                                    # Copy file
                                    source_file = os.path.join(files_dir, str(matched_file_id))
                                    if os.path.exists(source_file):
                                        # Determine file extension
                                        ext = '.jpg'  # Default to jpg
                                        if '.' in filename:
                                            ext = '.' + filename.split('.')[-1]
                                        
                                        dest_filename = f"{matched_file_id}{ext}"
                                        dest_path = os.path.join(assets_dir, dest_filename)
                                        
                                        if not os.path.exists(dest_path):
                                            import shutil
                                            shutil.copy2(source_file, dest_path)
                                            print(f"  Copied: {dest_filename}")
                                            copied_files.add(matched_file_id)
                                        
                                        converted_paths.append(f"{asset_prefix}/{dest_filename}")
                            
                            if converted_paths:
                                if len(converted_paths) == 1:
                                    record[field_title] = converted_paths[0]
                                else:
                                    record[field_title] = converted_paths
                        else:
                            # Use plaintext value from CSV
                            record[field_title] = value
                
                if record:
                    records.append(record)
        else:
            # Fallback to database data
            print("Using database data (encrypted)")
            for item_uuid, in library_items:
                record = {}
                
                # Get all field data for this item
                cursor.execute("""
                    SELECT ft.title, fc.stringContent, fc.realContent, fc.intContent, ft.type_code
                    FROM tbl_flex_content2 fc
                    JOIN tbl_flex_template ft ON fc.templateUUID = ft.UUID
                    WHERE fc.ownerUUID = ?
                """, (item_uuid,))
                
                field_data = cursor.fetchall()
                
                for field_title, string_content, real_content, int_content, type_code in field_data:
                    field_type = get_field_type_from_template(type_code)
                    
                    # Determine which content field to use
                    if string_content is not None:
                        value = string_content
                    elif real_content is not None:
                        value = real_content
                    elif int_content is not None:
                        value = int_content
                    else:
                        continue
                    
                    # Process based on field type
                    if field_type == 'image':
                        # Handle file:/// paths
                        if isinstance(value, str) and 'file:///' in value:
                            file_paths = parse_file_paths(value)
                            converted_paths = []
                            
                            for file_path in file_paths:
                                # Extract filename from path
                                filename = os.path.basename(file_path)
                                
                                # Find matching file in index
                                matched_file_id = None
                                for file_id, file_info in file_map.items():
                                    if file_info['filename'] == filename:
                                        matched_file_id = file_id
                                        break
                                
                                if matched_file_id is not None:
                                    # Copy file
                                    source_file = os.path.join(files_dir, str(matched_file_id))
                                    if os.path.exists(source_file):
                                        # Determine file extension
                                        ext = '.jpg'  # Default to jpg
                                        if '.' in filename:
                                            ext = '.' + filename.split('.')[-1]
                                        
                                        dest_filename = f"{matched_file_id}{ext}"
                                        dest_path = os.path.join(assets_dir, dest_filename)
                                        
                                        if not os.path.exists(dest_path):
                                            import shutil
                                            shutil.copy2(source_file, dest_path)
                                            print(f"  Copied: {dest_filename}")
                                            copied_files.add(matched_file_id)
                                        
                                        converted_paths.append(f"{asset_prefix}/{dest_filename}")
                            
                            if converted_paths:
                                if len(converted_paths) == 1:
                                    record[field_title] = converted_paths[0]
                                else:
                                    record[field_title] = converted_paths
                        else:
                            # Try to decrypt if it's encrypted text
                            decrypted = decrypt_memento_value(str(value), field_type, aes_key_hex)
                            if decrypted:
                                record[field_title] = decrypted
                    else:
                        # For non-image fields, try to decrypt
                        decrypted = decrypt_memento_value(str(value), field_type, aes_key_hex)
                        if decrypted:
                            record[field_title] = decrypted            
                if record:
                    records.append(record)
        
        conn.close()
        
        # Create YAML structure
        yaml_data = {
            'schema': {
                'fields': schema_fields,
                'icon': icon
            },
            'records': records
        }
        
        # Write YAML file
        output_path = os.path.join(output_dir, f"{safe_name}.yaml")
        with open(output_path, 'w', encoding='utf-8') as f:
            yaml.dump(yaml_data, f, allow_unicode=True, default_flow_style=False, indent=2)
        
        print(f"\nDone!")
        print(f"  Output: {output_path}")
        print(f"  Assets: {assets_dir}")
        print(f"  Records: {len(records)}")
        print(f"  Fields: {len(schema_fields)}")
        print(f"  Files copied: {len(copied_files)}")


def main():
    parser = argparse.ArgumentParser(
        description="Convert Memento backup zip files to ArchiveX YAML format",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  # Basic conversion:
  python memento2yaml.py backup.zip --name "contacts"

  # With CSV file for plaintext data:
  python memento2yaml.py backup.zip --name "contacts" --csv "data.csv"

  # Custom output directory:
  python memento2yaml.py backup.zip --name "photos" --output "./data"

  # Custom icon:
  python memento2yaml.py backup.zip --name "memories" --icon "image"
        """,
    )

    parser.add_argument("zip_file", help="Path to the Memento backup zip file")
    parser.add_argument("--name", "-n", required=True, help="Database name")
    parser.add_argument("--output", "-o", default=".", help="Output directory (default: current directory)")
    parser.add_argument("--icon", "-i", default="book", help="Database icon (default: book)")
    parser.add_argument("--asset-prefix", help="Override the asset directory name")
    parser.add_argument("--csv", "-c", help="Optional CSV file with plaintext data")

    args = parser.parse_args()

    if not os.path.exists(args.zip_file):
        print(f"Error: Zip file not found: {args.zip_file}")
        exit(1)

    convert_memento_to_yaml(
        zip_path=args.zip_file,
        db_name=args.name,
        output_dir=args.output,
        icon=args.icon,
        asset_prefix_override=args.asset_prefix,
        csv_path=args.csv
    )

if __name__ == "__main__":
    main()