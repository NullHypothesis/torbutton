/*************************************************************************
 * Cookie Jar Selector (JavaScript XPCOM component)
 * Enables selection of separate cookie jars for (more) anonymous browsing.
 * Designed as a component of FoxTor, http://cups.cs.cmu.edu/foxtor/
 * Copyright 2006, distributed under the same (open source) license as FoxTor
 *   - XXX: ??? Which license is this? Unspecified on website/src! 
 *
 * Contributor(s):
 *         Collin Jackson <mozilla@collinjackson.com>
 *
 *************************************************************************/

// Module specific constants
const kMODULE_NAME = "Cookie Jar Selector";
const kMODULE_CONTRACTID = "@stanford.edu/cookie-jar-selector;1";
const kMODULE_CID = Components.ID("e6204253-b690-4159-bfe8-d4eedab6b3be");

function CookieJarSelector() {
  var Cc = Components.classes;
  var Ci = Components.interfaces;

  var getProfileFile = function(filename) {
    var loc = "ProfD";  // profile directory
    var file = 
      Cc["@mozilla.org/file/directory_service;1"]
      .getService(Ci.nsIProperties)
      .get(loc, Ci.nsILocalFile)
      .clone();
    file.append(filename); 
    return file;
  };

  var copyProfileFile = function(src, dest) {
    var srcfile = getProfileFile(src);    
    var destfile = getProfileFile(dest);
    if (srcfile.exists()) {
      if (destfile.exists()) {
        destfile.remove(false);
      }
      srcfile.copyTo(null, dest);
    }
  };

  var moveProfileFile = function(src, dest) { // XXX: Why does this not work?
    var srcfile = getProfileFile(src);    
    var destfile = getProfileFile(dest);
    if (srcfile.exists()) {
      if (destfile.exists()) {
        destfile.remove(false);
      }
      srcfile.moveTo(null, dest);
    }
  };

  this.clearCookies = function() {
    Cc["@mozilla.org/cookiemanager;1"]
    .getService(Ci.nsICookieManager)
    .removeAll();
  }

  this.saveCookies = function(name) {
    copyProfileFile("cookies.txt", "cookies-" + name + ".txt");
  };

  this.loadCookies = function(name, deleteSavedCookieJar) {
    var cookieManager =
      Cc["@mozilla.org/cookiemanager;1"]
      .getService(Ci.nsICookieManager);
    cookieManager.QueryInterface(Ci.nsIObserver);

    // Tell the cookie manager to unload cookies from memory and disk
    var context = "shutdown-cleanse"; 
    cookieManager.observe(this, "profile-before-change", context);

    // Replace the cookies.txt file with the loaded data
    var fn = deleteSavedCookieJar ? moveProfileFile : copyProfileFile;
    fn("cookies-" + name + ".txt", "cookies.txt");

    // Tell the cookie manager to reload cookies from disk
    cookieManager.observe(this, "profile-do-change", context);
  };

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

CookieJarSelector.prototype =
{
  QueryInterface: function(iid)
  {
    if (!iid.equals(nsIClassInfo) &&
        !iid.equals(nsISupports))
      throw Components.results.NS_ERROR_NO_INTERFACE;
    return this;
  },

  wrappedJSObject: null,  // Initialized by constructor

  // make this an nsIClassInfo object
  flags: nsIClassInfo.DOM_OBJECT,

  // method of nsIClassInfo
  classDescription: "CookieJarSelector",

  // method of nsIClassInfo
  getInterfaces: function(count) {
    var interfaceList = [nsIClassInfo];
    count.value = interfaceList.length;
    return interfaceList;
  },

  // method of nsIClassInfo
  getHelperForLanguage: function(count) { return null; },

}

var CookieJarSelectorFactory = new Object();

CookieJarSelectorFactory.createInstance = function (outer, iid)
{
  if (outer != null)
    throw Components.results.NS_ERROR_NO_AGGREGATION;

  if (!iid.equals(nsIClassInfo) &&
      !iid.equals(nsISupports))
    throw Components.results.NS_ERROR_NO_INTERFACE;

  return new CookieJarSelector();
}

var CookieJarSelectorModule = new Object();

CookieJarSelectorModule.registerSelf = 
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

CookieJarSelectorModule.getClassObject = function (compMgr, cid, iid)
{
  if (!cid.equals(kMODULE_CID))
    throw Components.results.NS_ERROR_NO_INTERFACE;

  if (!iid.equals(Components.interfaces.nsIFactory))
    throw Components.results.NS_ERROR_NOT_IMPLEMENTED;
    
  return CookieJarSelectorFactory;
}

CookieJarSelectorModule.canUnload = function (compMgr)
{
  return true;
}

function NSGetModule(compMgr, fileSpec)
{
  return CookieJarSelectorModule;
}
