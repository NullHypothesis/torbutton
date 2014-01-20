// preserved here, but in an ideal world, most of this code should perhaps be
// moved into an XPCOM service, and much can also be tossed. See also
// individual 1506 comments for details.

// TODO: check for leaks: http://www.mozilla.org/scriptable/avoiding-leaks.html
// TODO: Double-check there are no strange exploits to defeat:
//       http://kb.mozillazine.org/Links_to_local_pages_don%27t_work

const k_tb_browser_update_needed_pref = "extensions.torbutton.updateNeeded";
const k_tb_tor_check_failed_topic = "Torbutton:TorCheckFailed";

// status
var m_tb_wasinited = false;
var m_tb_prefs = false;
var m_tb_jshooks = false;
var m_tb_plugin_string = false;
var m_tb_is_main_window = false;
var m_tb_hidden_browser = false;

var m_tb_confirming_plugins = false;

var m_tb_window_height = window.outerHeight;
var m_tb_window_width = window.outerWidth;

var m_tb_ff3 = false;
var m_tb_ff35 = false;
var m_tb_ff36 = false;
var m_tb_ff4 = false;
var m_tb_ff15 = false;
var m_tb_ff10_8 = false;
var m_tb_tbb = false;

var m_tb_control_port = null;
var m_tb_control_host = null;
var m_tb_control_pass = null;

var m_tb_orig_BrowserOnAboutPageLoad = null;

// Bug 1506 P1: This object is only for updating the UI for toggling and style
var torbutton_window_pref_observer =
{
    register: function()
    {
        var pref_service = Components.classes["@mozilla.org/preferences-service;1"]
                                     .getService(Components.interfaces.nsIPrefBranchInternal);
        this._branch = pref_service.QueryInterface(Components.interfaces.nsIPrefBranchInternal);
        this._branch.addObserver("extensions.torbutton", this, false);
    },

    unregister: function()
    {
        if (!this._branch) return;
        this._branch.removeObserver("extensions.torbutton", this);
    },

    // topic:   what event occurred
    // subject: what nsIPrefBranch we're observing
    // data:    which pref has been changed (relative to subject)
    observe: function(subject, topic, data)
    {
        if (topic != "nsPref:changed") return;
        switch (data) {
            // These two need to be per-window:
            case "extensions.torbutton.display_panel":
                torbutton_set_panel_view();
                break;
            case "extensions.torbutton.panel_style":
                torbutton_set_panel_style();
                break;

            // FIXME: Maybe make a intermediate state with a yellow 
            // icon?
            case "extensions.torbutton.settings_applied":
                var mode = m_tb_prefs.getBoolPref("extensions.torbutton.settings_applied");
                torbutton_update_toolbutton(mode);
                torbutton_update_statusbar(mode);

                // Update all open about:tor pages.
                torbutton_update_all_abouttor_pages(undefined, undefined);
                break;
            case k_tb_browser_update_needed_pref:
                torbutton_notify_if_update_needed();
                break;
        }
    }
}

// Bug 1506 P2: This object keeps Firefox prefs in sync with Torbutton prefs.
// It probably could stand some simplification (See #3100). It also belongs
// in a component, not the XUL overlay. There also are a lot of toggle-triggering
// prefs here..
var torbutton_unique_pref_observer =
{
    register: function()
    {
        this.forced_ua = false;
        var pref_service = Components.classes["@mozilla.org/preferences-service;1"]
                                     .getService(Components.interfaces.nsIPrefBranchInternal);
        this.did_toggle_warning = false;
        this._branch = pref_service.QueryInterface(Components.interfaces.nsIPrefBranchInternal);
        this._branch.addObserver("extensions.torbutton", this, false);
        this._branch.addObserver("network.proxy", this, false);
        this._branch.addObserver("network.cookie", this, false);
        this._branch.addObserver("browser.privatebrowsing.autostart", this, false);

        // We observe xpcom-category-entry-added for plugins w/ Gecko-Content-Viewers
        var observerService = Cc["@mozilla.org/observer-service;1"].
            getService(Ci.nsIObserverService);
        observerService.addObserver(this, "xpcom-category-entry-added", false);
    },

    unregister: function()
    {
        if (!this._branch) return;
        this._branch.removeObserver("extensions.torbutton", this);
        this._branch.removeObserver("network.proxy", this);
        this._branch.removeObserver("network.cookie", this);
        this._branch.removeObserver("browser.privatebrowsing.autostart", this);

        var observerService = Cc["@mozilla.org/observer-service;1"].
            getService(Ci.nsIObserverService);
        observerService.removeObserver(this, "xpcom-category-entry-added");
    },

    // topic:   what event occurred
    // subject: what nsIPrefBranch we're observing
    // data:    which pref has been changed (relative to subject)
    observe: function(subject, topic, data)
    {
        if (topic == "xpcom-category-entry-added") {
          // Hrmm. should we inspect subject too? it's just mime type..
          subject.QueryInterface(Ci.nsISupportsCString);
          if (data == "Gecko-Content-Viewers" &&
              !m_tb_prefs.getBoolPref("extensions.torbutton.startup") &&
              m_tb_prefs.getBoolPref("extensions.torbutton.confirm_plugins")) {
             torbutton_log(3, "Got plugin enabled notification: "+subject);

             /* We need to protect this call with a flag becuase we can
              * get multiple observer events for each mime type a plugin
              * registers. Thankfully, these notifications arrive only on
              * the main thread, *however*, our confirmation dialog suspends
              * execution and allows more events to arrive until it is answered
              */ 
             if (!m_tb_confirming_plugins) {
               m_tb_confirming_plugins = true;
               torbutton_confirm_plugins();
               m_tb_confirming_plugins = false;
             } else {
               torbutton_log(3, "Skipping notification for mime type: "+subject);
             }
          }
          return;
        }
 
        if (topic != "nsPref:changed") return;

        switch (data) {
            case "network.proxy.http":
            case "network.proxy.http_port":
            case "network.proxy.ssl":
            case "network.proxy.ssl_port":
            case "network.proxy.ftp":
            case "network.proxy.ftp_port":
            case "network.proxy.gopher":
            case "network.proxy.gopher_port":
            case "network.proxy.socks":
            case "network.proxy.socks_port":
            case "network.proxy.socks_version":
            case "network.proxy.share_proxy_settings":
            case "network.proxy.socks_remote_dns":
            case "network.proxy.type":
                torbutton_log(1, "Got update message, setting status");
                torbutton_set_status();
                break;

            case "browser.privatebrowsing.autostart":
                var mode = m_tb_prefs.getBoolPref("browser.privatebrowsing.autostart");
                var ourmode = m_tb_prefs.getBoolPref("extensions.torbutton.block_disk");
                if (mode != ourmode)
                  m_tb_prefs.setBoolPref("extensions.torbutton.block_disk", mode);
                break;
            case "network.cookie.cookieBehavior":
                var val = m_tb_prefs.getIntPref("network.cookie.cookieBehavior");
                var block_thirdparty = m_tb_prefs.getBoolPref("extensions.torbutton.restrict_thirdparty");
                if (val == 0 && block_thirdparty) // Allow all cookies
                  m_tb_prefs.setBoolPref("extensions.torbutton.restrict_thirdparty", false);
                else if (val == 1 && !block_thirdparty) // Block third party cookies
                  m_tb_prefs.setBoolPref("extensions.torbutton.restrict_thirdparty", true);
                break;

            case "extensions.torbutton.no_tor_plugins":
                torbutton_toggle_plugins(
                        m_tb_prefs.getBoolPref("extensions.torbutton.no_tor_plugins"));
                break;
            case "extensions.torbutton.block_disk":
                torbutton_update_disk_prefs();
                break;
            case "extensions.torbutton.resist_fingerprinting":
            case "extensions.torbutton.spoof_english":
                torbutton_update_fingerprinting_prefs();
                break;
            case "extensions.torbutton.restrict_thirdparty":
                torbutton_update_thirdparty_prefs();
                break;
        }
    }
}

var torbutton_tor_check_observer = {
    register: function()
    {
        this._obsSvc = Cc["@mozilla.org/observer-service;1"]
                         .getService(Ci.nsIObserverService);
        this._obsSvc.addObserver(this, k_tb_tor_check_failed_topic, false);
    },

    unregister: function()
    {
        if (this._obsSvc)
          this._obsSvc.removeObserver(this, k_tb_tor_check_failed_topic);
    },

    observe: function(subject, topic, data)
    {
      if (topic == k_tb_tor_check_failed_topic) {
        // Update toolbar icon and tooltip.
        var mode = m_tb_prefs.getBoolPref("extensions.torbutton.tor_enabled");
        torbutton_update_toolbutton(mode);

        // Update all open about:tor pages. If the user does not have an
        // about:tor page open in the front most window, open one.
        if (torbutton_update_all_abouttor_pages(undefined, false) < 1) {
          var wm = Cc["@mozilla.org/appshell/window-mediator;1"]
              .getService(Components.interfaces.nsIWindowMediator);
          var win = wm.getMostRecentWindow("navigator:browser");
          if (win == window) {
            gBrowser.selectedTab = gBrowser.addTab("about:tor");
          }
        }
      }
    }
};

// Bug 1506 P1
function torbutton_set_panel_view() {
    var o_statuspanel = false;
    var o_prefbranch = false;

    o_statuspanel = torbutton_get_statuspanel();
    o_prefbranch = torbutton_get_prefbranch('extensions.torbutton.');
    if (!o_statuspanel || !o_prefbranch) return;

    // Firefox 4 has no toolbar panel
    var display_panel = o_prefbranch.getBoolPref('display_panel')
        && !m_tb_ff4;
    torbutton_log(2, 'setting panel visibility');
    o_statuspanel.setAttribute('collapsed', !display_panel);
}

// Bug 1506 P1
function torbutton_set_panel_style() {
    var o_statuspanel = false;
    var o_prefbranch = false;

    o_statuspanel = torbutton_get_statuspanel();
    o_prefbranch = torbutton_get_prefbranch('extensions.torbutton.');
    if (!o_statuspanel || !o_prefbranch) return;

    var panel_style = o_prefbranch.getCharPref('panel_style');
    torbutton_log(2, 'setting panel style: ' + panel_style);
    o_statuspanel.setAttribute('class','statusbarpanel-' + panel_style);
}

// Bug 1506 P0: Die toggle, die! 
function torbutton_toggle(force) {
    var o_toolbutton = false;

    // Only toggle if lock mode is set if the user goes out of their way.
    if(!force && m_tb_prefs.getBoolPref("extensions.torbutton.locked_mode")) {
        return;
    }

    o_toolbutton = torbutton_get_toolbutton();

    torbutton_log(3, 'called toggle()');
    if (!m_tb_wasinited) {
        torbutton_init();
    }

    if (torbutton_check_status()) {
        // Close on toggle before actually changing proxy settings
        // as additional safety precaution
        torbutton_close_on_toggle(false, false);
        torbutton_disable_tor();
    } else {
        torbutton_close_on_toggle(true, false);
        torbutton_enable_tor(false);
    }
}

// Bug 1506 P0: Die toggle, die!
function torbutton_set_status() {
    var state = false;
    if (torbutton_check_status()) {
        state = true;
        try {
            torbutton_update_status(true);
        } catch(e) {
            torbutton_log(5,'Error applying tor settings: '+e);
            var wm = Cc["@mozilla.org/appshell/window-mediator;1"]
                .getService(Components.interfaces.nsIWindowMediator);
            var chrome = wm.getMostRecentWindow("navigator:browser");
            var warning1 = torbutton_get_property_string("torbutton.popup.pref_error");

            if (e.result == 0x80520015 || e.result == 0x80520013) { // NS_ERROR_FILE_ACCESS_DENIED/NS_ERROR_FILE_READ_ONLY
                var warning2 = torbutton_get_property_string("torbutton.popup.permission_denied");
                chrome.alert(warning1+"\n\n"+warning2);
            } else if (e.result == 0x80520010) { // NS_ERROR_FILE_NO_DEVICE_SPACE
                var o_stringbundle = torbutton_get_stringbundle();
                var warning2 = torbutton_get_property_string("torbutton.popup.device_full");
                chrome.alert(warning1+"\n\n"+warning2);
            } else {
                // This should never happen.. 
                chrome.alert(warning1+"\n\n"+e);
            }
            // Setting these prefs should avoid ininite recursion
            // because torbutton_update_status should return immediately
            // on the next call.
            m_tb_prefs.setBoolPref("extensions.torbutton.tor_enabled", false);
            m_tb_prefs.setBoolPref("extensions.torbutton.proxies_applied", false);
            m_tb_prefs.setBoolPref("extensions.torbutton.settings_applied", false);
            torbutton_disable_tor();
        }
    } else {
        state = false;
        try {
            torbutton_update_status(false);
        } catch(e) {
            torbutton_log(5,'Error applying nontor settings: '+e);

            var wm = Cc["@mozilla.org/appshell/window-mediator;1"]
                .getService(Components.interfaces.nsIWindowMediator);
            var chrome = wm.getMostRecentWindow("navigator:browser");
            var warning1 = torbutton_get_property_string("torbutton.popup.pref_error");

            if (e.result == 0x80520015 || e.result == 0x80520013) { // NS_ERROR_FILE_ACCESS_DENIED/NS_ERROR_FILE_READ_ONLY
                var warning2 = torbutton_get_property_string("torbutton.popup.permission_denied");
                chrome.alert(warning1+"\n\n"+warning2);
            } else if (e.result == 0x80520010) { // NS_ERROR_FILE_NO_DEVICE_SPACE
                var warning2 = torbutton_get_property_string("torbutton.popup.device_full");
                chrome.alert(warning1+"\n\n"+warning2);
            } else {
                // This should never happen.. 
                chrome.alert(warning1+"\n\n"+e);
            }
            // Setting these prefs should avoid infinite recursion
            // because torbutton_update_status should return immediately
            // on the next call.
            m_tb_prefs.setBoolPref("extensions.torbutton.tor_enabled", true);
            m_tb_prefs.setBoolPref("extensions.torbutton.proxies_applied", true);
            m_tb_prefs.setBoolPref("extensions.torbutton.settings_applied", true);
            torbutton_enable_tor(true);
        }
    }
}

