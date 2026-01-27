#!/usr/bin/env python3
"""
SkyTrack Data Downloader v2.0
Downloads all required databases for SkyTrack flight tracker.

Fixed URLs as of January 2026:
- Aircraft types: Mictronics readsb-protobuf (moved from tar1090)
- Aircraft registrations: tar1090-db CSV branch
- Plane alert: sdr-enthusiasts plane-alert-db
- FAA database: registry.faa.gov
"""

import os
import sys
import json
import gzip
import shutil
import zipfile
import requests
from pathlib import Path
from datetime import datetime

# Configuration
BASE_DIR = Path(__file__).parent / "data"
TIMEOUT = 60
CHUNK_SIZE = 8192

# Data source URLs (UPDATED January 2026)
SOURCES = {
    # OurAirports - stable
    "airports": {
        "airports.csv": "https://davidmegginson.github.io/ourairports-data/airports.csv",
        "runways.csv": "https://davidmegginson.github.io/ourairports-data/runways.csv",
        "countries.csv": "https://davidmegginson.github.io/ourairports-data/countries.csv",
        "regions.csv": "https://davidmegginson.github.io/ourairports-data/regions.csv",
    },
    
    # Aircraft database - FIXED URLS
    "aircraft": {
        # Primary: tar1090-db CSV (comprehensive aircraft registrations)
        "registrations_csv": "https://github.com/wiedehopf/tar1090-db/raw/csv/aircraft.csv.gz",
        
        # Aircraft types database - NEW LOCATION (moved from tar1090)
        "types.json": "https://raw.githubusercontent.com/Mictronics/readsb-protobuf/dev/webapp/src/db/types.json",
        
        # Alternative: ICAO aircraft types from tar1090-db
        "icao_types.json": "https://raw.githubusercontent.com/wiedehopf/tar1090-db/master/icao_aircraft_types.json",
        
        # DB version tracking
        "dbversion.json": "https://raw.githubusercontent.com/wiedehopf/tar1090-db/master/version",
    },
    
    # ADS-B Exchange basic database
    "adsbx": {
        "basic-ac-db.json.gz": "https://downloads.adsbexchange.com/downloads/basic-ac-db.json.gz",
    },
    
    # Plane alert database (includes military, government, interesting aircraft)
    "plane_alert": {
        "interesting.csv": "https://raw.githubusercontent.com/sdr-enthusiasts/plane-alert-db/main/plane-alert-db.csv",
        "plane_images.csv": "https://raw.githubusercontent.com/sdr-enthusiasts/plane-alert-db/main/plane_images.csv",
    },
    
    # Military-specific databases from plane-alert-db
    "military": {
        "plane-alert-mil.csv": "https://raw.githubusercontent.com/sdr-enthusiasts/plane-alert-db/main/plane-alert-mil.csv",
        "plane-alert-mil-images.csv": "https://raw.githubusercontent.com/sdr-enthusiasts/plane-alert-db/main/plane-alert-mil-images.csv",
        "plane-alert-gov.csv": "https://raw.githubusercontent.com/sdr-enthusiasts/plane-alert-db/main/plane-alert-gov.csv",
        "plane-alert-pol.csv": "https://raw.githubusercontent.com/sdr-enthusiasts/plane-alert-db/main/plane-alert-pol.csv",
    },
    
    # Airlines
    "airlines": {
        "airlines.csv": "https://raw.githubusercontent.com/jpatokal/openflights/master/data/airlines.dat",
    },
    
    # FAA database
    "faa": {
        "ReleasableAircraft.zip": "https://registry.faa.gov/database/ReleasableAircraft.zip",
    },
}


def print_status(msg, status=""):
    """Print status message"""
    if status == "OK":
        print(f"  - {msg} \033[92mOK\033[0m")
    elif status == "FAILED":
        print(f"  - {msg} \033[91mFAILED\033[0m")
    elif status == "SKIP":
        print(f"  - {msg} \033[93mSKIPPED\033[0m")
    else:
        print(f"  - {msg}")


def download_file(url, dest_path, desc=""):
    """Download a file with progress indication"""
    try:
        response = requests.get(url, stream=True, timeout=TIMEOUT, 
                               headers={"User-Agent": "SkyTrack/2.0"})
        response.raise_for_status()
        
        total = int(response.headers.get('content-length', 0))
        
        with open(dest_path, 'wb') as f:
            downloaded = 0
            for chunk in response.iter_content(chunk_size=CHUNK_SIZE):
                if chunk:
                    f.write(chunk)
                    downloaded += len(chunk)
        
        return True
    except Exception as e:
        print(f"    Error: {e}")
        return False


