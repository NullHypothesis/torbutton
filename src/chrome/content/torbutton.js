var m_debug = true;
var m_toolbutton = false;
var m_statuspanel = false;
var m_wasinited = false;
var m_prefs = false;
var m_stringbundle = false;
var m_tb_logger = false;
var m_socks_pref_exists = false;
var m_exclusion_list = "";
var m_http_proxy = false;
var m_http_port = false;
var m_https_proxy = false;
var m_https_port = false;
var m_ftp_proxy = false;
var m_ftp_port = false;
var m_gopher_proxy = false;
var m_gopher_port = false;
var m_socks_host = false;
var m_socks_port = false;

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
        this._branch.removeOberver("", this);
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
                torbutton_set_status();
                break;
        }
    }
}

function torbutton_set_panel_view() {
    torbutton_log(4, 'setting panel visibility');
    var display_panel = m_prefs.getBoolPref('extensions.torbutton.display_panel');
    document.getElementById('torbutton-panel').setAttribute('collapsed', !display_panel);
}

function torbutton_set_panel_style() {
    var panel_style = m_prefs.getCharPref('extensions.torbutton.panel_style');
    torbutton_log(4, 'setting panel style: ' + panel_style);
    document.getElementById('torbutton-panel').setAttribute('class','statusbarpanel-'+panel_style);
}

function torbutton_toggle() {
    torbutton_log(1, 'called toggle()');
    if (!m_wasinited) {
        torbutton_init();
    }
    if (!m_toolbutton) {
        torbutton_init_toolbutton();
    }

    if (torbutton_check_status()) {
        torbutton_disable_tor();
    } else {
        torbutton_enable_tor();
    }
}

function torbutton_set_status() {
    if (torbutton_check_status()) {
        torbutton_log(1,'tor is enabled');
        torbutton_update_status(1);
    } else {
        torbutton_log(1,'tor is disabled');
        torbutton_update_status(0);
    }
}

function torbutton_init() {
    if (!m_tb_logger) {
        try {
            var logMngr = Components.classes["@mozmonkey.com/debuglogger/manager;1"]
                                    .getService(Components.interfaces.nsIDebugLoggerManager); 
            m_tb_logger = logMngr.registerLogger("torbutton");
        } catch (exErr) {
            m_tb_logger = false;
        }
    }

    torbutton_log(1, 'called init()');
    
    // load localization strings
    if (!m_stringbundle) {
        try {
            var oBundle = Components.classes["@mozilla.org/intl/stringbundle;1"]
                                    .getService(Components.interfaces.nsIStringBundleService);
            m_stringbundle = oBundle.createBundle("chrome://torbutton/locale/torbutton.properties");
        } catch(err) {
            m_stringbundle = false;
        }
        if (!m_stringbundle) {
            torbutton_log(1, 'ERROR (init): failed to find torbutton-bundle');
        }
    }

    if (!m_prefs) {
        torbutton_init_pref_objs();
    }

    // check if this version of Firefox has the socks_remote_dns option
    m_socks_pref_exists = true;
    try {
        m_prefs.getBoolPref('network.proxy.socks_remote_dns');
        torbutton_log(3, "socks_remote_dns is available");
    } catch (rErr) {
        // no such preference
        m_socks_pref_exists = false;
        torbutton_log(3, "socks_remote_dns is unavailable");
    }

    // initialize preferences before we start our prefs observer
    torbutton_init_prefs();

    if (!m_toolbutton) {
        torbutton_init_toolbutton();
    } else {
        torbutton_log(5, 'skipping toolbar button element search');
    }

    if (!m_statuspanel) {
        torbutton_init_statuspanel();
        torbutton_set_panel_style();
    } else {
        torbutton_log(5, 'skipping statusbar panel element search');
    }

    if (!m_wasinited) {
        torbutton_pref_observer.register();
        m_wasinited = true;
    } else {
        torbutton_log(5, 'skipping pref observer init');
    }
    
    torbutton_set_panel_view();
    torbutton_log(2, 'setting torbutton status from proxy prefs');
    torbutton_set_status();
    torbutton_log(2, 'init completed');
}

function torbutton_init_pref_objs() {
    torbutton_log(4, "called init_pref_objs()");
    m_prefs = Components.classes["@mozilla.org/preferences-service;1"]
                        .getService(Components.interfaces.nsIPrefBranch);
}

