// Bug 1506 P0: I don't really believe referers matter in the grand scheme.
// Kill this code.

const kMODULE_CID = Components.ID("65be2be0-ceb4-44c2-91a5-9c75c53430bf");
const kMODULE_CONTRACTID = "@torproject.org/torRefSpoofer;1";

function RefSpoofer() {
 this.logger = Components.classes["@torproject.org/torbutton-logger;1"].getService(Components.interfaces.nsISupports).wrappedJSObject;
 this.logger.log(3, "RefSpoof component created");
 this.specials = /[-[\]{}()*+?.,\\^$|#\s]/g;
}


RefSpoofer.prototype = {    
  observe: function(subject, topic, data)
  {
    if (topic == "http-on-modify-request") {
      var prefs = Components.classes["@mozilla.org/preferences-service;1"]
      .getService(Components.interfaces.nsIPrefBranch);    
      var tor_enabled = prefs.getBoolPref("extensions.torbutton.tor_enabled");
      
      if (!tor_enabled)
        return;
        
      subject.QueryInterface(Components.interfaces.nsIHttpChannel);
      this.onModifyRequest(subject);
      return;
    }
    if (topic == "profile-after-change") {
      this.logger.log(3, "RefSpoof got profile-after-change");
      var os = Components.classes["@mozilla.org/observer-service;1"].getService(Components.interfaces.nsIObserverService);
      os.addObserver(this, "http-on-modify-request", false);
      return;
    }
  },
  onModifyRequest: function(oHttpChannel)
  {
    var prefs = Components.classes["@mozilla.org/preferences-service;1"].getService(Components.interfaces.nsIPrefBranch);
    
    var spoofmode = prefs.getIntPref("extensions.torbutton.refererspoof");
    
    var ios = Components.classes["@mozilla.org/network/io-service;1"]
                    .getService(Components.interfaces.nsIIOService);

    if (spoofmode == 0)
    try {
      oHttpChannel.QueryInterface(Components.interfaces.nsIChannel);
      var referer;
      try{
        referer = oHttpChannel.getRequestHeader("Referer");
        referer = ios.newURI(referer,null,null);//make a nsIURI object for referer
      }catch(referr) {
        return;//no referer available or invalid uri
      }
      var requestURI = oHttpChannel.URI; //request nsIURI object
      var destHost = referer.host; //referer host w/o scheme
      var srcHost = oHttpChannel.URI.host;//request host without scheme

      // match is not what we want, unless we escape dots:
      var destHostMatch = destHost.replace(this.specials, "\\$&");
      var srcHostMatch = srcHost.replace(this.specials, "\\$&");

      // FIXME: This isn't exactly bulletproof security here, but it still
      // may need to be more lenient not to break sites...
      //
      // If we suspect issues, we can try doing the following first:
      // 1. Strip off all TLD suffixes, up to but not including '.'
      // 2. If more than one domain part is till left, strip off prefix

      //if they're in the same domain(if we can tell) or have the same host, keep the referer
      if (srcHost.split(".").length >= destHost.split(".").length
          && srcHost.match(destHostMatch)) // dest is a substring of src
        return;
      else if (destHost.split(".").length >= srcHost.split(".").length
          && destHost.match(srcHostMatch)) // src is a substring of dest
        return;
      //if they do not have the same host
      this.adjustRef(oHttpChannel, requestURI.scheme + "://" + requestURI.host);      
      this.logger.safe_log(3, "Adjusting Referer, ",
                          "from " + destHost + " to " + requestURI.host);
    }
     catch (ex) {
      this.logger.log(5, "RefSpoof onModifyRequest: " +ex);
    }
    else if (spoofmode == 2)
      this.adjustRef(oHttpChannel, "");
  },
  adjustRef: function(oChannel, sRef)
  {
    try {
      if (oChannel.referrer)
      {
        oChannel.referrer.spec = sRef;
        oChannel.setRequestHeader("Referer", sRef, false);
      }
      return true;
    } 
    catch (ex) {
      this.logger.log(5, "RefSpoof adjustRef: " +ex);
    }
    return false;
  },
  QueryInterface: function(iid)
  {
    if (!iid.equals(Components.interfaces.nsISupports) &&
      !iid.equals(Components.interfaces.nsIObserver) &&
      !iid.equals(Components.interfaces.nsISupportsWeakReference))
      throw Components.results.NS_ERROR_NO_INTERFACE;    
    return this;
  },
  _xpcom_categories: [{category:"profile-after-change"}],
  classID: kMODULE_CID,
  contractID: kMODULE_CONTRACTID,
  classDescription: "Tor Ref Spoofer"
};

/**
* XPCOMUtils.generateNSGetFactory was introduced in Mozilla 2 (Firefox 4).
* XPCOMUtils.generateNSGetModule is for Mozilla 1.9.2 (Firefox 3.6).
*/
Components.utils.import("resource://gre/modules/XPCOMUtils.jsm");
if (XPCOMUtils.generateNSGetFactory)
    var NSGetFactory = XPCOMUtils.generateNSGetFactory([RefSpoofer]);
else
    var NSGetModule = XPCOMUtils.generateNSGetModule([RefSpoofer]);
