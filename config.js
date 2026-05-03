// ─────────────────────────────────────────────────────────────────
// MMM-ShowIfHome — paste this block into your config/config.js
//
// BEFORE PUBLISHING / MOVING TO PI:
//   - Replace IPs and MACs with your real values
//   - Remove the Windows test phones (or update to Pi network IPs)
//   - Set pollInterval back to 300 (5 min) or whatever suits you
//   - Set showStatus: false once you're happy it's working
// ─────────────────────────────────────────────────────────────────
{
  module: "MMM-ShowIfHome",
  position: "bottom_center",
  config: {

    phones: [
      // ── Your real phones ── (update MACs once DHCP reservations are set)
      { name: "Karl", ip: "192.168.0.56", mac: "a64:41:e6:15:06:43" },
      { name: "Phone Two", ip: "192.168.0.57", mac: "11:22:33:44:55:66" },
    ],

    // Modules to hide when nobody is home
    privateModules: ["MMM-WeatherGraph", "MMM-RAIN-MAP"],

    pollInterval:   30,     // TESTING: 30s — change to 300 (5 min) on Pi
    animationSpeed: 1000,
    showStatus:     true,   // set to false once working, if you prefer silence
  }
},