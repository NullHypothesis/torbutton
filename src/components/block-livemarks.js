/*************************************************************************
 * Block Livemarks (JavaScript XPCOM component)
 *
 * The livemark service start() method is run on a 5 second delay timer
 * after startup. The safest way to block this is to hook the component.
 *************************************************************************/

// Module specific constants
const kMODULE_NAME = "Block Tor Livemarks";
const kMODULE_CONTRACTID = "@mozilla.org/browser/livemark-service;2";
const kMODULE_CID = Components.ID("24892630-d5f3-4af8-9662-e1d6479c5290");

/* Mozilla defined interfaces for FF3.x */
const kREAL_CID = "{dca61eb5-c7cd-4df1-b0fb-d0722baba251}";

const kImplementedInterfaces = [ "nsIFactory",
                                 "nsILivemarkService",
                                 "nsINavBookmarkObserver" ];
const Cr = Components.results;

function LivemarkWrapper() {
  this.logger = Components.classes["@torproject.org/torbutton-logger;1"]
      .getService(Components.interfaces.nsISupports).wrappedJSObject;
  this.logger.log(3, "Component Load 6: New LivemarkWrapper "+kMODULE_CONTRACTID);

  // assuming we're running under Firefox
  var appInfo = Components.classes["@mozilla.org/xre/app-info;1"]
      .getService(Components.interfaces.nsIXULAppInfo);
  var versionChecker = Components.classes["@mozilla.org/xpcom/version-comparator;1"]
      .getService(Components.interfaces.nsIVersionComparator);

  this._real_service = Components.classesByID[kREAL_CID];
  this._interfaces = kImplementedInterfaces;

  this._prefs = Components.classes["@mozilla.org/preferences-service;1"]
      .getService(Components.interfaces.nsIPrefBranch);

  this._service = function() {
    var service = this._real_service.getService();
    for (var i = 0; i < this._interfaces.length; i++) {
      service.QueryInterface(Components.interfaces[this._interfaces[i]]);
    }
    return service;
  };

  this.copyMethods(this._service());
}

LivemarkWrapper.prototype =
{
  QueryInterface: function(iid) {
    if (iid.equals(Components.interfaces.nsISupports)) {
      return this;
    }

    var service = this._service().QueryInterface(iid);
    this.copyMethods(service);
    return this;
  },

  /*
   * Copies methods from the true service object we are wrapping
   */
  copyMethods: function(wrapped) {
    var mimic = function(newObj, method) {
       if(typeof(wrapped[method]) == "function") {
          // Code courtesy of timeless: 
          // http://www.webwizardry.net/~timeless/windowStubs.js
          var params = [];
          params.length = wrapped[method].length;
          var x = 0;
          var call;
          if(params.length) call = "("+params.join().replace(/(?:)/g,function(){return "p"+(++x)})+")";
          else call = "()";
          var fun = "(function "+call+"{"+
            "if (arguments.length < "+wrapped[method].length+")"+
            "  throw Components.results.NS_ERROR_XPC_NOT_ENOUGH_ARGS;"+
            "return wrapped."+method+".apply(wrapped, arguments);})";
          newObj[method] = eval(fun);
       } else {
          newObj.__defineGetter__(method, function() { return wrapped[method]; });
          newObj.__defineSetter__(method, function(val) { wrapped[method] = val; });
      }
    };
    for (var method in wrapped) {
      if(typeof(this[method]) == "undefined") mimic(this, method);
    }
  },

  /* Because start runs on a delayed timer at startup, we must hook it block
   * it */
  start: function() {
    if(this._prefs.getBoolPref("extensions.torbutton.disable_livemarks")
            && this._prefs.getBoolPref("extensions.torbutton.tor_enabled")) {
      this.logger.log(3, "Blocked livemarks start from component");
      return;
    } else {
      return this._service().start();
    }
  }
};

var LivemarkWrapperSingleton = null;
var LivemarkWrapperFactory = new Object();

LivemarkWrapperFactory.createInstance = function (outer, iid)
{
  if (outer != null) {
    Components.returnCode = Cr.NS_ERROR_NO_AGGREGATION;
    return null;
  }

  if(!LivemarkWrapperSingleton)
    LivemarkWrapperSingleton = new LivemarkWrapper();

  return LivemarkWrapperSingleton;
};


/**
 * JS XPCOM component registration goop:
 *
 * Everything below is boring boilerplate and can probably be ignored.
 */

var LivemarkWrapperModule = new Object();

LivemarkWrapperModule.registerSelf =
function (compMgr, fileSpec, location, type) {
  var nsIComponentRegistrar = Components.interfaces.nsIComponentRegistrar;
  compMgr = compMgr.QueryInterface(nsIComponentRegistrar);

  var appInfo = Components.classes["@mozilla.org/xre/app-info;1"]
      .getService(Components.interfaces.nsIXULAppInfo);
  var versionChecker = Components.classes["@mozilla.org/xpcom/version-comparator;1"]
      .getService(Components.interfaces.nsIVersionComparator);

  if(versionChecker.compare(appInfo.version, "3.5a1") >= 0) {
      compMgr.registerFactoryLocation(kMODULE_CID,
              kMODULE_NAME,
              kMODULE_CONTRACTID,
              fileSpec,
              location,
              type);
  }
};

LivemarkWrapperModule.getClassObject = function (compMgr, cid, iid)
{
  if (cid.equals(kMODULE_CID))
    return LivemarkWrapperFactory;

  Components.returnCode = Cr.NS_ERROR_NOT_REGISTERED;
  return null;
};

LivemarkWrapperModule.canUnload = function (compMgr)
{
  return true;
};

function NSGetModule(compMgr, fileSpec)
{
  return LivemarkWrapperModule;
}

