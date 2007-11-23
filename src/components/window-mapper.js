/*************************************************************************
 * ContentWindowMapper (JavaScript XPCOM component)
 *
 * Allows you to find a tabbrowser tab for a top level content window.
 *
 *************************************************************************/

// Module specific constants
const kMODULE_NAME = "Content Window Mapper";
const kMODULE_CONTRACTID = "@torproject.org/content-window-mapper;1";
const kMODULE_CID = Components.ID("b985e49c-12cb-4f29-9d14-b62603332ec4");

const Cr = Components.results;
const Cc = Components.classes;
const Ci = Components.interfaces;
const EXPIRATION_TIME = 60000; // 60 seconds

const nsISupports = Components.interfaces.nsISupports;
const nsIClassInfo = Components.interfaces.nsIClassInfo;
const nsIComponentRegistrar = Components.interfaces.nsIComponentRegistrar;
const nsIObserverService = Components.interfaces.nsIObserverService;

function ContentWindowMapper() {
    this.cache = new Object();
    this.cache["bah"] = 0;

    this.logger = Components.classes["@torproject.org/torbutton-logger;1"]
        .getService(Components.interfaces.nsISupports).wrappedJSObject;
        

  // This JSObject is exported directly to chrome
  this.wrappedJSObject = this;
}

ContentWindowMapper.prototype =
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
  classDescription: "ContentWindowMapper",

  // method of nsIClassInfo
  getInterfaces: function(count) {
    var interfaceList = [nsIClassInfo];
    count.value = interfaceList.length;
    return interfaceList;
  },

  // method of nsIClassInfo
  getHelperForLanguage: function(count) { return null; },


  checkCache: function(topContentWindow) {
      if(typeof(this.cache[topContentWindow]) != "undefined") {
          this.logger.log(1, "Found cached element for: "+topContentWindow.location);
          return this.cache[topContentWindow].browser;
      }

      return null;
  },

  addCache: function(topContentWindow, browser) {
      var insertion = new Object();
      insertion.browser = browser;
      insertion.time = Date.now();
      this.cache[topContentWindow] = insertion; 
      this.logger.log(2, "Cached element: "+topContentWindow.location);
  },

  expireOldCache: function() {
      var now = Date.now();

      for(var elem in this.cache) {
          if((now - this.cache[elem].time) > EXPIRATION_TIME) {
              this.logger.log(2, "Deleting cached element: "+elem.location);
              delete this.cache[elem];
          }
      }
      for(var elem in this.cache) {
          if((now - this.cache[elem].time) > EXPIRATION_TIME) {
              this.logger.log(4, "ELEMENT STILL REMAINS: "+elem.location);
              delete this.cache[elem];
          }
      }
  },

  getBrowserForContentWindow: function(topContentWindow) {
      if(topContentWindow instanceof Components.interfaces.nsIDOMChromeWindow) {
          this.logger.log(3, "Chrome browser found: "+topContentWindow.location);
          return topContentWindow.getBrowser().selectedTab.linkedBrowser;
      }

      var cached = this.checkCache(topContentWindow);
      if(cached != null) return cached;

      var wm = Components.classes["@mozilla.org/appshell/window-mediator;1"]
          .getService(Components.interfaces.nsIWindowMediator);
      var enumerator = wm.getEnumerator("navigator:browser");
      while(enumerator.hasMoreElements()) {
          var win = enumerator.getNext();
          var browser = win.getBrowser(); 
          for (var i = 0; i < browser.browsers.length; ++i) {
              var b = browser.browsers[i];
              if (b && b.contentWindow == topContentWindow) {
                  this.addCache(topContentWindow, browser);
                  return browser;
              }
          }
      }

      if(topContentWindow && topContentWindow.location)
          this.logger.log(5, "No browser found: "+topContentWindow.location);
      else
          this.logger.log(5, "No browser found!");

      return null;
  }
}

/**
 * JS XPCOM component registration goop:
 *
 * Everything below is boring boilerplate and can probably be ignored.
 */

var ContentWindowMapperInstance = null;
var ContentWindowMapperFactory = new Object();

ContentWindowMapperFactory.createInstance = function (outer, iid)
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
  if(ContentWindowMapperInstance == null)
      ContentWindowMapperInstance = new ContentWindowMapper();

  return ContentWindowMapperInstance;
}

var ContentWindowMapperModule = new Object();

ContentWindowMapperModule.registerSelf = 
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

ContentWindowMapperModule.getClassObject = function (compMgr, cid, iid)
{
  if (cid.equals(kMODULE_CID))
    return ContentWindowMapperFactory;


  Components.returnCode = Cr.NS_ERROR_NOT_REGISTERED;
  return null;
}

ContentWindowMapperModule.canUnload = function (compMgr)
{
  return true;
}

function NSGetModule(compMgr, fileSpec)
{
  return ContentWindowMapperModule;
}
