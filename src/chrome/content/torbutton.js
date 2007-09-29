// TODO: check for leaks: http://www.mozilla.org/scriptable/avoiding-leaks.html
// TODO: Double-check there are no strange exploits to defeat:
//       http://kb.mozillazine.org/Links_to_local_pages_don%27t_work

// status
var m_tb_wasinited = false;
var m_tb_prefs = false;
var m_tb_jshooks = false;

var torbutton_pref_observer =
{
    register: function()
    {
        var pref_service = Components.classes["@mozilla.org/preferences-service;1"]
                                     .getService(Components.interfaces.nsIPrefBranchInternal);
        this._branch = pref_service.QueryInterface(Components.interfaces.nsIPrefBranchInternal);
        this._branch.addObserver("", this, false);
    },

    unregister: function()
    {
        if (!this._branch) return;
        this._branch.removeObserver("", this);
    },

    // topic:   what event occurred
    // subject: what nsIPrefBranch we're observing
    // data:    which pref has been changed (relative to subject)
    observe: function(subject, topic, data)
    {
        if (topic != "nsPref:changed") return;
        switch (data) {
            case "extensions.torbutton.display_panel":
                torbutton_set_panel_view();
                break;
            case "extensions.torbutton.panel_style":
                torbutton_set_panel_style();
                break;
            case "extensions.torbutton.http_proxy":
            case "extensions.torbutton.http_port":
            case "extensions.torbutton.https_proxy":
            case "extensions.torbutton.https_port":
            case "extensions.torbutton.ftp_proxy":
            case "extensions.torbutton.ftp_port":
            case "extensions.torbutton.gopher_proxy":
            case "extensions.torbutton.gopher_port":
            case "extensions.torbutton.socks_host":
            case "extensions.torbutton.socks_port":
                torbutton_init_prefs();
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
            case "extensions.torbutton.crashed":
                // can we say getto hack, boys and girls?
                torbutton_crash_recover();
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
            case "extensions.torbutton.set_uagent":
            case "extensions.torbutton.block_nthwrite":
            case "extensions.torbutton.block_thwrite":
            case "extensions.torbutton.shutdown_method":
            case "extensions.torbutton.spoof_english":
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
        torbutton_disable_tor();
    } else {
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
        // FIXME: Hrmm... Do we really need observers for each window?
        torbutton_pref_observer.register(); 
        torbutton_uninstall_observer.register();
        m_tb_wasinited = true;
    } else {
        torbutton_log(1, 'skipping pref observer init');
    }
    
    torbutton_set_panel_view();
    torbutton_log(1, 'setting torbutton status from proxy prefs');
    torbutton_set_status();
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
        proxy_host = 'localhost';
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
        torprefs.setCharPref('socks_host', 'localhost');
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
        torbutton_log(5, 'get_toolbutton(): did not find torbutton-button');
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
    torbutton_update_toolbutton(mode);
    torbutton_update_statusbar(mode);

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
            } catch(e) {
                torbutton_log(5, "Prefset error");
            }
        } else {
            try {
                m_tb_prefs.clearUserPref("general.appname.override");
                m_tb_prefs.clearUserPref("general.appversion.override");
                m_tb_prefs.clearUserPref("general.useragent.override");
                m_tb_prefs.clearUserPref("general.useragent.vendor");
                m_tb_prefs.clearUserPref("general.useragent.vendorSub");
                m_tb_prefs.clearUserPref("general.platform.override");
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
        m_tb_prefs.setCharPref("intl.accept_charsets", 
                torprefs.getCharPref("spoof_charset"));
        m_tb_prefs.setCharPref("intl.accept_languages",
                torprefs.getCharPref("spoof_language"));
    } else {
        try {
            m_tb_prefs.clearUserPref("intl.accept_charsets");
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

    // Always block disk cache during Tor. We clear it on toggle, 
    // so no need to keep it around for someone to rifle through.
    m_tb_prefs.setBoolPref("browser.cache.disk.enable", !mode);

    // Always, always disable remote "safe browsing" lookups.
    m_tb_prefs.setBoolPref("browser.safebrowsing.remoteLookups", false);

    if (torprefs.getBoolPref("no_search")) {
        m_tb_prefs.setBoolPref("browser.search.suggest.enabled", !mode);
    }
        
    if(torprefs.getBoolPref("no_tor_plugins")) {
        m_tb_prefs.setBoolPref("security.enable_java", !mode);
    }

    torbutton_toggle_jsplugins(!mode, 
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

    if(mode) {
        if(torprefs.getBoolPref('block_thwrite')) {
            m_tb_prefs.setIntPref("browser.download.manager.retention", 0);
        } else {
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
            m_tb_prefs.setIntPref("browser.download.manager.retention", 0);
        } else {
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

    // No need to clear cookies if just updating prefs
    if(!changed && force_update)
        return;

    if (torprefs.getBoolPref('clear_cookies')) {
        torbutton_clear_cookies();
    } else if (torprefs.getBoolPref('cookie_jars') 
            || torprefs.getBoolPref('dual_cookie_jars')) {
        torbutton_jar_cookies(mode);
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


// -------------- JS/PLUGIN HANDLING CODE ---------------------

function torbutton_check_js_tag(browser, allowed, js_enabled) {
    if (typeof(browser.__tb_js_state) == 'undefined') {
        // XXX: the error console is still a navigator:browser
        // and triggers this.
        // Is there any way to otherwise detect it?
        torbutton_log(5, "UNTAGGED WINDOW!!!!!!!!!");
    }

    if(browser.__tb_js_state == allowed) { // States match, js ok 
        browser.docShell.allowJavascript = js_enabled;
    } else { // States differ or undefined, js not ok 
        browser.docShell.allowJavascript = false;
    }
}

function torbutton_toggle_win_jsplugins(win, allowed, js_enabled, isolate_dyn, 
                                        kill_plugins) {
    var browser = win.getBrowser();
    var browsers = browser.browsers;

    for (var i = 0; i < browsers.length; ++i) {
        var b = browser.browsers[i];
        if (b) {
            // Only allow plugins if the tab load was from an allowed state 
            // and the current tor state is off.
            if(kill_plugins) 
                b.docShell.allowPlugins = allowed && b.__tb_js_state;
            else 
                browser.docShell.allowPlugins = true;
            
            if(isolate_dyn) {
                torbutton_check_js_tag(b, allowed, js_enabled);
                // kill meta-refresh and existing page loading 
                b.webNavigation.stop(b.webNavigation.STOP_ALL);
            }
        }
    }
}

// This is an ugly beast.. But unfortunately it has to be so..
// Looping over all tabs twice is not somethign we wanna do..
function torbutton_toggle_jsplugins(allowed, isolate_dyn, kill_plugins) {
    torbutton_log(1, "Plugins: "+allowed);
    var wm = Components.classes["@mozilla.org/appshell/window-mediator;1"]
                       .getService(Components.interfaces.nsIWindowMediator);
    var enumerator = wm.getEnumerator("navigator:browser");
    var js_enabled = m_tb_prefs.getBoolPref("javascript.enabled");
    while(enumerator.hasMoreElements()) {
        var win = enumerator.getNext();
        torbutton_toggle_win_jsplugins(win, allowed, js_enabled, isolate_dyn, 
                                       kill_plugins);   
    }
}

function torbutton_tag_new_browser(browser, tor_tag, no_plugins) {
    if (!tor_tag && no_plugins) {
        browser.docShell.allowPlugins = tor_tag;
    }

    // Only tag new windows
    if (typeof(browser.__tb_js_state) == 'undefined') {
        browser.__tb_js_state = tor_tag;
    }
}

function torbutton_conditional_set(state) {
    if (!m_tb_wasinited) torbutton_init();

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
        if(m_tb_prefs.getBoolPref("extensions.torbutton.reload_crashed_jar"))
            torbutton_restore_cookies();
        if(m_tb_prefs.getBoolPref("extensions.torbutton.restore_tor"))
            torbutton_conditional_set(true);
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
    }

    if((m_tb_prefs.getIntPref("extensions.torbutton.shutdown_method") == 1 && 
        m_tb_prefs.getBoolPref("extensions.torbutton.tor_enabled"))
        || m_tb_prefs.getIntPref("extensions.torbutton.shutdown_method") == 2) {
        torbutton_clear_cookies();
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

function torbutton_new_window(event)
{
    torbutton_log(3, "New window");
    var browser = getBrowser(); 
    if (!m_tb_wasinited) {
        torbutton_init();
    }
    
    torbutton_crash_recover();

    torbutton_tag_new_browser(browser, 
            !m_tb_prefs.getBoolPref("extensions.torbutton.tor_enabled"),
            m_tb_prefs.getBoolPref("extensions.torbutton.no_tor_plugins"));

    browser.addProgressListener(torbutton_weblistener,
      Components.interfaces.nsIWebProgress.NOTIFY_STATE_DOCUMENT|
      Components.interfaces.nsIWebProgress.NOTIFY_LOCATION);
}

function torbutton_close_window(event) {
    torbutton_pref_observer.unregister();
    torbutton_uninstall_observer.unregister();
}

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

function torbutton_check_load_state(doc, tor_tag) {
    var browser = getBrowser();

    // Find proper browser for this document.. ugh.
    for (var i = 0; i < browser.browsers.length; ++i) {
        var b = browser.browsers[i];
        if (b && b.contentDocument == doc) {
            torbutton_log(1, "Tab states "+tor_tag+" == "+
                    b.__tb_js_state + " -> " + 
                    (b.__tb_js_state == tor_tag)); 
            return b.__tb_js_state == tor_tag;
        }
    }
}

function torbutton_hookdoc(win, doc) {
    torbutton_log(1, "Hooking document: "+doc.location);
    if(doc.doctype) {
        torbutton_log(2, "Hooking document: "+doc.doctype.name);
    }
    if (!m_tb_wasinited) {
        torbutton_init();
    }

    var tor_tag = !m_tb_prefs.getBoolPref("extensions.torbutton.tor_enabled");
    var js_enabled = m_tb_prefs.getBoolPref("javascript.enabled");
   
    // We can't just tag the document here because it is possible
    // to hit reload at just the right point such that the document
    // has been cleared but the window remained.
    if(torbutton_check_flag(win, "__tb_did_hook")) {
        torbutton_log(2, "Already did hook " 
                + torbutton_check_flag(win, "__tb_did_hook"));
        /* XXX: Remove this once bug #460 is resolved */
        /* hrmm.. would doc.isSupported("javascript") 
         * or doc.implementation.hasFeature() work better? */
        if(doc.contentType.indexOf("text/html") != -1 && 
                torbutton_check_load_state(doc, false) && 
                !torbutton_check_flag(win.window.wrappedJSObject, 
                    "__tb_hooks_ran")) {
            torbutton_log(5, "FALSE WIN HOOKING. Please report bug+website!");
            win.alert("False win hooking. Please report bug+website!");
        }
        return; // Ran already
    }

    // We also can't just tag the window either, because it gets
    // cleared on back/fwd(!??)
    if(torbutton_check_flag(doc, "__tb_did_hook")) {
        /* XXX: Remove this once bug #460 is resolved */
        torbutton_log(4, "Hrmm.. Partial checked hook: "
                + torbutton_check_flag(win, "__tb_did_hook"));
        if(doc.contentType.indexOf("text/html") != -1 && 
                torbutton_check_load_state(doc, false) && 
                !torbutton_check_flag(win.window.wrappedJSObject, "__tb_hooks_ran")) {
            torbutton_log(5, "FALSE DOC HOOKING. Please report bug+website!");
            win.alert("False doc hooking. Please report bug+website!");
        } 
        return; // Ran already
    }

    var browser = getBrowser();
    var kill_plugins = m_tb_prefs.getBoolPref("extensions.torbutton.no_tor_plugins");

    // TODO: try nsIWindowWatcher.getChromeForWindow()

    // Find proper browser for this document.. ugh.
    for (var i = 0; i < browser.browsers.length; ++i) {
        var b = browser.browsers[i];
        if (b && b.contentDocument == doc) {
            b.__tb_js_state = tor_tag;
            b.docShell.allowPlugins = tor_tag || !kill_plugins;
            b.docShell.allowJavascript = js_enabled;
        }
    }

    torbutton_log(1, "JS set to: " + js_enabled);
    
    if(!js_enabled) // XXX: bug #460 hack
        win.window.wrappedJSObject.__tb_hooks_ran = true; 

    // No need to hook js if tor is off
    if(!js_enabled 
            || !m_tb_prefs.getBoolPref("extensions.torbutton.tor_enabled") 
            || !m_tb_prefs.getBoolPref('extensions.torbutton.kill_bad_js')) {
        torbutton_log(2, "Finished non-hook of: " + doc.location);
        torbutton_set_flag(win, "__tb_did_hook");
        torbutton_set_flag(doc, "__tb_did_hook");
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

    var str2 = "with(window) { window.__tb_set_uagent="+m_tb_prefs.getBoolPref('extensions.torbutton.set_uagent')+";\r\n";
    str2 += "window.__tb_oscpu=\""+m_tb_prefs.getCharPref('extensions.torbutton.oscpu_override')+"\";\r\n";
    str2 += "window.__tb_platform=\""+m_tb_prefs.getCharPref('extensions.torbutton.platform_override')+"\";\r\n";
    str2 += "window.__tb_productSub=\""+m_tb_prefs.getCharPref('extensions.torbutton.productsub_override')+"\";\r\n";
    str2 += m_tb_jshooks + "}";

    torbutton_log(2, "Document: " + doc.domain);

    try {
        var s = new Components.utils.Sandbox(win.window.wrappedJSObject);
        s.window = win.window.wrappedJSObject;
        var result = Components.utils.evalInSandbox(str2, s);
        if(result == 23) { // secret confirmation result code.
            torbutton_set_flag(win, "__tb_did_hook");
            torbutton_set_flag(doc, "__tb_did_hook");
        } else {
            win.alert("Sandbox evaluation failed. Date hooks not applied!");
        }
    } catch (e) {
        win.alert("Sandbox evaluation failed. Date hooks not applied!");
    }

    torbutton_log(2, "Finished hook: " + doc.location);

    return;
}

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
  { /*torbutton_log(1, 'State change()'); */return 0; },

  onLocationChange: function(aProgress, aRequest, aURI)
  {
    torbutton_log(1, 'onLocationChange');
    // This fires when the location bar changes i.e load event is confirmed
    // or when the user switches tabs
    if(aProgress) {
        torbutton_log(1, "location progress");
        var doc = aProgress.DOMWindow.document;
        try {
            if(doc && doc.domain) 
                torbutton_hookdoc(aProgress.DOMWindow, doc);
            else torbutton_log(2, "No DOM yet at location event");
        } catch(e) {
            torbutton_log(3, "Hit about:plugins? "+doc.location);
        }        
    } else {
        torbutton_log(3, "No aProgress for location!");
    }
    return 0;
  },

  onProgressChange: function(webProgress, request, curSelfProgress, maxSelfProgress, curTotalProgress, maxTotalProgress) 
  { /* torbutton_log(1, 'called progressChange'); */ return 0; },
  
  onStatusChange: function() 
  { /*torbutton_log(1, 'called statusChange'); */ return 0; },
  
  onSecurityChange: function() {return 0;},
  
  onLinkIconAvailable: function() 
  { /*torbutton_log(1, 'called linkIcon'); */ return 0; }
}


//vim:set ts=4
