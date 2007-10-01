/*************************************************************************
 * ContentWindowMapper (JavaScript XPCOM component)
 *
 * Allows you to find a tabbrowser tab for a top level content window.
 *
 * TODO: Implement a local cache+timer expiration so this isn't ass-slow 
 * with lots of windows open.
 *
 *************************************************************************/

// Module specific constants
const kMODULE_NAME = "Content Window Mapper";
const kMODULE_CONTRACTID = "@torproject.org/content-window-mapper;1";
const kMODULE_CID = Components.ID("b985e49c-12cb-4f29-9d14-b62603332ec4");

const Cr = Components.results;
const Cc = Components.classes;
const Ci = Components.interfaces;

function ContentWindowMapper() {

    var checkCache = function(topContentWindow) {
        return null;
    };

    var addCache = function(topContentWindow, browser) {
        return null;
    };

    this.getBrowserForContentWindow = function(topContentWindow) {
        var cached = checkCache(topContentWindow);
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
                    addCache(topContentWindow, browser);
                    return browser;
                }
            }
        }

        dump("No browser found!\n");
        return null;
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

}

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
  return new ContentWindowMapper();
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
