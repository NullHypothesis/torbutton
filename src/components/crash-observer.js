/*************************************************************************
 * Crash observer (JavaScript XPCOM component)
 *
 * Provides the chrome with a notification ("extensions.torbutton.crashed"
 * pref event) that the browser in fact crashed. Does this by hooking
 * the sessionstore.
 *
 *************************************************************************/

const Cc = Components.classes;
const Ci = Components.interfaces;
const Cr = Components.results;

// Module specific constants
const kMODULE_NAME = "Sesstion crash detector";
const kMODULE_CONTRACTID = "@mozilla.org/browser/sessionstartup;1";
const kMODULE_CID = Components.ID("9215354b-1787-4aef-9946-780f046c75a9");

/* Mozilla defined interfaces */
const kREAL_STORE_CID = "{ec7a6c20-e081-11da-8ad9-0800200c9a66}";
const kREAL_STORE = Components.classesByID[kREAL_STORE_CID];
const kStoreInterfaces = ["nsISessionStartup", "nsIObserver", 
                          "nsISupportsWeakReference"];

var StartupObserver = {
    observe: function(aSubject, aTopic, aData) {
      if(aTopic == "final-ui-startup") {
          Components.classes["@mozilla.org/preferences-service;1"]
              .getService(Components.interfaces.nsIPrefBranch)
              .setBoolPref("extensions.torbutton.startup", true);
      } 
    },
};

function StoreWrapper() {
  this._prefs = Components.classes["@mozilla.org/preferences-service;1"]
      .getService(Components.interfaces.nsIPrefBranch);

  this._store = function() {
    var store = kREAL_STORE.getService();
    for (var i = 0; i < kStoreInterfaces.length; i++) {
      store.QueryInterface(Components.interfaces[kStoreInterfaces[i]]);
    }
    return store;
  };
}

StoreWrapper.prototype =
{
  QueryInterface: function(iid) {

    if (iid.equals(Components.interfaces.nsISupports) ||
        iid.equals(Components.interfaces.nsIClassInfo)) {
      return this.QueryInterface(iid);
    }

    try {
        var store = this._store().QueryInterface(iid);
        if (store) this.copyMethods(store);
    } catch(e) {
        dump("Exception on QI for crash detector\n");
        Components.returnCode = Cr.NS_ERROR_NO_INTERFACE;
        return null;
    }
    return this;
  },

  /* 
   * Copies methods from the true sessionstore object we are wrapping
   */
  copyMethods: function(store) {
    var mimic = function(obj, method) {
      if(typeof(store[method]) == "function") {
          obj[method] = function(a, b, c, d, e, f, g) {
              return store[method](a, b, c, d, e, f, g);
          };
      } else {
          obj.__defineGetter__(method, function() { return store[method]; });
          obj.__defineSetter__(method, function(val) { store[method] = val; });
      }
    };
    for (var method in store) {
      if(typeof(this[method]) == "undefined") mimic(this, method);
    }
  },

  observe: function sss_observe(aSubject, aTopic, aData) {
    if(aTopic == "app-startup") {
      this._startup = true;
      var observerService = Cc["@mozilla.org/observer-service;1"].
          getService(Ci.nsIObserverService);

      observerService.addObserver(StartupObserver, "final-ui-startup", false);
    } 
    this._store().observe(aSubject, aTopic, aData);
  },

  doRestore: function sss_doRestore() {
    var ret = false;
    // This is so lame. But the exposed API is braindead so it 
    // must be hacked around
    if((ret = this._store().doRestore()) && this._startup) {
        this._prefs.setBoolPref("extensions.torbutton.crashed", true);
    } 
    this._startup = false;
    return ret;
  },
};
 
const StoreWrapperFactory = {

  createInstance: function(aOuter, aIID) {
    if (aOuter != null) {
      Components.returnCode = Cr.NS_ERROR_NO_AGGREGATION;
      return null;
    }
    
    return (new StoreWrapper()).QueryInterface(aIID);
  },
  
  lockFactory: function(aLock) { },
  
  QueryInterface: function(aIID) {
    if (!aIID.equals(Ci.nsISupports) && !aIID.equals(Ci.nsIModule) &&
        !aIID.equals(Ci.nsIFactory) && !aIID.equals(Ci.nsISessionStore)) {
      Components.returnCode = Cr.NS_ERROR_NO_INTERFACE;
      return null;
    }
    
    return this;
  }
};



/**
 * JS XPCOM component registration goop:
 *
 * Everything below is boring boilerplate and can probably be ignored.
 */

var StoreWrapperModule = new Object();

StoreWrapperModule.registerSelf = 
function (compMgr, fileSpec, location, type){
  var nsIComponentRegistrar = Components.interfaces.nsIComponentRegistrar;
  compMgr = compMgr.QueryInterface(nsIComponentRegistrar);
  compMgr.registerFactoryLocation(kMODULE_CID,
                                  kMODULE_NAME,
                                  kMODULE_CONTRACTID,
                                  fileSpec, 
                                  location, 
                                  type);
};

StoreWrapperModule.getClassObject = function (compMgr, cid, iid)
{
  if (cid.equals(kMODULE_CID)) {
      return StoreWrapperFactory;
  }
  Components.returnCode = Cr.NS_ERROR_NOT_REGISTERED;
  return null;
};

StoreWrapperModule.canUnload = function (compMgr)
{
  return true;
};

function NSGetModule(compMgr, fileSpec)
{
  return StoreWrapperModule;
}