// Bug 1506 P0: Die toggle die
function torbutton_init_toolbutton()
{
    try {
      torbutton_log(3, "Initializing the Torbutton button.");
      // Prevent the FF4 status bar from making our menu invisible...
      /* Not needed
      var o_toolbutton = torbutton_get_toolbutton();
      if (o_toolbutton) {
        var context = document.getElementById('torbutton-context-menu');
        context.style.visibility = "visible";
        context.hidden = false;
        torbutton_log(3, "Set new context menu.");
      }
      */
      torbutton_update_toolbutton(torbutton_check_status());
    } catch(e) {
      torbutton_log(4, "Error Initializing Torbutton button: "+e);
    }
}

// Bug 1506 P2-P4: This code sets some version variables that are irrelevant.
// It does read out some important environment variables, though. It is
// called once per browser window.. This might belong in a component.
function torbutton_init() {
    torbutton_log(3, 'called init()');
    
    if (m_tb_wasinited) {
        return;
    }
    m_tb_wasinited = true;

    m_tb_prefs =  Components.classes["@mozilla.org/preferences-service;1"]
        .getService(Components.interfaces.nsIPrefBranch);

    // Determine if we are firefox 3 or not.
    var appInfo = Components.classes["@mozilla.org/xre/app-info;1"]
        .getService(Components.interfaces.nsIXULAppInfo);
    var versionChecker = Components.classes["@mozilla.org/xpcom/version-comparator;1"]
        .getService(Components.interfaces.nsIVersionComparator);

    if(versionChecker.compare(appInfo.version, "15.0a1") >= 0) {
        m_tb_ff15 = true;
    } else {
        m_tb_ff15 = false;
    }

    if(versionChecker.compare(appInfo.version, "10.0.8") >= 0
       && versionChecker.compare(appInfo.version, "11.0a1") < 0) {
        m_tb_ff10_8 = true;
    } else {
        m_tb_ff10_8 = false;
    }

    if(versionChecker.compare(appInfo.version, "4.0a1") >= 0) {
        m_tb_ff4 = true;
    } else {
        m_tb_ff4 = false;
    }

    if(versionChecker.compare(appInfo.version, "3.0a1") >= 0) {
        m_tb_ff3 = true;
    } else {
        m_tb_ff3 = false;
    }

    if(versionChecker.compare(appInfo.version, "3.5a1") >= 0) {
        m_tb_ff35 = true;
    } else {
        m_tb_ff35 = false;
    }

    if(versionChecker.compare(appInfo.version, "3.6a1") >= 0) {
        m_tb_ff36 = true;
    } else {
        m_tb_ff36 = false;
    }

    try {
      var test = m_tb_prefs.getCharPref("torbrowser.version");
      m_tb_tbb = true;
      torbutton_log(3, "This is a Tor Browser");
    } catch(e) {
      torbutton_log(3, "This is not a Tor Browser: "+e);
    }

    // Bug 1506 P4: These vars are very important for New Identity
    var environ = Components.classes["@mozilla.org/process/environment;1"]
                   .getService(Components.interfaces.nsIEnvironment);

    if (environ.exists("TOR_CONTROL_PASSWD")) {
        m_tb_control_pass = environ.get("TOR_CONTROL_PASSWD");
    } else if (environ.exists("TOR_CONTROL_COOKIE_AUTH_FILE")) {
        var cookie_path = environ.get("TOR_CONTROL_COOKIE_AUTH_FILE");
        try {
            if ("" != cookie_path) {
                m_tb_control_pass = torbutton_read_authentication_cookie(cookie_path);
            }
        } catch(e) {
            torbutton_log(4, 'unable to read authentication cookie');
        }
    } else {
        // Try to get password from Tor Launcher.
        try {
		    let tlps = Cc["@torproject.org/torlauncher-protocol-service;1"]
						 .getService(Ci.nsISupports).wrappedJSObject;
            m_tb_control_pass = tlps.TorGetPassword(false);
        } catch(e) {}
	}

    if (environ.exists("TOR_CONTROL_PORT")) {
        m_tb_control_port = environ.get("TOR_CONTROL_PORT");
    } else {
        try {
            const kTLControlPortPref = "extensions.torlauncher.control_port";
            m_tb_control_port = m_tb_prefs.getIntPref(kTLControlPortPref);
        } catch(e) {}
    }

    if (environ.exists("TOR_CONTROL_HOST")) {
        m_tb_control_host = environ.get("TOR_CONTROL_HOST");
    } else {
        try {
            const kTLControlHostPref = "extensions.torlauncher.control_host";
            m_tb_control_host = m_tb_prefs.getCharPref(kTLControlHostPref);
        } catch(e) {
            m_tb_control_host = "127.0.0.1";
		}
    }

    // Add our hook into about page load
    m_tb_orig_BrowserOnAboutPageLoad = window.BrowserOnAboutPageLoad;
    window.BrowserOnAboutPageLoad = torbutton_override_BrowserOnAboutPageLoad;

    // initialize preferences before we start our prefs observer
    torbutton_init_prefs();

    // set panel style from preferences
    torbutton_set_panel_style();

    // listen for our toolbar button being added so we can initialize it
    torbutton_init_toolbutton();

    torbutton_log(1, 'registering pref observer');
    torbutton_window_pref_observer.register(); 

    torbutton_log(1, "registering Tor check observer");
    torbutton_tor_check_observer.register();
    
    //setting up context menu
    //var contextMenu = document.getElementById("contentAreaContextMenu");
    //if (contextMenu)
    //  contextMenu.addEventListener("popupshowing", torbutton_check_contextmenu, false);

    // Add toolbutton to the bar.
    // This should maybe be in the startup function, but we want to add
    // the button to the panel before it's state (color) is set..
    if (!m_tb_prefs.getBoolPref("extensions.torbutton.inserted_button")) {
      torbutton_log(3, 'Adding button');
      try {
        var toolbutton = torbutton_get_button_from_toolbox();
        var navbar = document.getElementById("nav-bar");
        // XXX: Will probably fail on fennec. Also explicitly forbidden
        // by MDC style guides (for good reason). Fix later..
        var urlbar = document.getElementById("urlbar-container");
        navbar.insertBefore(toolbutton, urlbar);
        navbar.setAttribute("currentset", navbar.currentSet);
        document.persist("nav-bar", "currentset");
        torbutton_log(3, 'Button added');
        m_tb_prefs.setBoolPref("extensions.torbutton.inserted_button", true);
      } catch(e) {
        torbutton_log(4, 'Failed to add Torbutton to toolbar: '+e);
      }
    }

    torbutton_set_panel_view();
    torbutton_log(1, 'setting torbutton status from proxy prefs');
    torbutton_set_status();
    var mode = m_tb_prefs.getBoolPref("extensions.torbutton.tor_enabled");
    torbutton_update_toolbutton(mode);
    torbutton_update_statusbar(mode);
    torbutton_notify_if_update_needed();

    torbutton_log(3, 'init completed');
}

// Bug 1506 P3: This code asks the user once if they want to spoof their
// language to English.
//
// Asks the user whether Torbutton should make "English requests", and updates
// the extensions.torbutton.spoof_english preference accordingly.
function torbutton_prompt_for_language_preference() {
  var prompts = Cc["@mozilla.org/embedcomp/prompt-service;1"]
      .getService(Components.interfaces.nsIPromptService);

  // Display two buttons, both with string titles.
  var flags = prompts.STD_YES_NO_BUTTONS;

  var message = torbutton_get_property_string("torbutton.popup.prompted_language");

  var response = prompts.confirmEx(null, "", message, flags, null, null, null,
      null, {value: false});

  // Update preferences to reflect their response and to prevent the prompt from
  // being displayed again.
  m_tb_prefs.setBoolPref("extensions.torbutton.spoof_english", response == 0);
  m_tb_prefs.setBoolPref("extensions.torbutton.prompted_language", true);
}

function torbutton_confirm_plugins() {
  var any_plugins_enabled = false;
  var PH=Cc["@mozilla.org/plugin/host;1"].getService(Ci.nsIPluginHost);
  var P=PH.getPluginTags({});
  for(var i=0; i<P.length; i++) {
      if (!P[i].disabled)
        any_plugins_enabled = true;
  }

  if (!any_plugins_enabled) {
    torbutton_log(3, "False positive on plugin notification. Ignoring");
    return;
  }
  
  torbutton_log(3, "Confirming plugin usage.");

  var prompts = Cc["@mozilla.org/embedcomp/prompt-service;1"]
      .getService(Components.interfaces.nsIPromptService);

  // Display two buttons, both with string titles.
  var flags = prompts.STD_YES_NO_BUTTONS + prompts.BUTTON_DELAY_ENABLE;
      
  var message = torbutton_get_property_string("torbutton.popup.confirm_plugins");
  var askAgainText = torbutton_get_property_string("torbutton.popup.never_ask_again");
  var askAgain = {value: false};

  var no_plugins = (prompts.confirmEx(null, "", message, flags, null, null, null,
      askAgainText, askAgain) == 1);

  m_tb_prefs.setBoolPref("extensions.torbutton.confirm_plugins", !askAgain.value);

  // The pref observer for no_tor_plugins will set the appropriate plugin state.
  // So, we only touch the pref if it has changed.
  if (no_plugins != 
      m_tb_prefs.getBoolPref("extensions.torbutton.no_tor_plugins"))
    m_tb_prefs.setBoolPref("extensions.torbutton.no_tor_plugins", no_plugins);
  else
    torbutton_toggle_plugins(no_plugins);

  // Now, if any tabs were open to about:addons, reload them. Our popup
  // messed up that page.
  var wm = Components.classes["@mozilla.org/appshell/window-mediator;1"]
                     .getService(Components.interfaces.nsIWindowMediator);
  var browserEnumerator = wm.getEnumerator("navigator:browser");
 
  // Check each browser instance for our URL
  while (browserEnumerator.hasMoreElements()) {
    var browserWin = browserEnumerator.getNext();
    var tabbrowser = browserWin.gBrowser;
 
    // Check each tab of this browser instance
    var numTabs = tabbrowser.browsers.length;
    for (var index = 0; index < numTabs; index++) {
      var currentBrowser = tabbrowser.getBrowserAtIndex(index);
      if ("about:addons" == currentBrowser.currentURI.spec) {
        torbutton_log(3, "Got browser: "+currentBrowser.currentURI.spec);
        currentBrowser.reload();
      }
    }
  }
}

function torbutton_inform_about_tbb() {
  var prompts = Cc["@mozilla.org/embedcomp/prompt-service;1"]
      .getService(Components.interfaces.nsIPromptService);

  var message = torbutton_get_property_string("torbutton.popup.prompt_torbrowser");
  var title = torbutton_get_property_string("torbutton.title.prompt_torbrowser");
  var checkbox = {value: false};

  var sb = Components.classes["@mozilla.org/intl/stringbundle;1"]
      .getService(Components.interfaces.nsIStringBundleService);
  var browserstrings = sb.createBundle("chrome://browser/locale/browser.properties");

  var askagain = browserstrings.GetStringFromName("privateBrowsingNeverAsk");

  var response = prompts.alertCheck(null, title, message, askagain, checkbox);

  // Update preferences to reflect their response and to prevent the prompt from
  // being displayed again.
  m_tb_prefs.setBoolPref("extensions.torbutton.prompt_torbrowser", !checkbox.value);
}

// Bug 1506 P0: Our prefs should be handled by Tor Browser. Even if they're
// not, they should be vastly simplified from this. See also #3100.
//
// this function duplicates a lot of code in preferences.js for deciding our
// recommended settings.  figure out a way to eliminate the redundancy.
// TODO: Move it to torbutton_util.js?
function torbutton_init_prefs() {
    var torprefs = false;
    var proxy_port;
    var proxy_host;
    torbutton_log(2, "called init_prefs()");
    torprefs = torbutton_get_prefbranch('extensions.torbutton.');

    if (torprefs.getCharPref('settings_method') == 'recommended') {
        torbutton_log(2, "using recommended settings");
        if (torbutton_has_good_socks()) {
            proxy_host = '';
            proxy_port = 0;
        } else {
            // Privoxy is always recommended for Firefoxes not supporting socks_remote_dns
            if (!torbutton_check_socks_remote_dns())
                torprefs.setBoolPref('use_privoxy', true);

            if (torprefs.getBoolPref('use_privoxy')) {
                proxy_host = '127.0.0.1';
                proxy_port = 8118;
            } else {
                proxy_host = '';
                proxy_port = 0;
            }
        }

        if (torbutton_check_socks_remote_dns()) {
            torprefs.setCharPref('http_proxy', proxy_host);
            torprefs.setCharPref('https_proxy', proxy_host);
            torprefs.setCharPref('ftp_proxy', '');
            torprefs.setIntPref('http_port', proxy_port);
            torprefs.setIntPref('https_port', proxy_port);
            torprefs.setIntPref('ftp_port', 0);
            if (!m_tb_ff4) {
                torprefs.setCharPref('gopher_proxy', '');
                torprefs.setIntPref('gopher_port', 0);
            }
        } else {
            torprefs.setCharPref('http_proxy', proxy_host);
            torprefs.setCharPref('https_proxy', proxy_host);
            torprefs.setCharPref('ftp_proxy', proxy_host);
            if (!m_tb_ff4) {
                torprefs.setCharPref('gopher_proxy', proxy_host);
                torprefs.setIntPref('gopher_port', proxy_port);
            }
            torprefs.setIntPref('http_port', proxy_port);
            torprefs.setIntPref('https_port', proxy_port);
            torprefs.setIntPref('ftp_port', proxy_port);
        }
    }

    torbutton_log(1, 'http_port='+torprefs.getIntPref('http_port'));
}

// Bug 1506 P2: It might be nice to let people move the button around, I guess?
function torbutton_get_button_from_toolbox() {
    var toolbox = document.getElementById("navigator-toolbox");
    for (var child = toolbox.palette.firstChild; child; child = child.nextSibling)
        if (child.id == "torbutton-button")
            return child;
    torbutton_log(3, "Could not find toolbox button, trying in window DOM");
    return torbutton_get_toolbutton();
}