// this function duplicates a lot of code in preferences.js for deciding our
// recommended settings.  figure out a way to eliminate the redundancy.
function torbutton_init_prefs() {
    var proxy_port;
    var proxy_host;
    torbutton_log(4, "called init_prefs()");
    if (!m_prefs) { torbutton_log(1, "ERROR: m_prefs undefined"); }
    if (m_prefs.getBoolPref('extensions.torbutton.use_privoxy'))
    {
        proxy_host = 'localhost';
        proxy_port = 8118;
    }
    else
    {
        proxy_host = '';
        proxy_port = 0;
    }

    if (m_prefs.getCharPref('extensions.torbutton.settings_method') == 'recommended')
    {
        torbutton_log(5, "using recommended settings");
        if (m_socks_pref_exists)
        {
            m_http_proxy = m_https_proxy = proxy_host;
            m_ftp_proxy = m_gopher_proxy = '';
            m_http_port = m_https_port   = proxy_port;
            m_ftp_port = m_gopher_port   = 0;
        } else {
            m_http_proxy = m_https_proxy = m_ftp_proxy = m_gopher_proxy = proxy_host;
            m_http_port = m_https_port = m_ftp_port = m_gopher_port = proxy_port;
        }
        m_socks_host = 'localhost';
        m_socks_port = 9050;
    } else {
        m_http_proxy   = m_prefs.getCharPref('extensions.torbutton.http_proxy');
        m_http_port    = m_prefs.getIntPref('extensions.torbutton.http_port');
        m_https_proxy  = m_prefs.getCharPref('extensions.torbutton.https_proxy');
        m_https_port   = m_prefs.getIntPref('extensions.torbutton.https_port');
        m_ftp_proxy    = m_prefs.getCharPref('extensions.torbutton.ftp_proxy');
        m_ftp_port     = m_prefs.getIntPref('extensions.torbutton.ftp_port');
        m_gopher_proxy = m_prefs.getCharPref('extensions.torbutton.gopher_proxy');
        m_gopher_port  = m_prefs.getIntPref('extensions.torbutton.gopher_port');
        m_socks_host   = m_prefs.getCharPref('extensions.torbutton.socks_host');
        m_socks_port   = m_prefs.getIntPref('extensions.torbutton.socks_port');
    }
    torbutton_log(1, 'http_port='+m_http_port);
    // m_prefs.setCharPref('extensions.torbutton.http_proxy',   m_http_proxy);
    // m_prefs.setIntPref('extensions.torbutton.http_port',     m_http_port);
    // m_prefs.setCharPref('extensions.torbutton.https_proxy',  m_https_proxy);
    // m_prefs.setIntPref('extensions.torbutton.https_port',    m_https_port);
    // m_prefs.setCharPref('extensions.torbutton.ftp_proxy',    m_ftp_proxy);
    // m_prefs.setIntPref('extensions.torbutton.ftp_port',      m_ftp_port);
    // m_prefs.setCharPref('extensions.torbutton.gopher_proxy', m_gopher_proxy);
    // m_prefs.setIntPref('extensions.torbutton.gopher_port',   m_gopher_port);
    // m_prefs.setCharPref('extensions.torbutton.socks_host',   m_socks_host);
    // m_prefs.setIntPref('extensions.torbutton.socks_port',    m_socks_port);
}

function torbutton_init_toolbutton() {
    torbutton_log(4, 'init_toolbutton(): looking for button element');
    if (document.getElementById("torbutton-button")) {
        m_toolbutton = document.getElementById("torbutton-button");
    } else if (document.getElementById("torbutton-button-tb")) {
        m_toolbutton = document.getElementById("torbutton-button-tb");
    } else if (document.getElementById("torbutton-button-tb-msg")) {
        m_toolbutton = document.getElementById("torbutton-button-tb-msg");
    } else {
        torbutton_log(1, 'ERROR (init): failed to find torbutton-button');
    }
}

function torbutton_init_statuspanel() {
    torbutton_log(4, 'init_statuspanel(): looking for statusbar element');
    if (document.getElementById("torbutton-panel")) {
        m_statuspanel = document.getElementById("torbutton-panel");
    } else {
        torbutton_log(1, 'ERROR (init): failed to find torbutton-panel');
    }
}

function torbutton_check_status() {
    // make sure we have the latest proxy exclusion list
    m_exclusion_list = m_prefs.getCharPref("network.proxy.no_proxies_on");

    var remote_dns = false;
    if (m_socks_pref_exists) {
         remote_dns = m_prefs.getBoolPref("network.proxy.socks_remote_dns");
    } else {
         remote_dns = true;
    }

    return ( (m_prefs.getIntPref("network.proxy.type")           == 1)              &&
             (m_prefs.getCharPref("network.proxy.http")          == m_http_proxy)   &&
             (m_prefs.getIntPref("network.proxy.http_port")      == m_http_port)    &&
             (m_prefs.getCharPref("network.proxy.ssl")           == m_https_proxy)  &&
             (m_prefs.getIntPref("network.proxy.ssl_port")       == m_https_port)   &&
             (m_prefs.getCharPref("network.proxy.ftp")           == m_ftp_proxy)    &&
             (m_prefs.getIntPref("network.proxy.ftp_port")       == m_ftp_port)     &&
             (m_prefs.getCharPref("network.proxy.gopher")        == m_gopher_proxy) &&
             (m_prefs.getIntPref("network.proxy.gopher_port")    == m_gopher_port)  &&
             (m_prefs.getCharPref("network.proxy.socks")         == m_socks_host)   &&
             (m_prefs.getIntPref("network.proxy.socks_port")     == m_socks_port)   &&
             (m_prefs.getIntPref("network.proxy.socks_version")  == 5)              &&
             (m_prefs.getBoolPref("network.proxy.share_proxy_settings") == false)   &&
             (remote_dns == true) );
}

