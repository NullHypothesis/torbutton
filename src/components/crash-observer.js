/*************************************************************************
 * Crash observer (JavaScript XPCOM component)
 *
 * Provides the chrome with a notification ("extensions.torbutton.crashed"
 * pref event) that the browser in fact crashed. Does this by hooking
 * the sessionstore.
 *
 *************************************************************************/

const Cc = Components.classes;
const Ci = Components.interfaces;
const Cr = Components.results;

// Module specific constants
const kMODULE_NAME = "Session crash detector";
const kMODULE_CONTRACTID = "@mozilla.org/browser/sessionstartup;1";
const kMODULE_CID = Components.ID("9215354b-1787-4aef-9946-780f046c75a9");
const TORBUTTON_EXTENSION_UUID = "{E0204BD5-9D31-402B-A99D-A6AA8FFEBDCA}";

/* Mozilla defined interfaces */
const kREAL_STORE_CID = "{ec7a6c20-e081-11da-8ad9-0800200c9a66}";
const kREAL_STORE = Components.classesByID[kREAL_STORE_CID];
const kStoreInterfaces = ["nsISessionStartup", "nsIObserver", 
                          "nsISupportsWeakReference"];

function AppObserver() {
    this._uninstall = false;
    this.logger = Components.classes["@torproject.org/torbutton-logger;1"]
         .getService(Components.interfaces.nsISupports).wrappedJSObject;
    this._prefs = Components.classes["@mozilla.org/preferences-service;1"]
         .getService(Components.interfaces.nsIPrefBranch);
    this.logger.log(3, "AppObserver created");
}

AppObserver.prototype = {
    observe: function(subject, topic, data) {
      if(topic == "final-ui-startup") {
          this.logger.log(2, "final-ui-startup.");
          Components.classes["@mozilla.org/preferences-service;1"]
              .getService(Components.interfaces.nsIPrefBranch)
              .setBoolPref("extensions.torbutton.startup", true);
      } else if (topic == "em-action-requested") {
        // http://xulsolutions.blogspot.com/2006/07/creating-uninstall-script-for.html
        subject.QueryInterface(Components.interfaces.nsIUpdateItem);
        this.logger.log(2, "Uninstall: "+data+" "+subject.id.toUpperCase());

        if (subject.id.toUpperCase() == TORBUTTON_EXTENSION_UUID) {
          this.logger.log(2, "Uninstall: "+data);
          if (data == "item-uninstalled" || data == "item-disabled") {
            this._uninstall = true;
          } else if (data == "item-cancel-action") {
            this._uninstall = false;
          }
        }
      } else if (topic == "quit-application-granted") {
        this.logger.log(2, "Got firefox quit event.");
        var chrome = null;
        try {
            var wm = Cc["@mozilla.org/appshell/window-mediator;1"]
                         .getService(Components.interfaces.nsIWindowMediator);
            var chrome = wm.getMostRecentWindow("navigator:browser");
        } catch(e) {
            this.logger.log(3, "Exception on shutdown window: "+e);
        }
        if (this._uninstall) {
            if (chrome) {
                chrome.torbutton_disable_tor();
            } else {
                this.logger.log(5,
                        "User asked to uninstall, but we have no window!");
            }
        }

        // Remove the cookie observer so clearing cookies below does not
        // issue a new request.
        if (chrome) chrome.torbutton_cookie_observer.unregister();

        // Set pref in case this is just an upgrade (So we don't
        // mess with cookies)
        this._prefs.setBoolPref("extensions.torbutton.normal_exit", true);
        this._prefs.setBoolPref("extensions.torbutton.crashed", false);
        this._prefs.setBoolPref("extensions.torbutton.noncrashed", false);

        if((this._prefs.getIntPref("extensions.torbutton.shutdown_method") == 1 && 
            this._prefs.getBoolPref("extensions.torbutton.tor_enabled"))
            || this._prefs.getIntPref("extensions.torbutton.shutdown_method") == 2) {
            var selector =
                Components.classes["@torproject.org/cookie-jar-selector;1"]
                .getService(Components.interfaces.nsISupports)
                .wrappedJSObject;
            selector.clearCookies();
            // clear the cookie jar by saving the empty cookies to it.
            if(this._prefs.getIntPref("extensions.torbutton.shutdown_method") == 2) {
                if(this._prefs.getBoolPref('extensions.torbutton.dual_cookie_jars'))
                    selector.saveCookies("tor");
                selector.saveCookies("nontor");
            } else if(this._prefs.getBoolPref('extensions.torbutton.dual_cookie_jars')) {
                selector.saveCookies("tor");
            }
        }
        this.logger.log(3, "Torbutton normal exit.");
        //this.unregister();
      }
    }

};

