Module.register("MMM-ShowIfHome", {

  defaults: {
    privateModules: [],
    animationSpeed: 1000,
  },

  start() {
    Log.info("[MMM-ShowIfHome] Started — registering with node_helper.");
    this.anyoneHome  = false;
    this.lastChecked = null;
    this.phonesFound = 0;
    // Must send at least one notification to node_helper before it can push back to us.
    // Without this handshake, sendSocketNotification from node_helper is silently dropped.
    this.sendSocketNotification("FRONTEND_READY", {});
  },

  notificationReceived(notification) {
    if (notification === "ALL_MODULES_STARTED") {
      Log.info("[MMM-ShowIfHome] All modules started — applying safe default (hide).");
      setTimeout(() => { this._applyPresence(false); }, 1000);
    }
  },

  socketNotificationReceived(notification, payload) {
    if (notification === "PRESENCE_UPDATE") {
      Log.info("[MMM-ShowIfHome] PRESENCE_UPDATE received — anyone_home=" + payload.anyone_home + " phones_found=" + payload.phones_found);
      this.anyoneHome  = payload.anyone_home;
      this.phonesFound = payload.phones_found || 0;
      this.lastChecked = new Date();
      this._applyPresence(this.anyoneHome);
      this.updateDom();
    }
  },

  _applyPresence(anyoneHome) {
    const speed   = this.config.animationSpeed;
    const targets = this.config.privateModules;
    Log.info("[MMM-ShowIfHome] _applyPresence — " + (anyoneHome ? "SHOW" : "HIDE") + " " + JSON.stringify(targets));
    MM.getModules().enumerate((mod) => {
      if (targets.indexOf(mod.name) !== -1) {
        Log.info("[MMM-ShowIfHome]   -> " + (anyoneHome ? "show" : "hide") + " " + mod.name);
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
    wrapper.style.cssText = "font-size:0.75em; opacity:0.6; text-align:center;";

    if (!this.lastChecked) {
      wrapper.innerHTML = "&#128247; Waiting for phone check&hellip;";
      return wrapper;
    }

    const timeStr = this.lastChecked.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    const count   = this.phonesFound;
    const icon    = this.anyoneHome ? "&#128247;" : "&#128683;";
    let msg;
    if (count === 0)      msg = "no phones found &mdash; private modules hidden";
    else if (count === 1) msg = "1 phone home &mdash; private modules visible";
    else                  msg = count + " phones home &mdash; private modules visible";

    wrapper.innerHTML = icon + " " + msg + " <span style='opacity:0.5'>(" + timeStr + ")</span>";
    return wrapper;
  }

});