// Bug 1506 P2: It might be nice to let people move the button around, I guess?
function torbutton_get_toolbutton() {
    var o_toolbutton = false;

    torbutton_log(1, 'get_toolbutton(): looking for button element');
    if (document.getElementById("torbutton-button")) {
        o_toolbutton = document.getElementById("torbutton-button");
    } else if (document.getElementById("torbutton-button-tb")) {
        o_toolbutton = document.getElementById("torbutton-button-tb");
    } else if (document.getElementById("torbutton-button-tb-msg")) {
        o_toolbutton = document.getElementById("torbutton-button-tb-msg");
    } else {
        torbutton_log(3, 'get_toolbutton(): did not find torbutton-button');
    }

    return o_toolbutton;
}

function torbutton_get_statuspanel() {
    var o_statuspanel = false;

    torbutton_log(1, 'init_statuspanel(): looking for statusbar element');
    if (document.getElementById("torbutton-panel")) {
        o_statuspanel = document.getElementById("torbutton-panel");
    } else {
        torbutton_log(5, 'ERROR (init): failed to find torbutton-panel');
    }

    return o_statuspanel;
}

function torbutton_update_is_needed() {
    var updateNeeded = false;
    try {
        updateNeeded = m_tb_prefs.getBoolPref(k_tb_browser_update_needed_pref);
    } catch (e) {}

    return updateNeeded;
}

function torbutton_notify_if_update_needed() {
    function setOrClearAttribute(aElement, aAttrName, aValue)
    {
        if (!aElement || !aAttrName)
            return;

        if (aValue)
            aElement.setAttribute(aAttrName, aValue);
        else
            aElement.removeAttribute(aAttrName);
    }

    let updateNeeded = torbutton_update_is_needed();

    // Change look of toolbar item (enable/disable animated update icon).
    var btn = torbutton_get_toolbutton();
    setOrClearAttribute(btn, "tbUpdateNeeded", updateNeeded);

    // Update all open about:tor pages.
    torbutton_update_all_abouttor_pages(updateNeeded, undefined);

    // Hide/show download menu item and preceding separator.
    var item = document.getElementById("torbutton-downloadUpdate");
    setOrClearAttribute(item, "hidden", !updateNeeded);
    if (item)
        setOrClearAttribute(item.previousSibling, "hidden", !updateNeeded);
}

function torbutton_download_update() {
    var downloadURI = "https://www.torproject.org/download/download-easy.html";
    var rtSvc = Components.classes["@mozilla.org/xre/app-info;1"]
                          .getService(Components.interfaces.nsIXULRuntime);
    downloadURI += "?os=" + rtSvc.OS + "&arch=" + rtSvc.XPCOMABI;
    if (rtSvc.OS == "Darwin")
      downloadURI += "#mac";
    else if (rtSvc.OS == "WINNT")
      downloadURI += "#win";
    else if (rtSvc.OS == "Linux")
      downloadURI += "#linux";

    var newTab = gBrowser.addTab(downloadURI);
    gBrowser.selectedTab = newTab;
}

// Pass undefined for a parameter to have this function determine it.
// Returns a count of open pages that were updated,
function torbutton_update_all_abouttor_pages(aUpdateNeeded, aTorIsOn) {
  if (aUpdateNeeded === undefined)
    aUpdateNeeded = torbutton_update_is_needed();
  if (aTorIsOn === undefined)
    aTorIsOn = torbutton_tor_check_ok();

  var count = 0;
  var tabBrowser = top.getBrowser();
  var tabs = tabBrowser.mTabs;
  if (tabs && (tabs.length > 0)) {
    for (var tab = tabs[0]; tab != null; tab = tab.nextSibling) {
      try {
        let doc = tabBrowser.getBrowserForTab(tab).contentDocument;
        if (torbutton_update_abouttor_doc(doc, aTorIsOn, aUpdateNeeded))
          ++count;
      } catch(e) {}
    }
  }

  return count;
}

// Returns true if aDoc is an about:tor page.
function torbutton_update_abouttor_doc(aDoc, aTorOn, aUpdateNeeded) {
  var isAboutTor = torbutton_is_abouttor_doc(aDoc);
  if (isAboutTor) {
    if (aTorOn)
      aDoc.body.setAttribute("toron", "yes");
    else
      aDoc.body.removeAttribute("toron");

    if (aUpdateNeeded)
      aDoc.body.setAttribute("torNeedsUpdate", "yes"); 
    else
      aDoc.body.removeAttribute("torNeedsUpdate");

    try
    {
      const kBrandBundle = "chrome://branding/locale/brand.properties";
      let brandBundle = Cc["@mozilla.org/intl/stringbundle;1"]
                          .getService(Ci.nsIStringBundleService)
                          .createBundle(kBrandBundle);
      let productName = brandBundle.GetStringFromName("brandFullName");
      let tbbVersion = m_tb_prefs.getCharPref("torbrowser.version");
      let e = aDoc.getElementById("torstatus-version");

      while (e.firstChild)
        e.removeChild(e.firstChild);
      e.appendChild(aDoc.createTextNode(productName + '\n' + tbbVersion));
    } catch (e) {}
  }

  return isAboutTor;
}

function torbutton_override_BrowserOnAboutPageLoad(aDoc) {
  if (torbutton_is_abouttor_doc(aDoc) &&
      !aDoc.documentElement.hasAttribute("aboutTorLoaded")) {
    aDoc.documentElement.setAttribute("aboutTorLoaded", true);

    // Show correct Tor on/off and "update needed" status.
    let torOn = torbutton_tor_check_ok();
    let needsUpdate = torbutton_update_is_needed();
    torbutton_update_abouttor_doc(aDoc, torOn, needsUpdate);

    // Insert "Test Tor Network Settings" url.
    let elem = aDoc.getElementById("testTorSettings");
    if (elem) {
      let locale = m_tb_prefs.getCharPref("general.useragent.locale");
      locale = locale.replace(/-/g, '_');
      let url = m_tb_prefs.getCharPref(
                      "extensions.torbutton.test_url_interactive");
      elem.href = url.replace(/__LANG__/g, locale);
    }
  }

  if (m_tb_orig_BrowserOnAboutPageLoad)
    m_tb_orig_BrowserOnAboutPageLoad(aDoc);
}

function torbutton_is_abouttor_doc(aDoc) {
  return (aDoc && /^about:tor$/i.test(aDoc.documentURI.toLowerCase()));
}

// Bug 1506 P0: Toggle. Kill kill kill.
function torbutton_save_nontor_settings()
{
  var liveprefs = false;
  var savprefs = false;

  liveprefs = torbutton_get_prefbranch('network.proxy.');
  savprefs = torbutton_get_prefbranch('extensions.torbutton.saved.');
  if (!liveprefs || !savprefs) {
      torbutton_log(4, 'Prefbranch error');
      return;
  }

  torbutton_log(2, 'saving nontor settings');
  savprefs.setIntPref('type',          liveprefs.getIntPref('type'));
  savprefs.setCharPref('http_proxy',   liveprefs.getCharPref('http'));
  savprefs.setIntPref('http_port',     liveprefs.getIntPref('http_port'));
  savprefs.setCharPref('https_proxy',  liveprefs.getCharPref('ssl'));
  savprefs.setIntPref('https_port',    liveprefs.getIntPref('ssl_port'));
  savprefs.setCharPref('ftp_proxy',    liveprefs.getCharPref('ftp'));
  torbutton_log(1, 'half-way');
  savprefs.setIntPref('ftp_port',      liveprefs.getIntPref('ftp_port'));
  savprefs.setCharPref('socks_host',   liveprefs.getCharPref('socks'));
  savprefs.setIntPref('socks_port',    liveprefs.getIntPref('socks_port'));
  savprefs.setIntPref('socks_version', liveprefs.getIntPref('socks_version'));
  savprefs.setCharPref('no_proxies_on', liveprefs.getCharPref('no_proxies_on'));
  if (!m_tb_ff4) {
    savprefs.setCharPref('gopher_proxy', liveprefs.getCharPref('gopher'));
    savprefs.setIntPref('gopher_port',   liveprefs.getIntPref('gopher_port'));
  }
  try { // ff-0.9 doesn't have share_proxy_settings
    savprefs.setBoolPref('share_proxy_settings', liveprefs.getBoolPref('share_proxy_settings'));
  } catch(e) {}
  
  torbutton_log(1, 'almost there');
  if (torbutton_check_socks_remote_dns())
    savprefs.setBoolPref('socks_remote_dns',     liveprefs.getBoolPref('socks_remote_dns'));
  torbutton_log(2, 'Non-tor settings saved');
}

// Bug 1506 P0: Toggle. Kill kill kill.
function torbutton_restore_nontor_settings()
{
  var liveprefs = false;
  var savprefs = false;

  liveprefs = torbutton_get_prefbranch('network.proxy.');
  savprefs = torbutton_get_prefbranch('extensions.torbutton.saved.');
  if (!liveprefs || !savprefs) {
      torbutton_log(4, 'Prefbranch error');
      return;
  }

  torbutton_log(2, 'restoring nontor settings');

  m_tb_prefs.setBoolPref("extensions.torbutton.tor_enabled", false);
  liveprefs.setIntPref('type',          savprefs.getIntPref('type'));
  liveprefs.setCharPref('http',         savprefs.getCharPref('http_proxy'));
  liveprefs.setIntPref('http_port',     savprefs.getIntPref('http_port'));
  liveprefs.setCharPref('ssl',          savprefs.getCharPref('https_proxy'));
  liveprefs.setIntPref('ssl_port',      savprefs.getIntPref('https_port'));
  liveprefs.setCharPref('ftp',          savprefs.getCharPref('ftp_proxy'));
  torbutton_log(1, 'half-way there');
  liveprefs.setIntPref('ftp_port',      savprefs.getIntPref('ftp_port'));
  if (!m_tb_ff4) {
      liveprefs.setCharPref('gopher',       savprefs.getCharPref('gopher_proxy'));
      liveprefs.setIntPref('gopher_port',   savprefs.getIntPref('gopher_port'));
  }
  liveprefs.setCharPref('socks',        savprefs.getCharPref('socks_host'));
  liveprefs.setIntPref('socks_port',    savprefs.getIntPref('socks_port'));
  liveprefs.setIntPref('socks_version', savprefs.getIntPref('socks_version'));
  liveprefs.setCharPref('no_proxies_on',savprefs.getCharPref('no_proxies_on'));
  try { // ff-0.9 doesn't have share_proxy_settings
    liveprefs.setBoolPref('share_proxy_settings', savprefs.getBoolPref('share_proxy_settings'));
  } catch(e) {}
  
  torbutton_log(1, 'almost there');
  if (torbutton_check_socks_remote_dns())
    liveprefs.setBoolPref('socks_remote_dns',     savprefs.getBoolPref('socks_remote_dns'));

  // This is needed for torbrowser and other cases where the 
  // proxy prefs are actually the same..
  if(torbutton_check_status()) {
      m_tb_prefs.setBoolPref("extensions.torbutton.tor_enabled", true);
  }

  torbutton_log(2, 'settings restored');
}

// Bug 1506 P4: Checking for Tor Browser updates is pretty important,
// probably even as a fallback if we ever do get a working updater.
function torbutton_do_async_versioncheck() {
  if (!m_tb_tbb || !m_tb_prefs.getBoolPref("extensions.torbutton.versioncheck_enabled")) {
    return;
  }

  // Suppress update check if done recently.
  const kLastCheckPref = "extensions.torbutton.lastUpdateCheck";
  const kMinSecsBetweenChecks = 90 * 60; // 1.5 hours
  var now = Date.now() / 1000;
  var lastCheckTime;
  try {
    lastCheckTime = parseFloat(m_tb_prefs.getCharPref(kLastCheckPref));
    if (isNaN(lastCheckTime))
      lastCheckTime = undefined;
  } catch (e) {}

  if (lastCheckTime && ((now - lastCheckTime) < kMinSecsBetweenChecks))
    return;

  m_tb_prefs.setCharPref(kLastCheckPref, now);

  torbutton_log(3, "Checking version with socks port: "
          +m_tb_prefs.getIntPref("extensions.torbutton.socks_port"));
  try {
    var req = Components.classes["@mozilla.org/xmlextras/xmlhttprequest;1"]
                            .createInstance(Components.interfaces.nsIXMLHttpRequest);
    //var req = new XMLHttpRequest(); Blocked by content policy
    var url = m_tb_prefs.getCharPref("extensions.torbutton.versioncheck_url");
    req.open('GET', url, true);
    req.channel.loadFlags |= Ci.nsIRequest.LOAD_BYPASS_CACHE;
    req.overrideMimeType("text/json");
    req.onreadystatechange = function (oEvent) {  
      if (req.readyState === 4) {
        if(req.status == 200) {
          if(!req.responseText) {
            torbutton_log(5, "Version check failed! No JSON present!");
            return -1;
          }
          try {
            var version_list = JSON.parse(req.responseText);
            var my_version = m_tb_prefs.getCharPref("torbrowser.version");
            for (var v in version_list) {
              if (version_list[v] == my_version) {
                torbutton_log(3, "Version check passed.");
                m_tb_prefs.setBoolPref(k_tb_browser_update_needed_pref, false);
                return;
              }
            }
            torbutton_log(5, "Your Tor Browser is out of date.");
            m_tb_prefs.setBoolPref(k_tb_browser_update_needed_pref, true);
            return;
          } catch(e) {
            torbutton_log(5, "Version check failed! JSON parsing error: "+e);
            return;
          }
        } else if (req.status == 404) {
          // We're going to assume 404 means the service is not implemented yet.
          torbutton_log(3, "Version check failed. Versions file is 404.");
          return -1;
        }
        torbutton_log(5, "Version check failed! Web server error: "+req.status);
        return -1;
      }  
    };  
    req.send(null);
  } catch(e) {
    if(e.result == 0x80004005) { // NS_ERROR_FAILURE
      torbutton_log(5, "Version check failed! Is tor running?");
      return -1;
    }
    torbutton_log(5, "Version check failed! Tor internal error: "+e);
    return -1;
  }

}

