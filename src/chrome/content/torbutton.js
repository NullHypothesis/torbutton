var m_toolbutton = false;
var m_statuspanel = false;
var m_wasinited = false;
var m_commonprefs = false;
var m_stringbundle = false;
var m_tb_logger = false;

function torbutton_toggle() {
    torbutton_log(1, 'called toggle()');
    if (!m_wasinited) {
        torbutton_init();
    }
    if (!m_toolbutton) {
        torbutton_init_toolbutton();
    }

    var nCurProxyType = m_commonprefs.getIntPref("network.proxy.type");
    if (torbutton_check_status()) {
        torbutton_disable_tor();
    } else {
        torbutton_enable_tor();
    }
}

function torbutton_init() {
    if (!m_tb_logger) {
        try {
            var logMngr = Components.classes["@mozmonkey.com/debuglogger/manager;1"].getService(Components.interfaces.nsIDebugLoggerManager); 
            m_tb_logger = logMngr.registerLogger("torbutton");
        } catch (exErr) {
            m_tb_logger = false;
        }
    }
    
    if (!m_stringbundle) {
        try {
            var oBundle = Components.classes["@mozilla.org/intl/stringbundle;1"].getService(Components.interfaces.nsIStringBundleService);
            m_stringbundle = oBundle.createBundle("chrome://torbutton/locale/torbutton.properties");
        } catch(err) { torbutton_log(1, 'caught exception'); }
        if (!m_stringbundle) {
            torbutton_log(1, 'ERROR (init): failed to find torbutton-bundle');
        }
    }

    torbutton_log(1, 'called init()');
    if (!m_commonprefs) {
    	torbutton_initPrefObjects();
    }

    if (!m_statuspanel) {
        torbutton_log(1, 'looking for statusbar element');
        if (document.getElementById("torbutton-panel")) {
            m_statuspanel = document.getElementById("torbutton-panel");
        } else {
            torbutton_log(1, 'ERROR (init): failed to find torbutton-panel');
        }
    } else {
        torbutton_log(1, 'skipping statusbar panel element search');
    }

    if (!m_wasinited) {
        torbutton_log(1, 'initializing observer');
        var rObserver = {
            observe : function(subject, topic, data) { torbutton_setButtonFromPreference(); }
        };
        torbutton_log(1, 'getting service');
        var prefService = Components.classes["@mozilla.org/preferences-service;1"].
            getService(Components.interfaces.nsIPrefService);
        torbutton_log(1, 'getting branch');
        var rBranch = prefService.getBranch("network.");
        torbutton_log(1, 'quering interface');
        var pbi = rBranch.QueryInterface(Components.interfaces.nsIPrefBranchInternal);
        torbutton_log(1, 'adding observer');
        pbi.addObserver("proxy", rObserver, false);
        
        m_wasinited = true;
    } else {
        torbutton_log(1, 'skipping observers init');
    }
    
    torbutton_log(1, 'setting from prefs');
    torbutton_setButtonFromPreference();
    torbutton_log(1, 'init completed');
}

function torbutton_init_toolbutton() {
    torbutton_log(1, 'called init_toolbutton()');
    if (!m_toolbutton) {
        torbutton_log(1, 'looking for button element');
        if (document.getElementById("torbutton-button")) {
            m_toolbutton = document.getElementById("torbutton-button");
        } else {
            torbutton_log(1, 'ERROR (init): failed to find torbutton-button');
        }
    } else {
        torbutton_log(1, 'skipping button element search');
    }
}

function torbutton_initPrefObjects() {
    m_commonprefs = Components.classes["@mozilla.org/preferences-service;1"].getService(Components.interfaces.nsIPrefBranch);
}

