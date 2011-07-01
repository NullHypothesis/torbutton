/*

Redistribution and use in source and binary forms, with or without modification, are permitted provided that the following conditions are met:

    * Redistributions of source code must retain the above copyright notice, this list of conditions and the following disclaimer.
    * Redistributions in binary form must reproduce the above copyright notice, this list of conditions and the following disclaimer in the documentation and/or other materials provided with the distribution.
    * Neither the name of Stanford University nor the names of its contributors may be used to endorse or promote products derived from this software without specific prior written permission.

THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT OWNER OR CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.

*/
// Dual-keyed cache/cookie same-origin policy
// Ensures that cache and cookies set in HTTP headers cannot be used for 
// non-cooperative or semi-cooperative tracking.
// 
// Author: Edward Pastuszenski
// 
// Based on Stanford SafeCache
// Author: Collin Jackson
// Other contributors: Andrew Bortz, John Mitchell, Dan Boneh
// 

//////////////////////////////////////////////////////////////////////////////
// Constants

const kSSC_ENABLED_PREF = "extensions.torbutton.safecache";
const kSSC_SC_ENABLED_PREF = "extensions.torbutton.dual_key_cookies";
const kSSC_TORBUTTON_PREF = "extensions.torbutton.tor_enabled";
const kSSC_COOKIE_JS_PREF = "extensions.torbutton.cookie_js_allow";

////////////////////////////////////////////////////////////////////////////
// Debug stuff

/**
 * Dump information to the console?
 */
var SSC_debug = true;

/**
 * Sends data to the console if we're in debug mode
 * @param msg The string containing the message to display
 */
function SSC_dump(msg) {
  if (SSC_debug)
    torbutton_log(2, "SSC: " + msg);
}

////////////////////////////////////////////////////////////////////////////
// "Major" objects/classes

/**
 * SafeCache HTTP Request Listener
 * Watches for the authentication requests and presents password dialog
 */

function SSC_RequestListener(controller) {
  this.controller = controller;
}