// Bug 1506 P0: Deprecated by the async version.
function torbutton_check_version() {
  torbutton_log(3, "Checking version");
  try {
    var req = Components.classes["@mozilla.org/xmlextras/xmlhttprequest;1"]
                            .createInstance(Components.interfaces.nsIXMLHttpRequest);
    //var req = new XMLHttpRequest(); Blocked by content policy
    var url = m_tb_prefs.getCharPref("extensions.torbutton.versioncheck_url");
    req.open('GET', url, false);
    req.overrideMimeType("text/json");
    req.send(null);
  } catch(e) {
    if(e.result == 0x80004005) { // NS_ERROR_FAILURE
      torbutton_log(5, "Version check failed! Is tor running?");
      return -1;
    }
    torbutton_log(5, "Version check failed! Tor internal error: "+e);
    return -1;
  }
  if(req.status == 200) {
    if(!req.responseText) {
      torbutton_log(5, "Version check failed! No JSON present!");
      return -1;
    }
    try {
      var version_list = JSON.parse(req.responseText);
      // torbrowser.version may not exist..
      var my_version = m_tb_prefs.getCharPref("torbrowser.version");
      for (var v in version_list) {
        if (version_list[v] == my_version) {
          return 1;
        }
      }
      return 0;
    } catch(e) {
      torbutton_log(5, "Version check failed! JSON parsing error: "+e);
      return -1;
    }
  } else if (req.status == 404) {
    // We're going to assume 404 means the service is not implemented yet.
    torbutton_log(3, "Version check failed. Versions file is 404.");
    return -1;
  }
  torbutton_log(5, "Version check failed! Web server error: "+req.status);
  return -1;
}

// Bug 1506 P2: Probably a good idea to have some way to test everything,
// but will need to be decoupled from the toggle logic :/
function torbutton_test_settings() {
    var wasEnabled = true;
    if(!torbutton_check_status()) {
        wasEnabled = false;
        torbutton_enable_tor(true);
    }
            
    torbutton_log(3, "Testing Tor settings");

    m_tb_prefs.setBoolPref("extensions.torbutton.test_failed", true);
    try {
        var checkSvc = Cc["@torproject.org/torbutton-torCheckService;1"]
                         .getService(Ci.nsISupports).wrappedJSObject;
        var req = checkSvc.createCheckRequest(false);
        req.send(null);
    } catch(e) {
        // FIXME: This happens if this function is called from a browser
        // window with tor disabled because the content policy will block us.
        // Right now the check works because we get called from the 
        // preference window. Sort of makes automatic testing a bit trickier..
        if(!wasEnabled) torbutton_disable_tor();
        if(e.result == 0x80004005) { // NS_ERROR_FAILURE
            torbutton_log(5,
                    "Test failed! HTTP proxy down or request blocked!");
            return 8;
        }
        torbutton_log(5, "Test failed! Tor internal error: "+e);
        return 0;
    }

    var ret = checkSvc.parseCheckResponse(req);
    if (ret == 4)
      m_tb_prefs.setBoolPref("extensions.torbutton.test_failed", false);
    if(!wasEnabled) torbutton_disable_tor();
    torbutton_log(3, "Done testing Tor settings. Result: "+ret);
    return ret;
}

// Bug 1506 P0: Toggle must die.
function torbutton_disable_tor()
{
  torbutton_log(3, 'called disable_tor()');
  torbutton_restore_nontor_settings();
}

// Bug 1506 P0: Toggle must die.
function torbutton_enable_tor(force)
{
  torbutton_log(3, 'called enable_tor()');

  if(!force && m_tb_prefs.getBoolPref("extensions.torbutton.test_failed")) {
      var warning = torbutton_get_property_string("torbutton.popup.test.confirm_toggle");
      var wm = Cc["@mozilla.org/appshell/window-mediator;1"]
                   .getService(Components.interfaces.nsIWindowMediator);
      var chrome = wm.getMostRecentWindow("navigator:browser");
      if(!chrome.confirm(warning)) {
          return;
      }
  }

  torbutton_save_nontor_settings();
  torbutton_activate_tor_settings();
}

// Bug 1506 P0: Toggle must die.
function torbutton_update_toolbutton(mode)
{
  var o_toolbutton = torbutton_get_toolbutton();
  if (!o_toolbutton) return;
  var tooltip = "";

  if (mode && torbutton_tor_check_ok()) {
      tooltip = torbutton_get_property_string("torbutton.panel.label.enabled");
      o_toolbutton.setAttribute('tbstatus', 'on');
      o_toolbutton.setAttribute('tooltiptext', tooltip);
  } else {
      tooltip = torbutton_get_property_string("torbutton.panel.label.disabled");
      o_toolbutton.setAttribute('tbstatus', 'off');
      o_toolbutton.setAttribute('tooltiptext', tooltip);
  }
}

// Bug 1506 P0: Toggle must die.
function torbutton_update_statusbar(mode)
{
    var o_statuspanel = torbutton_get_statuspanel();
    if (!window.statusbar.visible) return;
    var label = "";
    var tooltip = "";

    if (mode && torbutton_tor_check_ok()) {
        label   = torbutton_get_property_string("torbutton.panel.label.enabled");
        tooltip = torbutton_get_property_string("torbutton.panel.tooltip.enabled");
        o_statuspanel.style.color = "#390";
        o_statuspanel.setAttribute('label', label);
        o_statuspanel.setAttribute('tooltiptext', tooltip);
        o_statuspanel.setAttribute('tbstatus', 'on');
    } else {
        label   = torbutton_get_property_string("torbutton.panel.label.disabled");
        tooltip = torbutton_get_property_string("torbutton.panel.tooltip.disabled");
        o_statuspanel.style.color = "#F00";
        o_statuspanel.setAttribute('label', label);
        o_statuspanel.setAttribute('tooltiptext', tooltip);
        o_statuspanel.setAttribute('tbstatus', 'off');
    }
}

// Bug 1506 P4: Timezone spoofing is pretty important
function torbutton_set_timezone(mode, startup) {
    /* Windows doesn't call tzset() automatically.. Linux and MacOS
     * both do though.. FF3.5 now calls _tzset() for us on windows.
     */
    // FIXME: Test:
    //  1. odd timezones like IST and IST+13:30
    //  2. negative offsets
    //  3. Windows-style spaced names
    var environ = Components.classes["@mozilla.org/process/environment;1"]
                   .getService(Components.interfaces.nsIEnvironment);
        
    torbutton_log(3, "Setting timezone at "+startup+" for mode "+mode);

    // For TZ info, see:
    // http://www-01.ibm.com/support/docview.wss?rs=0&uid=swg21150296
    // and 
    // http://msdn.microsoft.com/en-us/library/90s5c885.aspx
    if(startup) {
        // Save Date() string to pref
        var d = new Date();
        var offset = d.getTimezoneOffset();
        var offStr = "";
        if(d.getTimezoneOffset() < 0) {
            offset = -offset;
            offStr = "-";
        } else {
            offStr = "+";
        }
        
        if(Math.floor(offset/60) < 10) {
            offStr += "0";
        }
        offStr += Math.floor(offset/60)+":";
        if((offset%60) < 10) {
            offStr += "0";
        }
        offStr += (offset%60);

        // Regex match for 3 letter code
        var re = new RegExp('\\((\\S+)\\)', "gm");
        var match = re.exec(d.toString());
        // Parse parens. If parseable, use. Otherwise set TZ=""
        var set = ""
        if(match) {
            set = match[1]+offStr;
        } else {
            torbutton_log(3, "Skipping timezone storage");
        }
        m_tb_prefs.setCharPref("extensions.torbutton.tz_string", set);
    }

    if(mode) {
        torbutton_log(2, "Setting timezone to UTC");
        environ.set("TZ", "UTC");
    } else {
        // 1. If startup TZ string, reset.
        torbutton_log(2, "Unsetting timezone.");
        // FIXME: Tears.. This will not update during daylight switch for linux+mac users
        // Windows users will be fine though, because tz_string should be empty for them
        environ.set("TZ", m_tb_prefs.getCharPref("extensions.torbutton.tz_string"));
    }
}

// Bug 1506 P3: Support code for language+uagent spoofing
function torbutton_get_general_useragent_locale() {
   try {
        var locale = m_tb_prefs.getCharPref("general.useragent.locale");
        if (/chrome:\/\//.test(locale)) {
            return m_tb_prefs.getComplexValue("general.useragent.locale",
                       Components.interfaces.nsIPrefLocalizedString).data;
        }
        return locale;
    } catch(err) {
        torbutton_log(4, "Error while getting general.useragent.locale:" + err);
        return 'en-US';
    }
}

function torbutton_socket_read(input, full_output) {

    var status_code = "";
    var multi_line = "";

    status_code += input.readBytes(3);
    multi_line = input.readBytes(1);

    if ((multi_line === '+') && full_output) {
        return status_code + multi_line + torbutton_socket_read_all(input);
    } else {
        return status_code + multi_line + torbutton_socket_readline(input);
    }
}

// Bug 1506 P4: Control port interaction. Needed for New Identity.
function torbutton_socket_readline(input) {
  var str = "";
  var bytes;
  while((bytes = input.readBytes(1)) != "\n") {
    if (bytes != '\r')
      str += bytes;
  }
  return str;
}

function torbutton_socket_read_all(input) {
  var str = "";
  var bytes;

  // Read the output until the final "\n.\n".
  while ((str.lastIndexOf("\n.\n") === -1) ||
         (str.lastIndexOf("\n.\n") !== (str.length - 3))) {
    c = input.readBytes(1);
    if (c != '\r') {
      str += c;
    }
  }

  return str;
}

// Bug 1506 P4: Control port interaction. Needed for New Identity.
function torbutton_read_authentication_cookie(path) {
  var file = Components.classes['@mozilla.org/file/local;1']
             .createInstance(Components.interfaces.nsILocalFile);
  file.initWithPath(path);
  var fileStream = Components.classes['@mozilla.org/network/file-input-stream;1']
                   .createInstance(Components.interfaces.nsIFileInputStream);
  fileStream.init(file, 1, 0, false);
  var binaryStream = Components.classes['@mozilla.org/binaryinputstream;1']
                     .createInstance(Components.interfaces.nsIBinaryInputStream);
  binaryStream.setInputStream(fileStream);
  var array = binaryStream.readByteArray(fileStream.available());
  binaryStream.close();
  fileStream.close();
  return torbutton_array_to_hexdigits(array);
}

// Bug 1506 P4: Control port interaction. Needed for New Identity.
function torbutton_array_to_hexdigits(array) {
  return array.map(function(c) {
                     return String("0" + c.toString(16)).slice(-2)
                   }).join('');
};

// Bug 1506 P4: Control port interaction. Needed for New Identity.
//
// Executes a command on the control port.
// Return a string response upon success and null upon error.
function torbutton_send_ctrl_cmd(command, full_output) {
  try {

    if (full_output === undefined) full_output = false;

    var socketTransportService = Components.classes["@mozilla.org/network/socket-transport-service;1"]
        .getService(Components.interfaces.nsISocketTransportService);
    var socket = socketTransportService.createTransport(null, 0, m_tb_control_host, m_tb_control_port, null);

    // If we don't get a response from the control port in 2 seconds, someting is wrong..
    socket.setTimeout(Ci.nsISocketTransport.TIMEOUT_READ_WRITE, 2);

    var input = socket.openInputStream(3, 1, 1); // 3 == OPEN_BLOCKING|OPEN_UNBUFFERED
    var output = socket.openOutputStream(3, 1, 1); // 3 == OPEN_BLOCKING|OPEN_UNBUFFERED

    var inputStream     = Cc["@mozilla.org/binaryinputstream;1"].createInstance(Ci.nsIBinaryInputStream);
    var outputStream    = Cc["@mozilla.org/binaryoutputstream;1"].createInstance(Ci.nsIBinaryOutputStream);

    inputStream.setInputStream(input);
    outputStream.setOutputStream(output);

    var auth_cmd = "AUTHENTICATE "+m_tb_control_pass+"\r\n";
    outputStream.writeBytes(auth_cmd, auth_cmd.length);

    var bytes = torbutton_socket_read(inputStream, full_output);

    // Check if authentication resulted in a "250 OK" from Tor.
    if (bytes.indexOf("250") != 0) {
      torbutton_safelog(4, "Unexpected auth response on control port "+m_tb_control_port+":", bytes);
      return null;
    }

    outputStream.writeBytes(command, command.length);

    if (full_output) {
      bytes = torbutton_socket_read_all(inputStream);
    } else {
      bytes = torbutton_socket_read(inputStream, full_output);
    }

    if(bytes.indexOf("250") != 0) {
      torbutton_safelog(4, "Unexpected command response on control port "+m_tb_control_port+":", bytes);
      return null;
    }

    // Closing these streams prevents a shutdown hang on Mac OS. See bug 10201.
    inputStream.close();
    outputStream.close();
    socket.close(Components.results.NS_OK);
    return bytes.substr(4);
  } catch(e) {
    torbutton_log(4, "Exception on control port "+e);
    return null;
  }
}

// Bug 1506 P4: Needed for New Identity.
function torbutton_new_identity() {
  try {
    torbutton_do_new_identity();
  } catch(e) {
    torbutton_log(5, "Unexpected error on new identity: "+e);
    window.alert("Torbutton: Unexpected error on new identity: "+e);
  }
}

/* The "New Identity" implementation does the following:
 *   1. Disables Javascript and plugins on all tabs
 *   2. Clears state:
 *      a. OCSP
 *      b. Cache + image cache
 *      c. Site-specific zoom
 *      d. Cookies+DOM Storage+safe browsing key
 *      e. google wifi geolocation token
 *      f. http auth
 *      g. SSL Session IDs
 *      h. last open location url
 *      i. clear content prefs
 *   3. Sends tor the NEWNYM signal to get a new circuit
 *   4. Opens a new window with the default homepage
 *   5. Closes this window
 *
 * XXX: intermediate SSL certificates are not cleared.
 */
