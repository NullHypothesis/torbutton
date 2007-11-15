/*************************************************************************
 * Content policy to block stuff not handled by other components
 * (such as CSS)
 *   - http://www.w3.org/TR/REC-CSS2/selector.html#dynamic-pseudo-classes
 * 
 * Also serves as a safety net to catch content the other mechanisms 
 * somehow might be tricked into failing to block (this should not happen 
 * in normal operation though).
 *
 * Based on examples from:
 * - http://adblockplus.org/en/faq_internal
 *   - http://developer.mozilla.org/en/docs/How_to_Build_an_XPCOM_Component_in_Javascript
 *   - http://www.xulplanet.com/references/xpcomref/ifaces/nsICategoryManager.html
 *   - http://www.xulplanet.com/references/xpcomref/ifaces/nsIContentPolicy.html
 * - http://greasemonkey.devjavu.com/projects/greasemonkey/browser/trunk/src/components/greasemonkey.js
 *
 * Test cases:
 *   - http://www.tjkdesign.com/articles/css%20pop%20ups/default.asp
 *
 *************************************************************************/

// This is all local scope
const CSSB_CONTRACTID = "@freehaven.net/cssblocker;1";
const CSSB_CID = Components.ID("{23f4d9ba-023a-94ab-eb75-67aed7562a18}");

const DNode = Components.interfaces.nsIDOMNode;
const DWindow = Components.interfaces.nsIDOMWindow;
const ok = Components.interfaces.nsIContentPolicy.ACCEPT;
const block = Components.interfaces.nsIContentPolicy.REJECT_REQUEST;
const CPolicy = Components.interfaces.nsIContentPolicy;
const Cr = Components.results;

// Retrieves the window object for a node or returns null if it isn't possible
function getWindow(node) {
    if (node && node.nodeType != DNode.DOCUMENT_NODE)
        node = node.ownerDocument;

    if (!node || node.nodeType != DNode.DOCUMENT_NODE)
        return null;

    return node.defaultView;
}

//FIXME: can we kill this noise?
//HACKHACK: need a way to get an implicit wrapper for nodes because of bug 337095 (fixed in Gecko 1.8.0.5)
var fakeFactory = {
	createInstance: function(outer, iid) {
		return outer;
	},

	QueryInterface: function(iid) {
		if (iid.equals(Components.interfaces.nsISupports) ||
				iid.equals(Components.interfaces.nsIFactory))
			return this;

       Components.returnCode = Cr.NS_ERROR_NO_INTERFACE;
       return null;
	}
};
var array = Components.classes['@mozilla.org/supports-array;1'].createInstance(Components.interfaces.nsISupportsArray);
array.AppendElement(fakeFactory);
fakeFactory = array.GetElementAt(0).QueryInterface(Components.interfaces.nsIFactory);
array = null;

function wrapNode(insecNode) {
	return fakeFactory.createInstance(insecNode, Components.interfaces.nsISupports);
}



