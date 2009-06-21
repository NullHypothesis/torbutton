// Test protocol related
const kSCHEME = "tors";
const kPROTOCOL_NAME = "tors";
const kPROTOCOL_CONTRACTID = "@mozilla.org/network/protocol;1?name=" + kSCHEME;
const kPROTOCOL_CID = Components.ID("a5a4bc50-5e8d-11de-8a39-0800200c9a66");

// Mozilla defined
const kSIMPLEURI_CONTRACTID = "@mozilla.org/network/simple-uri;1";
const kIOSERVICE_CONTRACTID = "@mozilla.org/network/io-service;1";
const nsISupports = Components.interfaces.nsISupports;
const nsIIOService = Components.interfaces.nsIIOService;
const nsIProtocolHandler = Components.interfaces.nsIProtocolHandler;
const nsIURI = Components.interfaces.nsIURI;

function Protocol()
{
}

Protocol.prototype =
{
  QueryInterface: function(iid)
  {
    if (!iid.equals(nsIProtocolHandler) &&
        !iid.equals(nsISupports))
      throw Components.results.NS_ERROR_NO_INTERFACE;
    return this;
  },

  scheme: kSCHEME,
  defaultPort: -1,
  protocolFlags: nsIProtocolHandler.URI_NORELATIVE |
                 nsIProtocolHandler.URI_NOAUTH,
  
  allowPort: function(port, scheme)
  {
    return false;
  },

  newURI: function(spec, charset, baseURI)
  {
    const nsIStandardURL = Components.interfaces.nsIStandardURL;
    var uri = Components.classes["@mozilla.org/network/standard-url;1"].createInstance(nsIStandardURL);
    uri.init(nsIStandardURL.URLTYPE_STANDARD, 433, spec, charset, baseURI);

    return uri.QueryInterface(Components.interfaces.nsIURI);

  },

  newChannel: function(aURI)
  {
    /*The protocol has been called, therefore we want to enable tor, wait for it to activate return the new channel with the scheme of https.*/
    var ios = Components.classes[kIOSERVICE_CONTRACTID].getService(nsIIOService);
    var prompt = Components.classes["@mozilla.org/embedcomp/prompt-service;1"]
                        .getService(Components.interfaces.nsIPromptService);
    var prefs = Components.classes["@mozilla.org/preferences-service;1"]
        .getService(Components.interfaces.nsIPrefBranch);
    var tor_enabled = prefs.getBoolPref("extensions.torbutton.tor_enabled");
    var wm = Components.classes["@mozilla.org/appshell/window-mediator;1"]
                         .getService(Components.interfaces.nsIWindowMediator);
    var chrome = wm.getMostRecentWindow("navigator:browser");
    if (!ios.allowPort(aURI.port, aURI.scheme))
      throw Components.results.NS_ERROR_FAILURE;
    
    if (!tor_enabled)
    {
      var result = prompt.confirm(null, "Allow Tor toggle?", "Do you want to enable Tor and navigate to " + aURI.spec + "?");   
      if (!result)
        throw Components.results.NS_ERROR_UNEXPECTED;        
      chrome.torbutton_enable_tor(true);    
    } 
    
    //if tor is turned on then, else we should throw exception of some sort.
    tor_enabled = prefs.getBoolPref("extensions.torbutton.tor_enabled");
    if (!tor_enabled)
        throw Components.results.NS_ERROR_UNEXPECTED;
    else
    {
        aURI.scheme = "https";    
        return ios.newChannelFromURI(aURI);
    }      
  },
}

var ProtocolFactory = new Object();

ProtocolFactory.createInstance = function (outer, iid)
{
  if (outer != null)
    throw Components.results.NS_ERROR_NO_AGGREGATION;

  if (!iid.equals(nsIProtocolHandler) &&
      !iid.equals(nsISupports))
    throw Components.results.NS_ERROR_NO_INTERFACE;

  return new Protocol();
}


/**
 * JS XPCOM component registration goop:
 *
 * We set ourselves up to observe the xpcom-startup category.  This provides
 * us with a starting point.
 */

var TestModule = new Object();

TestModule.registerSelf = function (compMgr, fileSpec, location, type)
{
  compMgr = compMgr.QueryInterface(Components.interfaces.nsIComponentRegistrar);
  compMgr.registerFactoryLocation(kPROTOCOL_CID,
                                  kPROTOCOL_NAME,
                                  kPROTOCOL_CONTRACTID,
                                  fileSpec, 
                                  location, 
                                  type);
}

TestModule.getClassObject = function (compMgr, cid, iid)
{
  if (!cid.equals(kPROTOCOL_CID))
    throw Components.results.NS_ERROR_NO_INTERFACE;

  if (!iid.equals(Components.interfaces.nsIFactory))
    throw Components.results.NS_ERROR_NOT_IMPLEMENTED;
    
  return ProtocolFactory;
}

TestModule.canUnload = function (compMgr)
{
  return true;
}

function NSGetModule(compMgr, fileSpec)
{
  return TestModule;
}