function torbutton_disable_tor() {
    torbutton_log(2, 'called disable_tor()');
    m_prefs.setIntPref("network.proxy.type", 0);
}

function torbutton_enable_tor() {
    torbutton_log(2, 'called enable_tor()');

    m_prefs.setCharPref("network.proxy.http",         m_http_proxy);
    m_prefs.setIntPref("network.proxy.http_port",     m_http_port);
    m_prefs.setCharPref("network.proxy.ssl",          m_https_proxy);
    m_prefs.setIntPref("network.proxy.ssl_port",      m_https_port);
    m_prefs.setCharPref("network.proxy.ftp",          m_ftp_proxy);
    m_prefs.setIntPref("network.proxy.ftp_port",      m_ftp_port);
    m_prefs.setCharPref("network.proxy.gopher",       m_gopher_proxy);
    m_prefs.setIntPref("network.proxy.gopher_port",   m_gopher_port);
    m_prefs.setCharPref("network.proxy.socks",        m_socks_host);
    m_prefs.setIntPref("network.proxy.socks_port",    m_socks_port);
    m_prefs.setIntPref("network.proxy.socks_version", 5);
    m_prefs.setBoolPref("network.proxy.share_proxy_settings", false);
    if (m_socks_pref_exists) {
        m_prefs.setBoolPref("network.proxy.socks_remote_dns", true);
    }
    m_prefs.setIntPref("network.proxy.type", 1);
}

function torbutton_update_status(nMode) {
    var sPrefix;
    var label;
    var tooltip;

    torbutton_log(2, 'called update_status('+nMode+')');
    if (nMode == 0) {
        if (m_toolbutton) {
            tooltip = m_stringbundle.GetStringFromName("torbutton.button.tooltip.disabled");
            m_toolbutton.setAttribute('tbstatus', 'off');
            m_toolbutton.setAttribute('tooltiptext', tooltip);
        }

        if (window.statusbar.visible) {
            label   = m_stringbundle.GetStringFromName("torbutton.panel.label.disabled");
            tooltip = m_stringbundle.GetStringFromName("torbutton.panel.tooltip.disabled");
            m_statuspanel.style.color = "#F00";
            m_statuspanel.setAttribute('label', label);
            m_statuspanel.setAttribute('tooltiptext', tooltip);
            m_statuspanel.setAttribute('tbstatus', 'off');
        }
    } else {
        if (m_toolbutton) {
            tooltip = m_stringbundle.GetStringFromName("torbutton.button.tooltip.enabled");
            m_toolbutton.setAttribute('tbstatus', 'on');
            m_toolbutton.setAttribute('tooltiptext', tooltip);
        }

        if (window.statusbar.visible) {
            label   = m_stringbundle.GetStringFromName("torbutton.panel.label.enabled");
            tooltip = m_stringbundle.GetStringFromName("torbutton.panel.tooltip.enabled");
            m_statuspanel.style.color = "#390";
            m_statuspanel.setAttribute('label', label);
            m_statuspanel.setAttribute('tooltiptext', tooltip);
            m_statuspanel.setAttribute('tbstatus', 'on');
        }
    }
}

function torbutton_open_prefs_dialog() {
    window.openDialog("chrome://torbutton/content/preferences.xul","torbutton-preferences","centerscreen, chrome");
}

function torbutton_open_about_dialog() {
    var extensionManager = Components.classes["@mozilla.org/extensions/manager;1"]
                           .getService(Components.interfaces.nsIExtensionManager);
    var database = '@mozilla.org/rdf/datasource;1?name=composite-datasource';
    database = Components.classes[database]
               .getService(Components.interfaces.nsIRDFCompositeDataSource);
    database.AddDataSource(extensionManager.datasource);

    window.openDialog("chrome://mozapps/content/extensions/about.xul","","chrome,modal","urn:mozilla:item:{e0204bd5-9d31-402b-a99d-a6aa8ffebdca}",database);

// or we could just extract the version the way that about.js and about.xul do it
// (the below is incomplete)
/*
  var rdfs = Components.classes["@mozilla.org/rdf/rdf-service;1"]
                       .getService(Components.interfaces.nsIRDFService);
  var extension = rdfs.GetResource("urn:mozilla:item:{e0204bd5-9d31-402b-a99d-a6aa8ffebdca}"); 
  alert(extension.Value);
*/
}

function torbutton_log(nLevel, sMsg) {
    if (m_tb_logger) {
        var rDate = new Date();
        m_tb_logger.log(nLevel, rDate.getTime()+': '+sMsg);
    } else if (m_debug) {
        var rDate = new Date();
        dump("ERROR: m_tb_logger undefined ");
        dump(rDate.getTime()+': '+sMsg+"\n");
    }
}
