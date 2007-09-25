/*************************************************************************
 * Session Blocker (JavaScript XPCOM component)
 * Disables reading and writing session state without disabling the 
 * session store itself by wrapping nsIFileOutputStream and preventing it 
 * from writing sessionstore.js.
 *
 *************************************************************************/

const Cc = Components.classes;
const Ci = Components.interfaces;
const Cr = Components.results;

// Module specific constants
const kMODULE_NAME = "Session Blocking File Output Stream";
const kMODULE_CONTRACTID = "@mozilla.org/network/safe-file-output-stream;1";
const kMODULE_CID = Components.ID("9215354b-1787-4aef-9946-780f046c75a8");

/* Mozilla defined interfaces */
const kREAL_STORE_CID = "{a181af0d-68b8-4308-94db-d4f859058215}";
const kREAL_STORE = Components.classesByID[kREAL_STORE_CID];
const kStoreInterfaces = [
    "nsIFileOutputStream",
    "nsIOutputStream",
    "nsISafeOutputStream",
    "nsISeekableStream",
    "nsISupports"];

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
  _log: function(str) {
    // TODO: This could be done better/unified with the main log system..
    if(this._loglevel <= 2) {
      dump(str);
    } 
  },

  QueryInterface: function(iid) {

    if (iid.equals(Components.interfaces.nsISupports) ||
        iid.equals(Components.interfaces.nsISecurityCheckedComponent) ||
        iid.equals(Components.interfaces.nsIClassInfo)) {
      return this.QueryInterface(iid);
    }

    var store = this._store().QueryInterface(iid);
    if (store) this.copyMethods(store);
    return this;
  },

  /* 
   * Copies methods from the true sessionstore object we are wrapping
   */
  copyMethods: function(store) {
    var mimic = function(obj, method) {
      obj[method] = function(a, b, c, d, e, f, g) {
        if(this._passthrough) {
          return 0;
        }
        return store[method](a, b, c, d, e, f, g);
      };
    };
    for (var method in store) {
      if(typeof(this[method]) == "undefined") mimic(this, method);
    }
  },

  init: function(file, ioFlags , perm , behaviorFlags ) {
    this._prefs = Components.classes["@mozilla.org/preferences-service;1"]
      .getService(Components.interfaces.nsIPrefBranch);
    this._loglevel = this._prefs.getIntPref("extensions.torbutton.loglevel");
    try {
      if(this._prefs.getBoolPref("extensions.torbutton.disable_sessionstore") &&
          file.leafName == "sessionstore.js" || file.leafName == "sessionstore.bak") {
        this._passthrough = true;
        return;
      }
    } catch (e) { // permission denied to access filename 
    }
    
    this._passthrough = false;
    this._store().init(file,ioFlags,perm,behaviorFlags);
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
        !aIID.equals(Ci.nsIFactory)) {
      dump("Bad QI: "+aIID.toString());
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

