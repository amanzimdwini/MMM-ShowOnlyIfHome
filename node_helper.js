/**
 * MMM-ShowIfHome — node_helper.js
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
    console.log("[MMM-ShowIfHome] node_helper starting...");
    this.config      = null;
    this.anyoneHome  = false;
    this.phonesFound = 0;
    this.timer       = null;
  },

  socketNotificationReceived(notification, payload) {
    if (notification === "FRONTEND_READY") {
      this.config = payload.config;
      console.log("[MMM-ShowIfHome] Config received. Phones:", JSON.stringify(this.config.phones));
      console.log("[MMM-ShowIfHome] Poll interval:", this.config.pollInterval, "seconds");
      this._poll();
    }
  },

  _poll() {
    const self   = this;
    const phones = this.config.phones || [];

    if (phones.length === 0) {
      console.warn("[MMM-ShowIfHome] No phones configured.");
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
      // Ping OK — verify MAC if one is configured
      this._verifyMac(phone, callback);
    }.bind(this));
  },

  _verifyMac(phone, callback) {
    const placeholder = "aa:bb:cc:dd:ee:ff";
    const expected    = phone.mac
      ? phone.mac.toLowerCase().replace(/-/g, ":")
      : placeholder;

    if (expected === placeholder) {
      callback(true);   // no MAC configured — trust the ping
      return;
    }

    exec("arp -a " + phone.ip, function(error, stdout) {
      if (error || !stdout) {
        callback(true);   // can't verify — trust the ping
        return;
      }
      const match = stdout.match(/([\da-fA-F]{2}[:\-]){5}[\da-fA-F]{2}/);
      if (!match) {
        callback(true);
        return;
      }
      const found = match[0].toLowerCase().replace(/-/g, ":");
      if (found === expected) {
        callback(true);
      } else {
        console.warn("[MMM-ShowIfHome] Wrong device at " + phone.ip +
          " — expected " + expected + " got " + found);
        callback(false);
      }
    });
  },

  _checkArp(phone, callback) {
    const placeholder = "aa:bb:cc:dd:ee:ff";
    const expected    = phone.mac
      ? phone.mac.toLowerCase().replace(/-/g, ":")
      : placeholder;

    if (expected === placeholder) {
      callback(false);   // no MAC to search for
      return;
    }

    exec("arp -a", function(error, stdout) {
      if (error || !stdout) {
        callback(false);
        return;
      }
      const found = stdout.toLowerCase().indexOf(expected) !== -1;
      if (found) {
        console.log("[MMM-ShowIfHome] " + phone.name + " found in ARP cache (sleeping).");
      }
      callback(found);
    });
  },

  _handleResults(results) {
    const homePhones  = results.filter(function(r) { return r.home; });
    const anyoneHome  = homePhones.length > 0;
    const phonesFound = homePhones.length;

    results.forEach(function(r) {
      console.log("[MMM-ShowIfHome] " + r.phone.name +
        " (" + r.phone.ip + "): " + (r.home ? "HOME" : "away"));
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

    // Schedule next poll
    const self     = this;
    const interval = (this.config.pollInterval || 300) * 1000;
    this.timer     = setTimeout(function() { self._poll(); }, interval);
  },

  stop() {
    console.log("[MMM-ShowIfHome] Stopping.");
    if (this.timer) clearTimeout(this.timer);
  }

});