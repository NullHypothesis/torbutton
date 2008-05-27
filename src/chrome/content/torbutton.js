// TODO: check for leaks: http://www.mozilla.org/scriptable/avoiding-leaks.html
// TODO: Double-check there are no strange exploits to defeat:
//       http://kb.mozillazine.org/Links_to_local_pages_don%27t_work

// status
var m_tb_wasinited = false;
var m_tb_prefs = false;
var m_tb_jshooks = false;
var m_tb_plugin_mimetypes = false;
var m_tb_plugin_string = false;
var m_tb_is_main_window = false;

var m_tb_window_height = 0;
var m_tb_window_width = 0;

var m_tb_ff3 = false;

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
            case "extensions.torbutton.tor_enabled":
                var mode = m_tb_prefs.getBoolPref("extensions.torbutton.tor_enabled");
                torbutton_update_toolbutton(mode);
                torbutton_update_statusbar(mode);
                break;
        }
    }
}

var torbutton_unique_pref_observer =
{
    register: function()
    {
        var pref_service = Components.classes["@mozilla.org/preferences-service;1"]
                                     .getService(Components.interfaces.nsIPrefBranchInternal);
        this._branch = pref_service.QueryInterface(Components.interfaces.nsIPrefBranchInternal);
        this._branch.addObserver("extensions.torbutton", this, false);
        this._branch.addObserver("network.proxy", this, false);
    },

    unregister: function()
    {
        if (!this._branch) return;
        this._branch.removeObserver("extensions.torbutton", this);
        this._branch.removeObserver("network.proxy", this);
    },

    // topic:   what event occurred
    // subject: what nsIPrefBranch we're observing
    // data:    which pref has been changed (relative to subject)
    observe: function(subject, topic, data)
    {
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

            case "extensions.torbutton.dual_cookie_jars":
            case "extensions.torbutton.cookie_jars":
            case "extensions.torbutton.clear_cookies":
                torbutton_log(2, "Got cookie pref change");
                if(!m_tb_prefs.getBoolPref("extensions.torbutton.cookie_jars")
                    && !m_tb_prefs.getBoolPref("extensions.torbutton.clear_cookies")) {
                    torbutton_log(3, "Changing lifetime");
                    m_tb_prefs.setIntPref("network.cookie.lifetimePolicy",
                            m_tb_prefs.getIntPref("extensions.torbutton.saved.cookieLifetime")); 
                } else if(m_tb_prefs.getBoolPref("extensions.torbutton.tor_enabled")) {
                    torbutton_log(3, "Changing lifetime");
                    m_tb_prefs.setIntPref("network.cookie.lifetimePolicy", 2); 
                }
                break;
            
            case "extensions.torbutton.crashed":
                // can we say ghetto hack, boys and girls?
                torbutton_crash_recover();
                break;

            case "extensions.torbutton.set_uagent":
                // If the user turns off the pref, reset their user agent to
                // vanilla
                if(!m_tb_prefs.getBoolPref("extensions.torbutton.set_uagent")) {
                    if(m_tb_prefs.prefHasUserValue("general.appname.override"))
                        m_tb_prefs.clearUserPref("general.appname.override");
                    if(m_tb_prefs.prefHasUserValue("general.appversion.override"))
                        m_tb_prefs.clearUserPref("general.appversion.override");
                    if(m_tb_prefs.prefHasUserValue("general.useragent.override"))
                        m_tb_prefs.clearUserPref("general.useragent.override");
                    if(m_tb_prefs.prefHasUserValue("general.useragent.vendor"))
                        m_tb_prefs.clearUserPref("general.useragent.vendor");
                    if(m_tb_prefs.prefHasUserValue("general.useragent.vendorSub"))
                        m_tb_prefs.clearUserPref("general.useragent.vendorSub");
                    if(m_tb_prefs.prefHasUserValue("general.platform.override"))
                        m_tb_prefs.clearUserPref("general.platform.override");
                    
                    // XXX: Is this ok on ff2?
                    if(m_tb_prefs.prefHasUserValue("general.oscpu.override"))
                        m_tb_prefs.clearUserPref("general.oscpu.override");
                    if(m_tb_prefs.prefHasUserValue("general.buildID.override"))
                        m_tb_prefs.clearUserPref("general.buildID.override");
                    if(m_tb_prefs.prefHasUserValue("general.productSub.override"))
                        m_tb_prefs.clearUserPref("general.productSub.override");

                } else {
                    torbutton_log(1, "Got update message, updating status");
                    torbutton_update_status(
                            m_tb_prefs.getBoolPref("extensions.torbutton.tor_enabled"),
                            true);
                }
                break;

            case "extensions.torbutton.disable_referer":
                if(!m_tb_prefs.getBoolPref("extensions.torbutton.disable_referer")) {
                    m_tb_prefs.setBoolPref("network.http.sendSecureXSiteReferrer", true);
                    m_tb_prefs.setIntPref("network.http.sendRefererHeader", 2);
                }
            case "extensions.torbutton.no_tor_plugins":
            case "extensions.torbutton.no_updates":
            case "extensions.torbutton.no_search":
            case "extensions.torbutton.block_cache":
            case "extensions.torbutton.block_nthwrite":
            case "extensions.torbutton.block_thwrite":
            case "extensions.torbutton.shutdown_method":
            case "extensions.torbutton.spoof_english":
            case "extensions.torbutton.resize_on_toggle":
                torbutton_log(1, "Got update message, updating status");
                torbutton_update_status(
                        m_tb_prefs.getBoolPref("extensions.torbutton.tor_enabled"),
                        true);
                break;
        }
    }
}


function torbutton_set_panel_view() {
    var o_statuspanel = false;
    var o_prefbranch = false;

    o_statuspanel = torbutton_get_statuspanel();
    o_prefbranch = torbutton_get_prefbranch('extensions.torbutton.');
    if (!o_statuspanel || !o_prefbranch) return;

    var display_panel = o_prefbranch.getBoolPref('display_panel');
    torbutton_log(2, 'setting panel visibility');
    o_statuspanel.setAttribute('collapsed', !display_panel);
}

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

function torbutton_toggle() {
    var o_toolbutton = false;
    o_toolbutton = torbutton_get_toolbutton();

    torbutton_log(3, 'called toggle()');
    if (!m_tb_wasinited) {
        torbutton_init();
    }

    if (torbutton_check_status()) {
        // Close on toggle before actually changing proxy settings
        // as additional safety precaution
        torbutton_close_on_toggle(false);
        torbutton_disable_tor();
    } else {
        torbutton_close_on_toggle(true);
        torbutton_enable_tor();
    }
}

function torbutton_set_status() {
    if (torbutton_check_status()) {
        torbutton_log(3,'status: tor is enabled');
        torbutton_update_status(true, false);
    } else {
        torbutton_log(3,'status: tor is disabled');
        torbutton_update_status(false, false);
    }
}

// load localization strings
function torbutton_get_stringbundle()
{
    var o_stringbundle = false;

    try {
        var oBundle = Components.classes["@mozilla.org/intl/stringbundle;1"]
                                .getService(Components.interfaces.nsIStringBundleService);
        o_stringbundle = oBundle.createBundle("chrome://torbutton/locale/torbutton.properties");
    } catch(err) {
        o_stringbundle = false;
    }
    if (!o_stringbundle) {
        torbutton_log(5, 'ERROR (init): failed to find torbutton-bundle');
    }

    return o_stringbundle;
}

function torbutton_init_toolbutton(event)
{
    if (event.originalTarget && event.originalTarget.getAttribute('id') == 'torbutton-button')
       torbutton_update_toolbutton(torbutton_check_status());
}

function torbutton_init() {
    torbutton_log(3, 'called init()');

    // Determine if we are firefox 3 or not.
    var appInfo = Components.classes["@mozilla.org/xre/app-info;1"]
        .getService(Components.interfaces.nsIXULAppInfo);
    var versionChecker = Components.classes["@mozilla.org/xpcom/version-comparator;1"]
        .getService(Components.interfaces.nsIVersionComparator);

    if(versionChecker.compare(appInfo.version, "3.0a1") >= 0) {
        m_tb_ff3 = true;
    } else {
        m_tb_ff3 = false;
    }
    
    // initialize preferences before we start our prefs observer
    torbutton_init_prefs();

    // set panel style from preferences
    torbutton_set_panel_style();

    // listen for our toolbar button being added so we can initialize it
    if (torbutton_gecko_compare("1.8") <= 0) {
        document.getElementById('navigator-toolbox')
                .addEventListener('DOMNodeInserted', torbutton_init_toolbutton, false);
    }

    if (!m_tb_wasinited) { 
        // Runs every time a new window is opened
        m_tb_prefs =  Components.classes["@mozilla.org/preferences-service;1"]
                        .getService(Components.interfaces.nsIPrefBranch);

        torbutton_init_jshooks();

        torbutton_log(1, 'registering pref observer');
        torbutton_window_pref_observer.register(); 
        m_tb_wasinited = true;
    } else {
        torbutton_log(1, 'skipping pref observer init');
    }
    
    torbutton_set_panel_view();
    torbutton_log(1, 'setting torbutton status from proxy prefs');
    torbutton_set_status();
    var mode = m_tb_prefs.getBoolPref("extensions.torbutton.tor_enabled");
    torbutton_update_toolbutton(mode);
    torbutton_update_statusbar(mode);
    torbutton_log(3, 'init completed');
}

