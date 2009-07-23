/*************************************************************************
 * External App Handler.
 * Handles displaying confirmation dialogs for external apps and protocols
 * due to Firefox Bug https://bugzilla.mozilla.org/show_bug.cgi?id=440892
 *************************************************************************/

// Module specific constants
const kMODULE_NAME = "Torbutton External App Handler";

// XXX: Also psm-external-content-listener?
const kMODULE_CONTRACTID_APP = "@mozilla.org/uriloader/external-helper-app-service;1";
const kMODULE_CONTRACTID_PROTO = "@mozilla.org/uriloader/external-protocol-service;1";

const kMODULE_CID = Components.ID("3da0269f-fc29-4e9e-a678-c3b1cafcf13f");

/* Mozilla defined interfaces for FF3.0 */
const kREAL_EXTERNAL_CID = "{A7F800E0-4306-11d4-98D0-001083010E9B}";

const kExternalInterfaces = ["nsIObserver", "nsIMIMEService",
                             "nsIExternalHelperAppService",
                             "nsISupportsWeakReference", // XXX: Uh-oh...
                             "nsIExternalProtocolService",
                             "nsPIExternalAppLauncher"];

const Cr = Components.results;
const Cc = Components.classes;
const Ci = Components.interfaces;

var appInfo = Components.classes["@mozilla.org/xre/app-info;1"]
                .getService(Components.interfaces.nsIXULAppInfo);
var versionChecker = Components.classes["@mozilla.org/xpcom/version-comparator;1"]
                       .getService(Components.interfaces.nsIVersionComparator);
var is_ff3 = (versionChecker.compare(appInfo.version, "3.0a1") >= 0);

function ExternalWrapper() {
  this.logger = Components.classes["@torproject.org/torbutton-logger;1"]
      .getService(Components.interfaces.nsISupports).wrappedJSObject;
  this.logger.log(3, "Component Load 0: New ExternalWrapper.");

  this._real_external = Components.classesByID[kREAL_EXTERNAL_CID];
  this._interfaces = kExternalInterfaces;

  this._prefs = Components.classes["@mozilla.org/preferences-service;1"]
      .getService(Components.interfaces.nsIPrefBranch);

  this._external = function() {
    var external = this._real_external.getService();
    for (var i = 0; i < this._interfaces.length; i++) {
      external.QueryInterface(Components.interfaces[this._interfaces[i]]);
    }
    return external;
  };
    
  this.copyMethods(this._external());
}

