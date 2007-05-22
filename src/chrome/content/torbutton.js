var m_toolbutton = false;
var m_statuspanel = false;
var m_wasinited = false;
var m_prefs = false;
var m_stringbundle = false;
var m_tb_logger = false;
var m_socks_pref_exists = false;
var m_exclusion_list = "";

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
    torbutton_log(1, 'called init()');

    if (!m_tb_logger) {
        try {
            var logMngr = Components.classes["@mozmonkey.com/debuglogger/manager;1"]
                                    .getService(Components.interfaces.nsIDebugLoggerManager); 
            m_tb_logger = logMngr.registerLogger("torbutton");
        } catch (exErr) {
            m_tb_logger = false;
        }
    }
    
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

    if (!m_toolbutton) {
        torbutton_init_toolbutton();
    } else {
        torbutton_log(5, 'skipping toolbar button element search');
    }

    if (!m_statuspanel) {
        torbutton_init_statuspanel();
    } else {
        torbutton_log(5, 'skipping statusbar panel element search');
    }

    if (!m_wasinited) {
        torbutton_pref_observer.register();
        m_wasinited = true;
    } else {
        torbutton_log(5, 'skipping pref observer init');
    }
    
    // check if this version of Firefox has the socks_remote_dns option
    m_socks_pref_exists = true;
    try {
        m_prefs.getCharPref("network.proxy.socks_remote_dns");
    } catch (rErr) {
        // no such preference
        m_socks_pref_exists = false;
    }

    torbutton_set_panel_view();
    torbutton_log(2, 'setting torbutton status from proxy prefs');
    torbutton_set_status();
    torbutton_log(2, 'init completed');
}

function torbutton_init_pref_objs() {
    m_prefs = Components.classes["@mozilla.org/preferences-service;1"]
                              .getService(Components.interfaces.nsIPrefBranch);
}

function torbutton_init_toolbutton() {
    torbutton_log(4, 'init_toolbutton(): looking for button element');
    if (document.getElementById("torbutton-button")) {
        m_toolbutton = document.getElementById("torbutton-button");
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

// preferences dialog functions
//   torbutton_prefs_init() -- on dialog load
//   torbutton_prefs_save() -- on dialog save

function torbutton_prefs_init(doc) {
    var checkbox_displayStatusPanel = doc.getElementById('torbutton_displayStatusPanel');
    
    sizeToContent();

    if (!m_prefs) {
        torbutton_init_pref_objs();
    }

    doc.getElementById('torbutton_displayStatusPanel').checked = m_prefs.getBoolPref('extensions.torbutton.display_panel');
    // doc.getElementById('torbutton_warnUponExcludedSite').checked = m_prefs.getBoolPref('extensions.torbutton.prompt_before_visiting_excluded_sites');
}

function torbutton_prefs_save(doc) {
    m_prefs.setBoolPref('extensions.torbutton.display_panel', doc.getElementById('torbutton_displayStatusPanel').checked);
    // m_prefs.setBoolPref('extensions.torbutton.prompt_before_visiting_excluded_sites', doc.getElementById('torbutton_warnUponExcludedSite').checked);
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

    return ( (m_prefs.getIntPref("network.proxy.type")           == 1)           &&
             (m_prefs.getCharPref("network.proxy.http")          == "localhost") &&
             (m_prefs.getIntPref("network.proxy.http_port")      == 8118)        &&
             (m_prefs.getCharPref("network.proxy.ssl")           == "localhost") &&
             (m_prefs.getIntPref("network.proxy.ssl_port")       == 8118)        &&
             (m_prefs.getCharPref("network.proxy.ftp")           == "localhost") &&
             (m_prefs.getIntPref("network.proxy.ftp_port")       == 8118)        &&
             (m_prefs.getCharPref("network.proxy.gopher")        == "localhost") &&
             (m_prefs.getIntPref("network.proxy.gopher_port")    == 8118)        &&
             (m_prefs.getCharPref("network.proxy.socks")         == "localhost") &&
             (m_prefs.getIntPref("network.proxy.socks_port")     == 9050)        &&
             (m_prefs.getIntPref("network.proxy.socks_version")  == 5)           &&
             (m_prefs.getBoolPref("network.proxy.share_proxy_settings") == false) &&
             (remote_dns == true) );
}

function torbutton_disable_tor() {
    torbutton_log(2, 'called disable_tor()');
    m_prefs.setIntPref("network.proxy.type", 0);
}

function torbutton_enable_tor() {
    torbutton_log(2, 'called enable_tor()');

    m_prefs.setCharPref("network.proxy.http", "localhost");
    m_prefs.setIntPref("network.proxy.http_port", 8118);
    m_prefs.setCharPref("network.proxy.ssl", "localhost");
    m_prefs.setIntPref("network.proxy.ssl_port", 8118);
    m_prefs.setCharPref("network.proxy.ftp", "localhost");
    m_prefs.setIntPref("network.proxy.ftp_port", 8118);
    m_prefs.setCharPref("network.proxy.gopher", "localhost");
    m_prefs.setIntPref("network.proxy.gopher_port", 8118);
    m_prefs.setCharPref("network.proxy.socks", "localhost");
    m_prefs.setIntPref("network.proxy.socks_port", 9050);
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
        }
    }
}

function torbutton_log(nLevel, sMsg) {
    if (m_tb_logger) {
        var rDate = new Date();
        m_tb_logger.log(nLevel, rDate.getTime()+': '+sMsg);
    }
}