def download_and_decompress_gzip(url, dest_path, desc=""):
    """Download gzip file and decompress"""
    gz_path = str(dest_path) + ".gz"
    
    if not download_file(url, gz_path, desc):
        return False
    
    try:
        with gzip.open(gz_path, 'rb') as f_in:
            with open(dest_path, 'wb') as f_out:
                shutil.copyfileobj(f_in, f_out)
        os.remove(gz_path)
        return True
    except Exception as e:
        print(f"    Decompress error: {e}")
        return False


def download_and_extract_zip(url, dest_dir, desc=""):
    """Download ZIP and extract"""
    zip_path = dest_dir / "temp.zip"
    
    if not download_file(url, zip_path, desc):
        return False
    
    try:
        with zipfile.ZipFile(zip_path, 'r') as zf:
            zf.extractall(dest_dir)
        os.remove(zip_path)
        return True
    except Exception as e:
        print(f"    Extract error: {e}")
        return False


def convert_csv_to_json(csv_path, json_path):
    """Convert aircraft.csv to JSON for faster lookup"""
    try:
        import csv
        
        aircraft = {}
        with open(csv_path, 'r', encoding='utf-8', errors='ignore') as f:
            # Format: hex,reg,type,flags,desc,year,ownop
            for line in f:
                parts = line.strip().split(',')
                if len(parts) >= 3 and parts[0]:
                    hex_code = parts[0].upper()
                    aircraft[hex_code] = {
                        'r': parts[1] if len(parts) > 1 else '',  # registration
                        't': parts[2] if len(parts) > 2 else '',  # type
                        'f': parts[3] if len(parts) > 3 else '',  # flags
                        'd': parts[4] if len(parts) > 4 else '',  # description
                        'y': parts[5] if len(parts) > 5 else '',  # year
                        'o': parts[6] if len(parts) > 6 else '',  # owner/operator
                    }
        
        with open(json_path, 'w') as f:
            json.dump(aircraft, f, separators=(',', ':'))
        
        return True
    except Exception as e:
        print(f"    Conversion error: {e}")
        return False