// Bug 1506 P4: Needed for New Identity.
function torbutton_do_new_identity() {
  var obsSvc = Components.classes["@mozilla.org/observer-service;1"].getService(Ci.nsIObserverService);
  torbutton_log(3, "New Identity: Disabling JS");
  torbutton_disable_all_js();

  m_tb_prefs.setBoolPref("browser.zoom.siteSpecific",
                         !m_tb_prefs.getBoolPref("browser.zoom.siteSpecific"));
  m_tb_prefs.setBoolPref("browser.zoom.siteSpecific",
                         !m_tb_prefs.getBoolPref("browser.zoom.siteSpecific"));

  if(m_tb_ff35) {
      try {
          if(m_tb_prefs.prefHasUserValue("geo.wifi.access_token")) {
              m_tb_prefs.clearUserPref("geo.wifi.access_token");
          }
      } catch(e) {
          torbutton_log(3, "Exception on wifi token clear: "+e);
      }
  }

  try {
      if(m_tb_prefs.prefHasUserValue("general.open_location.last_url")) {
          m_tb_prefs.clearUserPref("general.open_location.last_url");
      }
  } catch(e) {
      torbutton_log(3, "Exception on wifi token clear: "+e);
  }

  torbutton_log(3, "New Identity: Closing tabs and clearing searchbox");

  torbutton_close_on_toggle(true, true);

  var searchBar = window.document.getElementById("searchbar");
  if (searchBar)
      searchBar.textbox.reset();

  if (gFindBarInitialized) {
      var findbox = gFindBar.getElement("findbar-textbox");
      findbox.reset();
      gFindBar.close();
  }

  torbutton_log(3, "New Identity: Emitting Private Browsing Session clear event");
  obsSvc.notifyObservers(null, "browser:purge-session-history", "");

  torbutton_log(3, "New Identity: Clearing NoScript Temporary Permissions");

  try {
    if(m_tb_prefs.prefHasUserValue("noscript.temp"))
      m_tb_prefs.clearUserPref("noscript.temp");
  } catch(e) {
    torbutton_log(4, "New Identity: Error clearing NoScript Temporary Permissions: "+e);
  }

  torbutton_log(3, "New Identity: Clearing HTTP Auth");

  if(m_tb_prefs.getBoolPref('extensions.torbutton.clear_http_auth')) {
      var auth = Components.classes["@mozilla.org/network/http-auth-manager;1"].
          getService(Components.interfaces.nsIHttpAuthManager);
      auth.clearAll();
  }

  torbutton_log(3, "New Identity: Clearing Crypto Tokens");

  // Clear all crypto auth tokens. This includes calls to PK11_LogoutAll(),
  // nsNSSComponent::LogoutAuthenticatedPK11() and clearing the SSL session
  // cache.
  let sdr = Components.classes["@mozilla.org/security/sdr;1"].
                       getService(Components.interfaces.nsISecretDecoderRing);
  sdr.logoutAndTeardown();

  // This clears the OCSP cache.
  //
  // nsNSSComponent::Observe() watches security.OCSP.enabled, which calls
  // setValidationOptions(), which in turn calls setNonPkixOcspEnabled() which,
  // if security.OCSP.enabled is set to 0, calls CERT_DisableOCSPChecking(),
  // which calls CERT_ClearOCSPCache().
  // See: https://mxr.mozilla.org/comm-esr24/source/mozilla/security/manager/ssl/src/nsNSSComponent.cpp
  var ocsp = m_tb_prefs.getIntPref("security.OCSP.enabled");
  m_tb_prefs.setIntPref("security.OCSP.enabled", 0);
  m_tb_prefs.setIntPref("security.OCSP.enabled", ocsp);

  // This clears the STS cache and site permissions on Tor Browser
  // XXX: Tie to some kind of disk-ok pref?
  try {
      m_tb_prefs.setBoolPref('permissions.memory_only', false);
      m_tb_prefs.setBoolPref('permissions.memory_only', true);
  } catch(e) {
      // Actually, this catch does not appear to be needed. Leaving it in for
      // safety though.
      torbutton_log(3, "Can't clear STS/Permissions: Not Tor Browser: "+e);
  }

  // This clears the undo tab history.
  var tabs = m_tb_prefs.getIntPref("browser.sessionstore.max_tabs_undo");
  m_tb_prefs.setIntPref("browser.sessionstore.max_tabs_undo", 0);
  m_tb_prefs.setIntPref("browser.sessionstore.max_tabs_undo", tabs);

  torbutton_log(3, "New Identity: Clearing Image Cache");
  torbutton_clear_image_caches();

  torbutton_log(3, "New Identity: Clearing Offline Cache");

  var cache = Components.classes["@mozilla.org/network/cache-service;1"].
      getService(Components.interfaces.nsICacheService);

  try {
      cache.evictEntries(Ci.nsICache.STORE_OFFLINE);
  } catch(e) {
      torbutton_log(5, "Exception on cache clearing: "+e);
      window.alert("Torbutton: Unexpected error during offline cache clearing: "+e);
  }

  torbutton_log(3, "New Identity: Clearing LocalStorage");
  
  try {
      Components.utils.import("resource:///modules/offlineAppCache.jsm");
      OfflineAppCacheHelper.clear();
  } catch(e) {
      torbutton_log(5, "Exception on localStorage clearing: "+e);
      window.alert("Torbutton: Unexpected error during localStorage clearing: "+e);
  }

  torbutton_log(3, "New Identity: Clearing Disk Cache");

  try {
      cache.evictEntries(0);
  } catch(e) {
      torbutton_log(5, "Exception on cache clearing: "+e);
      window.alert("Torbutton: Unexpected error during cache clearing: "+e);
  }

  torbutton_log(3, "New Identity: Clearing Cookies and DOM Storage");

  if (m_tb_prefs.getBoolPref('extensions.torbutton.cookie_protections')) {
    var selector = Components.classes["@torproject.org/cookie-jar-selector;1"]
                    .getService(Components.interfaces.nsISupports)
                    .wrappedJSObject;
    // This emits "cookie-changed", "cleared", which kills DOM storage
    // and the safe browsing API key
    selector.clearUnprotectedCookies("tor");
  } else {
    torbutton_clear_cookies();
  }

  torbutton_log(3, "New Identity: Closing open connections");

  // Clear keep-alive
  obsSvc.notifyObservers(this, "net:prune-all-connections", null);

  torbutton_log(3, "New Identity: Clearing Content Preferences");

  // XXX: This may not clear zoom site-specific
  // browser.content.full-zoom
  if (Ci.nsIContentPrefService2) {   // Firefox >= 20
    XPCOMUtils.defineLazyModuleGetter(this, "PrivateBrowsingUtils",
                            "resource://gre/modules/PrivateBrowsingUtils.jsm");
    var pbCtxt = PrivateBrowsingUtils.privacyContextFromWindow(window);
    var cps = Cc["@mozilla.org/content-pref/service;1"]
                .getService(Ci.nsIContentPrefService2);
    cps.removeAllDomains(pbCtxt);
  } else {                           // Firefox < 20
    var cps = Cc["@mozilla.org/content-pref/service;1"].
        createInstance(Ci.nsIContentPrefService);
    cps.removeGroupedPrefs();
  }
  
  torbutton_log(3, "New Identity: Syncing prefs");

  // Force prefs to be synced to disk
  var prefService = Components.classes["@mozilla.org/preferences-service;1"]
      .getService(Components.interfaces.nsIPrefService);
  prefService.savePrefFile(null);
  
  torbutton_log(3, "New Identity: Sending NEWNYM");

  // We only support TBB for newnym.
  if (!m_tb_control_pass || !m_tb_control_port) {
    var warning = torbutton_get_property_string("torbutton.popup.no_newnym");
    torbutton_log(5, "Torbutton cannot safely newnym. It does not have access to the Tor Control Port.");
    window.alert(warning);
  } else {
    if (!torbutton_send_ctrl_cmd("SIGNAL NEWNYM\r\n")) {
      var warning = torbutton_get_property_string("torbutton.popup.no_newnym");
      torbutton_log(5, "Torbutton was unable to request a new circuit from Tor");
      window.alert(warning);
    }
  }

  torbutton_log(3, "Ending any remaining private browsing sessions.");
  obsSvc.notifyObservers(null, "last-pb-context-exited", "");

  torbutton_log(3, "New Identity: Opening a new browser window");

  // Open a new window with the TBB check homepage
  // In Firefox >=19, can pass {private: true} but we do not need it because
  // we have browser.privatebrowsing.autostart = true
  OpenBrowserWindow();

  torbutton_log(3, "New identity successful");

  // Close the current window for added safety
  window.close();
}

function torbutton_clear_image_caches()
{
  try {
    let imgCache;
    let imgTools = Cc["@mozilla.org/image/tools;1"].getService(Ci.imgITools);
    if (!("getImgCacheForDocument" in imgTools)) {
      // In Firefox 17 and older, there is one global image cache.  Clear it.
      imgCache = Cc["@mozilla.org/image/cache;1"].getService(Ci.imgICache);
      imgCache.clearCache(false); // evict all but chrome cache
    } else {
      // In Firefox 18 and newer, there are two image caches:  one that is
      // used for regular browsing and one that is used for private browsing.

      // Clear the non-private browsing image cache.
      imgCache = imgTools.getImgCacheForDocument(null);
      imgCache.clearCache(false); // evict all but chrome cache

      // Try to clear the private browsing cache.  To do so, we must locate
      // a content document that is contained within a private browsing window.
      let didClearPBCache = false;
      let wm = Cc["@mozilla.org/appshell/window-mediator;1"]
                 .getService(Ci.nsIWindowMediator);
      let enumerator = wm.getEnumerator("navigator:browser");
      while (!didClearPBCache && enumerator.hasMoreElements()) {
        let win = enumerator.getNext();
        let browserDoc = win.document.documentElement;
        if (!browserDoc.hasAttribute("privatebrowsingmode"))
          continue;

        let tabbrowser = win.getBrowser();
        if (!tabbrowser)
          continue;

        var tabCount = tabbrowser.browsers.length;
        for (var i = 0; i < tabCount; i++) {
          let doc = tabbrowser.browsers[i].contentDocument;
          if (doc) {
            imgCache = imgTools.getImgCacheForDocument(doc);
            imgCache.clearCache(false); // evict all but chrome cache
            didClearPBCache = true;
            break;
          }
        }
      }
    }
  } catch(e) {
    // FIXME: This can happen in some rare cases involving XULish image data
    // in combination with our image cache isolation patch. Sure isn't
    // a good thing, but it's not really a super-cookie vector either.
    // We should fix it eventually.
    torbutton_log(4, "Exception on image cache clearing: "+e);
  }
}

function torbutton_do_tor_check()
{
  let checkSvc = Cc["@torproject.org/torbutton-torCheckService;1"]
                   .getService(Ci.nsISupports).wrappedJSObject;
  if (checkSvc.kCheckNotInitiated != checkSvc.statusOfTorCheck)
    return; // Only do the check once.

  // If we have a tor control port and transparent torification is off,
  // perform a check via the control port.
  if (m_tb_control_port &&
      !m_tb_prefs.getBoolPref("extensions.torbutton.saved.transparentTor")) {
    if (torbutton_local_tor_check())
      checkSvc.statusOfTorCheck = checkSvc.kCheckSuccessful;
    else {
      // The check failed.  Update toolbar icon and tooltip.
      checkSvc.statusOfTorCheck = checkSvc.kCheckFailed;
      var mode = m_tb_prefs.getBoolPref("extensions.torbutton.tor_enabled");
      torbutton_update_toolbutton(mode);
    }
  }
  else {
    // A local check is not possible, so perform a remote check.
    torbutton_initiate_remote_tor_check();
  }
}

function torbutton_local_tor_check()
{
  let didLogError = false;

  let proxyType = m_tb_prefs.getIntPref("network.proxy.type");
  if (0 == proxyType)
    return false;

  // Ask tor for its SOCKS listener address and port and compare to the
  // browser preferences.
  const kCmdArg = "net/listeners/socks";
  let resp = torbutton_send_ctrl_cmd("GETINFO " + kCmdArg + "\r\n");
  if (!resp)
    return false;

  function logUnexpectedResponse()
  {
    if (!didLogError) {
      didLogError = true;
      torbutton_log(5, "unexpected tor response: " + resp);
    }
  }

  // Sample response: net/listeners/socks="127.0.0.1:9149" "127.0.0.1:9150"
  // First, check for command argument prefix.
  resp = resp.toLowerCase();
  if (0 != resp.indexOf(kCmdArg + '=')) {
    logUnexpectedResponse();
    return false;
  }

  // Retrieve configured proxy settings and check each listener against them.
  let socksAddr = m_tb_prefs.getCharPref("network.proxy.socks");
  let socksPort = m_tb_prefs.getIntPref("network.proxy.socks_port");
  let addrArray = resp.substr(kCmdArg.length + 1).split(' ');
  let foundSocksListener = false;
  for (let i = 0; !foundSocksListener && (i < addrArray.length); ++i)
  {
    var addr = addrArray[i];

    // Remove double quotes if present.
    let len = addr.length;
    if ((len > 2) && ('"' == addr.charAt(0)) && ('"' == addr.charAt(len - 1)))
      addr = addr.substring(1, len - 1);

    // Check against the configured proxy.
    let tokens = addr.split(':');
    if (tokens.length < 2)
      logUnexpectedResponse();
    else
    {
      let torSocksAddr = tokens[0];
      let torSocksPort = parseInt(tokens[1], 10);
      if ((torSocksAddr.length < 1) || isNaN(torSocksPort))
        logUnexpectedResponse();
      else
      {
        torbutton_log(2, "Tor socks listener: " + torSocksAddr + ':'
                         + torSocksPort);
        foundSocksListener = ((socksAddr == torSocksAddr) &&
                              (socksPort == torSocksPort));
      }
    }
  }

  return foundSocksListener;
} // torbutton_local_tor_check


function torbutton_initiate_remote_tor_check()
{
  let obsSvc = Cc["@mozilla.org/observer-service;1"]
                 .getService(Ci.nsIObserverService);

  try {
      let checkSvc = Cc["@torproject.org/torbutton-torCheckService;1"]
                       .getService(Ci.nsISupports).wrappedJSObject;
      let req = checkSvc.createCheckRequest(true); // async
      req.onreadystatechange = function (aEvent) {
          if (req.readyState === 4) {
            let ret = checkSvc.parseCheckResponse(req);

            // If we received an error response from check.torproject.org,
            // set the status of the tor check to failure (we don't want
            // to indicate failure if we didn't receive a response).
            if (ret == 2 || ret == 3 || ret == 5 || ret == 6 || ret == 7) {
              checkSvc.statusOfTorCheck = checkSvc.kCheckFailed;
              obsSvc.notifyObservers(null, k_tb_tor_check_failed_topic, null);
            } else if (ret == 4) {
              checkSvc.statusOfTorCheck = checkSvc.kCheckSuccessful;
            } // Otherwise, redo the check later

            torbutton_log(3, "Tor remote check done. Result: " + ret);
          }
      };

      torbutton_log(3, "Sending async Tor remote check");
      req.send(null);
  } catch(e) {
    if (e.result == 0x80004005) // NS_ERROR_FAILURE
      torbutton_log(5, "Tor check failed! Is tor running?");
    else
      torbutton_log(5, "Tor check failed! Tor internal error: "+e);

    checkSvc.statusOfTorCheck = checkSvc.kCheckFailed;
    obsSvc.notifyObservers(null, k_tb_tor_check_failed_topic, null);
  }
} // torbutton_initiate_remote_tor_check()

