const kMODULE_CID = Components.ID("65be2be0-ceb4-44c2-91a5-9c75c53430bf");
const kMODULE_CONTRACTID = "@torproject.org/torRefSpoofer;1";

function RefSpoofer() {
 this.logger = Components.classes["@torproject.org/torbutton-logger;1"].getService(Components.interfaces.nsISupports).wrappedJSObject;
 this.logger.log(3, "RefSpoof component created");
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
      var refererHost = referer.host; //referer host w/o scheme
      var requestHost = oHttpChannel.URI.host;//request host without scheme
      
      //get rid of www. to compare root domain
      if (refererHost.match("^www."))
        refererHost = refererHost.substring(4);
      
      if (requestHost.match("^www."))
        requestHost = requestHost.substring(4);
 
      //if they're in the same domain(if we can tell) or have the same host, keep the referer     
      if (requestHost.split(".").length >= refererHost.split(".").length && requestHost.match(refererHost))
        return;
      else if (refererHost.split(".").length >= requestHost.split(".").length && refererHost.match(requestHost))
        return;
      //if they do not have the same host
      this.adjustRef(oHttpChannel, requestURI.scheme + "://" + requestURI.host);      
      this.logger.safe_log(3, "Adjusting Referer, ",
                          "from " + refererHost + " to " + requestURI.host);
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