SSC_RequestListener.prototype =
{
  controller: null,  // The SSC_Controller that created this

  observe: function(subject, topic, data) { 
    try { 
      if(this.controller.getEnabled() == 2) return;
      if(this.controller.getEnabled() == 1
          && !this.controller.getTorButton()) return;
      if (topic == 'http-on-modify-request') {
        subject.QueryInterface(Components.interfaces.nsIHttpChannel);
        subject.QueryInterface(Components.interfaces.nsIHttpChannelInternal);
        subject.QueryInterface(Components.interfaces.nsICachingChannel);
        this.onModifyRequest(subject);
      } else if (topic == 'http-on-examine-response') {
        subject.QueryInterface(Components.interfaces.nsIHttpChannel);
        subject.QueryInterface(Components.interfaces.nsIHttpChannelInternal);
        subject.QueryInterface(Components.interfaces.nsICachingChannel);
        this.onExamineResponse(subject);
      }
    } catch(e) {try {SSC_dump(e);} catch(ex) {}} 
  },

  bypassCache: function(channel) {
    channel.loadFlags |= channel.LOAD_BYPASS_CACHE;  
      // INHIBIT_PERSISTENT_CACHING instead?
    channel.cacheKey = this.newCacheKey(0);
    SSC_dump("Bypassed cache for " + channel.URI.spec);
  },

  setCacheKey: function(channel, str) {
    var oldData = this.readCacheKey(channel.cacheKey);
    var newKey = this.newCacheKey(this.getHash(str) + oldData);
    channel.cacheKey = newKey;
    SSC_dump("Set cache key to hash(" + str + ") = " + 
              newKey.data + " for " + channel.URI.spec);
  },

  onModifyRequest: function(channel) {
    var parent = null;
    if (channel.notificationCallbacks) {
        try {
            var wind = channel.notificationCallbacks.QueryInterface(
                    Components.interfaces.nsIInterfaceRequestor).getInterface(
                        Components.interfaces.nsIDOMWindow);
            parent = wind.window.top.location;
        } catch(e) {
        }
        SSC_dump("Parent "+parent+" for "+ channel.URI.spec);
    }

    if (channel.documentURI && channel.documentURI == channel.URI) {
      parent = null;  // first party interaction
    }

    // Same-origin policy
    var referrer;
    if (parent && parent.hostname != channel.URI.host) {
      SSC_dump("Segmenting " + channel.URI.host + 
               " content loaded by " + parent.host);
      this.setCacheKey(channel, parent.hostname);
      referrer = parent.hostname;
    } else {
      referrer = channel.URI.host;  
      if(!this.readCacheKey(channel.cacheKey)) {
        this.setCacheKey(channel, channel.URI.host);
      } else {
        SSC_dump("Existing cache key detected; leaving it unchanged.");
      }
    }

    if (this.controller.getBlockThirdPartyCache()) {
      if(parent && parent.hostname != channel.URI.host) {
          //SSC_dump("Third party cache blocked for " + channel.URI.spec +
          //" content loaded by " + parent.spec);
          this.bypassCache(channel);
      }
    }

    var cookie = null;
    if (this.controller.getSafeCookieEnabled()) {
        try{
            cookie = channel.getRequestHeader("Cookie");
            //SSC_dump("Cookie: " + cookie);
        } catch(e) {cookie = null;}
    }

    if(cookie) {
        //Strip the secondary key from every referrer-matched cookie
        var newHeader = "";
        var i = 0;
        var lastStart = 0;
        //State 0: no information on next cookie
        //State 1: cookie will be sent.
        //State 2: cookie will not be sent.
        var state = 0;
        while (i < cookie.length) {
            //Dual-keyed cookie
            if(state == 0 && cookie.charAt(i) == '|'){
                //If referrers match, strip key and send cookie
                var cookieReferrer = cookie.toString().substr(lastStart, i - lastStart);
                if (referrer == cookieReferrer){
                    lastStart = i+1;
                    state = 1;
                } else {
                    state = 2;
                }
            }
            //Single-keyed cookie that was set via scripting.
            if (state == 0 && cookie.charAt(i) == '='){
                if(this.controller.getCookieJS())  state = 1;
                else {
                    if (referrer == channel.getRequestHeader("Host")) state = 1;
                    else state = 2;
                }
            }
            //End of a cookie
            if (cookie.charAt(i) == ';') {
                var thisCookie = cookie.toString().substr(lastStart, i - lastStart + 2);
                if (state == 1){
                    newHeader += thisCookie; 
                }
                if (state == 2){
                    SSC_dump("Declining to send " + thisCookie +  
                        " for request by embedded domain " + channel.URI.host +
                        + "   " + channel.getRequestHeader("Host") +
                        " on embedding page " + referrer);
                }
                lastStart = i+2;
                state = 0;
            }
            //End of the string
            if (i == cookie.length - 1){
                thisCookie = cookie.toString().substr(lastStart, i - lastStart + 1);
                if (state == 1){
                    newHeader += thisCookie; 
                }
                if (state == 2){
                    SSC_dump("Declining to send " + thisCookie + 
                        " for request by embedded domain " + channel.URI.host +
                        + "   " + channel.getRequestHeader("Host") +
                        " on embedding page " + referrer);
                }
                lastStart = i+1;
            }                
            i++;
        }
        channel.setRequestHeader("Cookie", newHeader, false);
    }

  },

  onExamineResponse: function(channel) {
    var setCookie;
    try{
        setCookie = channel.getResponseHeader("Set-Cookie");
    } catch(e) {setCookie = null;}
    
    if(setCookie) {
        var parent = null;
        if (channel.notificationCallbacks) {
            var wind = channel.notificationCallbacks.QueryInterface(
                    Components.interfaces.nsIInterfaceRequestor).getInterface(
                        Components.interfaces.nsIDOMWindow);
            parent = wind.window.top.location;
        }

        if (channel.documentURI && channel.documentURI == channel.URI) {
            parent = null;  // first party interaction
        }

        var referrer;
        // Same-origin policy
        if (parent && parent.hostname != channel.URI.host) {
            //SSC_dump("Segmenting " + channel.URI.host + 
            //" content loaded by " + parent.host);
            referrer = parent.hostname;
        } else {
            referrer = channel.URI.host;
        }
        //Dual-key each cookie set in the header
        var newHeader = "";
        var i = 0;
        var lastStart = 0;
        //Some messy code that prevents multiple embedding-domain keys
        //from being concatenated to cookie names.
        var passedname = false;
        var namebar = false;
        while (i < setCookie.length) {
            if (setCookie.charAt(i) == '=') passedname = true;
            else if (setCookie.charAt(i) == '|' && passedname == false)
                namebar = true;
            if (i == setCookie.length - 1 || setCookie.charAt(i) == '\n'){
                if(!namebar){
                  newHeader += referrer + "|" + 
                      setCookie.toString().substr(lastStart, i - lastStart + 1);   
                }
                lastStart = i+1;
                passedname = false;
                namebar = false;
            }
            i++;
        }
        //SSC_dump("MODIFIED Set-Cookie: " + newHeader);
        channel.setResponseHeader("Set-Cookie", newHeader, false);
    }
  },

  // Read the integer data contained in a cache key
  readCacheKey: function(key) {
    key.QueryInterface(Components.interfaces.nsISupportsPRUint32);
    return key.data;
  },

  // Construct a new cache key with some integer data
  newCacheKey: function(data) {
    var cacheKey = 
      Components.classes["@mozilla.org/supports-PRUint32;1"]
                .createInstance(Components.interfaces.nsISupportsPRUint32);
    cacheKey.data = data;
    return cacheKey;
  },

  strMD5: function(str) {
    var converter =
        Components.classes["@mozilla.org/intl/scriptableunicodeconverter"].
        createInstance(Components.interfaces.nsIScriptableUnicodeConverter);

    // nsIURI.host is UTF-8
    converter.charset = "UTF-8";
    // result.value will contain the array length
    var result = {};
    // data is an array of bytes
    var data = converter.convertToByteArray(str, result);
    var ch = Components.classes["@mozilla.org/security/hash;1"]
        .createInstance(Components.interfaces.nsICryptoHash);
    ch.init(ch.MD5);
    ch.update(data, data.length);
    return ch.finish(false);
  },

  // Get an integer hash of a string
  getHash: function(str) {
    var hash = this.strMD5(str);
    var intHash = 0;
    for(var i = 0; i < hash.length && i < 8; i++)
      intHash += hash.charCodeAt(i) << (i << 3);
    return intHash;
  },
}