// Unwraps jar:, view-source: and wyciwyg: URLs, returns the contained URL
function unwrapURL(url) {
	if (!url)
		return url;

	var ret = url.replace(/^view-source:/).replace(/^wyciwyg:\/\/\d+\//);
	if (/^jar:(.*?)!/.test(ret))
		ret = RegExp.$1;

	if (ret == url)
		return url;
	else
		return unwrapURL(ret);
}

var localSchemes = {"about" : true, "chrome" : true, "file" : true, 
    "resource" : true, "x-jsd" : true, "addbook" : true, "cid" : true, 
    "mailbox" : true, "data" : true, "javascript" : true};

function ContentPolicy() {
    this._prefs = Components.classes["@mozilla.org/preferences-service;1"]
        .getService(Components.interfaces.nsIPrefBranch);
    this.wm = Components.classes["@torproject.org/content-window-mapper;1"]
        .getService(Components.interfaces.nsISupports)
        .wrappedJSObject;
    
    // XXX: Ewww. torbutton.logger may not be loaded yet..
    this.logger = Components.classes["@torproject.org/torbutton-logger;1"]
        .getService(Components.interfaces.nsISupports).wrappedJSObject;
        
    this.isolate_content = this._prefs.getBoolPref("extensions.torbutton.isolate_content");
    this.tor_enabled = this._prefs.getBoolPref("extensions.torbutton.tor_enabled");
    this.no_tor_plugins = this._prefs.getBoolPref("extensions.torbutton.no_tor_plugins");

    // Register observer: FIXME: Restrict this to extensions.torbutton branch?
    var pref_service = Components.classes["@mozilla.org/preferences-service;1"]
        .getService(Components.interfaces.nsIPrefBranchInternal);
    this._branch = pref_service.QueryInterface(Components.interfaces.nsIPrefBranchInternal);
    this._branch.addObserver("extensions.torbutton", this, false);

    dump("Content policy component initialized\n");
    return;
}

ContentPolicy.prototype = {
    isLocalScheme: function(loc) {
        if (loc.indexOf(":") < 0)
            return false;

        var scheme = loc.replace(/:.*/, "").toLowerCase();
        return (scheme in localSchemes) || loc == "about:blank";
    },

	// nsIContentPolicy interface implementation
	shouldLoad: function(contentType, contentLocation, requestOrigin, insecNode, mimeTypeGuess, extra) {
       
        /*. Debugging hack. DO NOT UNCOMMENT IN PRODUCTION ENVIRONMENTS
        if(contentLocation.spec.search("venkman") != -1) {
            this.logger.log(3, "chrome-venk");
            return ok;
        }*/

        if(!insecNode) {
            // Happens on startup
            this.logger.log(3, "Skipping no insec: "+contentLocation.spec);
            return ok;
        }

        if(!this.isolate_content) {
            this.logger.eclog(1, "Content policy disabled");
            return ok;
        }
        
        var node = wrapNode(insecNode);
        var wind = getWindow(node);

		// Local stuff has to be eclog because otherwise debuglogger will
        // get into an infinite log-loop w/ its chrome updates
        if (this.isLocalScheme(unwrapURL(contentLocation.spec))) {
            this.logger.eclog(1, "Skipping local: "+contentLocation.spec);
			return ok;
        } 

		// For frame elements go to their window
		if (contentType == CPolicy.TYPE_SUBDOCUMENT && node.contentWindow) {
			node = node.contentWindow;
			wind = node;
		}

        // XXX: Something is rotten in denmark        
        var tor_state = this.tor_enabled;

        if (contentType == 5) { // Object
            // Never seems to happen.. But it would be nice if we 
            // could handle it either here or shouldProcess, instead of in 
            // the webprogresslistener
            if(this.tor_enabled && this.no_tor_plugins) {
                this.logger.log(4, "Blocking object at "+contentLocation.spec);
                return block;
            }
        }

        if (!wind || !wind.top.location || !wind.top.location.href) {
            this.logger.log(4, "Skipping no location: "+contentLocation.spec);
			return ok;
        }

        var doc = wind.top.document;
        if(!doc) {
            // 1st load of a page in a new location
            this.logger.log(3, "Skipping no doc: "+contentLocation.spec);
            return ok;
        }

        var browser = this.wm.getBrowserForContentWindow(wind.top);
        if(!browser) {
            // This happens on the first load of a doc
            this.logger.log(3, "No window found: "+contentLocation.spec);
            return ok; 
        }

        if (typeof(browser.__tb_tor_fetched) == 'undefined') {
            this.logger.log(5, "UNTAGGED WINDOW2!!!!!!!!! "+contentLocation.spec);
            return block;
        }

        if(browser.__tb_tor_fetched == tor_state) {
            return ok;
        } else {
            this.logger.log(3, "Blocking: "+contentLocation.spec);
            return block;
        }

	},

	shouldProcess: function(contentType, contentLocation, requestOrigin, insecNode, mimeType, extra) {
        // Were this actually ever called, it might be useful :(
        // Instead, related functionality has been grafted onto the 
        // webprogresslistener :(	
        // See mozilla bugs 380556, 305699, 309524
        return ok;
	},

    // Pref observer interface implementation
  
    // topic:   what event occurred
    // subject: what nsIPrefBranch we're observing
    // data:    which pref has been changed (relative to subject)
    observe: function(subject, topic, data)
    {
        if (topic != "nsPref:changed") return;
        switch (data) {
            case "extensions.torbutton.isolate_content":
                this.isolate_content = this._prefs.getBoolPref("extensions.torbutton.isolate_content");
                break;
            case "extensions.torbutton.tor_enabled":
                this.tor_enabled = this._prefs.getBoolPref("extensions.torbutton.tor_enabled");
                break;
            case "extensions.torbutton.no_tor_plugins":
                this.no_tor_plugins = this._prefs.getBoolPref("extensions.torbutton.no_tor_plugins");
                break;
        }
    }
};

/*
 * Factory object
 */

var ContentPolicyInstance = null;

const factory = {
	// nsIFactory interface implementation
	createInstance: function(outer, iid) {
		if (outer != null) {
           Components.returnCode = Cr.NS_ERROR_NO_AGGREGATION;
           return null;
       }

        if (!iid.equals(Components.interfaces.nsIContentPolicy) &&
                !iid.equals(Components.interfaces.nsISupports)) {
            Components.returnCode = Cr.NS_ERROR_NO_INTERFACE;          
            return null;
        }

        if(!ContentPolicyInstance)
            ContentPolicyInstance = new ContentPolicy();

		return ContentPolicyInstance;
	},

	// nsISupports interface implementation
	QueryInterface: function(iid) {
		if (iid.equals(Components.interfaces.nsISupports) ||
				iid.equals(Components.interfaces.nsIModule) ||
				iid.equals(Components.interfaces.nsIFactory))
			return this;

        /*
		if (!iid.equals(Components.interfaces.nsIClassInfo))
			dump("CSS Blocker: factory.QI to an unknown interface: " + iid + "\n");
        */

        Components.returnCode = Cr.NS_ERROR_NO_INTERFACE;          
        return null;   
	}
};


/*
 * Module object
 */
const module = {
	registerSelf: function(compMgr, fileSpec, location, type) {
		compMgr = compMgr.QueryInterface(Components.interfaces.nsIComponentRegistrar);
		compMgr.registerFactoryLocation(CSSB_CID, 
										"Torbutton content policy",
										CSSB_CONTRACTID,
										fileSpec, location, type);

		var catman = Components.classes["@mozilla.org/categorymanager;1"]
					 .getService(Components.interfaces.nsICategoryManager);
		catman.addCategoryEntry("content-policy", CSSB_CONTRACTID,
							CSSB_CONTRACTID, true, true);
	},

	unregisterSelf: function(compMgr, fileSpec, location) {
		compMgr = compMgr.QueryInterface(Components.interfaces.nsIComponentRegistrar);

		compMgr.unregisterFactoryLocation(CSSB_CID, fileSpec);
		var catman = Components.classes["@mozilla.org/categorymanager;1"]
					   .getService(Components.interfaces.nsICategoryManager);
		catman.deleteCategoryEntry("content-policy", CSSB_CONTRACTID, true);
	},

	getClassObject: function(compMgr, cid, iid) {
		if (cid.equals(CSSB_CID))
            return factory;

        Components.returnCode = Cr.NS_ERROR_NOT_REGISTERED;
        return null;
	},

	canUnload: function(compMgr) {
		return true;
	}
};

function NSGetModule(comMgr, fileSpec) {
	return module;
}