// this function duplicates a lot of code in preferences.js for deciding our
// recommended settings.  figure out a way to eliminate the redundancy.
// TODO: Move it to torbutton_util.js?
function torbutton_init_prefs() {
    var torprefs = false;
    var proxy_port;
    var proxy_host;
    torbutton_log(2, "called init_prefs()");
    torprefs = torbutton_get_prefbranch('extensions.torbutton.');

    // Privoxy is always recommended for Firefoxes not supporting socks_remote_dns
    if (!torbutton_check_socks_remote_dns())
        torprefs.setBoolPref('use_privoxy', true);

    if (torprefs.getBoolPref('use_privoxy'))
    {
        proxy_host = '127.0.0.1';
        proxy_port = 8118;
    }
    else
    {
        proxy_host = '';
        proxy_port = 0;
    }

    if (torprefs.getCharPref('settings_method') == 'recommended')
    {
        torbutton_log(2, "using recommended settings");
        if (torbutton_check_socks_remote_dns())
        {
            torprefs.setCharPref('http_proxy', proxy_host);
            torprefs.setCharPref('https_proxy', proxy_host);
            torprefs.setCharPref('ftp_proxy', '');
            torprefs.setCharPref('gopher_proxy', '');
            torprefs.setIntPref('http_port', proxy_port);
            torprefs.setIntPref('https_port', proxy_port);
            torprefs.setIntPref('ftp_port', 0);
            torprefs.setIntPref('gopher_port', 0);
        } else {
            torprefs.setCharPref('http_proxy', proxy_host);
            torprefs.setCharPref('https_proxy', proxy_host);
            torprefs.setCharPref('ftp_proxy', proxy_host);
            torprefs.setCharPref('gopher_proxy', proxy_host);
            torprefs.setIntPref('http_port', proxy_port);
            torprefs.setIntPref('https_port', proxy_port);
            torprefs.setIntPref('ftp_port', proxy_port);
            torprefs.setIntPref('gopher_port', proxy_port);
        }
        torprefs.setCharPref('socks_host', '127.0.0.1');
        torprefs.setIntPref('socks_port', 9050);
    }

    torbutton_log(1, 'http_port='+torprefs.getIntPref('http_port'));
    // m_tb_prefs.setCharPref('extensions.torbutton.http_proxy',   m_http_proxy);
    // m_tb_prefs.setIntPref('extensions.torbutton.http_port',     m_http_port);
    // m_tb_prefs.setCharPref('extensions.torbutton.https_proxy',  m_https_proxy);
    // m_tb_prefs.setIntPref('extensions.torbutton.https_port',    m_https_port);
    // m_tb_prefs.setCharPref('extensions.torbutton.ftp_proxy',    m_ftp_proxy);
    // m_tb_prefs.setIntPref('extensions.torbutton.ftp_port',      m_ftp_port);
    // m_tb_prefs.setCharPref('extensions.torbutton.gopher_proxy', m_gopher_proxy);
    // m_tb_prefs.setIntPref('extensions.torbutton.gopher_port',   m_gopher_port);
    // m_tb_prefs.setCharPref('extensions.torbutton.socks_host',   m_socks_host);
    // m_tb_prefs.setIntPref('extensions.torbutton.socks_port',    m_socks_port);
}

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
  savprefs.setCharPref('gopher_proxy', liveprefs.getCharPref('gopher'));
  savprefs.setIntPref('gopher_port',   liveprefs.getIntPref('gopher_port'));
  savprefs.setCharPref('socks_host',   liveprefs.getCharPref('socks'));
  savprefs.setIntPref('socks_port',    liveprefs.getIntPref('socks_port'));
  savprefs.setIntPref('socks_version', liveprefs.getIntPref('socks_version'));
  try { // ff-0.9 doesn't have share_proxy_settings
    savprefs.setBoolPref('share_proxy_settings', liveprefs.getBoolPref('share_proxy_settings'));
  } catch(e) {}
  
  torbutton_log(1, 'almost there');
  if (torbutton_check_socks_remote_dns())
    savprefs.setBoolPref('socks_remote_dns',     liveprefs.getBoolPref('socks_remote_dns'));
  torbutton_log(2, 'Non-tor settings saved');
}

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
  liveprefs.setIntPref('type',          savprefs.getIntPref('type'));
  liveprefs.setCharPref('http',         savprefs.getCharPref('http_proxy'));
  liveprefs.setIntPref('http_port',     savprefs.getIntPref('http_port'));
  liveprefs.setCharPref('ssl',          savprefs.getCharPref('https_proxy'));
  liveprefs.setIntPref('ssl_port',      savprefs.getIntPref('https_port'));
  liveprefs.setCharPref('ftp',          savprefs.getCharPref('ftp_proxy'));
  torbutton_log(1, 'half-way there');
  liveprefs.setIntPref('ftp_port',      savprefs.getIntPref('ftp_port'));
  liveprefs.setCharPref('gopher',       savprefs.getCharPref('gopher_proxy'));
  liveprefs.setIntPref('gopher_port',   savprefs.getIntPref('gopher_port'));
  liveprefs.setCharPref('socks',        savprefs.getCharPref('socks_host'));
  liveprefs.setIntPref('socks_port',    savprefs.getIntPref('socks_port'));
  liveprefs.setIntPref('socks_version', savprefs.getIntPref('socks_version'));
  try { // ff-0.9 doesn't have share_proxy_settings
    liveprefs.setBoolPref('share_proxy_settings', savprefs.getBoolPref('share_proxy_settings'));
  } catch(e) {}
  
  torbutton_log(1, 'almost there');
  if (torbutton_check_socks_remote_dns())
    liveprefs.setBoolPref('socks_remote_dns',     savprefs.getBoolPref('socks_remote_dns'));
  torbutton_log(2, 'settings restored');
}

function torbutton_disable_tor()
{
  torbutton_log(3, 'called disable_tor()');
  torbutton_restore_nontor_settings();
}

function torbutton_enable_tor()
{
  torbutton_log(3, 'called enable_tor()');

  torbutton_save_nontor_settings();
  torbutton_activate_tor_settings();
}

function torbutton_update_toolbutton(mode)
{
  var o_toolbutton = torbutton_get_toolbutton();
  if (!o_toolbutton) return;
  var o_stringbundle = torbutton_get_stringbundle();

  if (mode) {
      tooltip = o_stringbundle.GetStringFromName("torbutton.button.tooltip.enabled");
      o_toolbutton.setAttribute('tbstatus', 'on');
      o_toolbutton.setAttribute('tooltiptext', tooltip);
  } else {
      tooltip = o_stringbundle.GetStringFromName("torbutton.button.tooltip.disabled");
      o_toolbutton.setAttribute('tbstatus', 'off');
      o_toolbutton.setAttribute('tooltiptext', tooltip);
  }
}

function torbutton_update_statusbar(mode)
{
    var o_statuspanel = torbutton_get_statuspanel();
    if (!window.statusbar.visible) return;
    var o_stringbundle = torbutton_get_stringbundle();

    if (mode) {
        label   = o_stringbundle.GetStringFromName("torbutton.panel.label.enabled");
        tooltip = o_stringbundle.GetStringFromName("torbutton.panel.tooltip.enabled");
        o_statuspanel.style.color = "#390";
        o_statuspanel.setAttribute('label', label);
        o_statuspanel.setAttribute('tooltiptext', tooltip);
        o_statuspanel.setAttribute('tbstatus', 'on');
    } else {
        label   = o_stringbundle.GetStringFromName("torbutton.panel.label.disabled");
        tooltip = o_stringbundle.GetStringFromName("torbutton.panel.tooltip.disabled");
        o_statuspanel.style.color = "#F00";
        o_statuspanel.setAttribute('label', label);
        o_statuspanel.setAttribute('tooltiptext', tooltip);
        o_statuspanel.setAttribute('tbstatus', 'off');
    }
}

