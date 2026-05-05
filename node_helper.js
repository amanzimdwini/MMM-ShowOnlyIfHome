/**
 * MMM-ShowOnlyIfHome — node_helper.js
 *
 * Polls the network for configured phones and notifies the frontend
 * to show or hide private modules accordingly.
 *
 * All configuration comes from config.js — no external dependencies.
 */

"use strict";

const NodeHelper = require("node_helper");
const { exec }   = require("child_process");
const os         = require("os");

module.exports = NodeHelper.create({

  start() {
    console.log("[MMM-ShowOnlyIfHome] node_helper starting...");
    this.config      = null;
    this.anyoneHome  = false;
    this.phonesFound = 0;
    this.timer       = null;
  },

  socketNotificationReceived(notification, payload) {
    if (notification === "FRONTEND_READY") {
      this.config = payload.config;
      console.log("[MMM-ShowOnlyIfHome] Config received. Phones:", JSON.stringify(this.config.phones));
      console.log("[MMM-ShowOnlyIfHome] Poll interval:", this.config.pollInterval, "seconds");
      this._poll();
    }
  },

  _poll() {
    const self   = this;
    const phones = this.config.phones || [];

    if (phones.length === 0) {
      console.warn("[MMM-ShowOnlyIfHome] No phones configured.");
      return;
    }

    const results = new Array(phones.length).fill(null);
    let   pending = phones.length;

    phones.forEach(function(phone, i) {
      self._pingPhone(phone, function(isHome) {
        results[i] = { phone: phone, home: isHome };
        pending--;
        if (pending === 0) {
          self._handleResults(results);
        }
      });
    });
  },

  _pingPhone(phone, callback) {
    const self  = this;
    const isWin = os.platform() === "win32";
    const cmd   = isWin
      ? "ping -n 1 -w 1000 " + phone.ip
      : "ping -c 1 -W 2 " + phone.ip;

    exec(cmd, function(error) {
      if (error) {
        // No ping reply — try ARP cache (catches sleeping phones)
        self._checkArp(phone, callback);
        return;
      }
      // Ping succeeded — MAC verification is mandatory if a MAC is configured
      self._verifyMac(phone, callback);
    });
  },

  _normaliseMac(mac) {
    return mac.toLowerCase().replace(/-/g, ":");
  },

  _isPlaceholder(mac) {
    // Any MAC that is clearly a placeholder/unconfigured value
    const placeholders = ["aa:bb:cc:dd:ee:ff", "11:22:33:44:55:66"];
    return placeholders.indexOf(mac) !== -1;
  },

  _verifyMac(phone, callback) {
    // If no MAC configured, or it's a placeholder, trust the ping
    if (!phone.mac) {
      console.warn("[MMM-ShowOnlyIfHome] " + phone.name + " has no MAC configured — trusting ping (not secure).");
      callback(true);
      return;
    }

    const expected = this._normaliseMac(phone.mac);

    if (this._isPlaceholder(expected)) {
      console.warn("[MMM-ShowOnlyIfHome] " + phone.name + " has placeholder MAC — trusting ping (not secure).");
      callback(true);
      return;
    }

    exec("arp -a " + phone.ip, function(error, stdout) {
      if (error || !stdout) {
        // ARP lookup failed — deny, don't assume
        console.warn("[MMM-ShowOnlyIfHome] ARP lookup failed for " + phone.ip + " — denying.");
        callback(false);
        return;
      }

      const match = stdout.match(/([\da-fA-F]{2}[:\-]){5}[\da-fA-F]{2}/);
      if (!match) {
        // No MAC in ARP output — deny, don't assume
        console.warn("[MMM-ShowOnlyIfHome] No MAC found in ARP output for " + phone.ip + " — denying.");
        callback(false);
        return;
      }

      const found = match[0].toLowerCase().replace(/-/g, ":");
      if (found === expected) {
        console.log("[MMM-ShowOnlyIfHome] " + phone.name + " MAC verified ✓");
        callback(true);
      } else {
        console.warn("[MMM-ShowOnlyIfHome] Wrong device at " + phone.ip +
          " — expected " + expected + " got " + found + " — denying.");
        callback(false);
      }
    });
  },

  _checkArp(phone, callback) {
    // Fallback for sleeping phones — search entire ARP cache for MAC
    if (!phone.mac) {
      callback(false);
      return;
    }

    const expected = this._normaliseMac(phone.mac);

    if (this._isPlaceholder(expected)) {
      callback(false);   // no reliable MAC to search for
      return;
    }

    exec("arp -a", function(error, stdout) {
      if (error || !stdout) {
        callback(false);
        return;
      }
      const found = stdout.toLowerCase().indexOf(expected) !== -1;
      if (found) {
        console.log("[MMM-ShowOnlyIfHome] " + phone.name + " found in ARP cache (sleeping) ✓");
      }
      callback(found);
    });
  },

  _handleResults(results) {
    const self        = this;
    const homePhones  = results.filter(function(r) { return r.home; });
    const anyoneHome  = homePhones.length > 0;
    const phonesFound = homePhones.length;

    results.forEach(function(r) {
      console.log("[MMM-ShowOnlyIfHome] " + r.phone.name +
        " (" + r.phone.ip + "): " + (r.home ? "HOME ✓" : "away"));
    });

    this.anyoneHome  = anyoneHome;
    this.phonesFound = phonesFound;

    this.sendSocketNotification("PRESENCE_UPDATE", {
      anyone_home:  anyoneHome,
      phones_found: phonesFound,
      results:      results.map(function(r) {
        return { name: r.phone.name, home: r.home };
      })
    });

    const interval = (this.config.pollInterval || 300) * 1000;
    this.timer     = setTimeout(function() { self._poll(); }, interval);
  },

  stop() {
    console.log("[MMM-ShowOnlyIfHome] Stopping.");
    if (this.timer) clearTimeout(this.timer);
  }

});