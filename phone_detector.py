#!/usr/bin/env python3
"""
Phone presence detector -> MMM-ShowIfHome controller.

Polls the network for configured phones and notifies MMM-ShowIfHome
(port 8081) to show or hide private modules accordingly.

SETUP:
  1. Copy .env.example to .env and fill in all values.
  2. Copy MMM-ShowIfHome/ into your MagicMirror modules/ folder.
  3. In your router, assign fixed IPs to each phone's MAC address.
  4. Disable MAC randomisation on each phone for your home Wi-Fi:
       iPhone:  Settings > Wi-Fi > (network) > Private Wi-Fi Address -> Off
       Android: Wi-Fi > (network) > Privacy > Use device MAC

Usage:
    python phone_detector.py                 # single check + act
    python phone_detector.py --loop 60       # check every 60 seconds
    python phone_detector.py --verbose       # show detail
    python phone_detector.py --dry-run       # check phones, print actions but don't POST to MM
    python phone_detector.py --status        # ask MMM-ShowIfHome what it currently thinks
"""

import subprocess
import re
import time
import argparse
import platform
import os
import urllib.request
import urllib.error
import json
from datetime import datetime
from dotenv import load_dotenv

load_dotenv()

# ─────────────────────────────────────────────────────
# PHONE CONFIG  (from .env)
# ─────────────────────────────────────────────────────

PHONES = {
    "Phone One": {
        "ip":  os.getenv("PHONE1_IP",  "192.168.0.56"),
        "mac": os.getenv("PHONE1_MAC", "aa:bb:cc:dd:ee:ff"),
    },
    "Phone Two": {
        "ip":  os.getenv("PHONE2_IP",  "192.168.0.57"),
        "mac": os.getenv("PHONE2_MAC", "11:22:33:44:55:66"),
    },
}

# ─────────────────────────────────────────────────────
# MAGICMIRROR CONFIG  (from .env)
# MM_TARGET=local -> laptop, MM_TARGET=pi -> Pi
# ─────────────────────────────────────────────────────

_target = os.getenv("MM_TARGET", "local").strip().lower()
MM_HOST  = os.getenv("MM_HOST_PI", "192.168.0.100") if _target == "pi" \
           else os.getenv("MM_HOST_LOCAL", "localhost")
MM_PORT  = 8081   # MMM-ShowIfHome always listens here

PING_TIMEOUT_MS = 1000   # Windows -w (milliseconds)
PING_TIMEOUT_S  = 2      # Linux/macOS -W (seconds)

# ─────────────────────────────────────────────────────


def normalise_mac(mac):
    return mac.lower().strip().replace("-", ":")


def ping(ip):
    """Ping once. Returns True if the device replied."""
    if platform.system() == "Windows":
        cmd = ["ping", "-n", "1", "-w", str(PING_TIMEOUT_MS), ip]
    else:
        cmd = ["ping", "-c", "1", "-W", str(PING_TIMEOUT_S), ip]
    result = subprocess.run(cmd, capture_output=True, text=True)
    return result.returncode == 0


def get_mac_from_arp(ip):
    """Look up the MAC for a given IP in the OS ARP cache."""
    try:
        result = subprocess.run(["arp", "-a", ip], capture_output=True, text=True)
        for line in result.stdout.splitlines():
            mac_match = re.search(r"([\da-fA-F]{2}[:\-]){5}[\da-fA-F]{2}", line)
            if mac_match:
                return normalise_mac(mac_match.group(0))
    except Exception:
        pass
    return None


def check_phone(name, config, verbose=False):
    """
    Ping the fixed IP then verify the MAC from ARP cache.
    Returns (is_home: bool, message: str).
    """
    ip          = config["ip"]
    expected    = normalise_mac(config["mac"])
    placeholder = normalise_mac("aa:bb:cc:dd:ee:ff")

    replied = ping(ip)
    if verbose:
        print(f"    ping {ip} -> {'replied' if replied else 'no reply'}")

    if not replied:
        return False, "away (no ping reply)"

    found_mac = get_mac_from_arp(ip)
    if verbose:
        print(f"    MAC at {ip}: {found_mac or 'not in ARP cache'}")

    if found_mac is None:
        return True, "home (MAC unverified)"

    if expected == placeholder:
        return True, f"home (MAC not configured -- device MAC is {found_mac})"

    if found_mac == expected:
        return True, "home ✓"
    else:
        return False, f"WRONG DEVICE at {ip} (got {found_mac})"