function torbutton_update_status(mode, force_update) {
    var o_toolbutton = false;
    var o_statuspanel = false;
    var o_stringbundle = false;
    var sPrefix;
    var label;
    var tooltip;
    
    var torprefs = torbutton_get_prefbranch('extensions.torbutton.');
    var changed = (torprefs.getBoolPref('tor_enabled') != mode);
    torprefs.setBoolPref('tor_enabled', mode);

    torbutton_log(2, 'called update_status: '+mode);
    torbutton_log(2, 'Changed: '+changed);

    // this function is called every time there is a new window! Alot of this
    // stuff expects to be called on toggle only.. like the cookie jars and
    // history/cookie clearing
    if(!changed && !force_update) return;

    torbutton_log(2, 'Setting user agent');
    
    if(torprefs.getBoolPref("set_uagent")) {
        if(mode) {
            try {
                m_tb_prefs.setCharPref("general.appname.override", 
                        torprefs.getCharPref("appname_override"));

                m_tb_prefs.setCharPref("general.appversion.override",
                        torprefs.getCharPref("appversion_override"));

                m_tb_prefs.setCharPref("general.platform.override",
                        torprefs.getCharPref("platform_override"));

                m_tb_prefs.setCharPref("general.useragent.override",
                        torprefs.getCharPref("useragent_override"));

                m_tb_prefs.setCharPref("general.useragent.vendor",
                        torprefs.getCharPref("useragent_vendor"));

                m_tb_prefs.setCharPref("general.useragent.vendorSub",
                        torprefs.getCharPref("useragent_vendorSub"));

                m_tb_prefs.setCharPref("general.oscpu.override",
                        torprefs.getCharPref("oscpu_override"));

                m_tb_prefs.setCharPref("general.buildID.override",
                        torprefs.getCharPref("buildID_override"));

                m_tb_prefs.setCharPref("general.productSub.override",
                        torprefs.getCharPref("productsub_override"));

            } catch(e) {
                torbutton_log(5, "Prefset error");
            }
        } else {
            try {
                if(m_tb_prefs.prefHasUserValue("general.appname.override"))
                    m_tb_prefs.clearUserPref("general.appname.override");
                if(m_tb_prefs.prefHasUserValue("general.appversion.override"))
                    m_tb_prefs.clearUserPref("general.appversion.override");
                if(m_tb_prefs.prefHasUserValue("general.useragent.override"))
                    m_tb_prefs.clearUserPref("general.useragent.override");
                if(m_tb_prefs.prefHasUserValue("general.useragent.vendor"))
                    m_tb_prefs.clearUserPref("general.useragent.vendor");
                if(m_tb_prefs.prefHasUserValue("general.useragent.vendorSub"))
                    m_tb_prefs.clearUserPref("general.useragent.vendorSub");
                if(m_tb_prefs.prefHasUserValue("general.platform.override"))
                    m_tb_prefs.clearUserPref("general.platform.override");

                // XXX: Is this ok on ff2?
                if(m_tb_prefs.prefHasUserValue("general.oscpu.override"))
                    m_tb_prefs.clearUserPref("general.oscpu.override");
                if(m_tb_prefs.prefHasUserValue("general.buildID.override"))
                    m_tb_prefs.clearUserPref("general.buildID.override");
                if(m_tb_prefs.prefHasUserValue("general.productSub.override"))
                    m_tb_prefs.clearUserPref("general.productSub.override");
            } catch (e) {
                // This happens because we run this from time to time
                torbutton_log(3, "Prefs already cleared");
            }
        }
    }

    torbutton_log(2, 'Done with user agent: '+changed);

    // FIXME: This is not ideal, but the refspoof method is not compatible
    // with FF2.0
    if(torprefs.getBoolPref("disable_referer")) {
        m_tb_prefs.setBoolPref("network.http.sendSecureXSiteReferrer", !mode);
        m_tb_prefs.setIntPref("network.http.sendRefererHeader", mode ? 0 : 2);
    }

    if(torprefs.getBoolPref("disable_domstorage")) {
        m_tb_prefs.setBoolPref("dom.storage.enabled", !mode);
    }

    if(torprefs.getBoolPref("spoof_english") && mode) {
        m_tb_prefs.setCharPref("general.useragent.locale", 
                torprefs.getCharPref("spoof_locale"));
        m_tb_prefs.setCharPref("intl.accept_charsets", 
                torprefs.getCharPref("spoof_charset"));
        m_tb_prefs.setCharPref("intl.accept_languages",
                torprefs.getCharPref("spoof_language"));
    } else {
        try {
            if(m_tb_prefs.prefHasUserValue("general.useragent.locale"))
                m_tb_prefs.clearUserPref("general.useragent.locale");
            if(m_tb_prefs.prefHasUserValue("intl.accept_charsets"))
                m_tb_prefs.clearUserPref("intl.accept_charsets");
            if(m_tb_prefs.prefHasUserValue("intl.accept_languages"))
                m_tb_prefs.clearUserPref("intl.accept_languages");
        } catch (e) {
            // Can happen if english browser.
            torbutton_log(3, "Browser already english");
        }
    }

    if (torprefs.getBoolPref("no_updates")) {
        m_tb_prefs.setBoolPref("extensions.update.enabled", !mode);
        m_tb_prefs.setBoolPref("app.update.enabled", !mode);
        m_tb_prefs.setBoolPref("app.update.auto", !mode);
        m_tb_prefs.setBoolPref("browser.search.update", !mode);
    }

    if (torprefs.getBoolPref('block_cache')) {
        m_tb_prefs.setBoolPref("browser.cache.memory.enable", !mode);
        m_tb_prefs.setBoolPref("network.http.use-cache", !mode);
    }

    var children = m_tb_prefs.getChildList("network.protocol-handler.warn-external", 
            new Object());
    torbutton_log(2, 'Children: '+ children.length);
    for(var i = 0; i < children.length; i++) {
        torbutton_log(2, 'Children: '+ children[i]);
        if(mode) {
            m_tb_prefs.setBoolPref(children[i], mode);
        } else {
            if(m_tb_prefs.prefHasUserValue(children[i]))
                m_tb_prefs.clearUserPref(children[i]);
        }
    }
    

    // Always block disk cache during Tor. We clear it on toggle, 
    // so no need to keep it around for someone to rifle through.
    m_tb_prefs.setBoolPref("browser.cache.disk.enable", !mode);

    // Disable safebrowsing in Tor for FF2. It fetches some info in 
    // cleartext with no HMAC (Firefox Bug 360387)
    if(!m_tb_ff3) {
        m_tb_prefs.setBoolPref("browser.safebrowsing.enabled", !mode);
    }

    // I think this pref is evil (and also hidden from user configuration, 
    // which makes it extra evil) and so therefore am disabling it 
    // by fiat for both tor and non-tor. Basically, I'm not willing 
    // to put the code in to allow it to be enabled until someone 
    // complains that it breaks stuff.
    m_tb_prefs.setBoolPref("browser.send_pings", false);

    // Always, always disable remote "safe browsing" lookups.
    m_tb_prefs.setBoolPref("browser.safebrowsing.remoteLookups", false);

    // Prevent pages from pinging the Tor ports regardless tor mode
    m_tb_prefs.setCharPref("network.security.ports.banned", 
            m_tb_prefs.getCharPref("extensions.torbutton.banned_ports"));
   
    if (torprefs.getBoolPref("no_search")) {
        m_tb_prefs.setBoolPref("browser.search.suggest.enabled", !mode);
    }
        
    if(torprefs.getBoolPref("no_tor_plugins")) {
        m_tb_prefs.setBoolPref("security.enable_java", !mode);
    }

    torbutton_toggle_jsplugins(mode, 
            changed && torprefs.getBoolPref("isolate_content"),
            torprefs.getBoolPref("no_tor_plugins"));


    if (torprefs.getBoolPref('clear_cache')) {
        var cache = Components.classes["@mozilla.org/network/cache-service;1"].
        getService(Components.interfaces.nsICacheService);
        cache.evictEntries(0);
    }

    if (torprefs.getBoolPref('clear_history')) {
        torbutton_clear_history();
    }

    // FIXME: This is kind of not so user friendly to people who like
    // to keep their own prefs.. Not sure what to do though..
    if(mode) {
        if(torprefs.getBoolPref('block_thwrite')) {
            if(m_tb_ff3) {
                m_tb_prefs.setIntPref("browser.history_expire_days", 0);
            }
            m_tb_prefs.setIntPref("browser.download.manager.retention", 0);
        } else {
            if(m_tb_ff3) {
                // XXX: save user value..
                if(m_tb_prefs.prefHasUserValue("browser.history_expire_days")) {
                    m_tb_prefs.clearUserPref("browser.history_expire_days");
                }
            }
            m_tb_prefs.setIntPref("browser.download.manager.retention", 2);
        }

        if(torprefs.getBoolPref('block_tforms')) {
            m_tb_prefs.setBoolPref("browser.formfill.enable", false);
            m_tb_prefs.setBoolPref("signon.rememberSignons", false);
        } else {
            m_tb_prefs.setBoolPref("browser.formfill.enable", true);
            m_tb_prefs.setBoolPref("signon.rememberSignons", true);
        }
    } else {
        if(torprefs.getBoolPref('block_nthwrite')) {
            if(m_tb_ff3) {
                m_tb_prefs.setIntPref("browser.history_expire_days", 0);
            }
            m_tb_prefs.setIntPref("browser.download.manager.retention", 0);
        } else {
            if(m_tb_ff3) {
                // XXX: save user value..
                if(m_tb_prefs.prefHasUserValue("browser.history_expire_days")) {
                    m_tb_prefs.clearUserPref("browser.history_expire_days");
                }
            }
            m_tb_prefs.setIntPref("browser.download.manager.retention", 2);
        }

        if(torprefs.getBoolPref('block_ntforms')) {
            m_tb_prefs.setBoolPref("browser.formfill.enable", false);
            m_tb_prefs.setBoolPref("signon.rememberSignons", false);
        } else {
            m_tb_prefs.setBoolPref("browser.formfill.enable", true);
            m_tb_prefs.setBoolPref("signon.rememberSignons", true);
        }
    }

    torbutton_log(2, "Prefs pretty much done");
    
    if(torprefs.getBoolPref("no_tor_plugins")) {
        if(mode) {
            if(changed && m_tb_prefs.prefHasUserValue("plugin.disable_full_page_plugin_for_types")) {
                // Update saved plugin pref
                torprefs.setCharPref("saved.full_page_plugins", 
                  m_tb_prefs.getCharPref("plugin.disable_full_page_plugin_for_types"));
            }
            // copy plugins array to pref
            m_tb_prefs.setCharPref("plugin.disable_full_page_plugin_for_types",
                    m_tb_plugin_string);
        } else {
            if(torprefs.prefHasUserValue("saved.full_page_plugins")) {
                // restore saved pref
                m_tb_prefs.setCharPref("plugin.disable_full_page_plugin_for_types",
                        torprefs.getCharPref("saved.full_page_plugins"));
            } else {
                m_tb_prefs.clearUserPref("plugin.disable_full_page_plugin_for_types");
            }
        }
    }

    // No need to clear cookies if just updating prefs
    if(!changed && force_update)
        return;

    if(mode) {
        // Disable livemark fetching on FF3
        // XXX: save user pref
        m_tb_prefs.setIntPref("browser.bookmarks.livemark_refresh_seconds", 0);
    } else {
        if(m_tb_prefs.prefHasUserValue("plugin.disable_full_page_plugin_for_types")) {
            m_tb_prefs.clearUserPref("browser.bookmarks.livemark_refresh_seconds");
        }
    }

    /*
     * XXX: Windows doesn't call tzset() automatically.. Linux and MacOS
     * both do though.. :(
    var environ = Components.classes["@mozilla.org/process/environment;1"]
                   .getService(Components.interfaces.nsIEnvironment);

    if(mode) {
        torbutton_log(2, "Setting timezone to UTC");
        environ.set("TZ", "UTC");
    } else {
        torbutton_log(2, "Unsetting timezone.");
        environ.set("TZ", "PST+7:00");
    }
    */

    // This call also has to be here for 3rd party proxy changers.
    torbutton_close_on_toggle(mode);

    if(torprefs.getBoolPref('clear_http_auth')) {
        var auth = Components.classes["@mozilla.org/network/http-auth-manager;1"].
        getService(Components.interfaces.nsIHttpAuthManager);
        auth.clearAll();
    }

    // Prevent tor cookies from being written to disk
    if(torprefs.getBoolPref('clear_cookies') 
            || torprefs.getBoolPref('cookie_jars')) {
        torbutton_log(2, "Changing cookie lifetime");
        if(mode) {
            torprefs.setIntPref("saved.cookieLifetime", 
                    m_tb_prefs.getIntPref("network.cookie.lifetimePolicy"));
            m_tb_prefs.setIntPref("network.cookie.lifetimePolicy", 2);
        } else {
            m_tb_prefs.setIntPref("network.cookie.lifetimePolicy",
                    torprefs.getIntPref("saved.cookieLifetime")); 
        }
        torbutton_log(2, "Cookie lifetime changed");
    }

    if (torprefs.getBoolPref('clear_cookies')) {
        torbutton_clear_cookies();
    } else if (torprefs.getBoolPref('cookie_jars') 
            || torprefs.getBoolPref('dual_cookie_jars')) {
        torbutton_jar_cookies(mode);
    }

    if (torprefs.getBoolPref('jar_certs')) {
        torbutton_jar_certs(mode);
    }
}

function torbutton_close_on_toggle(mode) {
    var close_tor = m_tb_prefs.getBoolPref("extensions.torbutton.close_tor");
    var close_nontor = m_tb_prefs.getBoolPref("extensions.torbutton.close_nontor");

    if((!close_tor && !mode) || (mode && !close_nontor)) {
        torbutton_log(3, "Not closing tabs");
        return;
    }

    // XXX: muck around with browser.tabs.warnOnClose
    torbutton_log(3, "Closing tabs");
    var wm = Components.classes["@mozilla.org/appshell/window-mediator;1"]
        .getService(Components.interfaces.nsIWindowMediator);
    var enumerator = wm.getEnumerator("navigator:browser");
    while(enumerator.hasMoreElements()) {
        var win = enumerator.getNext();
        var browser = win.getBrowser();
        var tabs = browser.browsers.length;
        var remove = new Array();
        for(var i = 0; i < tabs; i++) {
            if(browser.browsers[i].__tb_tor_fetched != mode) {
                remove.push(browser.browsers[i]);
            }
        }

        for(var i = 0; i < remove.length; i++) {
            browser.removeTab(remove[i]);
        }

        torbutton_log(3, "Length: "+browser.browsers.length);

        if(browser.browsers.length == 1 
                && browser.browsers[0].__tb_tor_fetched != mode) {
            if(win != window) {
                win.close();
            } else {
                var newb = browser.addTab("about:blank");
                browser.removeAllTabsBut(newb);
            }
        }
    }
}


