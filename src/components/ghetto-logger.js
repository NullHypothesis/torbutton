/*************************************************************************
 * GhettoLogger (JavaScript XPCOM component)
 *
 * Allows loglevel-based logging to the console (via dump)
 *
 *************************************************************************/

// Module specific constants
const kMODULE_NAME = "Ghetto Logger";
const kMODULE_CONTRACTID = "@torproject.org/ghetto-logger;1";
const kMODULE_CID = Components.ID("f36d72c9-9718-4134-b550-e109638331d7");

const Cr = Components.results;
const Cc = Components.classes;
const Ci = Components.interfaces;

function GhettoLogger() {
    var prefs = Components.classes["@mozilla.org/preferences-service;1"]
        .getService(Components.interfaces.nsIPrefBranch);
    this._loglevel = prefs.getIntPref("extensions.torbutton.loglevel");

    this.log = function(level, str) {
        // TODO: This could be done better/unified with the main log system..
        if(this._loglevel <= level) {
            dump(str);
        } 
    },

    // This JSObject is exported directly to chrome
    this.wrappedJSObject = this;
}

/**
 * JS XPCOM component registration goop:
 *
 * Everything below is boring boilerplate and can probably be ignored.
 */

const nsISupports = Components.interfaces.nsISupports;
const nsIClassInfo = Components.interfaces.nsIClassInfo;
const nsIComponentRegistrar = Components.interfaces.nsIComponentRegistrar;
const nsIObserverService = Components.interfaces.nsIObserverService;

GhettoLogger.prototype =
{
  QueryInterface: function(iid)
  {
    if (!iid.equals(nsIClassInfo) &&
        !iid.equals(nsISupports)) {
      Components.returnCode = Cr.NS_ERROR_NO_INTERFACE;
      return null;
    }
    return this;
  },

  wrappedJSObject: null,  // Initialized by constructor

  // make this an nsIClassInfo object
  flags: nsIClassInfo.DOM_OBJECT,

  // method of nsIClassInfo
  classDescription: "GhettoLogger",

  // method of nsIClassInfo
  getInterfaces: function(count) {
    var interfaceList = [nsIClassInfo];
    count.value = interfaceList.length;
    return interfaceList;
  },

  // method of nsIClassInfo
  getHelperForLanguage: function(count) { return null; },

}

var GhettoLoggerInstance = null;
var GhettoLoggerFactory = new Object();

GhettoLoggerFactory.createInstance = function (outer, iid)
{
  if (outer != null) {
    Components.returnCode = Cr.NS_ERROR_NO_AGGREGATION;
    return null;
  }
  if (!iid.equals(nsIClassInfo) &&
      !iid.equals(nsISupports)) {
    Components.returnCode = Cr.NS_ERROR_NO_INTERFACE;
    return null;
  }
  if(GhettoLoggerInstance == null)
      GhettoLoggerInstance = new GhettoLogger();

  return GhettoLoggerInstance;
}

var GhettoLoggerModule = new Object();

GhettoLoggerModule.registerSelf = 
function (compMgr, fileSpec, location, type)
{
  compMgr = compMgr.QueryInterface(nsIComponentRegistrar);
  compMgr.registerFactoryLocation(kMODULE_CID,
                                  kMODULE_NAME,
                                  kMODULE_CONTRACTID,
                                  fileSpec, 
                                  location, 
                                  type);
}

GhettoLoggerModule.getClassObject = function (compMgr, cid, iid)
{
  if (cid.equals(kMODULE_CID))
    return GhettoLoggerFactory;


  Components.returnCode = Cr.NS_ERROR_NOT_REGISTERED;
  return null;
}

GhettoLoggerModule.canUnload = function (compMgr)
{
  return true;
}

function NSGetModule(compMgr, fileSpec)
{
  return GhettoLoggerModule;
}