def main():
    print("=" * 40)
    print("   SkyTrack Data Downloader v2.0")
    print("=" * 40)
    
    # Create directory structure
    dirs = {
        "airports": BASE_DIR / "airports",
        "aircraft": BASE_DIR / "aircraft",
        "aircraft_faa": BASE_DIR / "aircraft" / "faa",
        "military": BASE_DIR / "military",
        "airlines": BASE_DIR / "airlines",
    }
    
    for d in dirs.values():
        d.mkdir(parents=True, exist_ok=True)
    
    results = {"ok": [], "failed": [], "skipped": []}
    
    # 1. OurAirports
    print("\n[1/6] Downloading OurAirports data...")
    for filename, url in SOURCES["airports"].items():
        dest = dirs["airports"] / filename
        if download_file(url, dest, filename):
            print_status(filename, "OK")
            results["ok"].append(filename)
        else:
            print_status(filename, "FAILED")
            results["failed"].append(filename)
    
    # 2. ADS-B Exchange database
    print("\n[2/6] Downloading ADS-B Exchange database...")
    url = SOURCES["adsbx"]["basic-ac-db.json.gz"]
    dest = dirs["aircraft"] / "adsbx-basic.json"
    print_status("Downloading compressed file...", "")
    if download_and_decompress_gzip(url, dest):
        print_status("Decompressing...", "OK")
        results["ok"].append("adsbx-basic.json")
    else:
        print_status("ADS-B Exchange DB", "FAILED")
        results["failed"].append("adsbx-basic.json")
    
    # 3. Aircraft types (FIXED URLS)
    print("\n[3/6] Downloading aircraft types...")
    
    # Primary types.json from Mictronics
    url = SOURCES["aircraft"]["types.json"]
    dest = dirs["aircraft"] / "types.json"
    if download_file(url, dest, "types.json (Mictronics)"):
        print_status("types.json (Mictronics)", "OK")
        results["ok"].append("types.json")
    else:
        # Fallback to ICAO types
        print_status("types.json (Mictronics)", "FAILED")
        url = SOURCES["aircraft"]["icao_types.json"]
        dest = dirs["aircraft"] / "icao_aircraft_types.json"
        if download_file(url, dest, "icao_types.json (fallback)"):
            print_status("icao_types.json (fallback)", "OK")
            # Copy as types.json
            shutil.copy(dest, dirs["aircraft"] / "types.json")
            results["ok"].append("types.json (fallback)")
        else:
            print_status("icao_types.json (fallback)", "FAILED")
            results["failed"].append("types.json")
    
    # DB version
    url = SOURCES["aircraft"]["dbversion.json"]
    dest = dirs["aircraft"] / "dbversion.txt"
    if download_file(url, dest, "dbversion"):
        print_status("dbversion", "OK")
        results["ok"].append("dbversion")
    else:
        print_status("dbversion", "SKIP")
        results["skipped"].append("dbversion")
    
    # 4. tar1090-db registrations (CSV -> JSON)
    print("\n[4/6] Downloading tar1090-db registrations...")
    url = SOURCES["aircraft"]["registrations_csv"]
    csv_dest = dirs["aircraft"] / "aircraft.csv"
    json_dest = dirs["aircraft"] / "registrations.json"
    
    print_status("Downloading aircraft.csv.gz...", "")
    if download_and_decompress_gzip(url, csv_dest):
        print_status("aircraft.csv", "OK")
        print_status("Converting to JSON...", "")
        if convert_csv_to_json(csv_dest, json_dest):
            print_status("registrations.json", "OK")
            results["ok"].append("registrations.json")
        else:
            print_status("registrations.json", "FAILED")
            results["failed"].append("registrations.json")
    else:
        print_status("aircraft.csv", "FAILED")
        results["failed"].append("registrations.json")
    
    # 5. Plane-alert-db
    print("\n[5/6] Downloading plane-alert-db...")
    for filename, url in SOURCES["plane_alert"].items():
        dest = dirs["aircraft"] / filename
        if download_file(url, dest, filename):
            print_status(filename, "OK")
            results["ok"].append(filename)
        else:
            print_status(filename, "FAILED")
            results["failed"].append(filename)
    
    # 6. Airlines
    print("\n[6/8] Downloading airlines...")
    url = SOURCES["airlines"]["airlines.csv"]
    dest = dirs["airlines"] / "airlines.csv"
    if download_file(url, dest, "airlines.csv"):
        print_status("airlines.csv", "OK")
        results["ok"].append("airlines.csv")
    else:
        print_status("airlines.csv", "FAILED")
        results["failed"].append("airlines.csv")
    
    # 7. Military databases
    print("\n[7/8] Downloading military databases...")
    for filename, url in SOURCES["military"].items():
        dest = dirs["military"] / filename
        if download_file(url, dest, filename):
            print_status(filename, "OK")
            results["ok"].append(filename)
        else:
            print_status(filename, "FAILED")
            results["failed"].append(filename)
    
    # 8. FAA database (optional, large)
    print("\n[8/8] Downloading FAA database (optional)...")
    url = SOURCES["faa"]["ReleasableAircraft.zip"]
    print_status("Downloading ZIP (~60MB)...", "")
    if download_and_extract_zip(url, dirs["aircraft_faa"], "FAA database"):
        print_status("Extracting...", "OK")
        results["ok"].append("FAA database")
    else:
        print_status("FAA database", "FAILED")
        results["failed"].append("FAA database")
    
    # Summary
    print("\n" + "=" * 40)
    print("         Download Summary")
    print("=" * 40)
    print(f"Location: {BASE_DIR}")
    print(f"\nSuccessful: {len(results['ok'])}")
    print(f"Failed:     {len(results['failed'])}")
    print(f"Skipped:    {len(results['skipped'])}")
    
    if results["failed"]:
        print(f"\nFailed items: {', '.join(results['failed'])}")
    
    print(f"""
Expected structure:
{BASE_DIR}/
  airports/
    airports.csv       {'[OK]' if 'airports.csv' in str(results['ok']) else '[MISSING]'}
    countries.csv      {'[OK]' if 'countries.csv' in str(results['ok']) else '[MISSING]'}
    regions.csv        {'[OK]' if 'regions.csv' in str(results['ok']) else '[MISSING]'}
    runways.csv        {'[OK]' if 'runways.csv' in str(results['ok']) else '[MISSING]'}
  aircraft/
    registrations.json {'[OK]' if 'registrations.json' in str(results['ok']) else '[MISSING]'}
    types.json         {'[OK]' if 'types.json' in str(results['ok']) else '[MISSING]'}
    interesting.csv    {'[OK]' if 'interesting.csv' in str(results['ok']) else '[MISSING]'}
    plane_images.csv   {'[OK]' if 'plane_images.csv' in str(results['ok']) else '[MISSING]'}
    faa/
      MASTER.txt       {'[OK]' if 'FAA database' in str(results['ok']) else '[MISSING]'}
      ACFTREF.txt      {'[OK]' if 'FAA database' in str(results['ok']) else '[MISSING]'}
  military/
    plane-alert-mil.csv        {'[OK]' if 'plane-alert-mil.csv' in str(results['ok']) else '[MISSING]'}
    plane-alert-mil-images.csv {'[OK]' if 'plane-alert-mil-images.csv' in str(results['ok']) else '[MISSING]'}
    plane-alert-gov.csv        {'[OK]' if 'plane-alert-gov.csv' in str(results['ok']) else '[MISSING]'}
    plane-alert-pol.csv        {'[OK]' if 'plane-alert-pol.csv' in str(results['ok']) else '[MISSING]'}
  airlines/
    airlines.csv       {'[OK]' if 'airlines.csv' in str(results['ok']) else '[MISSING]'}
""")
    
    return 0 if not results["failed"] else 1


if __name__ == "__main__":
    sys.exit(main())
