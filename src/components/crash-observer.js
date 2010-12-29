/*************************************************************************
 * Crash observer (JavaScript XPCOM component)
 *
 * Provides the chrome with a notification ("extensions.torbutton.crashed"
 * pref event) that the browser in fact crashed.
 *
 * XXX: Cases to test (each during Tor and Non-Tor)
 *    0. Crash
 *       * XXX: Sometimes just saves window list..
 *    2. Upgrade
 *    1. Uninstall
 *    3. Profile restore without crash
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
    dump("Crash observer\n\n\n");
    this._uninstall = false;
    this.logger = Components.classes["@torproject.org/torbutton-logger;1"]
         .getService(Components.interfaces.nsISupports).wrappedJSObject;
    this._prefs = Components.classes["@mozilla.org/preferences-service;1"]
         .getService(Components.interfaces.nsIPrefBranch);
    this.logger.log(3, "AppObserver created");

    var observerService = Cc["@mozilla.org/observer-service;1"].
            getService(Ci.nsIObserverService);
    observerService.addObserver(this, "final-ui-startup", false);
    observerService.addObserver(this, "em-action-requested", false);
    observerService.addObserver(this, "quit-application-granted", false);
}

CrashObserver.prototype = {
    observe: function(subject, topic, data) {
      if(topic == "profile-after-change") {
        if(this._prefs.getBoolPref("extensions.torbutton.fresh_install")) {
          this._prefs.setBoolPref("extensions.torbutton.normal_exit", true);
        }
      } else if(topic == "final-ui-startup") {
          this.logger.log(2, "final-ui-startup.");
          this._prefs.setBoolPref("extensions.torbutton.startup", true);
          if (this._prefs.getBoolPref("extensions.torbutton.normal_exit")) {
            this._prefs.setBoolPref("extensions.torbutton.noncrashed", true);
          } else {
            this._prefs.setBoolPref("extensions.torbutton.crashed", true);
          }
          this._prefs.setBoolPref("extensions.torbutton.normal_exit", false);
      } else if (topic == "em-action-requested") {
        // http://xulsolutions.blogspot.com/2006/07/creating-uninstall-script-for.html
        subject.QueryInterface(Components.interfaces.nsIUpdateItem);
        this.logger.log(2, "Uninstall: "+data+" "+subject.id.toUpperCase());

        if (subject.id.toUpperCase() == TORBUTTON_EXTENSION_UUID) {
          this.logger.log(2, "Uninstall: "+data);
          if (data == "item-uninstalled" || data == "item-disabled") {
            this._uninstall = true;
          } else if (data == "item-cancel-action") {
            this._uninstall = false;
          }
        }
      } else if (topic == "quit-application-granted") {
        this.logger.log(2, "Got firefox quit event.");
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