function torbutton_tor_check_ok()
{
  let checkSvc = Cc["@torproject.org/torbutton-torCheckService;1"]
                   .getService(Ci.nsISupports).wrappedJSObject;
  return (checkSvc.kCheckFailed != checkSvc.statusOfTorCheck);
}

// Bug 1506 P5: Despite the name, this is the way we disable
// plugins for Tor Browser, too.
//
// toggles plugins: true for disabled, false for enabled
function torbutton_toggle_plugins(disable_plugins) {
  if (m_tb_tbb) {
    var PH=Cc["@mozilla.org/plugin/host;1"].getService(Ci.nsIPluginHost);
    var P=PH.getPluginTags({});
    for(var i=0; i<P.length; i++) {
        if ("enabledState" in P[i]) { // FF24
          // FIXME: DOCDOC the reasoning for the isDisabled check, or remove it.
          var isDisabled = (P[i].enabledState == Ci.nsIPluginTag.STATE_DISABLED);
          if (!isDisabled && disable_plugins)
            P[i].enabledState = Ci.nsIPluginTag.STATE_DISABLED;
          else if (isDisabled && !disable_plugins)
            P[i].enabledState = Ci.nsIPluginTag.STATE_CLICKTOPLAY;
        } else if (P[i].disabled != disable_plugins) { // FF17
          P[i].disabled=disable_plugins;
        }
    }
  }
}

function torbutton_update_disk_prefs() {
    var mode = m_tb_prefs.getBoolPref("extensions.torbutton.block_disk");

    m_tb_prefs.setBoolPref("browser.privatebrowsing.autostart", mode);
    m_tb_prefs.setBoolPref("browser.cache.disk.enable", !mode);

    // No way to clear this beast during New Identity. Leave it off.
    //m_tb_prefs.setBoolPref("dom.indexedDB.enabled", !mode);

    if (m_tb_tbb) m_tb_prefs.setBoolPref("permissions.memory_only", mode);

    // Third party abuse. Leave it off for now.
    //m_tb_prefs.setBoolPref("browser.cache.offline.enable", !mode);

    if (mode) {
        m_tb_prefs.setIntPref("network.cookie.lifetimePolicy", 2);
        m_tb_prefs.setIntPref("browser.download.manager.retention", 1);
    } else {
        m_tb_prefs.setIntPref("network.cookie.lifetimePolicy", 0);
        m_tb_prefs.setIntPref("browser.download.manager.retention", 2);
    }

    // Force prefs to be synced to disk
    var prefService = Components.classes["@mozilla.org/preferences-service;1"]
        .getService(Components.interfaces.nsIPrefService);
    prefService.savePrefFile(null);
}

function torbutton_update_fingerprinting_prefs() {
    var mode = m_tb_prefs.getBoolPref("extensions.torbutton.resist_fingerprinting");

    if (m_tb_tbb) {
      if (mode) {
        // Use TBB pref defaults for these two.
        if(m_tb_prefs.prefHasUserValue("browser.display.max_font_attempts"))
          m_tb_prefs.clearUserPref("browser.display.max_font_attempts");
        if(m_tb_prefs.prefHasUserValue("browser.display.max_font_count"))
          m_tb_prefs.clearUserPref("browser.display.max_font_count");
 
        // Governed also by the spoof_english dialog..       
        if (m_tb_prefs.getBoolPref("extensions.torbutton.spoof_english")) {
          m_tb_prefs.setCharPref("intl.accept_languages", "en-us, en");
          m_tb_prefs.setCharPref("intl.accept_charsets", "iso-8859-1,*,utf-8");
          m_tb_prefs.setCharPref("intl.charsetmenu.browser.cache", "UTF-8");
        } else {
          if(m_tb_prefs.prefHasUserValue("intl.accept_languages"))
            m_tb_prefs.clearUserPref("intl.accept_languages");
          if(m_tb_prefs.prefHasUserValue("intl.charsetmenu.browser.cache"))
            m_tb_prefs.clearUserPref("intl.charsetmenu.browser.cache");
          if(m_tb_prefs.prefHasUserValue("intl.accept_charsets"))
            m_tb_prefs.clearUserPref("intl.accept_charsets");
        }
      } else {
        m_tb_prefs.setIntPref("browser.display.max_font_attempts",-1);
        m_tb_prefs.setIntPref("browser.display.max_font_count",-1);

        if(m_tb_prefs.prefHasUserValue("intl.accept_languages"))
          m_tb_prefs.clearUserPref("intl.accept_languages");
        if(m_tb_prefs.prefHasUserValue("intl.charsetmenu.browser.cache"))
          m_tb_prefs.clearUserPref("intl.charsetmenu.browser.cache");
        if(m_tb_prefs.prefHasUserValue("intl.accept_charsets"))
          m_tb_prefs.clearUserPref("intl.accept_charsets");

      }
    }

    m_tb_prefs.setBoolPref("webgl.min_capability_mode", mode);
    m_tb_prefs.setBoolPref("webgl.disable-extensions", mode);
    m_tb_prefs.setBoolPref("dom.battery.enabled", !mode);
    m_tb_prefs.setBoolPref("dom.network.enabled", !mode);
    m_tb_prefs.setBoolPref("dom.enable_performance", !mode);
    m_tb_prefs.setBoolPref("plugin.expose_full_path", !mode);
    m_tb_prefs.setBoolPref("browser.zoom.siteSpecific", !mode);

    m_tb_prefs.setBoolPref("extensions.torbutton.resize_new_windows", mode);

    // XXX: How do we undo timezone?

    // Force prefs to be synced to disk
    var prefService = Components.classes["@mozilla.org/preferences-service;1"]
        .getService(Components.interfaces.nsIPrefService);
    prefService.savePrefFile(null);
}

function torbutton_update_thirdparty_prefs() {
    var mode = m_tb_prefs.getBoolPref("extensions.torbutton.restrict_thirdparty");
    
    if (mode) {
      m_tb_prefs.setIntPref("network.cookie.cookieBehavior", 1);
    } else {
      m_tb_prefs.setIntPref("network.cookie.cookieBehavior", 0);
    }

    pref("security.enable_tls_session_tickets", !mode);
    pref("network.http.spdy.enabled", !mode);

    // Force prefs to be synced to disk
    var prefService = Components.classes["@mozilla.org/preferences-service;1"]
        .getService(Components.interfaces.nsIPrefService);
    prefService.savePrefFile(null);
}

// Bug 1506 P0: This code is a toggle-relic. 
//
// It basically just enforces the three Torbutton prefs
// so that the Torbutton state and button UI is consistent
function torbutton_update_status(mode) {
    var o_toolbutton = false;
    var o_statuspanel = false;
    var o_stringbundle = false;
    var sPrefix;
    var label;
    var tooltip;
   
    var torprefs = torbutton_get_prefbranch('extensions.torbutton.');
    var changed = (torprefs.getBoolPref('proxies_applied') != mode);

    torbutton_log(2, 'called update_status: '+mode+","+changed);

    if (!changed) return;
 
    torprefs.setBoolPref('proxies_applied', mode);
    if(torprefs.getBoolPref("tor_enabled") != mode) {
        torbutton_log(3, 'Got external update for: '+mode);
        torprefs.setBoolPref("tor_enabled", mode);
    }

    m_tb_prefs.setBoolPref("extensions.torbutton.settings_applied", mode);

    // Force prefs to be synced to disk
    var prefService = Components.classes["@mozilla.org/preferences-service;1"]
        .getService(Components.interfaces.nsIPrefService);
    prefService.savePrefFile(null);

    torbutton_log(3, "Settings applied for mode: "+mode);
}

// Bug 1506 P4: Despite the name, it is used on new identity
function torbutton_close_on_toggle(mode, newnym) {
    var close_tor = m_tb_prefs.getBoolPref("extensions.torbutton.close_tor");
    var close_nontor = m_tb_prefs.getBoolPref("extensions.torbutton.close_nontor");
    var close_newnym = m_tb_prefs.getBoolPref("extensions.torbutton.close_newnym");

    if (newnym) {
      if (!close_newnym) {
        torbutton_log(3, "Not closing tabs");
      }
    } else if((mode && !close_nontor) || (!mode && !close_tor)) {
        torbutton_log(3, "Not closing tabs");
        return;
    }

    // TODO: muck around with browser.tabs.warnOnClose.. maybe..
    torbutton_log(3, "Closing tabs...");
    var wm = Components.classes["@mozilla.org/appshell/window-mediator;1"]
        .getService(Components.interfaces.nsIWindowMediator);
    var enumerator = wm.getEnumerator("navigator:browser");
    var closeWins = new Array();
    while(enumerator.hasMoreElements()) {
        var win = enumerator.getNext();
        var browser = win.getBrowser();
        if(!browser) {
          torbutton_log(5, "No browser for possible closed window");
          continue;
        }
        var tabs = browser.browsers.length;

        torbutton_log(3, "Length: "+browser.browsers.length);

        var remove = new Array();
        for(var i = 0; i < tabs; i++) {
            remove.push(browser.browsers[i]);
        }

        if(browser.browsers.length == remove.length) {
            // It is a bad idea to alter the window list while
            // iterating over it.
            browser.addTab("about:blank");
            if(win != window) {
                closeWins.push(win);
            }
        }

        for(var i = 0; i < remove.length; i++) {
            remove[i].contentWindow.close();
        }
    }

    torbutton_log(2, "Closing windows...");

    for(var i = 0; i < closeWins.length; ++i) {
        closeWins[i].close();
    }

    torbutton_log(3, "Closed all tabs");
}

// Bug 1506 P2: This code is only important for disabling
// New Identity where it is not supported (ie no control port).
function torbutton_check_protections()
{
  var cookie_pref = m_tb_prefs.getBoolPref("extensions.torbutton.cookie_protections");
  var locked_pref = m_tb_prefs.getBoolPref("extensions.torbutton.locked_mode")
  document.getElementById("torbutton-cookie-protector").disabled = !cookie_pref;
  document.getElementById("torbutton-toggle").collapsed = locked_pref;

  if (!m_tb_control_pass || !m_tb_control_port)
    document.getElementById("torbutton-new-identity").disabled = true;

  if (!m_tb_tbb && m_tb_prefs.getBoolPref("extensions.torbutton.prompt_torbrowser")) {
      torbutton_inform_about_tbb();
  }
}

// Bug 1506 P2: I think cookie protections is a neat feature.
function torbutton_open_cookie_dialog() {
  window.openDialog('chrome://torbutton/content/torcookiedialog.xul','Cookie Protections',
                                   'centerscreen,chrome,dialog,modal,resizable');
}

// Bug 1506 P2/P3: Prefs are handled differently on android, I guess?
function torbutton_open_prefs_dialog() {
    window.openDialog("chrome://torbutton/content/preferences.xul","torbutton-preferences","centerscreen, chrome");
    torbutton_log(2, 'opened preferences window');
}

// Bug 1506 P0: Support code for checking Firefox versions. Not needed.
function torbutton_gecko_compare(aVersion) {
    var ioService = Components.classes["@mozilla.org/network/io-service;1"]
                    .getService(Components.interfaces.nsIIOService);
    var httpProtocolHandler = ioService.getProtocolHandler("http")
                              .QueryInterface(Components.interfaces.nsIHttpProtocolHandler);
    var versionComparator = null;

    if ("nsIVersionComparator" in Components.interfaces) {
        versionComparator = Components.classes["@mozilla.org/xpcom/version-comparator;1"]
                            .getService(Components.interfaces.nsIVersionComparator);
    } else {
        versionComparator = Components.classes["@mozilla.org/updates/version-checker;1"]
                            .getService(Components.interfaces.nsIVersionChecker);
    }
    var geckoVersion = httpProtocolHandler.misc.match(/rv:([0-9.]+)/)[1];
    return versionComparator.compare(aVersion, geckoVersion);
}

// Bug 1506 P0: Code to attempt to grey out browser proxy prefs. Doesn't
// actually seem to work?
function torbutton_browser_proxy_prefs_init()
{
  var _elementIDs = ["networkProxyType",
                     "networkProxyFTP", "networkProxyFTP_Port",
                     "networkProxyGopher", "networkProxyGopher_Port",
                     "networkProxyHTTP", "networkProxyHTTP_Port",
                     "networkProxySOCKS", "networkProxySOCKS_Port",
                     "networkProxySOCKSVersion",
                     "networkProxySOCKSVersion4", "networkProxySOCKSVersion5",
                     "networkProxySSL", "networkProxySSL_Port",
                     "networkProxyNone", "networkProxyAutoconfigURL", "shareAllProxies"];

  torbutton_log(2, 'called torbutton_browser_proxy_prefs_init()');
  if (!torbutton_check_status())
  {
    document.getElementById('torbutton-pref-connection-notice').hidden = true;
    document.getElementById('torbutton-pref-connection-more-info').hidden = true;
  }
  else
  {
    document.getElementById('networkProxyType').disabled = true;
    for (var i = 0; i < _elementIDs.length; i++)
        document.getElementById(_elementIDs[i]).setAttribute( "disabled", "true" );
  }

  // window.sizeToContent();
}

// -------------- HISTORY & COOKIES ---------------------

// Bug 1506 P4: Used by New Identity if cookie protections are
// not in use.
function torbutton_clear_cookies() {
    torbutton_log(2, 'called torbutton_clear_cookies');
    var cm = Components.classes["@mozilla.org/cookiemanager;1"]
                    .getService(Components.interfaces.nsICookieManager);
   
    cm.removeAll();
}

