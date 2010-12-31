/*************************************************************************
 * Crash observer (JavaScript XPCOM component)
 *
 * Provides the chrome with a notification ("extensions.torbutton.crashed"
 * pref event) that the browser in fact crashed.
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
const kMODULE_NAME = "Session crash detector";
const kMODULE_CONTRACTID = "@torproject.org/crash-observer;1";
const kMODULE_CID = Components.ID("06322def-6fde-4c06-aef6-47ae8e799629");
const TORBUTTON_EXTENSION_UUID = "{E0204BD5-9D31-402B-A99D-A6AA8FFEBDCA}";

function CrashObserver() {
    this._uninstall = false;
    this.logger = Components.classes["@torproject.org/torbutton-logger;1"]
         .getService(Components.interfaces.nsISupports).wrappedJSObject;
    this._prefs = Components.classes["@mozilla.org/preferences-service;1"]
         .getService(Components.interfaces.nsIPrefBranch);
    this.logger.log(3, "Crash Observer created");

    var observerService = Cc["@mozilla.org/observer-service;1"].
            getService(Ci.nsIObserverService);
    observerService.addObserver(this, "quit-application-granted", false);

    // Determine if we are firefox 4 or not.. They changed the addon listeners
    // in a backwards-incompatible way...
    var appInfo = Components.classes["@mozilla.org/xre/app-info;1"]
        .getService(Components.interfaces.nsIXULAppInfo);
    var versionChecker = Components.classes["@mozilla.org/xpcom/version-comparator;1"]
        .getService(Components.interfaces.nsIVersionComparator);

    if(versionChecker.compare(appInfo.version, "4.0a1") >= 0) {
        this.is_ff4 = true;
    } else {
        this.is_ff4 = false;
    }

    if (this.is_ff4) {
      Components.utils.import("resource://gre/modules/AddonManager.jsm");
      this.onEnabling = this.onOperationCancelled;
      this.onDisabling = this.onUninstalling;
      AddonManager.addAddonListener(this);
    } else {
      observerService.addObserver(this, "em-action-requested", false);
    }
}

CrashObserver.prototype = {
    // AddonListeners. We need to listen to see if we are about to be
    // disabled or uninstalled. We also need to track this, and listen
    // for an arbitrary "cancel" event that changes the current state.
    // This is for FF4 and above. The logic in em-action-requested handles
    // it for earlier versions
    // XXX: If firefox crashes before quit here, and still manages to uninstall
    // us somehow, we will leave the browser in a sorry state... Let's hope they
    // have the sense not to uninstall addons after an improper shutdown/crash
    // (or at least give us this event again in that case).
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

    onOperationCancelled: function(addon) {
      if (addon.id.toUpperCase() == TORBUTTON_EXTENSION_UUID) {
         this.logger.log(4, "Uninstall of Torbutton canceled. Hurray!");
         this._uninstall = false;
      }
    },

    // This is done in the constructor. JS doesn't allow this...
    //onEnabling: this.onOperationCancelled,

    observe: function(subject, topic, data) {
      if(topic == "profile-after-change") {
        if(this._prefs.getBoolPref("extensions.torbutton.fresh_install")) {
          this._prefs.setBoolPref("extensions.torbutton.normal_exit", true);
        }
        this._prefs.setBoolPref("extensions.torbutton.startup", true);
        if (this._prefs.getBoolPref("extensions.torbutton.normal_exit")) {
          this._prefs.setBoolPref("extensions.torbutton.noncrashed", true);
        } else {
          this._prefs.setBoolPref("extensions.torbutton.crashed", true);
        }
        this._prefs.setBoolPref("extensions.torbutton.normal_exit", false);
      } else if (topic == "em-action-requested") {
        this.logger.log(3, "Uninstall action requested..");
        // http://xulsolutions.blogspot.com/2006/07/creating-uninstall-script-for.html
        subject.QueryInterface(Components.interfaces.nsIUpdateItem);
        this.logger.log(3, "Uninstall: "+data+" "+subject.id.toUpperCase());

        if (subject.id.toUpperCase() == TORBUTTON_EXTENSION_UUID) {
          this.logger.log(3, "Uninstall: "+data);
          if (data == "item-uninstalled" || data == "item-disabled") {
            this._uninstall = true;
          } else if (data == "item-cancel-action") {
            this._uninstall = false;
          }
        }
      } else if (topic == "quit-application-granted") {
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

        // Remove the cookie observer so clearing cookies below does not
        // issue a new request.
        if (chrome) chrome.torbutton_cookie_observer.unregister();

        // Set pref in case this is just an upgrade (So we don't
        // mess with cookies)
        this._prefs.setBoolPref("extensions.torbutton.normal_exit", true);
        this._prefs.setBoolPref("extensions.torbutton.crashed", false);
        this._prefs.setBoolPref("extensions.torbutton.noncrashed", false);

        if((this._prefs.getIntPref("extensions.torbutton.shutdown_method") == 1 && 
            this._prefs.getBoolPref("extensions.torbutton.tor_enabled"))
            || this._prefs.getIntPref("extensions.torbutton.shutdown_method") == 2) {
            var selector =
                Components.classes["@torproject.org/cookie-jar-selector;1"]
                .getService(Components.interfaces.nsISupports)
                .wrappedJSObject;
            selector.clearCookies();
            // clear the cookie jar by saving the empty cookies to it.
            if(this._prefs.getIntPref("extensions.torbutton.shutdown_method") == 2) {
                if(this._prefs.getBoolPref('extensions.torbutton.dual_cookie_jars'))
                    selector.saveCookies("tor");
                selector.saveCookies("nontor");
            } else if(this._prefs.getBoolPref('extensions.torbutton.dual_cookie_jars')) {
                selector.saveCookies("tor");
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
  classDescription: "Torbutton Crash Observer",
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
    var NSGetFactory = XPCOMUtils.generateNSGetFactory([CrashObserver]);
else
    var NSGetModule = XPCOMUtils.generateNSGetModule([CrashObserver]);