function torbutton_open_prefs_dialog() {
    window.openDialog("chrome://torbutton/content/preferences.xul","torbutton-preferences","centerscreen, chrome");
    torbutton_log(2, 'opened preferences window');
}

function torbutton_open_about_dialog() {
    var extensionManager = Components.classes["@mozilla.org/extensions/manager;1"]
                           .getService(Components.interfaces.nsIExtensionManager);
    var database = '@mozilla.org/rdf/datasource;1?name=composite-datasource';
    var extension_id = '';
    database = Components.classes[database]
               .getService(Components.interfaces.nsIRDFCompositeDataSource);
    database.AddDataSource(extensionManager.datasource);

    if (torbutton_gecko_compare("1.8") <= 0)
    {
        // Firefox 1.5 -- use built-in about box
        extension_id = "urn:mozilla:item:{e0204bd5-9d31-402b-a99d-a6aa8ffebdca}";
        window.openDialog("chrome://mozapps/content/extensions/about.xul","","chrome",extension_id,database);
    } else {
        // Firefox 1.0 -- home page link is broken in built-in about box, use our own
        extension_id = "urn:mozilla:extension:{e0204bd5-9d31-402b-a99d-a6aa8ffebdca}";
        window.openDialog("chrome://torbutton/content/about.xul","","chrome",extension_id,database);
    }
}

function torbutton_about_init() {
    var extensionID = window.arguments[0];
    var extensionDB = window.arguments[1];

    var oBundle = Components.classes["@mozilla.org/intl/stringbundle;1"]
                            .getService(Components.interfaces.nsIStringBundleService);
    var extensionsStrings = document.getElementById("extensionsStrings");

    var rdfs = Components.classes["@mozilla.org/rdf/rdf-service;1"]
                         .getService(Components.interfaces.nsIRDFService);
    var extension = rdfs.GetResource(extensionID);

    var versionArc = rdfs.GetResource("http://www.mozilla.org/2004/em-rdf#version");
    var version = extensionDB.GetTarget(extension, versionArc, true);
    version = version.QueryInterface(Components.interfaces.nsIRDFLiteral).Value;

    var extensionVersion = document.getElementById("torbuttonVersion");

    extensionVersion.setAttribute("value", extensionsStrings.getFormattedString("aboutWindowVersionString", [version]));
}

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
    for (i = 0; i < _elementIDs.length; i++)
        document.getElementById(_elementIDs[i]).setAttribute( "disabled", "true" );
  }

  // window.sizeToContent();
}

// -------------- HISTORY & COOKIES ---------------------
function torbutton_clear_history() {
    torbutton_log(2, 'called torbutton_clear_history');
    var hist = Components.classes["@mozilla.org/browser/global-history;2"]
                    .getService(Components.interfaces.nsIBrowserHistory);
    hist.removeAllPages();

    // Clear individual session histories also
    var wm = Components.classes["@mozilla.org/appshell/window-mediator;1"]
                       .getService(Components.interfaces.nsIWindowMediator);
    var enumerator = wm.getEnumerator("navigator:browser");
    var js_enabled = m_tb_prefs.getBoolPref("javascript.enabled");
    while(enumerator.hasMoreElements()) {
        var win = enumerator.getNext();
        var browser = win.getBrowser();
        var browsers = browser.browsers;
        torbutton_log(1, "Toggle window plugins");

        for (var i = 0; i < browsers.length; ++i) {
            var b = browser.browsers[i];

            b.webNavigation.sessionHistory.PurgeHistory(
                    b.webNavigation.sessionHistory.count);
        }
    }
}

function torbutton_clear_cookies() {
    torbutton_log(2, 'called torbutton_clear_cookies');
    var cm = Components.classes["@mozilla.org/cookiemanager;1"]
                    .getService(Components.interfaces.nsICookieManager);
   
    cm.removeAll();
}

function torbutton_jar_cookies(mode) {
    var selector =
          Components.classes["@stanford.edu/cookie-jar-selector;1"]
                    .getService(Components.interfaces.nsISupports)
                    .wrappedJSObject;
    if(mode) {
        selector.saveCookies("nontor");
        selector.clearCookies();
        if(m_tb_prefs.getBoolPref('extensions.torbutton.dual_cookie_jars'))
            selector.loadCookies("tor", false);
    } else {
        if(m_tb_prefs.getBoolPref('extensions.torbutton.dual_cookie_jars'))
            selector.saveCookies("tor");
        selector.clearCookies();
        selector.loadCookies("nontor", false);
    }
}

function torbutton_jar_cert_type(mode, treeView, name, type) {
    var certdb = Components.classes["@mozilla.org/security/x509certdb;1"]
                    .getService(Components.interfaces.nsIX509CertDB2);
    certdb.QueryInterface(Components.interfaces.nsIX509CertDB);
    var outFile = Components.classes["@mozilla.org/file/local;1"].
        createInstance(Components.interfaces.nsILocalFile); 
    var outList = [];
    
    torbutton_log(2, "Jaring "+name+" certificates: "+mode);

    if(type == Components.interfaces.nsIX509Cert.CA_CERT) {
        try {
            var bundles = Components.classes["@mozilla.org/intl/stringbundle;1"]
                .getService(Components.interfaces.nsIStringBundleService);
            var pipnss_bundle = bundles.createBundle("chrome://pipnss/locale/pipnss.properties");
            var internalToken = pipnss_bundle.GetStringFromName("InternalToken");
        } catch(err) {
            torbutton_log(5, "No String bundle for NSS: "+err);
        }
    }

    for(var i = 0; i < treeView.rowCount; i++) {
        var cert = treeView.getCert(i);
        // HACK alert
        // There is no real way to differentiate user added 
        // CA certificates from builtin ones, aside from the 
        // token name string (which is localized) 
        if(!cert || (type == Components.interfaces.nsIX509Cert.CA_CERT
                && cert.tokenName != internalToken)) {
            continue;
        }

        outList.push(cert);
    }

    // Write current certs to certjar-tor
    // clear certs
    // load certs from certjar-nontor (if exists)

    var dir = Components.classes["@mozilla.org/file/directory_service;1"]
        .getService(Components.interfaces.nsIProperties)
        .get("ProfD", Components.interfaces.nsIFile);

    if(mode) {
        // http://developer.mozilla.org/en/docs/Code_snippets:File_I/O#Getting_special_files
        outFile.initWithPath(dir.path);
        outFile.append("certs-"+name+".nottor");
    } else {
        // http://developer.mozilla.org/en/docs/Code_snippets:File_I/O#Getting_special_files
        outFile.initWithPath(dir.path);
        outFile.append("certs-"+name+".tor");
    }

    // this prompts for a password..
    //certdb.exportPKCS12File(null, outFile, outList.length, outList);
 
    if(outFile.exists()) {
        outFile.remove(false);
    }

    if(outList.length) {
        outFile.create(Components.interfaces.nsIFile.NORMAL_FILE_TYPE, 0600);

        var stream = Components.classes["@mozilla.org/network/file-output-stream;1"]
            .createInstance(Components.interfaces.nsIFileOutputStream);
        stream.init(outFile, 0x04 | 0x08 | 0x20, 0600, 0); // write, create, truncate

        var bstream = Components.classes["@mozilla.org/binaryoutputstream;1"]
            .createInstance(Components.interfaces.nsIBinaryOutputStream);
        bstream.setOutputStream(stream);

        var binaryCerts = [];
        var bitList = [];

        for(var i = 0; i< outList.length; i++) {
            if(outList[i]) {
                var len = new Object();
                var data = outList[i].getRawDER(len);
                //torbutton_log(2, "Delete: "+certdb.deleteCertificate(outList[i]));
                torbutton_log(2, "Delete: "+outList[i].organization+" "+outList[i].tokenName);
                // Need to save trustbits somehow.. They are not saved.
                var bits = 0;
                if(certdb.isCertTrusted(outList[i], type, certdb.TRUSTED_SSL)) {
                    bits |= certdb.TRUSTED_SSL;
                }
                if(certdb.isCertTrusted(outList[i], type, certdb.TRUSTED_EMAIL)) {
                    bits |= certdb.TRUSTED_EMAIL;
                }
                if(certdb.isCertTrusted(outList[i], type, certdb.TRUSTED_OBJSIGN)) {
                    bits |= certdb.TRUSTED_OBJSIGN;
                }

                certdb.deleteCertificate(outList[i]);

                bitList.push(bits); 
                binaryCerts.push(data);
            }
        }

        bstream.write32(binaryCerts.length);
        for(var i = 0; i < binaryCerts.length; i++) {
            bstream.write32(binaryCerts[i].length);
            bstream.write32(bitList[i]);
            bstream.writeByteArray(binaryCerts[i], binaryCerts[i].length);
        }

        bstream.close();
        stream.close();
    }
    
    torbutton_log(2, "Wrote "+outList.length+" "+name+" certificates to "+outFile.path);
}

function torbutton_bytearray_to_string(ba) {
    var ret = "";
    for(var i = 0; i < ba.length; i++) {
        ret = ret + String.fromCharCode(ba[i]);
    }
    return ret;
}

