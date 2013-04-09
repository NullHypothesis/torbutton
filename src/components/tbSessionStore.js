// Bug 1506 P4: This code blocks the session store from being written to
// disk. It is fairly important, but only one small piece is needed. Search
// this file for 1506 for more details.

/*************************************************************************
 * Torbutton Session Store Control
 *
 * Uses the new Firefox 3.5+ session store APIs to prevent writing
 * of tor-loaded tabs to disk.
 *
 *************************************************************************/

// Module specific constants
const kMODULE_NAME = "Torbutton Session Store Blocker";
const kMODULE_CONTRACTID = "@torproject.org/torbutton-ss-blocker;1";
const kMODULE_CID = Components.ID("aef08952-b003-4697-b935-a392367e214f");

const Cr = Components.results;
const Cc = Components.classes;
const Ci = Components.interfaces;
const Cu = Components.utils;

function TBSessionBlocker() {
    this.logger = Components.classes["@torproject.org/torbutton-logger;1"]
        .getService(Components.interfaces.nsISupports).wrappedJSObject;
    this.logger.log(3, "Torbutton Session Store Blocker initialized");

    var obsSvc = Components.classes["@mozilla.org/observer-service;1"]
        .getService(Ci.nsIObserverService);
    obsSvc.addObserver(this, "sessionstore-state-write", false);
    this.prefs = Components.classes["@mozilla.org/preferences-service;1"]
        .getService(Components.interfaces.nsIPrefBranch);

    this.wrappedJSObject = this;
}

TBSessionBlocker.prototype =
{
  QueryInterface: function(iid) {
    if (!iid.equals(Ci.nsIClassInfo) &&
        !iid.equals(Ci.nsIObserver) &&
        !iid.equals(Ci.nsISupports)) {
      Components.returnCode = Cr.NS_ERROR_NO_INTERFACE;
      return null;
    }
    return this;
  },

  wrappedJSObject: null,  // Initialized by constructor

  // make this an nsIClassInfo object
  flags: Ci.nsIClassInfo.DOM_OBJECT,

  // method of nsIClassInfo
  classDescription: kMODULE_NAME,
  classID: kMODULE_CID,
  contractID: kMODULE_CONTRACTID,

  // Hack to get us registered early enough to observe the session store.
  _xpcom_categories: [{category:"profile-after-change"}],

  // method of nsIClassInfo
  getInterfaces: function(count) {
    var interfaceList = [Ci.nsIClassInfo];
    count.value = interfaceList.length;
    return interfaceList;
  },

  // method of nsIClassInfo
  getHelperForLanguage: function(count) { return null; },

  _walkObj: function(soFar, obj) {
    for (let m in obj) {
      this.logger.log(2, soFar+"."+m);
      if (obj[m] != obj)
        this._walkObj(soFar+"."+m, obj[m]);
    }
  },

  // observer interface implementation
  // topic:   what event occurred
  // subject: what nsIPrefBranch we're observing
  // data:    which pref has been changed (relative to subject)
  observe: function(subject, topic, data)
  {
      if (topic != "sessionstore-state-write") return;
      this.logger.log(3, "Got Session Store observe: "+topic);
      subject = subject.QueryInterface(Ci.nsISupportsString);

      // Bug 1506: This is the only important bit, other than
      // the registration goop. You don't even need the JSON 
      // garbage...
      // 
      // Simply block sessionstore writes entirely in Tor Browser
      try {
        if (this.prefs.getBoolPref("extensions.torbutton.block_disk")) {
          this.logger.log(3, "Blocking SessionStore write in Tor Browser");
          subject.data = null;
          return;
        }
      } catch(e) {
          this.logger.log(5, "Error blocking SessionStore write in Tor Browser: "+e);
      }

      return;
  }

};

/**
* XPCOMUtils.generateNSGetFactory was introduced in Mozilla 2 (Firefox 4).
* XPCOMUtils.generateNSGetModule is for Mozilla 1.9.2 (Firefox 3.6).
*/
Components.utils.import("resource://gre/modules/XPCOMUtils.jsm");
// XXX: This won't work for FF3... We need to not register ourselves here..
if (XPCOMUtils.generateNSGetFactory)
  var NSGetFactory = XPCOMUtils.generateNSGetFactory([TBSessionBlocker]);
else
  var NSGetModule = XPCOMUtils.generateNSGetModule([TBSessionBlocker]);
