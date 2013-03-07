// Bug 1506 P1-3: This code is mostly hackish remnants of session store
// support. There are a couple of observer events that *might* be worth
// listening to. Search for 1506 in the code.

/*************************************************************************
 * Startup observer (JavaScript XPCOM component)
 *
 * Cases tested (each during Tor and Non-Tor, FF4 and FF3.6)
 *    1. Crash
 *    2. Upgrade
 *    3. Uninstall:
 *       XXX: Currently broken. Need
 *       https://developer.mozilla.org/en/Addons/Add-on_Manager/AddonListener#onOperationCancelled%28%29
 *       https://developer.mozilla.org/en/Addons/Add-on_Manager/AddonManager#addAddonListener%28%29
 *    4. Fresh install
 *
 *************************************************************************/

const Cc = Components.classes;
const Ci = Components.interfaces;
const Cr = Components.results;

// Module specific constants
const kMODULE_NAME = "Startup";
const kMODULE_CONTRACTID = "@torproject.org/startup-observer;1";
const kMODULE_CID = Components.ID("06322def-6fde-4c06-aef6-47ae8e799629");
const TORBUTTON_EXTENSION_UUID = "{E0204BD5-9D31-402B-A99D-A6AA8FFEBDCA}";

function StartupObserver() {
    this._uninstall = false;
    this.logger = Components.classes["@torproject.org/torbutton-logger;1"]
         .getService(Components.interfaces.nsISupports).wrappedJSObject;
    this._prefs = Components.classes["@mozilla.org/preferences-service;1"]
         .getService(Components.interfaces.nsIPrefBranch);
    this.logger.log(3, "Startup Observer created");

    var observerService = Cc["@mozilla.org/observer-service;1"].
            getService(Ci.nsIObserverService);
    observerService.addObserver(this, "quit-application-granted", false);

    try {
      var test = this._prefs.getCharPref("torbrowser.version");
      this.is_tbb = true;
      this.logger.log(3, "This is a Tor Browser's XPCOM");
    } catch(e) {
      this.logger.log(3, "This is not a Tor Browser's XPCOM");
    }

    try {
      // XXX: We're in a race with HTTPS-Everywhere to update our proxy settings
      // before the initial SSL-Observatory test... If we lose the race, Firefox
      // caches the old proxy settings for check.tp.o somehwere, and it never loads :(
      this.setProxySettings();
    } catch(e) {
      this.logger.log(4, "Early proxy change failed. Will try again at profile load. Error: "+e);
    }

    // Bug 1506 P2/P3: You probably want to register this observer to clean up
    // prefs if you're going to support using normal firefox. 
    Components.utils.import("resource://gre/modules/AddonManager.jsm");
    this.onEnabling = this.onOperationCancelled;
    this.onDisabling = this.onUninstalling;
    AddonManager.addAddonListener(this);
}