function torbutton_unjar_cert_type(mode, treeView, name, type) {
    var unjared_certs = 0;
    var certdb = Components.classes["@mozilla.org/security/x509certdb;1"]
                    .getService(Components.interfaces.nsIX509CertDB2);
    certdb.QueryInterface(Components.interfaces.nsIX509CertDB);

    var inFile = Components.classes["@mozilla.org/file/local;1"].
        createInstance(Components.interfaces.nsILocalFile); 

    var dir = Components.classes["@mozilla.org/file/directory_service;1"]
        .getService(Components.interfaces.nsIProperties)
        .get("ProfD", Components.interfaces.nsIFile);

    if(mode) {
        inFile.initWithPath(dir.path);
        inFile.append("certs-"+name+".tor");
    } else {
        inFile.initWithPath(dir.path);
        inFile.append("certs-"+name+".nottor");
    }
    
    torbutton_log(2, "Checking for certificates from "+inFile.path);

    if(!inFile.exists()) {
        return;
    }
    torbutton_log(2, "Reading certificates from "+inFile.path);

    var istream = Components.classes["@mozilla.org/network/file-input-stream;1"]
        .createInstance(Components.interfaces.nsIFileInputStream);
    istream.init(inFile, -1, -1, false);

    var bstream = Components.classes["@mozilla.org/binaryinputstream;1"]
        .createInstance(Components.interfaces.nsIBinaryInputStream);
    bstream.setInputStream(istream);

    if(bstream.available()) {
        var certs = bstream.read32();

        if(type == Components.interfaces.nsIX509Cert.CA_CERT) {
            m_tb_prefs.setBoolPref("extensions.torbutton.block_cert_dialogs", 
                    true);
        }

        for(var i = 0; i < certs; i++) {
            var len = bstream.read32();
            var trustBits = bstream.read32();
            var bytes = bstream.readByteArray(len);

            // This just for the trustBits, which seem to be lost 
            // in the BER translation. sucks..
            var base64 = window.btoa(torbutton_bytearray_to_string(bytes));
            var checkCert = certdb.constructX509FromBase64(base64);
            torbutton_log(2, "Made Cert: "+checkCert.organization);

            try {
                switch(type) {
                    case Components.interfaces.nsIX509Cert.EMAIL_CERT:
                        certdb.importEmailCertificate(bytes, bytes.length, null);
                        break;
                    case Components.interfaces.nsIX509Cert.SERVER_CERT:
                        certdb.importServerCertificate(bytes, bytes.length, null);
                        break;
                    case Components.interfaces.nsIX509Cert.USER_CERT:
                        certdb.importUserCertificate(bytes, bytes.length, null);
                        break;
                    case Components.interfaces.nsIX509Cert.CA_CERT:
                        certdb.importCertificates(bytes, bytes.length, type, null);
                        break;
                }
            
                certdb.setCertTrust(checkCert, type, trustBits);

            } catch(e) {
                torbutton_log(5, "Failed to import cert: "+checkCert.organization+": "+e);
            }

            unjared_certs++;
        }
        if(type == Components.interfaces.nsIX509Cert.CA_CERT) {
            m_tb_prefs.setBoolPref("extensions.torbutton.block_cert_dialogs", 
                    false);
        }

        torbutton_log(2, "Read "+unjared_certs+" "+name+" certificates from "+inFile.path);
    }

    bstream.close();
    istream.close();

    return unjared_certs;
}

function torbutton_jar_certs(mode) {
    var tot_certs = 0;
    var certCache = 
        Components.classes["@mozilla.org/security/nsscertcache;1"]
                    .getService(Components.interfaces.nsINSSCertCache);

    var serverTreeView = 
        Components.classes["@mozilla.org/security/nsCertTree;1"]
         .createInstance(Components.interfaces.nsICertTree);
    var emailTreeView = Components.classes["@mozilla.org/security/nsCertTree;1"]
        .createInstance(Components.interfaces.nsICertTree);
    var userTreeView = Components.classes["@mozilla.org/security/nsCertTree;1"]
        .createInstance(Components.interfaces.nsICertTree);
    var caTreeView = Components.classes["@mozilla.org/security/nsCertTree;1"]
        .createInstance(Components.interfaces.nsICertTree);

    torbutton_log(3, "Jaring certificates: "+mode);

    // backup cert8.db just in case..
    // XXX: Verify it actually is cert8.db on windows

    var dbfile = Components.classes["@mozilla.org/file/local;1"].
        createInstance(Components.interfaces.nsILocalFile); 

    var dir = Components.classes["@mozilla.org/file/directory_service;1"]
        .getService(Components.interfaces.nsIProperties)
        .get("ProfD", Components.interfaces.nsIFile);

    dbfile.initWithPath(dir.path);
    dbfile.append("cert8.db.bak");

    if(!dbfile.exists()) {
        torbutton_log(4, "Backing up certificates from "+dbfile.path);
        dbfile.initWithPath(dir.path);
        dbfile.append("cert8.db");
        dbfile.copyTo(dir, "cert8.db.bak");
        torbutton_log(4, "Backed up certificates to "+dbfile.path+".bak");
    }

    certCache.cacheAllCerts();
    serverTreeView.loadCertsFromCache(certCache, 
            Components.interfaces.nsIX509Cert.SERVER_CERT);
    emailTreeView.loadCertsFromCache(certCache, 
            Components.interfaces.nsIX509Cert.EMAIL_CERT);
    userTreeView.loadCertsFromCache(certCache, 
            Components.interfaces.nsIX509Cert.USER_CERT);
    caTreeView.loadCertsFromCache(certCache, 
            Components.interfaces.nsIX509Cert.CA_CERT);

    if(m_tb_prefs.getBoolPref("extensions.torbutton.jar_ca_certs")) {
        torbutton_jar_cert_type(mode, caTreeView, "ca", 
                Components.interfaces.nsIX509Cert.CA_CERT);
    }
    torbutton_jar_cert_type(mode, userTreeView, "user", 
            Components.interfaces.nsIX509Cert.USER_CERT);
    torbutton_jar_cert_type(mode, emailTreeView, "email", 
            Components.interfaces.nsIX509Cert.EMAIL_CERT);
    torbutton_jar_cert_type(mode, serverTreeView, "server", 
            Components.interfaces.nsIX509Cert.SERVER_CERT);
    
    certCache.cacheAllCerts();
    serverTreeView.loadCertsFromCache(certCache, 
            Components.interfaces.nsIX509Cert.SERVER_CERT);
    if(serverTreeView.selection)
        serverTreeView.selection.clearSelection();
    
    emailTreeView.loadCertsFromCache(certCache, 
            Components.interfaces.nsIX509Cert.EMAIL_CERT);
    if(emailTreeView.selection)
        emailTreeView.selection.clearSelection();
    
    userTreeView.loadCertsFromCache(certCache, 
            Components.interfaces.nsIX509Cert.USER_CERT);
    if(userTreeView.selection)
        userTreeView.selection.clearSelection();
    
    caTreeView.loadCertsFromCache(certCache, 
            Components.interfaces.nsIX509Cert.CA_CERT);
    if(caTreeView.selection)
        caTreeView.selection.clearSelection();

    var certdb = Components.classes["@mozilla.org/security/x509certdb;1"]
                    .getService(Components.interfaces.nsIX509CertDB2);
    certdb.QueryInterface(Components.interfaces.nsIX509CertDB);

    certCache.cacheAllCerts();
    serverTreeView.loadCertsFromCache(certCache, 
            Components.interfaces.nsIX509Cert.SERVER_CERT);
    if(serverTreeView.selection)
        serverTreeView.selection.clearSelection();
    
    emailTreeView.loadCertsFromCache(certCache, 
            Components.interfaces.nsIX509Cert.EMAIL_CERT);
    if(emailTreeView.selection)
        emailTreeView.selection.clearSelection();
    
    userTreeView.loadCertsFromCache(certCache, 
            Components.interfaces.nsIX509Cert.USER_CERT);
    if(userTreeView.selection)
        userTreeView.selection.clearSelection();
    
    caTreeView.loadCertsFromCache(certCache, 
            Components.interfaces.nsIX509Cert.CA_CERT);
    if(caTreeView.selection)
        caTreeView.selection.clearSelection();


    if(m_tb_prefs.getBoolPref("extensions.torbutton.jar_ca_certs")) {
        if(torbutton_unjar_cert_type(mode, caTreeView, "ca", 
                Components.interfaces.nsIX509Cert.CA_CERT) == 0) {
            // arma thinks this not worth even asking. He is probably right.
            m_tb_prefs.setBoolPref("extensions.torbutton.jar_ca_certs",
                    false);
        }
    }
    torbutton_unjar_cert_type(mode, userTreeView, "user", 
            Components.interfaces.nsIX509Cert.USER_CERT);
    torbutton_unjar_cert_type(mode, emailTreeView, "email", 
            Components.interfaces.nsIX509Cert.EMAIL_CERT);

    // XXX: on FF3, somehow CA certs get loaded into server pane on 
    // reload
    torbutton_unjar_cert_type(mode, serverTreeView, "server", 
            Components.interfaces.nsIX509Cert.SERVER_CERT);


    certCache.cacheAllCerts();
    serverTreeView.loadCertsFromCache(certCache, 
            Components.interfaces.nsIX509Cert.SERVER_CERT);
    if(serverTreeView.selection)
        serverTreeView.selection.clearSelection();
    
    emailTreeView.loadCertsFromCache(certCache, 
            Components.interfaces.nsIX509Cert.EMAIL_CERT);
    if(emailTreeView.selection)
        emailTreeView.selection.clearSelection();
    
    userTreeView.loadCertsFromCache(certCache, 
            Components.interfaces.nsIX509Cert.USER_CERT);
    if(userTreeView.selection)
        userTreeView.selection.clearSelection();
    
    caTreeView.loadCertsFromCache(certCache, 
            Components.interfaces.nsIX509Cert.CA_CERT);
    if(caTreeView.selection)
        caTreeView.selection.clearSelection();

}


// -------------- JS/PLUGIN HANDLING CODE ---------------------

function torbutton_check_js_tag(browser, tor_enabled, js_enabled) {
    if (typeof(browser.__tb_tor_fetched) == 'undefined') {
        // FIXME: the error console is still a navigator:browser
        // and triggers this.
        // Is there any way to otherwise detect it?
        torbutton_log(5, "UNTAGGED WINDOW!!!!!!!!!");
    }

    if(browser.__tb_tor_fetched == tor_enabled) { // States match, js ok 
        browser.docShell.allowJavascript = js_enabled;
    } else { // States differ or undefined, js not ok 
        browser.docShell.allowJavascript = false;
    }
}

function torbutton_toggle_win_jsplugins(win, tor_enabled, js_enabled, isolate_dyn, 
                                        kill_plugins) {
    var browser = win.getBrowser();
    var browsers = browser.browsers;
    torbutton_log(1, "Toggle window plugins");

    for (var i = 0; i < browsers.length; ++i) {
        var b = browser.browsers[i];
        if (b) {
            // Only allow plugins if the tab load was from an 
            // non-tor state and the current tor state is off.
            if(kill_plugins) 
                b.docShell.allowPlugins = !b.__tb_tor_fetched && !tor_enabled;
            else 
                b.docShell.allowPlugins = true;
            
            if(isolate_dyn) {
                torbutton_check_js_tag(b, tor_enabled, js_enabled);
                // kill meta-refresh and existing page loading 
                b.webNavigation.stop(b.webNavigation.STOP_ALL);
            }
        }
    }
}

// This is an ugly beast.. But unfortunately it has to be so..
// Looping over all tabs twice is not somethign we wanna do..
function torbutton_toggle_jsplugins(tor_enabled, isolate_dyn, kill_plugins) {
    torbutton_log(1, "Toggle plugins for: "+tor_enabled);
    var wm = Components.classes["@mozilla.org/appshell/window-mediator;1"]
                       .getService(Components.interfaces.nsIWindowMediator);
    var enumerator = wm.getEnumerator("navigator:browser");
    var js_enabled = m_tb_prefs.getBoolPref("javascript.enabled");
    while(enumerator.hasMoreElements()) {
        var win = enumerator.getNext();
        torbutton_toggle_win_jsplugins(win, tor_enabled, js_enabled, isolate_dyn, 
                                       kill_plugins);   
    }
}

