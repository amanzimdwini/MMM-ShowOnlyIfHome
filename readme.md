# MMM-ShowOnlyIfHome

A [MagicMirror²](https://magicmirror.builders) module that shows and hides
 modules deemed PRIVATE (think Stocktackers, emails, appointment calendars ...)
 based on whether your phone is present on the home network.

When nobody is home, all modules deemed private are hidden. 
When any phone in a list is detected, they reappear. 
No external scripts or services required — everything runs inside MagicMirror.

## How it works

The module polls your network by going through a list of phones and pinging 
each phone's fixed IP address. If the ping succeeds, the phone's MAC address 
is checked. If it matches, the phone is considered "home" and the private 
modules are displayed. If all phones are away or fail the MAC check, the 
private modules are hidden.

A sleeping phone that doesn't respond to ping is caught via the ARP cache as
a fallback — the MAC is verified there too, so a wrong device cannot
impersonate a known phone and gain a "home" result.

Also note that if you have two DIFFERENT networks you might connect to, you can check for that too - see the example config.js below

## Installation

```bash
cd ~/MagicMirror/modules
git clone https://github.com/amanzimdwini/MMM-ShowOnlyIfHome
```
No `npm install` needed — the module uses only Node.js built-ins.

## Phone setup (required)

Modern phones randomise their MAC address on Wi-Fi by default. You must disable
this for your home network, otherwise the phone will appear as a new unknown
device on each connection.

- **iPhone:** Settings → Wi-Fi → tap your network → Private Wi-Fi Address → **Off**
- **Android:** Wi-Fi → long-press your network → Manage → Privacy → **Use device MAC**

You should also assign each phone a **fixed/reserved IP** in your router's DHCP
settings so its address never changes.


## Configuration

Add to `config/config.js`:

```javascript
{
  module: "MMM-ShowOnlyIfHome",
  position: "bottom_center",
  config: {

    // Phones to check — add as many as you like
    phones: [
    // ⚠️  Replace these MACs with real values — placeholder MACs disable MAC verification
      { name: "Alice", ip: "192.168.0.56", mac: "aa:bb:cc:dd:ee:ff" },
      { name: "Bob",   ip: "192.168.0.57", mac: "11:22:33:44:55:66" },
      { name: "Alice", ip: "192.168.1.52", mac: "aa:bb:cc:dd:ee:ff" }
    ],

// Modules to hide when nobody is home
    privateModules: ["MMM-Secret1", "MMM-Secret2"],

    pollInterval:   300,    // seconds between checks (default: 300 = 5 min)
    animationSpeed: 1000,   // ms for show/hide fade (default: 1000)
    showStatus:     true,   // show status line on screen (default: true)
  }
},
```

### Configuration options

| Option | Default | Description |
|---|---|---|
| `phones` | `[]` | Array of phones to monitor. Each entry needs `ip` and `mac` (strongly recommended for security); `name` is optional. |
| `privateModules` | `[]` | Module names to hide when nobody is home. |
| `pollInterval` | `300` | Seconds between network checks. |
| `animationSpeed` | `1000` | Fade duration for private modules in milliseconds. |
| `showStatus` | `true` | Display the status line. Set to `false` to run silently. |

### Finding your MAC address

After disabling MAC randomisation, find the real MAC:
- **iPhone:** Settings → Wi-Fi → tap your network → the MAC is shown as "Wi-Fi Address"
- **Android:** Settings → About phone → Status → Wi-Fi MAC address
- **From your router:** check the DHCP client list

### Status display

When `showStatus: true`, a small line appears at the configured position:

```
📷 Alice: home | Bob: away  (14:32)
📵 Alice: away | Bob: away  (14:35)
```

Set `showStatus: false` to hide this line.

## License

MIT