// Bug 1506 P0: Toggle-only. Kill it.
function torbutton_jar_cookies(mode) {
    var selector =
          Components.classes["@torproject.org/cookie-jar-selector;1"]
                    .getService(Components.interfaces.nsISupports)
                    .wrappedJSObject;

    /*
    if(m_tb_ff3) {
        var o_stringbundle = torbutton_get_stringbundle();
        var warning = torbutton_get_property_string("torbutton.popup.ff3.cookie_warning");
        window.alert(warning);
        return;
    }*/
    var protectcookies = m_tb_prefs.getBoolPref('extensions.torbutton.cookie_protections');
    if(mode) {
        if (protectcookies)
          selector.clearUnprotectedCookies("nontor");        
        selector.saveCookies("nontor");
        selector.clearCookies();
        if(m_tb_prefs.getBoolPref('extensions.torbutton.dual_cookie_jars'))
            selector.loadCookies("tor", false);
    } else {
        if (protectcookies)
          selector.clearUnprotectedCookies("tor");          
        if(m_tb_prefs.getBoolPref('extensions.torbutton.dual_cookie_jars'))
            selector.saveCookies("tor");
        selector.clearCookies();
        selector.loadCookies("nontor", false);
    }
}

// -------------- JS/PLUGIN HANDLING CODE ---------------------
// Bug 1506 P3: Defense in depth. Disables JS and events for New Identity.
function torbutton_disable_browser_js(browser) {
    var eventSuppressor = null;

    /* Solution from: https://bugzilla.mozilla.org/show_bug.cgi?id=409737 */
    // XXX: This kills the entire window. We need to redirect
    // focus and inform the user via a lightbox.
    try {
        if (!browser.contentWindow)
            torbutton_log(3, "No content window to disable JS events.");
        else
            eventSuppressor = browser.contentWindow.
                QueryInterface(Components.interfaces.nsIInterfaceRequestor).
                       getInterface(Ci.nsIDOMWindowUtils);
    } catch(e) {
        torbutton_log(4, "Failed to disable JS events: "+e)
    }
   
    if (browser.docShell)
      browser.docShell.allowJavascript = false;

    try {
        // My estimation is that this does not get the inner iframe windows,
        // but that does not matter, because iframes should be destroyed
        // on the next load.
        browser.contentWindow.name = null;
        browser.contentWindow.window.name = null;
    } catch(e) {
        torbutton_log(4, "Failed to reset window.name: "+e)
    }

    if (eventSuppressor)
        eventSuppressor.suppressEventHandling(true);
}

// Bug 1506 P3: The JS-killing bits of this are used by
// New Identity as a defense-in-depth measure.
function torbutton_disable_window_js(win) {
    var browser = win.getBrowser();
    if(!browser) {
      torbutton_log(5, "No browser for plugin window...");
      return;
    }
    var browsers = browser.browsers;
    torbutton_log(1, "Toggle window plugins");

    for (var i = 0; i < browsers.length; ++i) {
        var b = browser.browsers[i];
        if (b && !b.docShell) {
            try {
                if (b.currentURI) 
                    torbutton_log(5, "DocShell is null for: "+b.currentURI.spec);
                else 
                    torbutton_log(5, "DocShell is null for unknown URL");
            } catch(e) {
                torbutton_log(5, "DocShell is null for unparsable URL: "+e);
            }
        }
        if (b && b.docShell) {
            torbutton_disable_browser_js(b);

            // kill meta-refresh and existing page loading
            // XXX: Despite having JUST checked b.docShell, it can
            // actually end up NULL here in some cases?
            try {
              if (b.docShell && b.webNavigation)
                b.webNavigation.stop(b.webNavigation.STOP_ALL);
            } catch(e) {
              torbutton_log(4, "DocShell error: "+e);
            }
        }
    }
}

// Bug 1506 P3: The JS-killing bits of this are used by
// New Identity as a defense-in-depth measure.
//
// This is an ugly beast.. But unfortunately it has to be so..
// Looping over all tabs twice is not somethign we wanna do..
function torbutton_disable_all_js() {
    var wm = Components.classes["@mozilla.org/appshell/window-mediator;1"]
                       .getService(Components.interfaces.nsIWindowMediator);
    var enumerator = wm.getEnumerator("navigator:browser");
    while(enumerator.hasMoreElements()) {
        var win = enumerator.getNext();
        torbutton_disable_window_js(win);
    }
}

// Bug 1506 P2: We may want to replace this with a XUl solution.
// See #6096.
function torbutton_reload_homepage() {
    var homepage = m_tb_prefs.getComplexValue("browser.startup.homepage",
                       Components.interfaces.nsIPrefLocalizedString).data;

    torbutton_log(3, "Reloading homepage: "+homepage);
    try {
      gBrowser.loadURI(homepage, null, null);
    } catch(e) {
      torbutton_log(4, "Failure reloading homepage "+homepage+": "+e);
    }
}

// Bug 1506 P0: Toggle, kill it.
function torbutton_restore_cookies(tor_enabled)
{
    var selector =
          Components.classes["@torproject.org/cookie-jar-selector;1"]
                    .getService(Components.interfaces.nsISupports)
                    .wrappedJSObject;
    torbutton_log(4, "Restoring cookie status");
    selector.clearCookies();
    
    if(tor_enabled) {
        if(m_tb_prefs.getBoolPref('extensions.torbutton.dual_cookie_jars')) {
            torbutton_log(4, "Loading tor jar after crash");
            selector.loadCookies("tor", false);
        }
    } else {
        if(m_tb_prefs.getBoolPref('extensions.torbutton.dual_cookie_jars')
                || m_tb_prefs.getBoolPref('extensions.torbutton.cookie_jars')) {
            torbutton_log(4, "Loading non-tor jar after crash");
            selector.loadCookies("nontor", false);
        }
    }
}

// ---------------------- Event handlers -----------------

// Bug 1506 P1/P3: This removes any platform-specific junk
// from the omnibox. In Tor Browser, it should not be needed.
function torbutton_wrap_search_service()
{
  var ss = Cc["@mozilla.org/browser/search-service;1"]
                 .getService(Ci.nsIBrowserSearchService);
  var junk = {"value":0};
  var engines = ss.getEngines(junk);

  for(var i = 0; i < engines.length; ++i) {
    var origEngineObj = engines[i].wrappedJSObject;
    torbutton_log(2, "Got engine: "+origEngineObj._name);
    // hrmm.. could use
    // searchForm.match(/^www\.google\.(co\.\S\S|com|\S\S|com\.\S\S)$/);
    if(origEngineObj._name.indexOf("Google") != -1) {
      torbutton_log(3, "Found google search plugin to wrap.");
      if (typeof(origEngineObj.oldGetSubmission) == "undefined") {
        torbutton_log(3, "Original window for google search");
        origEngineObj.oldGetSubmission=origEngineObj.getSubmission;
      } else {
        torbutton_log(3, "Secondary window for google search");
      }
      origEngineObj.getSubmission = function lmbd(aData, respType) {
        var sub = this.oldGetSubmission(aData, respType);
        if(!m_tb_prefs.getBoolPref("extensions.torbutton.tor_enabled")
            || !m_tb_prefs.getBoolPref("extensions.torbutton.fix_google_srch")) {
          return sub;
        }

        var querymatch = sub.uri.path.match("[\?\&](q=[^&]+)(?:[\&]|$)")[1];
        var querypath = sub.uri.path.split("?")[0];
        torbutton_log(3, "Got submission call to Google search.");

        var newURI = Cc["@mozilla.org/network/standard-url;1"]
                          .createInstance(Ci.nsIStandardURL);
        newURI.init(Ci.nsIStandardURL.URLTYPE_STANDARD, 80,
                sub.uri.scheme+"://"+sub.uri.host+querypath+"?"+querymatch,
                sub.uri.originCharset, null);
        newURI = newURI.QueryInterface(Components.interfaces.nsIURI);
        sub._uri = newURI;
        torbutton_log(3, "Returning new search url.");
        return sub;
      };
    }
  }
}

// Bug 1506 P1-P3: Most of these observers aren't very important.
// See their comments for details
function torbutton_do_main_window_startup()
{
    torbutton_log(3, "Torbutton main window startup");
    m_tb_is_main_window = true;

    // http://www.xulplanet.com/references/xpcomref/ifaces/nsIWebProgress.html
    var progress =
        Components.classes["@mozilla.org/docloaderservice;1"].
        getService(Components.interfaces.nsIWebProgress);

    progress.addProgressListener(torbutton_weblistener,
            Components.interfaces.nsIWebProgress.NOTIFY_LOCATION);

    // Wrap Google search service.
    //torbutton_wrap_search_service();

    torbutton_unique_pref_observer.register();

    // Bug 1506: This is probably the most important observer in this function
    // XXX: We should fold this into our code/move it to its own component
    SSC_startup();
}

// Bug 1506 P4: Most of this function is now useless, save
// for the very important SOCKS environment vars at the end.
// Those could probably be rolled into a function with the
// control port vars, though. See 1506 comments inside.
function torbutton_do_startup()
{
    if(m_tb_prefs.getBoolPref("extensions.torbutton.startup")) {
        // Bug 1506: Still want to do this
        torbutton_toggle_plugins(
                m_tb_prefs.getBoolPref("extensions.torbutton.no_tor_plugins"));

        // Bug 1506: Should probably be moved to an XPCOM component
        torbutton_do_main_window_startup();

        // Bug 1506: Still want to do this
        torbutton_set_timezone(true, true);

        // For charsets
        torbutton_update_fingerprinting_prefs();

        // #5758: Last ditch effort to keep Vanilla Torbutton users from totally
        // being pwnt.  This is a pretty darn ugly hack, too. But because of #5863,
        // we really don't care about preserving the user's values for this.
        if (!m_tb_tbb) {
            // Bug 1506 P5: You have to set these two for non-TBB Firefoxen
            m_tb_prefs.setBoolPref("network.websocket.enabled", false);
            m_tb_prefs.setBoolPref("dom.indexedDB.enabled", false);
        }

        // Still need this in case people shove this thing back into FF
        if (!m_tb_tbb && m_tb_prefs.getBoolPref("extensions.torbutton.prompt_torbrowser")) {
          var warning = torbutton_get_property_string("torbutton.popup.short_torbrowser");
          var title = torbutton_get_property_string("torbutton.title.prompt_torbrowser");
          var prompts = Cc["@mozilla.org/embedcomp/prompt-service;1"].getService(Components.interfaces.nsIPromptService);
          prompts.alert(null, title, warning);
        }

        m_tb_prefs.setBoolPref("extensions.torbutton.startup", false);
    }
}

// Bug 1506 P0: Has some tagging code (can be removed) 
// and the language prompt (probably the wrong place for the
// call)
function torbutton_new_tab(event)
{
    // listening for new tabs
    torbutton_log(3, "New tab");

    var tor_tag = !m_tb_prefs.getBoolPref("extensions.torbutton.tor_enabled");
    var no_plugins = m_tb_prefs.getBoolPref("extensions.torbutton.no_tor_plugins");
    // Changed in FF4...
    //var browser = event.currentTarget;
    var browser = gBrowser.getBrowserForTab(event.target);

    /* Perform the version check on new tab, module timer */
    if (!tor_tag) { // tor is enabled...
      torbutton_do_async_versioncheck();
    }

    // XXX: This is possibly slightly the wrong place to do this check,
    // but we know the TabOpen effect is late enough to provide the popup
    // after firefox is visible, which makes it more clear whose popup this is.
    //
    // Ask the user if they want to make "English requests" if their default
    // language isn't English and the prompt hasn't been displayed before.
    if (torbutton_get_general_useragent_locale().substring(0, 2) != "en" &&
        !m_tb_prefs.getBoolPref("extensions.torbutton.prompted_language")) {
      torbutton_prompt_for_language_preference();
    }
}

// Bug 1506 P3: Used to decide if we should resize the window.
//
// Returns true if the window wind is neither maximized, full screen,
// ratpoisioned/evilwmed, nor minimized.
function torbutton_is_windowed(wind) {
    torbutton_log(3, "Window: ("+wind.outerHeight+","+wind.outerWidth+") ?= ("
            +wind.screen.availHeight+","+wind.screen.availWidth+")");
    if(wind.windowState == Components.interfaces.nsIDOMChromeWindow.STATE_MINIMIZED
      || wind.windowState == Components.interfaces.nsIDOMChromeWindow.STATE_MAXIMIZED) {
        torbutton_log(2, "Window is minimized/maximized");
        return false;
    }
    if ("fullScreen" in wind && wind.fullScreen) {
        torbutton_log(2, "Window is fullScreen");
        return false;
    }
    if(wind.outerHeight == wind.screen.availHeight 
            && wind.outerWidth == wind.screen.availWidth) {
        torbutton_log(3, "Window is ratpoisoned/evilwm'ed");
        return false;
    }
        
    torbutton_log(2, "Window is normal");
    return true;
}

function get_recent_cert(hostname) {

  var srv = null;

  torbutton_log(2, "Obtaining certificate for: " + hostname);

  if (typeof Components.classes["@mozilla.org/security/recentbadcerts;1"]
      !== "undefined") {
    // Up to Firefox 19.
    srv = Components.classes["@mozilla.org/security/recentbadcerts;1"]
            .getService(Components.interfaces.nsIRecentBadCertsService);
  } else {
    // Firefox 20 and newer.
    Components.utils.import("resource://gre/modules/PrivateBrowsingUtils.jsm");
    var pbs = PrivateBrowsingUtils.isWindowPrivate(window);
    srv = Components.classes["@mozilla.org/security/x509certdb;1"]
            .getService(Components.interfaces.nsIX509CertDB)
            .getRecentBadCerts(pbs);
  }

  var gSSLStatus = srv.getRecentBadCert(hostname + ":443");
  if (!gSSLStatus) {
    torbutton_log(3, "gSSLStatus is 'null'.");
    return null;
  }

  return gSSLStatus.QueryInterface(Components.interfaces.nsISSLStatus)
           .serverCert;
}