function tbHistoryListener(browser) {
    this.browser = browser;

    var o_stringbundle = torbutton_get_stringbundle();
    var warning = o_stringbundle.GetStringFromName("torbutton.popup.history.warning");

    this.f1 = function() {
        if(this.browser.__tb_tor_fetched != m_tb_prefs.getBoolPref("extensions.torbutton.tor_enabled")
                && m_tb_prefs.getBoolPref("extensions.torbutton.block_js_history")) {
            torbutton_log(3, "Blocking history manipulation");
            window.alert(warning);
            return false;
        } else {
            return true;
        }
    };
}

tbHistoryListener.prototype = {
    QueryInterface: function(iid) {
        // XXX: Is this the right way to handle weak references from JS?
        if(iid.equals(Components.interfaces.nsISHistoryListener) || 
                iid.equals(Components.interfaces.nsISupports) ||
                iid.equals(Components.interfaces.nsISupportsWeakReference))
            return this;
        else
            return null;
    },

    OnHistoryGoBack: function(url) { return this.f1(); },
    OnHistoryGoForward: function(url) { return this.f1(); },
    OnHistoryGotoIndex: function(idx, url) { return this.f1(); }, 
    OnHistoryNewEntry: function(url) { return true; },
    OnHistoryPurge: function(ents) { return true; },
    OnHistoryReload: function(uri,flags) { return this.f1(); }
};

function torbutton_tag_new_browser(browser, tor_tag, no_plugins) {
    if (!tor_tag && no_plugins) {
        browser.docShell.allowPlugins = tor_tag;
    }

    // Only tag new windows
    if (typeof(browser.__tb_tor_fetched) == 'undefined') {
        torbutton_log(3, "Tagging new window: "+tor_tag);
        browser.__tb_tor_fetched = !tor_tag;

        // XXX: Do we need to remove this listener on tab close?
        var hlisten = new tbHistoryListener(browser);

        var sessionSetter = function() {
            if(!browser.webNavigation.sessionHistory) {
                torbutton_log(4, "Still failed to add historyListener!");
            }
            browser.webNavigation.sessionHistory.addSHistoryListener(hlisten);
            browser.__tb_hlistener = hlisten;
            torbutton_log(2, "Added history listener");
        }
        
        if(browser.webNavigation.sessionHistory) {
            sessionSetter();
        } else {
            torbutton_log(3, "Delayed session setter");
            window.setTimeout(sessionSetter, 500); 
        }
    }
}

function torbutton_conditional_set(state) {
    if (!m_tb_wasinited) torbutton_init();
    var no_plugins = m_tb_prefs.getBoolPref("extensions.torbutton.no_tor_plugins");
            
    torbutton_log(3, "Conditional set");
    
    // Need to set the tag on all tabs, some of them can be mis-set when
    // the first window is created (before session restore)
    var wm = Components.classes["@mozilla.org/appshell/window-mediator;1"]
                       .getService(Components.interfaces.nsIWindowMediator);
    var enumerator = wm.getEnumerator("navigator:browser");
    var js_enabled = m_tb_prefs.getBoolPref("javascript.enabled");
    while(enumerator.hasMoreElements()) {
        var win = enumerator.getNext();
        var browser = win.getBrowser();
        var browsers = browser.browsers;

        for (var i = 0; i < browsers.length; ++i) {
            var b = browser.browsers[i];

            if (!state && no_plugins) {
                b.docShell.allowPlugins = false;
            } 
            b.__tb_tor_fetched = state;
        }
    }

    torbutton_log(4, "Restoring tor state");
    if (torbutton_check_status() == state) return;
    
    if(state) torbutton_enable_tor();
    else  torbutton_disable_tor();
}