ExternalWrapper.prototype =
{
  QueryInterface: function(iid) {
    if (iid.equals(Components.interfaces.nsIClassInfo)
        || iid.equals(Components.interfaces.nsISupports)) {
      return this;
    }

    var external = this._external().QueryInterface(iid);
    this.copyMethods(external);
    return this;
  },

  // make this an nsIClassInfo object
  flags: Components.interfaces.nsIClassInfo.DOM_OBJECT,

  // method of nsIClassInfo

  classDescription: "@mozilla.org/uriloader/external-helper-app-service;1",
  contractID: "@mozilla.org/uriloader/external-helper-app-service;1",
  classID: kMODULE_CID,

  // method of nsIClassInfo
  getInterfaces: function(count) {
    var interfaceList = [Components.interfaces.nsIClassInfo];
    for (var i = 0; i < this._interfaces.length; i++) {
      interfaceList.push(Components.interfaces[this._interfaces[i]]);
    }

    count.value = interfaceList.length;
    return interfaceList;
  },

  // method of nsIClassInfo  
  getHelperForLanguage: function(count) { return null; },

  /* Determine whether we should ask the user to run the app */
  blockApp: function() {
    return this._prefs.getBoolPref("extensions.torbutton.tor_enabled");
  },

  /* Copies methods from the true object we are wrapping */
  copyMethods: function(wrapped) {
    var mimic = function(newObj, method) {
       if(method == "XXXX") {
          // Hack to deal with unimplemented methods.
          // XXX: the API docs say to RETURN the not implemented error
          // for these functions as opposed to throw...
          var fun = "(function (){return Components.results.NS_ERROR_NOT_IMPLEMENTED; })";
          newObj[method] = eval(fun);
       } else if(typeof(wrapped[method]) == "function") {
          // Code courtesy of timeless: 
          // http://www.webwizardry.net/~timeless/windowStubs.js
          var params = [];
          params.length = wrapped[method].length;
          var x = 0;
          var call;
          if(params.length) call = "("+params.join().replace(/(?:)/g,function(){return "p"+(++x)})+")";
          else call = "()";
          var fun = "(function "+call+"{if (arguments.length < "+wrapped[method].length+") throw Components.results.NS_ERROR_XPC_NOT_ENOUGH_ARGS; return wrapped."+method+".apply(wrapped, arguments);})";
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


  loadURI: function(aUri, aContext) {
    if(this.blockApp()) {
      var wm = Cc["@mozilla.org/appshell/window-mediator;1"]
                 .getService(Components.interfaces.nsIWindowMediator);
      var chrome = wm.getMostRecentWindow("navigator:browser");

      var prompts = Components.classes["@mozilla.org/embedcomp/prompt-service;1"]
                              .getService(Components.interfaces.nsIPromptService);
      var check = {value: false};
      // XXX: Localize
      var result = prompts.confirmCheck(chrome, "Load external content?",
                                        "Do you want to launch an external app to handle"
                                        +"\n"+aUri.spec+
                                        "\n\nNote: External apps are NOT Tor safe by default and can unmask you!\n", 
                                        "Do not ask me again", check);

      // do something check.value / result
      if (check.value) {
        // XXX: Set a pref...
      }

      if (!result) {
        return null;
      }
 
    }
 
    return this._external().loadURI(aUri, aContext);
  },

  // loadUrl calls loadURI

  doContent: function(aMimeContentType, aRequest, aWindowContext, aForceSave) {
    if(this.blockApp()) {
      var wm = Cc["@mozilla.org/appshell/window-mediator;1"]
                 .getService(Components.interfaces.nsIWindowMediator);
      var chrome = wm.getMostRecentWindow("navigator:browser");

      var prompts = Components.classes["@mozilla.org/embedcomp/prompt-service;1"]
                              .getService(Components.interfaces.nsIPromptService);
      var check = {value: false};
      // XXX: Localize
      var result = prompts.confirmCheck(chrome, "Load external content?",
                                        "Do you want to launch an external app to handle"
                                        +"\n"+aRequest.name+
                                        "\n\nNote: External apps are NOT Tor safe by default and can unmask you!\n", 
                                        "Do not ask me again", check);
      // do something check.value / result
      if (check.value) {
        // XXX: Set a pref...
      }

      if (!result) {
        return null;
      }
    }
 
    return this._external().doContent(aMimeContentType, aRequest, aWindowContext, aForceSave);
  },

};

var ExternalWrapperSingleton = null;
var ExternalWrapperFactory = new Object();

ExternalWrapperFactory.createInstance = function (outer, iid)
{
  if (outer != null) {
    Components.returnCode = Cr.NS_ERROR_NO_AGGREGATION;
    return null;
  }

  if(!ExternalWrapperSingleton)
    ExternalWrapperSingleton = new ExternalWrapper();

  return ExternalWrapperSingleton;
};


/**
 * JS XPCOM component registration goop:
 *
 * Everything below is boring boilerplate and can probably be ignored.
 */

var ExternalWrapperModule = new Object();

ExternalWrapperModule.registerSelf = 
function (compMgr, fileSpec, location, type) {
  var nsIComponentRegistrar = Components.interfaces.nsIComponentRegistrar;
  compMgr = compMgr.QueryInterface(nsIComponentRegistrar);
  compMgr.registerFactoryLocation(kMODULE_CID,
                                  kMODULE_NAME,
                                  kMODULE_CONTRACTID_APP,
                                  fileSpec, 
                                  location, 
                                  type);

  compMgr.registerFactoryLocation(kMODULE_CID,
                                  kMODULE_NAME,
                                  kMODULE_CONTRACTID_PROTO,
                                  fileSpec, 
                                  location, 
                                  type);
};

ExternalWrapperModule.getClassObject = function (compMgr, cid, iid)
{
  if (cid.equals(kMODULE_CID))
    return ExternalWrapperFactory;

  Components.returnCode = Cr.NS_ERROR_NOT_REGISTERED;
  return null;
};

ExternalWrapperModule.canUnload = function (compMgr)
{
  return true;
};

function NSGetModule(compMgr, fileSpec)
{
  return ExternalWrapperModule;
}

