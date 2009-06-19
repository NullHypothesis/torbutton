
function LOG(text)
{
  var logger = Components.classes["@torproject.org/torbutton-logger;1"].getService(Components.interfaces.nsISupports).wrappedJSObject;
  logger.log(text);
}



var refObserver = {    
  observe: function(subject, topic, data)
  {
    if (topic == "http-on-modify-request") {
      LOG("----------------------------> (" + subject + ") mod request");
      var httpChannel = subject.QueryInterface(Components.interfaces.nsIHttpChannel);
      httpChannel.setRequestHeader("referer", "http://foo.com", false);
      return;
      }
    if (topic == "app-startup") {
      LOG("----------------------------> app-startup");
      var os = Components.classes["@mozilla.org/observer-service;1"].getService(Components.interfaces.nsIObserverService);
      os.addObserver(this, "http-on-modify-request", false);
      return;
    }
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
    
  myCID: Components.ID("{65be2be0-ceb4-44c2-91a5-9c75c53430bf}"),
  myProgID: "@torproject.org/torRefSpoofer;1",
  myName:   "Ref Spoofer Component",
  registerSelf: function (compMgr, fileSpec, location, type) {
    var compMgr = compMgr.QueryInterface(Components.interfacesnsIComponentRegistrar);
    compMgr.registerFactoryLocation(this.myCID,this.myName,this.myProgID,fileSpec,location,type);
    LOG("----------------------------> registerSelf");
    var catMgr = Components.classes["@mozilla.org/categorymanager;1"].getService(Components.interfaces.nsICategoryManager);
    catMgr.addCategoryEntry("app-startup", this.myName, this.myProgID, true, true);
  },
  
  getClassObject: function (compMgr, cid, iid) {
    LOG("----------------------------> getClassObject");
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
			return myObserver.QueryInterface(iid);
    }
  }    
};

function NSGetModule(compMgr, fileSpec) {
  return myModule;
}