StartupObserver.prototype = {
    // AddonListeners. We need to listen to see if we are about to be
    // disabled or uninstalled. We also need to track this, and listen
    // for an arbitrary "cancel" event that changes the current state.
    // XXX: If firefox crashes before quit here, and still manages to uninstall
    // us somehow, we will leave the browser in a sorry state... Let's hope they
    // have the sense not to uninstall addons after an improper shutdown/crash
    // (or at least give us this event again in that case).
    // Bug 1506 P2/P3: You probably want to register this observer to clean up
    // prefs if you're going to support using normal firefox. 
    onUninstalling: function(addon, needsRestart) {
      if (addon.id.toUpperCase() == TORBUTTON_EXTENSION_UUID) {
        this._uninstall = true;
        this.logger.log(4, "User requested disable/uninstall of Torbutton. Preparing for death.");

        if (!needsRestart) {
          this.logger.log(5,
                  "Torbutton uninstalled/disabled, but a restart is not needed? How can this happen?");
        }
      }
    },

    // This is done in the constructor. JS doesn't allow this...
    //onDisabling: this.onUninstalling,

    // Bug 1506 P2/P3: You probably want to register this observer to clean up
    // prefs if you're going to support using normal firefox. 
    onOperationCancelled: function(addon) {
      if (addon.id.toUpperCase() == TORBUTTON_EXTENSION_UUID) {
         this.logger.log(4, "Uninstall of Torbutton canceled. Hurray!");
         this._uninstall = false;
      }
    },

    // Bug 6803: We need to get the env vars early due to
    // some weird proxy caching code that showed up in FF15.
    // Otherwise, homepage domain loads fail forever.
    setProxySettings: function() {
      // Bug 1506: Still want to get these env vars
      var environ = Components.classes["@mozilla.org/process/environment;1"]
                 .getService(Components.interfaces.nsIEnvironment);

      if (environ.exists("TOR_SOCKS_PORT")) {
        this._prefs.setIntPref('extensions.torbutton.socks_port',
                parseInt(environ.get("TOR_SOCKS_PORT")));
        if (this.is_tbb) {
            this._prefs.setIntPref('network.proxy.socks_port', parseInt(environ.get("TOR_SOCKS_PORT")));

            // XXX: Hack for TBB people who alternate between transproxy and non
            this._prefs.setCharPref('extensions.torbutton.settings_method', 'recommended');
            this._prefs.setBoolPref('extensions.torbutton.saved.transparentTor', false);
            this._prefs.setBoolPref('network.proxy.socks_remote_dns', true);
            this._prefs.setIntPref('network.proxy.type', 1);
        }
        this.logger.log(3, "Reset socks port to "+environ.get("TOR_SOCKS_PORT"));
      } else if (this._prefs.getCharPref('extensions.torbutton.settings_method') == 'recommended') {
        this._prefs.setIntPref('extensions.torbutton.socks_port', 9150);
      }

      if (environ.exists("TOR_SOCKS_HOST")) {
        this._prefs.setCharPref('extensions.torbutton.socks_host', environ.get("TOR_SOCKS_HOST"));
        if (this.is_tbb) {
            this._prefs.setCharPref('network.proxy.socks', environ.get("TOR_SOCKS_HOST"));
        }
      } else if (this._prefs.getCharPref('extensions.torbutton.settings_method') == 'recommended') {
        this._prefs.setCharPref('extensions.torbutton.socks_host', '127.0.0.1');
      }

      if (environ.exists("TOR_TRANSPROXY")) {
        this.logger.log(3, "Resetting Tor settings to transproxy");
        this._prefs.setCharPref('extensions.torbutton.settings_method', 'transparent');
        this._prefs.setBoolPref('extensions.torbutton.saved.transparentTor', true);
        this._prefs.setIntPref('extensions.torbutton.socks_port', 0);
        this._prefs.setCharPref('extensions.torbutton.socks_host', "");
        if (this.is_tbb) {
            this._prefs.setBoolPref('network.proxy.socks_remote_dns', false);
            this._prefs.setIntPref('network.proxy.type', 0);
            this._prefs.setIntPref('network.proxy.socks_port', 0);
            this._prefs.setCharPref('network.proxy.socks', "");
        }
      }

      // Force prefs to be synced to disk
      var prefService = Components.classes["@mozilla.org/preferences-service;1"]
          .getService(Components.interfaces.nsIPrefService);
      prefService.savePrefFile(null);
    
      this.logger.log(3, "Synced network settings to environment.");
    },

    observe: function(subject, topic, data) {
      if(topic == "profile-after-change") {
        // Bug 1506 P1: We listen to these prefs as signals for startup,
        // but only for hackish reasons.
        this._prefs.setBoolPref("extensions.torbutton.startup", true);

        this.setProxySettings();
      } else if (topic == "quit-application-granted") {
        // Bug 1506 P2/P3: You probably want to register this observer to clean up
        // prefs if you're going to support using normal firefox. 
        this.logger.log(3, "Got firefox quit event.");
        var chrome = null;
        try {
            var wm = Cc["@mozilla.org/appshell/window-mediator;1"]
                         .getService(Components.interfaces.nsIWindowMediator);
            var chrome = wm.getMostRecentWindow("navigator:browser");
        } catch(e) {
            this.logger.log(3, "Exception on shutdown window: "+e);
        }

        if (this._uninstall) {
            if (chrome) {
                chrome.torbutton_disable_tor();
                this.logger.log(4,
                        "Disabling Torbutton prior to uninstall.");
            } else {
                this.logger.log(5,
                        "User asked to uninstall, but we have no window!");
            }
        }

        this.logger.log(3, "Torbutton normal exit.");
        //this.unregister();
      }

      // In all cases, force prefs to be synced to disk
      var prefService = Components.classes["@mozilla.org/preferences-service;1"]
          .getService(Components.interfaces.nsIPrefService);
      prefService.savePrefFile(null);
    },

  QueryInterface: function(iid) {
    if (iid.equals(Components.interfaces.nsISupports)) {
        return this;
    }
    if(iid.equals(Components.interfaces.nsIClassInfo)) {
      return this;
    }
    return this;
  },

  // method of nsIClassInfo
  classDescription: "Torbutton Startup Observer",
  classID: kMODULE_CID,
  contractID: kMODULE_CONTRACTID,

  // Hack to get us registered early to observe recovery
  _xpcom_categories: [{category:"profile-after-change"}],

  getInterfaces: function(count) {
    var interfaceList = [nsIClassInfo];
    count.value = interfaceList.length;
    return interfaceList;
  },
  getHelperForLanguage: function(count) { return null; }

};

/**
* XPCOMUtils.generateNSGetFactory was introduced in Mozilla 2 (Firefox 4).
* XPCOMUtils.generateNSGetModule is for Mozilla 1.9.2 (Firefox 3.6).
*/
Components.utils.import("resource://gre/modules/XPCOMUtils.jsm");
if (XPCOMUtils.generateNSGetFactory)
    var NSGetFactory = XPCOMUtils.generateNSGetFactory([StartupObserver]);
else
    var NSGetModule = XPCOMUtils.generateNSGetModule([StartupObserver]);
