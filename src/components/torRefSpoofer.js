function LOG(text)
{
 var logger = Components.classes["@torproject.org/torbutton-logger;1"].getService(Components.interfaces.nsISupports).wrappedJSObject;
 logger.log("RefSpoof: " + text);
/*  var prompt = Components.classes["@mozilla.org/embedcomp/prompt-service;1"]
                        .getService(Components.interfaces.nsIPromptService);
  prompt.alert(null, "debug", text);
 */
}



var refObserver = {    
  observe: function(subject, topic, data)
  {
    if (topic == "http-on-modify-request") {
      //LOG("----------------------------> (" + subject + ") mod request");
      var prefs = Components.classes["@mozilla.org/preferences-service;1"]
      .getService(Components.interfaces.nsIPrefBranch);    
      var tor_enabled = prefs.getBoolPref("extensions.torbutton.tor_enabled");
      
      if (!tor_enabled)
        return;
        
      subject.QueryInterface(Components.interfaces.nsIHttpChannel);
      this.onModifyRequest(subject);
      return;
    }
    if (topic == "app-startup") {
      //LOG("----------------------------> app-startup");
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
        LOG("Adjusting Referer from " + refererHost + " to " + requestURI.host);
    }
     catch (ex) {
      LOG("onModifyRequest: " + ex);
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
      LOG("adjustRef: " + ex);
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
  }
};

var myModule = {
    
  myCID: Components.ID("65be2be0-ceb4-44c2-91a5-9c75c53430bf"),
  myProgID: "@torproject.org/torRefSpoofer;1",
  myName:   "RefSpoofComp",
  registerSelf: function (compMgr, fileSpec, location, type) {
    var compMgr = compMgr.QueryInterface(Components.interfaces.nsIComponentRegistrar);
    compMgr.registerFactoryLocation(this.myCID,this.myName,this.myProgID,fileSpec,location,type);
    //LOG("----------------------------> registerSelf");
    var catMgr = Components.classes["@mozilla.org/categorymanager;1"].getService(Components.interfaces.nsICategoryManager);
    catMgr.addCategoryEntry("app-startup", this.myName, this.myProgID, true, true);
  },
  
  getClassObject: function (compMgr, cid, iid) {
    //LOG("----------------------------> getClassObject");
    return this.myFactory;
  },

  canUnload: function(compMgr) {
    return true;
  },    

  unregisterSelf: function(compMgr, fileSpec, location) {
    // Remove the auto-startup
    compMgr.QueryInterface(Components.interfaces.nsIComponentRegistrar);
    compMgr.unregisterFactoryLocation(this.myCID, fileSpec);
    var catMan = Components.classes["@mozilla.org/categorymanager;1"].getService(Components.interfaces.nsICategoryManager);
    catMan.deleteCategoryEntry("app-startup", this.myProgID, true);
  },
    
  getClassObject: function(compMgr, cid, iid) {
    if (!cid.equals(this.myCID))
      throw Components.results.NS_ERROR_FACTORY_NOT_REGISTERED;
    if (!iid.equals(Components.interfaces.nsIFactory))
      throw Components.results.NS_ERROR_NO_INTERFACE;
    return this.myFactory;
    },
    
  myFactory: {
    // Implement nsIFactory
    createInstance: function(outer, iid)
    {
      if (outer != null)
        throw Components.results.NS_ERROR_NO_AGGREGATION;      
      return refObserver.QueryInterface(iid);
    }
  }    
};

function NSGetModule(compMgr, fileSpec) {
  return myModule;
}
