/**
 * MMM-ShowIfHome
 *
 * MagicMirror module that shows/hides private modules based on
 * whether configured phones are present on the local network.
 *
 * See README.md for full setup instructions.
 */

Module.register("MMM-ShowIfHome", {

  defaults: {
    phones:         [],
    privateModules: [],
    pollInterval:   300,    // seconds between checks
    animationSpeed: 1000,   // ms for show/hide fade
    showStatus:     true,   // show status line on screen
  },

  start() {
    Log.info("[MMM-ShowIfHome] Started.");
    this.anyoneHome   = false;
    this.phonesFound  = 0;
    this.lastChecked  = null;
    this.phoneResults = [];
  },

  notificationReceived(notification) {
    if (notification === "ALL_MODULES_STARTED") {
      Log.info("[MMM-ShowIfHome] Applying safe default (hide) and starting poller.");
      setTimeout(() => { this._applyPresence(false); }, 1000);
      this.sendSocketNotification("FRONTEND_READY", { config: this.config });
    }
  },

  socketNotificationReceived(notification, payload) {
    if (notification !== "PRESENCE_UPDATE") return;
    Log.info("[MMM-ShowIfHome] Update — anyone_home=" + payload.anyone_home +
             " phones_found=" + payload.phones_found);
    this.anyoneHome   = payload.anyone_home;
    this.phonesFound  = payload.phones_found || 0;
    this.lastChecked  = new Date();
    this.phoneResults = payload.results || [];
    this._applyPresence(this.anyoneHome);
    this.updateDom();
  },

  _applyPresence(anyoneHome) {
    const speed   = this.config.animationSpeed;
    const targets = this.config.privateModules;
    Log.info("[MMM-ShowIfHome] " + (anyoneHome ? "SHOW" : "HIDE") +
             " " + JSON.stringify(targets));
    MM.getModules().enumerate((mod) => {
      if (targets.indexOf(mod.name) !== -1) {
        if (anyoneHome) {
          mod.show(speed, { lockString: "MMM-ShowIfHome" });
        } else {
          mod.hide(speed, { lockString: "MMM-ShowIfHome" });
        }
      }
    });
  },

  getDom() {
    const wrapper = document.createElement("div");
    if (!this.config.showStatus) return wrapper;

    wrapper.style.cssText = "font-size:0.75em; opacity:0.6; text-align:center;";

    if (!this.lastChecked) {
      wrapper.innerHTML = "&#128247; Waiting for phone check&hellip;";
      return wrapper;
    }

    const timeStr = this.lastChecked.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    const icon    = this.anyoneHome ? "&#128247;" : "&#128683;";

    let msg;
    if (this.phoneResults.length > 0) {
      msg = this.phoneResults.map(function(r) {
        return r.name + ": " + (r.home ? "home" : "away");
      }).join(" &nbsp;|&nbsp; ");
    } else {
      msg = this.phonesFound === 0
        ? "no phones found &mdash; private modules hidden"
        : this.phonesFound + " phone(s) home &mdash; private modules visible";
    }

    wrapper.innerHTML = icon + " " + msg +
      " <span style='opacity:0.5'>(" + timeStr + ")</span>";
    return wrapper;
  }

});