function StoreWrapper() {
  this.logger = Components.classes["@torproject.org/torbutton-logger;1"]
      .getService(Components.interfaces.nsISupports).wrappedJSObject;
  this.logger.log(3, "Component Load 4: New StoreWrapper "+kMODULE_CONTRACTID);

  this._prefs = Components.classes["@mozilla.org/preferences-service;1"]
      .getService(Components.interfaces.nsIPrefBranch);

  this._store = function() {
    var store = kREAL_STORE.getService();
    for (var i = 0; i < kStoreInterfaces.length; i++) {
      store.QueryInterface(Components.interfaces[kStoreInterfaces[i]]);
    }
    return store;
  };

  this.copyMethods(this._store());

  this.ao = new AppObserver();

  var observerService = Cc["@mozilla.org/observer-service;1"].
          getService(Ci.nsIObserverService);
  observerService.addObserver(this.ao, "em-action-requested", false);
  observerService.addObserver(this.ao, "quit-application-granted", false);


}

StoreWrapper.prototype =
{
  QueryInterface: function(iid) {

    if (iid.equals(Components.interfaces.nsISupports)) {
        return this;
    }

    if(iid.equals(Components.interfaces.nsIClassInfo)) {
      var ret = this._store().QueryInterface(iid);
      //dump("classInfo: "+ret.classID);
      return ret;
    }

    try {
        var store = this._store().QueryInterface(iid);
        if (store) this.copyMethods(store);
    } catch(e) {
        //dump("Exception on QI for crash detector\n");
        Components.returnCode = Cr.NS_ERROR_NO_INTERFACE;
        return null;
    }
    return this;
  },

  /* 
   * Copies methods from the true sessionstore object we are wrapping
   */
  copyMethods: function(wrapped) {
    var mimic = function(newObj, method) {
      if(typeof(wrapped[method]) == "function") {
          // Code courtesy of timeless: 
          // http://www.webwizardry.net/~timeless/windowStubs.js
          var params = [];
          params.length = wrapped[method].length;
          var x = 0;
          if(params.length) call = "("+params.join().replace(/(?:)/g,function(){return "p"+(++x)})+")";
          else call = "()";
          var fun = "(function "+call+"{"+
            "if (arguments.length < "+wrapped[method].length+")"+
            "  throw Components.results.NS_ERROR_XPC_NOT_ENOUGH_ARGS;"+
            "return wrapped."+method+".apply(wrapped, arguments);})";
          newObj[method] = eval(fun);
      } else {
          newObj.__defineGetter__(method, function() { return wrapped[method]; });
          newObj.__defineSetter__(method, function(val) { wrapped[method] = val; });
      }
    };
    for (var method in wrapped) {
      if(typeof(this[method]) == "undefined") mimic(this, method);
    }
  },

  observe: function(aSubject, aTopic, aData) {
    if(aTopic == "app-startup") {
      dump("App startup\n");
      this.logger.log(3, "Got app-startup");
      this._startup = true;
      var observerService = Cc["@mozilla.org/observer-service;1"].
          getService(Ci.nsIObserverService);

      observerService.addObserver(this.ao, "final-ui-startup", false);
    }
    this._store().observe(aSubject, aTopic, aData);
  },

  doRestore: function() {
    var ret = false;
    // FIXME: This happens right after an extension upgrade too. But maybe
    // that's what we want.

    // This is so lame. But the exposed API is braindead so it 
    // must be hacked around
    //dump("new doRestore\n");
    this.logger.log(3, "Got doRestore");
    ret = this._store().doRestore();
    if(this._startup) {
        if(ret) {
           this._prefs.setBoolPref("extensions.torbutton.crashed", true);
        } else {
           this._prefs.setBoolPref("extensions.torbutton.noncrashed", true);
        }
    } 
    this._startup = false;
    return ret;
  },
};
 
const StoreWrapperFactory = {

  createInstance: function(aOuter, aIID) {
    if (aOuter != null) {
      Components.returnCode = Cr.NS_ERROR_NO_AGGREGATION;
      return null;
    }
    
    return (new StoreWrapper()).QueryInterface(aIID);
  },
  
  lockFactory: function(aLock) { },
  
  QueryInterface: function(aIID) {
    if (!aIID.equals(Ci.nsISupports) && !aIID.equals(Ci.nsIModule) &&
        !aIID.equals(Ci.nsIFactory) && !aIID.equals(Ci.nsISessionStore)) {
      Components.returnCode = Cr.NS_ERROR_NO_INTERFACE;
      return null;
    }
    
    return this;
  }
};



/**
 * JS XPCOM component registration goop:
 *
 * Everything below is boring boilerplate and can probably be ignored.
 */

var StoreWrapperModule = new Object();

StoreWrapperModule.registerSelf = 
function (compMgr, fileSpec, location, type){
  var nsIComponentRegistrar = Components.interfaces.nsIComponentRegistrar;
  compMgr = compMgr.QueryInterface(nsIComponentRegistrar);
  compMgr.registerFactoryLocation(kMODULE_CID,
                                  kMODULE_NAME,
                                  kMODULE_CONTRACTID,
                                  fileSpec, 
                                  location, 
                                  type);
  //dump("Registered crash observer\n");
};

StoreWrapperModule.getClassObject = function (compMgr, cid, iid)
{
  if (cid.equals(kMODULE_CID)) {
      return StoreWrapperFactory;
  }
  Components.returnCode = Cr.NS_ERROR_NOT_REGISTERED;
  return null;
};

StoreWrapperModule.canUnload = function (compMgr)
{
  return true;
};

function NSGetModule(compMgr, fileSpec)
{
  return StoreWrapperModule;
}

