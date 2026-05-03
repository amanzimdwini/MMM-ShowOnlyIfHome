/**
 * MMM-ShowIfHome — node_helper.js
 *
 * Listens on port 8081 for presence updates from phone_detector.py.
 *
 * Endpoints:
 *   POST http://localhost:8081/presence
 *        Body: { "anyone_home": true, "phones_found": 1 }
 *
 *   GET  http://localhost:8081/status
 *        Returns current presence state
 */

"use strict";

const NodeHelper = require("node_helper");
const http       = require("http");

module.exports = NodeHelper.create({

  start() {
    console.log("============================================");
    console.log("[MMM-ShowIfHome] node_helper starting...");
    console.log("============================================");
    this.anyoneHome  = false;
    this.phonesFound = 0;
    this.startServer();
  },

  startServer() {
    const PORT = 8081;
    const self = this;

    this.server = http.createServer(function(req, res) {
      let pathname = req.url.split("?")[0];

      // ── GET /status ───────────────────────────────────
      if (req.method === "GET" && pathname === "/status") {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({
          success:      true,
          anyone_home:  self.anyoneHome,
          phones_found: self.phonesFound,
          timestamp:    new Date().toISOString()
        }));
        return;
      }

      // ── POST /presence ────────────────────────────────
      if (req.method === "POST" && pathname === "/presence") {
        let body = "";
        req.on("data", function(chunk) { body += chunk.toString(); });
        req.on("end", function() {
          try {
            const data = JSON.parse(body);
            console.log("[MMM-ShowIfHome] Received POST /presence:", data);

            if (typeof data.anyone_home !== "boolean") {
              throw new Error("anyone_home must be boolean");
            }

            const changed     = data.anyone_home !== self.anyoneHome;
            self.anyoneHome   = data.anyone_home;
            self.phonesFound  = typeof data.phones_found === "number" ? data.phones_found : (data.anyone_home ? 1 : 0);

            console.log("[MMM-ShowIfHome] State -> anyone_home=" + self.anyoneHome + " phones_found=" + self.phonesFound + " changed=" + changed);

            // Always notify frontend — it needs to apply hide/show even if state hasn't changed
            // (e.g. if MM restarted and modules defaulted back to visible)
            self.sendSocketNotification("PRESENCE_UPDATE", {
              anyone_home:  self.anyoneHome,
              phones_found: self.phonesFound,
              changed:      changed
            });

            res.writeHead(200, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ success: true, anyone_home: self.anyoneHome, phones_found: self.phonesFound, changed: changed }));

          } catch(e) {
            console.error("[MMM-ShowIfHome] Bad request body:", e.message, "| body was:", body);
            res.writeHead(400, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ success: false, error: e.message }));
          }
        });
        return;
      }

      // ── 404 ───────────────────────────────────────────
      console.log("[MMM-ShowIfHome] 404 for", req.method, req.url);
      res.writeHead(404, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Not found. Use POST /presence or GET /status" }));
    });

    this.server.on("error", function(err) {
      console.error("[MMM-ShowIfHome] HTTP server error:", err.message);
      if (err.code === "EADDRINUSE") {
        console.error("[MMM-ShowIfHome] Port " + PORT + " is already in use — is another MM instance running?");
      }
    });

    this.server.listen(PORT, "127.0.0.1", function() {
      console.log("============================================");
      console.log("[MMM-ShowIfHome] HTTP server listening on http://127.0.0.1:" + PORT);
      console.log("============================================");
    });
  },

  socketNotificationReceived(notification) {
    if (notification === "FRONTEND_READY") {
      console.log("[MMM-ShowIfHome] Frontend ready -- pushing current state: anyone_home=" + this.anyoneHome);
      this.sendSocketNotification("PRESENCE_UPDATE", {
        anyone_home:  this.anyoneHome,
        phones_found: this.phonesFound,
        changed:      false
      });
    }
  },

  stop() {
    console.log("[MMM-ShowIfHome] Stopping — closing HTTP server.");
    if (this.server) {
      this.server.close();
    }
  }
});