function on_page_load(event) {

  // The URI of the Firefox page showing certificate errors.
  var certErrorPage = "about:certerror";
  var uri = event.target.baseURI;
  var hostname = null;

  torbutton_log(2, "Triggered 'on_page_load()'.");

  // When stumbling upon a self-signed certificate, Firefox'
  // "about:certerror" page is displayed.  Therefore, we check if the URL
  // contains that string.
  if (uri.lastIndexOf(certErrorPage, 0) === 0) {
      torbutton_log(2, "Certificate error for: " + uri);
      hostname = event.originalTarget.location.hostname;
  } else {
      return;
  }

  var origCert = get_recent_cert(hostname);
  if (!origCert) {
      torbutton_log(4, "Could not get bad certificate for: " + hostname);
      return;
  }

  torbutton_log(2, "Certificate SHA-1 fingerprint: " +
                   origCert.sha1Fingerprint);

  var stream_status = null;
  var circuit_status = null;

  // Check if we have access to Tor's control port.
  if (!m_tb_control_pass || !m_tb_control_port) {
      var o_stringbundle = torbutton_get_stringbundle();
      var warning = o_stringbundle.GetStringFromName("torbutton.popup.no_newnym");
      torbutton_log(5, "TorButton does not have access to Tor's control port.");
      window.alert(warning);
      return;
  }

  // First, obtain the current stream status which should contain the current
  // connection which fetched the bad certificate.
  var ret = torbutton_send_ctrl_cmd("GETINFO stream-status\r\n", true);
  if (!ret) {
      torbutton_log(2, "'GETINFO stream-status' failed: " + ret);
  }
  torbutton_log(2, "Current stream status: " + ret);

  // Now get the circuit status and determine which exit relay was used by the
  // "bad certificate" stream.
  ret = torbutton_send_ctrl_cmd("GETINFO circuit-status\r\n", true);
  if (!ret) {
      torbutton_log(2, "'GETINFO circuit-status' failed: " + ret);
      return;
  }
  torbutton_log(2, "Current circuit status: " + ret);

  // Get a new identity to (hopefully) refetch the certificate over a different
  // exit relay.
  torbutton_log(2, "Now sending NEWNYM.");
  ret = torbutton_send_ctrl_cmd("SIGNAL NEWNYM\r\n");
  if (!ret) {
      torbutton_log(5, "'SIGNAL NEWNYM' failed: " + ret);
      return;
  }

  // Now refetch the certificate over different exit relay.
  var oReq = new XMLHttpRequest();

  // Hook into 'onerror' as page will give a certificate error. 'onerror' fires
  // on errors below the HTTP layer.
  oReq.onerror = function(e) {
      var cert = get_recent_cert(hostname);
      torbutton_log(3, "Certificate fingerprint: " + cert.sha1Fingerprint);

      // Now we have two certificate fingerprints.  See if they match.
      if (cert.sha1Fingerprint === origCert.sha1Fingerprint) {
          torbutton_log(3, "The certificates match. The site is probably fine.");
      } else {
          torbutton_log(5, "Certificate mismatch!  Reporting certificate.");
          // TODO: Here, we would interact with the user and submit the
          // certificate.
      }
  };

  torbutton_log(3, "Refetching certificate over new circuit.");
  oReq.open("GET", "https://" + hostname, true);
  oReq.send();
}


// Bug 1506 P3: This is needed pretty much only for the version check
// and the window resizing. See comments for individual functions for
// details
function torbutton_new_window(event)
{
    torbutton_log(3, "New window");
    var browser = getBrowser();

    if(!browser) {
      torbutton_log(5, "No browser for new window.");
      return;
    }

    m_tb_window_height = window.outerHeight;
    m_tb_window_width = window.outerWidth;

    if (!m_tb_wasinited) {
        torbutton_init();
    }
    // Add tab open listener..
    browser.tabContainer.addEventListener("TabOpen", torbutton_new_tab, false);

    window.addEventListener("DOMContentLoaded", on_page_load, false);

    torbutton_do_startup();

    if (m_tb_prefs.getBoolPref("extensions.torbutton.resize_new_windows")
            && m_tb_prefs.getBoolPref("extensions.torbutton.tor_enabled")
            && torbutton_is_windowed(window)) {
      var progress = Cc["@mozilla.org/docloaderservice;1"].getService(Ci.
        nsIWebProgress);
      progress.addProgressListener(torbutton_resizelistener,
        Components.interfaces.nsIWebProgress.NOTIFY_STATE_DOCUMENT);
    }

    // Check the version on every new window. We're already pinging check in these cases.    
    torbutton_do_async_versioncheck();

    torbutton_do_tor_check();
}

// Bug 1506 P2: This is only needed because we have observers
// in XUL that should be in an XPCOM component
function torbutton_close_window(event) {
    torbutton_window_pref_observer.unregister();
    torbutton_tor_check_observer.unregister();

    // TODO: This is a real ghetto hack.. When the original window
    // closes, we need to find another window to handle observing 
    // unique events... The right way to do this is to move the 
    // majority of torbutton functionality into a XPCOM component.. 
    // But that is a major overhaul..
    if (m_tb_is_main_window) {
        torbutton_log(3, "Original window closed. Searching for another");
        var wm = Components.classes["@mozilla.org/appshell/window-mediator;1"]
            .getService(Components.interfaces.nsIWindowMediator);
        var enumerator = wm.getEnumerator("navigator:browser");
        while(enumerator.hasMoreElements()) {
            var win = enumerator.getNext();
            if(win != window) {
                torbutton_log(3, "Found another window");
                win.torbutton_do_main_window_startup();
                m_tb_is_main_window = false;
                break;
            }
        }

        // remove old listeners
        var progress = Components.classes["@mozilla.org/docloaderservice;1"].
            getService(Components.interfaces.nsIWebProgress);

        progress.removeProgressListener(torbutton_weblistener);
        torbutton_unique_pref_observer.unregister();

        // XXX: We should fold this into our code..
        SSC_controller.removeListener();

        if(m_tb_is_main_window) { // main window not reset above
            // This happens on Mac OS because they allow firefox
            // to still persist without a navigator window
            torbutton_log(3, "Last window closed. None remain.");
            m_tb_prefs.setBoolPref("extensions.torbutton.startup", true);
            m_tb_is_main_window = false;
        }
    }
}


function torbutton_open_network_settings() {
  var obsSvc = Components.classes["@mozilla.org/observer-service;1"]
                .getService(Ci.nsIObserverService);
  obsSvc.notifyObservers(this, "TorOpenNetworkSettings", null);
}


window.addEventListener('load',torbutton_new_window,false);
window.addEventListener('unload', torbutton_close_window, false);

// FIXME: Tons of exceptions get thrown from this function on account
// of its being called so early. Need to find a quick way to check if
// aProgress and aRequest are actually fully initialized 
// (without throwing exceptions)
// Bug 1506 P0: This is to block full page plugins. Not needed anymore
// due to better (but non-toggle-friendly) plugin APIs)
function torbutton_check_progress(aProgress, aRequest, aFlags, new_loc) {
    if (!m_tb_wasinited) {
        torbutton_init();
    }

    var DOMWindow = null;

    // Bug #866: Zotero conflict with about:blank windows
    // handle docshell JS switching and other early duties
    var WP_STATE_START = Ci.nsIWebProgressListener.STATE_START;
    var WP_STATE_DOC = Ci.nsIWebProgressListener.STATE_IS_DOCUMENT;
    var WP_STATE_START_DOC = WP_STATE_START | WP_STATE_DOC;

    if ((aFlags & WP_STATE_START_DOC) == WP_STATE_START_DOC 
            && aRequest instanceof Ci.nsIChannel
            && !(aRequest.loadFlags & aRequest.LOAD_INITIAL_DOCUMENT_URI) 
            && aRequest.URI.spec == "about:blank") { 
        torbutton_log(3, "Passing on about:blank");
        return 0;
    }

    if(aProgress) {
        try {
            DOMWindow = aProgress.DOMWindow;
        } catch(e) {
            torbutton_log(4, "Exception on DOMWindow: "+e);
            DOMWindow = null;
        }
    } 

    if(!DOMWindow) {
        try {
            if(aRequest.notificationCallbacks) {
                DOMWindow = aRequest.notificationCallbacks.QueryInterface(
                        Components.interfaces.nsIInterfaceRequestor).getInterface(
                            Components.interfaces.nsIDOMWindow);
            }
        } catch(e) { }
    }
    
    // TODO: separate this from the above?
    if(DOMWindow) {
        var doc = DOMWindow.document;
        try {
            if(doc) {
                if(doc.domain) {
                  var referrer = null;
                  var win = DOMWindow.window;

                  try {
                      var hreq = aRequest.QueryInterface(Ci.nsIHttpChannel);
                      referrer = hreq.referrer;
                  } catch(e) {}

                  try {
                      // XXX: The patch from https://bugzilla.mozilla.org/show_bug.cgi?id=444222
                      // might be better here..
                      //
                      // Ticket #3414: Apply referer policy to window.name.
                      //
                      // This keeps window.name clean between fresh urls.
                      // It should also apply to iframes because hookdoc gets called for all
                      // frames and subdocuments.
                      //
                      // The about:blank check handles the 'name' attribute of framesets, which
                      // get set before the referer is set on the channel.
                      if ((!referrer || referrer.spec == "") && win.location != "about:blank") {
                          if (win.top == win.window) {
                              // Only reset if we're the top-level window
                              //torbutton_log(4, "Resetting window.name: "+win.name+" for "+win.location);
                              win.name = "";
                              win.window.name = "";
                          }
                      }
                  } catch(e) {
                      torbutton_log(4, "Failed to reset window.name: "+e)
                  }
                }
            }
        } catch(e) {
            try {
                if(doc && doc.location && 
                  (doc.location.href.indexOf("about:") != 0 &&
                   doc.location.href.indexOf("chrome:") != 0)) {
                    torbutton_safelog(4, "Exception "+e
                                   +" on tag application at: ",
                                    doc.location);
                } else {
                    torbutton_eclog(3, "Got an about url: "+e);
                }
            } catch(e1) {
                torbutton_eclog(3, "Got odd url "+e);
            }
        }        
    } else {
        torbutton_eclog(3, "No aProgress for location!");
    }
    return 0;
}

// Warning: These can also fire when the 'debuglogger' extension
// updates its window. Typically for this, doc.domain is null. Do not
// log in this case (until we find a better way to filter those
// events out). Use torbutton_eclog for common-path stuff.]
// 
// Bug 1506 P0: This listener is for blocking plugins and installing JS hooks.
// It can be eliminated.
var torbutton_weblistener =
{
  QueryInterface: function(aIID)
  {
   if (aIID.equals(Components.interfaces.nsIWebProgressListener) ||
       aIID.equals(Components.interfaces.nsISupportsWeakReference) ||
       aIID.equals(Components.interfaces.nsISupports))
     return this;
   throw Components.results.NS_NOINTERFACE;
  },

  onLocationChange: function(aProgress, aRequest, aURI)
  {
      torbutton_eclog(2, 'onLocationChange: '+aURI.asciiSpec);
      if(aURI.scheme == "about" || aURI.scheme == "chrome") {
          torbutton_eclog(3, "Skipping location change for "+aURI.asciiSpec);
      } else {
          return torbutton_check_progress(aProgress, aRequest, 0, true);
      }
  },

  // XXX: The following can probably go
  onStateChange: function(aProgress, aRequest, aFlag, aStatus)
  { 
      torbutton_eclog(2, 'State change()');
      return torbutton_check_progress(aProgress, aRequest, aFlag, false);
  },

  onProgressChange: function(aProgress, aRequest, curSelfProgress, maxSelfProgress, curTotalProgress, maxTotalProgress) 
  { 
      torbutton_eclog(2, 'called progressChange'); 
      return torbutton_check_progress(aProgress, aRequest, 0, false);
  },
  
  onStatusChange: function(aProgress, aRequest, stat, message) 
  { 
      torbutton_eclog(2, 'called progressChange'); 
      return torbutton_check_progress(aProgress, aRequest, 0, false);
  },
  
  onSecurityChange: function() {return 0;},
  
  onLinkIconAvailable: function() 
  { /*torbutton_eclog(1, 'called linkIcon'); */ return 0; }
}

// Bug 1506 P1/P3: Setting a fixed window size is important, but
// probably not for android.
var torbutton_resizelistener =
{
  QueryInterface: function(aIID)
  {
   if (aIID.equals(Components.interfaces.nsIWebProgressListener) ||
       aIID.equals(Components.interfaces.nsISupportsWeakReference) ||
       aIID.equals(Components.interfaces.nsISupports))
     return this;
   throw Components.results.NS_NOINTERFACE;
  },

  onLocationChange: function(aProgress, aRequest, aURI) {},
  onStateChange: function(aProgress, aRequest, aFlag, aStatus) {
    if (aFlag & Components.interfaces.nsIWebProgressListener.STATE_STOP) {
      var progress =
        Components.classes["@mozilla.org/docloaderservice;1"].
        getService(Components.interfaces.nsIWebProgress);
      var win = getBrowser().contentWindow;
      if (!win || typeof(win) == "undefined") {
        torbutton_log(5, "No initial browser content window?");
        progress.removeProgressListener(this);
        return;
      }
      var screenMan = Components.classes["@mozilla.org/gfx/screenmanager;1"].
        getService(Components.interfaces.nsIScreenManager);
      var junk = {}, availWidth = {}, availHeight = {};
      screenMan.primaryScreen.GetRect(junk, junk, availWidth, availHeight);

      // We need to set the inner width to an initial value because it has none
      // at this point... Choosing "300" as this works even on Windows
      // reliably.
      win.innerWidth = 300;
      win.innerHeight = 300;

      torbutton_log(3, "About to resize new window: " + window.outerWidth +
        "x" + window.outerHeight + " inner: " + win.innerWidth + "x" + win.
        innerHeight + " in state " + window.windowState + " Have " +
        availWidth.value + "x" + availHeight.value);

      var maxHeight = availHeight.value -
        (window.outerHeight - win.innerHeight) - 51;
      var maxWidth = availWidth.value - (window.outerWidth - win.innerWidth);
      torbutton_log(3, "Got max dimensions: " + maxWidth + "x" + maxHeight);

      var width;
      var height;

      if (maxWidth > 1000) {
        width = 1000;
      } else {
        width = Math.floor(maxWidth/200.0)*200;
      }

      height = Math.floor(maxHeight/100.0)*100;

      // This is fun. any attempt to directly set the inner window actually
      // resizes the outer width to that value instead. Must use resizeBy()
      // instead of assignment or resizeTo()
      win.resizeBy(width - win.innerWidth, height - win.innerHeight);
      torbutton_log(3, "Resized new window from: " + win.innerWidth + "x" +
        win.innerHeight + " to " + width + "x" + height + " in state " +
        window.windowState);

      progress.removeProgressListener(this);
    }
  },

  onProgressChange: function(aProgress, aRequest, curSelfProgress,
                             maxSelfProgress, curTotalProgress,
                             maxTotalProgress) {},
  onStatusChange: function(aProgress, aRequest, stat, message) {},
  onSecurityChange: function() {}
};

//vim:set ts=4
