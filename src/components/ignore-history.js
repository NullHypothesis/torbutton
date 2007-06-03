/*************************************************************************
 * Ignore History (JavaScript XPCOM component)
 * Disables reading and writing history. This component is implemented as a
 * wrapper around the true history object that sometimes lies about isVisited
 * queries and sometimes ignores addURI commands.
 * Designed as a component of FoxTor, http://cups.cs.cmu.edu/foxtor/
 * Copyright 2006, distributed under the same (open source) license as FoxTor
 *   - XXX: ??? Which license is this? Unspecified on website/src! 
 *
 * Contributor(s):
 *         Collin Jackson <mozilla@collinjackson.com>
 *
 *************************************************************************/

// Module specific constants
const kTORBUTTON_STATUS_PREF = "extensions.torbutton.tor_enabled";
const kSTATUS_THRESHOLD = 300;  // ignore history if status >= threshold
const kMODULE_NAME = "Ignore History";
const kMODULE_CONTRACTID = "@mozilla.org/browser/global-history;2";
const kMODULE_CID = Components.ID("bc666d45-a9a1-4096-9511-f6db6f686881");

/* Mozilla defined interfaces */
const kREAL_HISTORY_CID = "{59648a91-5a60-4122-8ff2-54b839c84aed}";
const kREAL_HISTORY = Components.classesByID[kREAL_HISTORY_CID];
const kHistoryInterfaces = [ "nsIBrowserHistory", "nsIGlobalHistory2" ];

function HistoryWrapper() {
  this._history = function() {
    var history = kREAL_HISTORY.getService();
    for (var i = 0; i < kHistoryInterfaces.length; i++) {
      history.QueryInterface(Components.interfaces[kHistoryInterfaces[i]]);
    }
    return history;
  };
}

HistoryWrapper.prototype =
{
  QueryInterface: function(iid) {

    if (iid.equals(Components.interfaces.nsISupports)) {
      return this;
    }

    var history = this._history().QueryInterface(iid);
    this.copyMethods(history);
    return this;
  },

  /*
   * Determine whether we should hide visited links
   */
  getIgnoreHistoryPref: function() {
    return Components.classes["@mozilla.org/preferences-service;1"]
                     .getService(Components.interfaces.nsIPrefBranch)
                     .getBoolPref(kTORBUTTON_STATUS_PREF);
  },

  /* 
   * Copies methods from the true history object we are wrapping
   */
  copyMethods: function(history) {
    var mimic = function(obj, method) {
      obj[method] = function(a, b, c, d, e, f, g) {
        history[method](a, b, c, d, e, f, g);
      };
    };
    for (var method in history) {
      if(typeof(this[method]) == "undefined") mimic(this, method);
    }
  },

  /* 
   * Maybe lie about whether link was visited
   */ 
  isVisited: function(aURI) {
    return (!this.getIgnoreHistoryPref() && 
            this._history().isVisited(aURI));
  },

  /*
   * Maybe add the URI to the history
   */
  addURI: function(aURI, redirect, toplevel, referrer) { 
    // XXX: make it possible to make history writeonly.     
    if(!this.getIgnoreHistoryPref())
      this._history().addURI(aURI, redirect, toplevel, referrer);
  },

  /*
   * Maybe set the title of a URI in the history
   */
  setPageTitle: function(URI, title) {
    if(!this.getIgnoreHistoryPref())
      this._history().setPageTitle(URI, title);
  },

  count getter: function() { return this._history().count; },
};
 
var HistoryWrapperSingleton = null;
var HistoryWrapperFactory = new Object();

HistoryWrapperFactory.createInstance = function (outer, iid)
{
  if (outer != null)
    throw Components.results.NS_ERROR_NO_AGGREGATION;

  if (!iid.equals(Components.interfaces.nsIGlobalHistory2) &&
      !iid.equals(Components.interfaces.nsIBrowserHistory) &&
      !iid.equals(Components.interfaces.nsISupports))
    throw Components.results.NS_ERROR_NO_INTERFACE;

  if(!HistoryWrapperSingleton)
    HistoryWrapperSingleton = new HistoryWrapper();

  return HistoryWrapperSingleton;
};


/**
 * JS XPCOM component registration goop:
 *
 * Everything below is boring boilerplate and can probably be ignored.
 */

var HistoryWrapperModule = new Object();

// XXX: Interesting.. Can we more easily override Date this way?
HistoryWrapperModule.registerSelf = 
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

HistoryWrapperModule.getClassObject = function (compMgr, cid, iid)
{
  if (!cid.equals(kMODULE_CID))
    throw Components.results.NS_ERROR_NO_INTERFACE;

  if (!iid.equals(Components.interfaces.nsIFactory))
    throw Components.results.NS_ERROR_NOT_IMPLEMENTED;
    
  return HistoryWrapperFactory;
};

HistoryWrapperModule.canUnload = function (compMgr)
{
  return true;
};

function NSGetModule(compMgr, fileSpec)
{
  return HistoryWrapperModule;
}