# ─────────────────────────────────────────────────────
# MMM-ShowIfHome API
# ─────────────────────────────────────────────────────

def notify_mm(anyone_home, phones_found=0, verbose=False, dry_run=False):
    """POST presence state to MMM-ShowIfHome on port 8081."""
    url  = f"http://{MM_HOST}:{MM_PORT}/presence"
    body = json.dumps({"anyone_home": anyone_home, "phones_found": phones_found}).encode()

    if dry_run:
        state = "home" if anyone_home else "away"
        print(f"  [dry-run] would POST -> anyone_home={anyone_home}, phones_found={phones_found} ({state})")
        return True

    try:
        req = urllib.request.Request(
            url, data=body,
            headers={"Content-Type": "application/json"},
            method="POST"
        )
        with urllib.request.urlopen(req, timeout=5) as resp:
            result = json.loads(resp.read().decode())
            if verbose:
                print(f"  MMM-ShowIfHome notified: phones_found={phones_found}, changed={result.get('changed', '?')}")
            return result.get("success", False)
    except urllib.error.URLError as e:
        print(f"  [warning] Could not reach MMM-ShowIfHome at {url}: {e}")
        return False


def mm_status(verbose=False):
    """GET current presence state from MMM-ShowIfHome (for debugging)."""
    url = f"http://{MM_HOST}:{MM_PORT}/status"
    try:
        with urllib.request.urlopen(url, timeout=5) as resp:
            return json.loads(resp.read().decode())
    except urllib.error.URLError as e:
        if verbose:
            print(f"  [warning] Could not reach MMM-ShowIfHome: {e}")
        return None


# ─────────────────────────────────────────────────────
# MAIN LOGIC
# ─────────────────────────────────────────────────────

def run_check(verbose=False):
    results = {}
    for name, config in PHONES.items():
        if verbose:
            print(f"  Checking {name} ({config['ip']})...")
        is_home, message = check_phone(name, config, verbose)
        results[name] = (is_home, message)
        if verbose:
            print()
    return results


def print_results(results, timestamp=False):
    if timestamp:
        print(f"[{datetime.now().strftime('%H:%M:%S')}]")
    for name, (is_home, message) in results.items():
        print(f"  {name}: {message}")


def main():
    parser = argparse.ArgumentParser(description="Phone presence -> MMM-ShowIfHome")
    parser.add_argument("--loop",    type=int, metavar="SECONDS",
                        help="Repeat every N seconds (Ctrl+C to stop)")
    parser.add_argument("--verbose", "-v", action="store_true",
                        help="Show ping, MAC, and API detail")
    parser.add_argument("--dry-run", "-n", action="store_true",
                        help="Check phones but don't POST to MagicMirror")
    parser.add_argument("--status",  action="store_true",
                        help="Query MMM-ShowIfHome's current state and exit")
    args = parser.parse_args()

    print("Phone presence detector -> MMM-ShowIfHome")
    print("-" * 42)
    print(f"  MM target: {_target.upper()} ({MM_HOST}:{MM_PORT})")
    if args.dry_run:
        print("  ** DRY RUN -- MMM-ShowIfHome will not be called **")
    print()

    if args.status:
        state = mm_status(verbose=True)
        if state:
            home  = state.get("anyone_home")
            ts    = state.get("timestamp", "?")
            count = state.get("phones_found", "?")
            print(f"  MMM-ShowIfHome says: {'HOME' if home else 'AWAY'} "
                  f"({count} phone(s) found, as of {ts})")
        else:
            print("  Could not reach MMM-ShowIfHome.")
        return

    def one_cycle():
        results     = run_check(verbose=args.verbose)
        print_results(results)
        phones_found = sum(1 for is_home, _ in results.values() if is_home)
        anyone_home  = phones_found > 0
        notify_mm(anyone_home, phones_found=phones_found,
                  verbose=args.verbose, dry_run=args.dry_run)
        print()

    if args.loop:
        print(f"Checking every {args.loop}s -- press Ctrl+C to stop\n")
        try:
            while True:
                one_cycle()
                time.sleep(args.loop)
        except KeyboardInterrupt:
            print("\nStopped.")
    else:
        one_cycle()


if __name__ == "__main__":
    main()