/**
 * Master control object. Adds and removes the RequestListener
 */
function SSC_Controller() {
  this.prefs = Components.classes["@mozilla.org/preferences-service;1"]
                           .getService(Components.interfaces.nsIPrefService);
  this.addListener(new SSC_RequestListener(this));
}

SSC_Controller.prototype = {

  getEnabled: function() {
    return (this.prefs.getIntPref(kSSC_ENABLED_PREF));
  },

  getSafeCookieEnabled: function() {
    return (this.prefs.getBoolPref(kSSC_SC_ENABLED_PREF));
  },

  getBlockThirdPartyCache: function() {
    // Meh, no pref for now. Always allow.
    return false;
  },

  getTorButton: function() {
    return (this.prefs.getBoolPref(kSSC_TORBUTTON_PREF));  
  },
  
  getCookieJS: function() {
      return (this.prefs.getBoolPref(kSSC_COOKIE_JS_PREF));  
  },

  addListener: function(listener) {
    this.listener = listener;
    var observerService = 
      Components.classes["@mozilla.org/observer-service;1"]
        .getService(Components.interfaces.nsIObserverService);
    observerService.addObserver(listener, "http-on-modify-request", false);
    // XXX: We need an observer to add this listener when the pref gets set
    if (this.getSafeCookieEnabled()) {
      observerService.addObserver(listener, "http-on-examine-response", false);
    }
  },

  removeListener: function() {
    var observerService = 
      Components.classes["@mozilla.org/observer-service;1"]
        .getService(Components.interfaces.nsIObserverService);
    observerService.removeObserver(this.listener, "http-on-modify-request");
    if (this.getSafeCookieEnabled()) {
      observerService.removeObserver(this.listener, "http-on-examine-response");
    }
  },
}

////////////////////////////////////////////////////////////////////////////
// Global stuff
// "What script would be complete without a couple of globals?" --Fritz

var SSC_controller;

function SSC_startup() {
  if(!SSC_controller) SSC_controller = new SSC_Controller();
  SSC_dump("Loaded controller");
}