function torbutton_check_status() {
    torbutton_log(1,'checking tor status');
    if ( (m_commonprefs.getIntPref("network.proxy.type")           == 0)           ||
         (m_commonprefs.getCharPref("network.proxy.http")          != "localhost") ||
         (m_commonprefs.getIntPref("network.proxy.http_port")      != 8118)        ||
         (m_commonprefs.getCharPref("network.proxy.ssl")           != "localhost") ||
         (m_commonprefs.getIntPref("network.proxy.ssl_port")       != 8118)        ||
         (m_commonprefs.getCharPref("network.proxy.ftp")           != "localhost") ||
         (m_commonprefs.getIntPref("network.proxy.ftp_port")       != 8118)        ||
         (m_commonprefs.getCharPref("network.proxy.gopher")        != "localhost") ||
         (m_commonprefs.getIntPref("network.proxy.gopher_port")    != 8118)        ||
         (m_commonprefs.getCharPref("network.proxy.socks")         != "localhost") ||
         (m_commonprefs.getIntPref("network.proxy.socks_port")     != 8118)        ||
         (m_commonprefs.getIntPref("network.proxy.socks_version")  != 4)           ||
         (m_commonprefs.getCharPref("network.proxy.no_proxies_on") != "localhost, 127.0.0.1") ||
         (m_commonprefs.getIntPref("network.proxy.type")           != 1) )
    {
        return false;
        // torbutton_log(1,'tor is disabled');
        // torbutton_update_status(0);
    } else {
        return true;
        // torbutton_log(1,'tor is enabled');
        // torbutton_update_status(1);
    }
}

function torbutton_setButtonFromPreference() {
    if (torbutton_check_status()) {
        torbutton_log(1,'tor is enabled');
        torbutton_update_status(1);
    } else {
        torbutton_log(1,'tor is disabled');
        torbutton_update_status(0);
    }
}

function torbutton_disable_tor() {
    torbutton_log(1, 'called disable_tor()');
    m_commonprefs.setIntPref("network.proxy.type", 0);
}

function torbutton_enable_tor() {
    torbutton_log(1, 'called enable_tor()');

    m_commonprefs.setCharPref("network.proxy.http", "localhost");
    m_commonprefs.setIntPref("network.proxy.http_port", 8118);
    m_commonprefs.setCharPref("network.proxy.ssl", "localhost");
    m_commonprefs.setIntPref("network.proxy.ssl_port", 8118);
    m_commonprefs.setCharPref("network.proxy.ftp", "localhost");
    m_commonprefs.setIntPref("network.proxy.ftp_port", 8118);
    m_commonprefs.setCharPref("network.proxy.gopher", "localhost");
    m_commonprefs.setIntPref("network.proxy.gopher_port", 8118);
    m_commonprefs.setCharPref("network.proxy.socks", "localhost");
    m_commonprefs.setIntPref("network.proxy.socks_port", 8118);
    m_commonprefs.setIntPref("network.proxy.socks_version", 4);
    m_commonprefs.setCharPref("network.proxy.no_proxies_on", "localhost, 127.0.0.1");
    m_commonprefs.setIntPref("network.proxy.type", 1);
}

function torbutton_update_status(nMode) {
    var sPrefix;

    torbutton_log(1, 'called update_status('+nMode+')');
    if (nMode == 0) {
        if (m_toolbutton) {
            m_toolbutton.setAttribute('tbstatus', 'off');
            m_toolbutton.setAttribute('tooltiptext', m_stringbundle.GetStringFromName("torbutton.button.tooltip.disabled"));
        }

        m_statuspanel.style.color = "#F00";
        m_statuspanel.setAttribute('label', m_stringbundle.GetStringFromName("torbutton.panel.label.disabled"));
        m_statuspanel.setAttribute('tooltiptext', m_stringbundle.GetStringFromName("torbutton.panel.tooltip.disabled"));
    } else {
        if (m_toolbutton) {
            m_toolbutton.setAttribute('tbstatus', 'on');
            m_toolbutton.setAttribute('tooltiptext', m_stringbundle.GetStringFromName("torbutton.button.tooltip.disabled"));
        }

        m_statuspanel.style.color = "#390";
        m_statuspanel.setAttribute('label', m_stringbundle.GetStringFromName("torbutton.panel.label.enabled"));
        m_statuspanel.setAttribute('tooltiptext', m_stringbundle.GetStringFromName("torbutton.panel.tooltip.enabled"));
    }
}

function torbutton_log(nLevel, sMsg) {
    if (m_tb_logger) {
        var rDate = new Date();
        m_tb_logger.log(nLevel, rDate.getTime()+': '+sMsg);
    }
}