function torbutton_restore_cookies()
{
    var selector =
          Components.classes["@stanford.edu/cookie-jar-selector;1"]
                    .getService(Components.interfaces.nsISupports)
                    .wrappedJSObject;
    torbutton_log(4, "Restoring cookie status");
    selector.clearCookies();
    
    if(m_tb_prefs.getBoolPref("extensions.torbutton.tor_enabled")) {
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

function torbutton_crash_recover()
{
    if (!m_tb_wasinited) torbutton_init();
    torbutton_log(3, "Crash recover check");

    // Crash detection code (works w/ components/crash-observer.js)
    if(m_tb_prefs.getBoolPref("extensions.torbutton.crashed")) {
        torbutton_log(4, "Crash detected, attempting recovery");
        m_tb_prefs.setBoolPref("extensions.torbutton.tor_enabled", 
                torbutton_check_status());
       
        // Do the restore cookies first because we potentially save
        // cookies by toggling tor state in the next pref. If we
        // do this first, we can be sure we have the 'right' cookies
        // currently loaded before the switch writes out a new jar
        if(m_tb_prefs.getBoolPref("extensions.torbutton.reload_crashed_jar"))
            torbutton_restore_cookies();

        if(m_tb_prefs.getBoolPref("extensions.torbutton.restore_tor"))
            torbutton_conditional_set(true);
        else
            torbutton_conditional_set(false);
        m_tb_prefs.setBoolPref("extensions.torbutton.crashed", false);
    }
    torbutton_log(3, "End crash recover check");
}


// ---------------------- Event handlers -----------------

// Technique courtesy of:
// http://xulsolutions.blogspot.com/2006/07/creating-uninstall-script-for.html
const TORBUTTON_EXTENSION_UUID = "{E0204BD5-9D31-402B-A99D-A6AA8FFEBDCA}";
var torbutton_uninstall_observer = {
_uninstall : false,
observe : function(subject, topic, data) {
  if (topic == "em-action-requested") {
    subject.QueryInterface(Components.interfaces.nsIUpdateItem);
    torbutton_log(2, "Uninstall: "+data+" "+subject.id.toUpperCase());

    if (subject.id.toUpperCase() == TORBUTTON_EXTENSION_UUID) {
      torbutton_log(2, "Uninstall: "+data);
      if (data == "item-uninstalled" || data == "item-disabled") {
        this._uninstall = true;
      } else if (data == "item-cancel-action") {
        this._uninstall = false;
      }
    }
  } else if (topic == "quit-application-granted") {
    if (this._uninstall) {
        torbutton_disable_tor();
        // Still called by pref observer:
        // torbutton_update_status(false, false);

        // Clear out prefs set regardless of Tor state 
        if(m_tb_prefs.prefHasUserValue("browser.send_pings"))
            m_tb_prefs.clearUserPref("browser.send_pings");

        if(m_tb_prefs.prefHasUserValue("browser.safebrowsing.remoteLookups"))
            m_tb_prefs.clearUserPref("browser.safebrowsing.remoteLookups");

        if(!m_tb_ff3) {
            if(m_tb_prefs.prefHasUserValue("network.security.ports.banned"))
                m_tb_prefs.clearUserPref("network.security.ports.banned");
        }
    }

    if((m_tb_prefs.getIntPref("extensions.torbutton.shutdown_method") == 1 && 
        m_tb_prefs.getBoolPref("extensions.torbutton.tor_enabled"))
        || m_tb_prefs.getIntPref("extensions.torbutton.shutdown_method") == 2) {
        var selector =
            Components.classes["@stanford.edu/cookie-jar-selector;1"]
            .getService(Components.interfaces.nsISupports)
            .wrappedJSObject;
        selector.clearCookies();
        // clear the cookie jar by saving the empty cookies to it.
        if(m_tb_prefs.getIntPref("extensions.torbutton.shutdown_method") == 2) {
            if(m_tb_prefs.getBoolPref('extensions.torbutton.dual_cookie_jars'))
                selector.saveCookies("tor");
            selector.saveCookies("nontor");
        } else if(m_tb_prefs.getBoolPref('extensions.torbutton.dual_cookie_jars')) {
            selector.saveCookies("tor");
        }
    }
    this.unregister();
  }
},
register : function() {
 var observerService =
   Components.classes["@mozilla.org/observer-service;1"].
     getService(Components.interfaces.nsIObserverService);
 torbutton_log(3, "Observer register");

 observerService.addObserver(this, "em-action-requested", false);
 observerService.addObserver(this, "quit-application-granted", false);
 torbutton_log(3, "Observer register");
},
unregister : function() {
  var observerService =
    Components.classes["@mozilla.org/observer-service;1"].
      getService(Components.interfaces.nsIObserverService);

  observerService.removeObserver(this,"em-action-requested");
  observerService.removeObserver(this,"quit-application-granted");
}
}

// This observer is to catch some additional http load events
// to deal with firefox bug 401296
var torbutton_http_observer = {
observe : function(subject, topic, data) {
  torbutton_eclog(2, 'Examine response: '+subject.name);
  if (!((subject instanceof Components.interfaces.nsIHttpChannel)
      && (subject.loadFlags & Components.interfaces.nsIChannel.LOAD_DOCUMENT_URI)))
      return;
  if (topic == "http-on-examine-response") {
      torbutton_eclog(3, 'Definitaly Examine response: '+subject.name);
      torbutton_check_progress(null, subject);
  } else if (topic == "http-on-modify-request") {
      torbutton_eclog(3, 'Modify request: '+subject.name);
  }
},
register : function() {
 var observerService =
   Components.classes["@mozilla.org/observer-service;1"].
     getService(Components.interfaces.nsIObserverService);
 torbutton_log(3, "Observer register");

 observerService.addObserver(this, "http-on-modify-request", false);
 observerService.addObserver(this, "http-on-examine-response", false);
 torbutton_log(3, "Observer register");
},
unregister : function() {
  var observerService =
    Components.classes["@mozilla.org/observer-service;1"].
      getService(Components.interfaces.nsIObserverService);

  observerService.removeObserver(this,"http-on-modify-request");
  observerService.removeObserver(this,"http-on-examine-response");
}
}


function torbutton_do_main_window_startup()
{
    torbutton_log(3, "Torbutton main window startup");
    m_tb_is_main_window = true;

    // http://www.xulplanet.com/references/xpcomref/ifaces/nsIWebProgress.html
    var progress =
        Components.classes["@mozilla.org/docloaderservice;1"].
        getService(Components.interfaces.nsIWebProgress);

    progress.addProgressListener(torbutton_weblistener,
            //   Components.interfaces.nsIWebProgress.NOTIFY_STATE_ALL|
            //   Components.interfaces.nsIWebProgress.NOTIFY_ALL);
        Components.interfaces.nsIWebProgress.NOTIFY_STATE_DOCUMENT|
            Components.interfaces.nsIWebProgress.NOTIFY_LOCATION);

    torbutton_unique_pref_observer.register();
    torbutton_uninstall_observer.register();
    torbutton_http_observer.register();
}

function torbutton_do_onetime_startup()
{
    if(m_tb_prefs.getBoolPref("extensions.torbutton.startup")) {
        torbutton_do_main_window_startup();
        m_tb_prefs.setBoolPref("extensions.torbutton.startup", false);
    }
}

function torbutton_get_plugin_mimetypes()
{
    m_tb_plugin_mimetypes = { null : null };
    var plugin_list = [];
    for(var i = 0; i < window.navigator.mimeTypes.length; ++i) {
        var mime = window.navigator.mimeTypes.item(i);
        if(mime && mime.enabledPlugin) {
            m_tb_plugin_mimetypes[mime.type] = true;
            plugin_list.push(mime.type);
        }
    }
    m_tb_plugin_string = plugin_list.join();
}


function torbutton_new_tab(event)
{ 
    // listening for new tabs
    torbutton_log(2, "New tab");
    var tor_tag = !m_tb_prefs.getBoolPref("extensions.torbutton.tor_enabled");
    var no_plugins = m_tb_prefs.getBoolPref("extensions.torbutton.no_tor_plugins");
    var browser = event.currentTarget;

    // Fucking garbage.. event is delivered to the current tab, not the 
    // newly created one. Need to traverse the current window for it.
    for (var i = 0; i < browser.browsers.length; ++i) {
        torbutton_tag_new_browser(browser.browsers[i], tor_tag, no_plugins);
    }
}

function torbutton_do_resize(ev)
{
    if(m_tb_prefs.getBoolPref("extensions.torbutton.tor_enabled")
            && m_tb_prefs.getBoolPref("extensions.torbutton.resize_on_toggle")) {
        var bWin = window.getBrowser().contentWindow;
        // only resize if outer window size has changed (ignore stuff like
        // scrollbars and find bars)
        if((m_tb_window_height != window.outerHeight ||
                m_tb_window_width != window.outerWidth) && window.windowState 
                == Components.interfaces.nsIDOMChromeWindow.STATE_NORMAL) {
            torbutton_log(2, "Resizing window on event");
            bWin.innerHeight = Math.round(bWin.innerHeight/50.0)*50;
            bWin.innerWidth = Math.round(bWin.innerWidth/50.0)*50;
        }
    }

    m_tb_window_height = window.outerHeight;
    m_tb_window_width = window.outerWidth;
}

function torbutton_check_round(browser) 
{
    // XXX: Not called???
    if(window.windowState 
                == Components.interfaces.nsIDOMChromeWindow.STATE_NORMAL
            && m_tb_prefs.getBoolPref("extensions.torbutton.tor_enabled")
            && m_tb_prefs.getBoolPref("extensions.torbutton.resize_on_toggle")) {
        
        if(Math.abs(browser.contentWindow.innerHeight - 
           Math.floor(Math.round(browser.contentWindow.innerHeight/50.0)*50))
           > 0.1) {
            torbutton_log(2, "Restoring orig window size");
            window.outerHeight = m_tb_window_height;
            window.outerWidth = m_tb_window_width;
        }

        // Always round.
        torbutton_log(2, "Resizing window on load");
        browser.contentWindow.innerHeight = Math.round(browser.contentWindow.innerHeight/50.0)*50;
        browser.contentWindow.innerWidth = Math.round(browser.contentWindow.innerWidth/50.0)*50;
    }
}

function torbutton_new_window(event)
{
    torbutton_log(3, "New window");
    var browser = getBrowser(); 
    if (!m_tb_wasinited) {
        torbutton_init();
    }
    
    torbutton_do_onetime_startup();
    torbutton_crash_recover();

    torbutton_get_plugin_mimetypes();

    torbutton_tag_new_browser(browser.browsers[0], 
            !m_tb_prefs.getBoolPref("extensions.torbutton.tor_enabled"),
            m_tb_prefs.getBoolPref("extensions.torbutton.no_tor_plugins"));

    m_tb_window_height = window.outerHeight;
    m_tb_window_width = window.outerWidth;

    window.addEventListener("resize", torbutton_do_resize, true);
}

function torbutton_close_window(event) {
    torbutton_window_pref_observer.unregister();

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
        torbutton_uninstall_observer.unregister();
        torbutton_http_observer.unregister();

    }
}

// XXX: Firefox3 might not support this??
window.addEventListener('load',torbutton_new_window,false);
window.addEventListener('unload', torbutton_close_window, false);
getBrowser().addEventListener("TabOpen", torbutton_new_tab, false);


// ----------- JAVASCRIPT HOOKING + EVENT HANDLERS ----------------

function torbutton_init_jshooks() {
    torbutton_log(2, "torbutton_init_jshooks()");
    var nsio = Components.classes["@mozilla.org/network/io-service;1"]
                .getService(Components.interfaces.nsIIOService);
    var chan = nsio.newChannel("chrome://torbutton/content/jshooks.js", 
                               null, null);
    var istream = Components.classes["@mozilla.org/scriptableinputstream;1"].
            createInstance(Components.interfaces.nsIScriptableInputStream);

    istream.init(chan.open());
    m_tb_jshooks = istream.read(istream.available());
    istream.close();
}

function torbutton_getbody(doc) {
    if (doc.body)
        return doc.body;
    else if (doc.documentElement)
        return doc.documentElement;
    return null;
}

/* This seems to be necessary due to javascript's
 * nebulous scoping/parsing/evaluations issues. Having this as
 * a standalone statement seems to cause the flag
 * to become defined after just parsing, not execution */
function torbutton_set_flag(obj, flag) {
    obj[flag] = true;
}

function torbutton_check_flag(obj, flag) {
    return (typeof(obj[flag]) != 'undefined');
}

function torbutton_is_same_origin(source, target) { // unused.
    var fixup = Components.classes["@mozilla.org/docshell/urifixup;1"]
        .getService(Components.interfaces.nsIURIFixup);
    var source = fixup.createFixupURI(win.top.location.href, 0);
    var target = fixup.createFixupURI(win.location.href, 0);

    var secmgr = Components.classes["@mozilla.org/scriptsecuritymanager;1"]
        .getService(Components.interfaces.nsIScriptSecurityManager);

    if(!source || !target) {
        torbutton_log(5, "Can't convert one of: "+win.document.location+", parent is: "+win.top.document.location);
    }

    // TODO: this doesn't work.. esp if document modifies document.domain
    // window.windowRoot instead? Also, prints an error message
    // to the error console..
    try {
        secmgr.checkSameOriginURI(source, target);
        torbutton_log(3, "Same-origin non-toplevel window: "+win.document.location+", parent is: "+win.top.document.location);
        win = win.top;
    } catch(e) {
        torbutton_log(3, "Exception w/ non-same-origin non-toplevel window: "+win.document.location+", parent is: "+win.top.document.location);
    }
}


function torbutton_update_tags(win) {
    torbutton_eclog(2, "Updating tags.");
    if(typeof(win.wrappedJSObject) == 'undefined') {
        torbutton_eclog(3, "No JSObject: "+win.location);
        return;
    }

    var wm = Components.classes["@torproject.org/content-window-mapper;1"]
        .getService(Components.interfaces.nsISupports)
        .wrappedJSObject;

    // Expire the cache on page loads. TODO: Do a timer instead.. 
    if(win == win.top) wm.expireOldCache();

    var browser = wm.getBrowserForContentWindow(win.top);
    if(!browser) {
        torbutton_log(5, "No window found!1");
        return;
        //win.alert("No window found!");
    }
    torbutton_log(2, "Got browser "+browser.contentWindow.location+" for: " 
            + win.location + ", under: "+win.top.location);

    var tor_tag = !m_tb_prefs.getBoolPref("extensions.torbutton.tor_enabled");
    var js_enabled = m_tb_prefs.getBoolPref("javascript.enabled");
    var kill_plugins = m_tb_prefs.getBoolPref("extensions.torbutton.no_tor_plugins");

    if (!torbutton_check_flag(win.top, "__tb_did_tag")) {
        torbutton_log(2, "Tagging browser for: " + win.location);
        torbutton_set_flag(win.top, "__tb_did_tag");

        if(typeof(browser.__tb_tor_fetched) == "undefined") {
            torbutton_log(5, "Untagged browser at: "+win.location);
        } else if(browser.__tb_tor_fetched != !tor_tag) {
            // Purge session history every time we fetch a new doc 
            // in a new tor state
            torbutton_log(2, "Purging session history");
            if(browser.webNavigation.sessionHistory.count > 1
                    && m_tb_prefs.getBoolPref("extensions.torbutton.block_js_history")) {
                // XXX: This isn't quite right.. For some reason
                // this breaks in some cases..
                /*
                var current = browser.webNavigation
                    .QueryInterface(Components.interfaces.nsIDocShellHistory)
                    .getChildSHEntry(0).clone(); // XXX: Use index??
                    */
                var current = browser.webNavigation.contentViewer.historyEntry;

                browser.webNavigation.sessionHistory.PurgeHistory(
                        browser.webNavigation.sessionHistory.count);

                if(current) {
                    // Add current page back in
                    browser.webNavigation
                        .QueryInterface(Components.interfaces.nsISHistoryInternal)
                        .addChildSHEntry(current, true);
                }
            }
        }

        browser.__tb_tor_fetched = !tor_tag;
        browser.docShell.allowPlugins = tor_tag || !kill_plugins;
        browser.docShell.allowJavascript = js_enabled;

        // We need to do the resize here as well in case the window
        // was minimized during toggle...
        torbutton_check_round(browser);
    }

    torbutton_log(2, "Tags updated.");
}

// XXX: Same-origin policy may prevent our hooks from applying
// to inner iframes.. Test with frames, iframes, and
// popups. Test these extensively:
// http://taossa.com/index.php/2007/02/08/same-origin-policy/
//  - http://www.htmlbasix.com/popup.shtml
//  - http://msdn2.microsoft.com/en-us/library/ms531202.aspx
//  - Url-free: http://www.yourhtmlsource.com/javascript/popupwindows.html#accessiblepopups
//    - Blocked by default (tho perhaps only via onload). 
//      see popup blocker detectors:
//      - http://javascript.internet.com/snippets/popup-blocker-detection.html
//      - http://www.visitor-stats.com/articles/detect-popup-blocker.php 
//      - http://www.dynamicdrive.com/dynamicindex8/dhtmlwindow.htm
//  - popup blocker tests:
//    - http://swik.net/User:Staple/JavaScript+Popup+Windows+Generation+and+Testing+Tutorials
//  - pure javascript pages/non-text/html pages
//  - Messing with variables/existing hooks
function torbutton_hookdoc(win, doc) {
    if(typeof(win.wrappedJSObject) == 'undefined') {
        torbutton_eclog(3, "No JSObject: "+win.location);
        return;
    }

    torbutton_log(2, "Hooking document: "+win.location);
    if(doc && doc.doctype) {
        torbutton_log(2, "Type: "+doc.doctype.name);
    }
    
    var js_enabled = m_tb_prefs.getBoolPref("javascript.enabled");

    // No need to hook js if tor is off
    if(!js_enabled 
            || !m_tb_prefs.getBoolPref("extensions.torbutton.tor_enabled") 
            || !m_tb_prefs.getBoolPref('extensions.torbutton.kill_bad_js')) {
        torbutton_log(2, "Finished non-hook of: " + win.location);
        return;
    }

    // Date Hooking:

    /* Q: Do this better with XPCOM?
     *    http://www.mozilla.org/projects/xpcom/nsIClassInfo.html
     * A: Negatory.. Date() is not an XPCOM component :(
     */
    
    // So it looks like the race condition is actually a result of
    // the insertion function returning before the injected code is evaluated.
    // This code seems to do what we want.

    var str2 = "";
    if(m_tb_ff3) {
        str2 += "window.__tb_set_uagent=false;\r\n";
        str2 += "window.__tb_hook_date=false;\r\n";
    } else {
        str2 += "window.__tb_hook_date=true;\r\n";
        if(m_tb_prefs.getBoolPref("extensions.torbutton.no_tor_plugins")) {
            str2 += "window.__tb_set_uagent="+m_tb_prefs.getBoolPref('extensions.torbutton.set_uagent')+";\r\n";
        } else {
            // Abandon ship on user agent spoofing if user wants plugins.
            // OS+platform can be obtained from plugins anyways, and complications
            // with XPCNativeWrappers makes it hard to provide
            // plugin information in window.navigator properly with plugins
            // enabled.
            str2 += "window.__tb_set_uagent=false;\r\n";
        }
        str2 += "window.__tb_oscpu=\""+m_tb_prefs.getCharPref('extensions.torbutton.oscpu_override')+"\";\r\n";
        str2 += "window.__tb_platform=\""+m_tb_prefs.getCharPref('extensions.torbutton.platform_override')+"\";\r\n";
        str2 += "window.__tb_productSub=\""+m_tb_prefs.getCharPref('extensions.torbutton.productsub_override')+"\";\r\n";
    }
    str2 += m_tb_jshooks;

    try {
        torbutton_log(2, "Type of window: " + typeof(win));
        torbutton_log(2, "Type of wrapped window: " + typeof(win.wrappedJSObject));
        var s = new Components.utils.Sandbox(win.wrappedJSObject);
        // XXX: FF3 issues 
        // http://developer.mozilla.org/en/docs/XPConnect_wrappers#XPCSafeJSObjectWrapper
        // http://developer.mozilla.org/en/docs/Code_snippets:Interaction_between_privileged_and_non-privileged_pages
        s.window = win.wrappedJSObject; 
//        s.__proto__ = win.wrappedJSObject;
        //var result = Components.utils.evalInSandbox('var origDate = Date; window.alert(new origDate())', s);
        //result = 23;
        var result = Components.utils.evalInSandbox(str2, s);
        if(result === 23) { // secret confirmation result code.
            torbutton_log(3, "Javascript hooks applied successfully at: " + win.location);
        } else if(result === 13) {
            torbutton_log(3, "Double-hook at: " + win.location);
        } else {
            window.alert("Sandbox evaluation failed. Date hooks not applied!");
            torbutton_log(5, "Hook evaluation failure at " + win.location);
        }
    } catch (e) {
        window.alert("Exception in sandbox evaluation. Date hooks not applied:\n"+e);
        torbutton_log(5, "Hook exception at: "+win.location+", "+e);
    }

    torbutton_log(2, "Finished hook: " + win.location);

    return;
}

// XXX: Tons of exceptions get thrown from this function on account
// of its being called so early. Need to find a quick way to check if
// aProgress and aRequest are actually fully initialized 
// (without throwing exceptions)
function torbutton_check_progress(aProgress, aRequest) {
    if (!m_tb_wasinited) {
        torbutton_init();
    }

    var DOMWindow = null;

    if(aProgress) {
        DOMWindow = aProgress.DOMWindow;
    } else {
        try {
            DOMWindow = aRequest.notificationCallbacks.QueryInterface(
                    Components.interfaces.nsIInterfaceRequestor).getInterface(
                        Components.interfaces.nsIDOMWindow);
        } catch(e) { }
    }
    
    // FIXME if intstanceof nsIHttpChannel check headers for 
    // Content-Disposition..

    // This noise is a workaround for firefox bugs involving
    // enforcement of docShell.allowPlugins and docShell.allowJavascript
    // (Bugs 401296 and 409737 respectively) 
    try {
        if(aRequest) {
            var chanreq = aRequest.QueryInterface(Components.interfaces.nsIChannel);
            if(chanreq
                    && chanreq instanceof Components.interfaces.nsIChannel
                    && aRequest.isPending()) {

                try { torbutton_eclog(2, 'Pending request: '+aRequest.name); }
                catch(e) { }

                if(DOMWindow && DOMWindow.opener 
                        && m_tb_prefs.getBoolPref("extensions.torbutton.isolate_content")) {

                    try { torbutton_eclog(3, 'Popup request: '+aRequest.name); } 
                    catch(e) { }

                    if(!(DOMWindow.top instanceof Components.interfaces.nsIDOMChromeWindow)) {
                        // Workaround for Firefox bug 409737
                        // The idea is that the content policy should stop all
                        // forms of javascript fetches except for popups. This
                        // code handles blocking popups from alternate tor states.
                        var wm = Components.classes["@torproject.org/content-window-mapper;1"]
                            .getService(Components.interfaces.nsISupports)
                            .wrappedJSObject;

                        var browser = wm.getBrowserForContentWindow(DOMWindow.opener);
                        torbutton_eclog(3, 'Got browser for request: ' + (browser != null));

                        // XXX: This may block ssl popups in the first tab
                        if(browser && browser.__tb_tor_fetched != m_tb_prefs.getBoolPref("extensions.torbutton.tor_enabled")) {
                            try {
                                torbutton_eclog(3, 'Stopping document: '+DOMWindow.location);
                                aRequest.cancel(0x804b0002); // NS_BINDING_ABORTED
                                DOMWindow.stop();
                                torbutton_eclog(3, 'Stopped document: '+DOMWindow.location);
                                DOMWindow.document.clear();
                                torbutton_eclog(3, 'Cleared document: '+DOMWindow.location);
                            } catch(e) { 
                            } 
                            torbutton_eclog(4, 'Torbutton blocked state-changed popup');
                            DOMWindow.close();
                            return 0;
                        }
                    }
                }

                torbutton_eclog(2, 'LocChange: '+aRequest.contentType);

                // Workaround for Firefox Bug 401296
                if((m_tb_prefs.getBoolPref("extensions.torbutton.tor_enabled")
                            && m_tb_prefs.getBoolPref("extensions.torbutton.no_tor_plugins")
                            && aRequest.contentType in m_tb_plugin_mimetypes)) {
                    aRequest.cancel(0x804b0002); // NS_BINDING_ABORTED
                    var o_stringbundle = torbutton_get_stringbundle();
                    var warning = o_stringbundle.GetStringFromName("torbutton.popup.plugin.warning");
                    if(DOMWindow) {
                        // ZOMG DIE DIE DXIE!!!!!@
                        try {
                            DOMWindow.stop();
                            torbutton_eclog(2, 'Stopped document');
                            DOMWindow.document.clear();
                            torbutton_eclog(2, 'Cleared document');

                            if(typeof(DOMWindow.__tb_kill_flag) == 'undefined') {
                                window.alert(warning);
                                DOMWindow.__tb_kill_flag = true;
                            }
                            // This doesn't seem to actually remove the child..
                            // It usually just causes an exception to be thrown,
                            // which strangely enough, actually does finally 
                            // kill the plugin.
                            DOMWindow.document.removeChild(
                                    DOMWindow.document.firstChild);
                        } catch(e) {
                            torbutton_eclog(3, 'Exception on stop/clear');
                        }
                    } else {
                        torbutton_eclog(4, 'No progress for document cancel!');
                        window.alert(warning);
                    }
                    torbutton_eclog(3, 'Killed plugin document');
                    return 0;
                }
            } else {
                torbutton_eclog(2, 'Nonpending: '+aRequest.name);
                torbutton_eclog(2, 'Type: '+aRequest.contentType);
            }
        }
    } catch(e) {
        torbutton_eclog(3, 'Exception on request cancel');
    }

    // TODO: separate this from the above?
    if(DOMWindow) {
        var doc = DOMWindow.document;
        try {
            if(doc && doc.domain) {
                torbutton_update_tags(DOMWindow.window);
                torbutton_hookdoc(DOMWindow.window, doc);
            }
        } catch(e) {
            torbutton_eclog(3, "Hit about:plugins? "+doc.location);
        }        
    } else {
        torbutton_eclog(3, "No aProgress for location!");
    }
    return 0;
}

// Warning: These can also fire when the 'debuglogger' extension
// updates its window. Typically for this, doc.domain is null. Do not
// log in this case (until we find a better way to filter those
// events out). Use torbutton_eclog for common-path stuff.
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

  onStateChange: function(aProgress, aRequest, aFlag, aStatus)
  { 
      torbutton_eclog(1, 'State change()');
      return torbutton_check_progress(aProgress, aRequest);
  },

  onLocationChange: function(aProgress, aRequest, aURI)
  {
      torbutton_eclog(1, 'onLocationChange: '+aURI.asciiSpec);
      return torbutton_check_progress(aProgress, aRequest);
  },

  onProgressChange: function(aProgress, aRequest, curSelfProgress, maxSelfProgress, curTotalProgress, maxTotalProgress) 
  { 
      torbutton_eclog(1, 'called progressChange'); 
      return torbutton_check_progress(aProgress, aRequest);
  },
  
  onStatusChange: function(aProgress, aRequest, stat, message) 
  { 
      torbutton_eclog(1, 'called progressChange'); 
      return torbutton_check_progress(aProgress, aRequest);
  },
  
  onSecurityChange: function() {return 0;},
  
  onLinkIconAvailable: function() 
  { /*torbutton_eclog(1, 'called linkIcon'); */ return 0; }
}


//vim:set ts=4
