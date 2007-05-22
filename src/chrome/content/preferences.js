// preferences dialog functions
//   torbutton_prefs_set_field_attributes() -- initialize dialog fields
//   torbutton_prefs_init() -- on dialog load
//   torbutton_prefs_save() -- on dialog save

var m_prefs_inited = false;
var m_prefs = false;
var m_socks_pref_exists = false;
var m_tb_logger = false;

function torbutton_prefs_init_globals() {
    if (!m_prefs) {
        m_prefs = Components.classes["@mozilla.org/preferences-service;1"]
                            .getService(Components.interfaces.nsIPrefBranch);
    }

    m_socks_pref_exists = true;
    try {
        m_prefs.getBoolPref('network.proxy.socks_remote_dns');
    } catch (rErr) {
        // no such preference
        m_socks_pref_exists = false;
    }

    if (!m_tb_logger) {
        try {
            var logMngr = Components.classes["@mozmonkey.com/debuglogger/manager;1"]
                                    .getService(Components.interfaces.nsIDebugLoggerManager);
            m_tb_logger = logMngr.registerLogger("torbutton_prefs");
        } catch (exErr) {
            m_tb_logger = false;
        }
    }

    m_prefs_inited = true;
}

function torbutton_prefs_set_field_attributes(doc)
{
    torbutton_log(4, "called prefs_set_field_attributes()");

    doc.getElementById('torbutton_panelStyle').setAttribute("disabled", !doc.getElementById('torbutton_displayStatusPanel').checked);
    doc.getElementById('torbutton_panelStyleText').setAttribute("disabled", !doc.getElementById('torbutton_displayStatusPanel').checked);
    doc.getElementById('torbutton_panelStyleIcon').setAttribute("disabled", !doc.getElementById('torbutton_displayStatusPanel').checked);
    doc.getElementById('torbutton_usePrivoxy').setAttribute("disabled", doc.getElementById('torbutton_settingsMethod').value != 'recommended');
    var proxy_port;
    var proxy_host;
    if (doc.getElementById('torbutton_usePrivoxy').checked)
    {
        proxy_host = 'localhost';
        proxy_port = 8118;
    }
    else
    {
        proxy_host = '';
        proxy_port = 0;
    }
    if (doc.getElementById('torbutton_settingsMethod').value == 'recommended') {
        torbutton_log(5, "using recommended settings");
        if (!m_socks_pref_exists)
        {
            doc.getElementById('torbutton_httpProxy').value = proxy_host;
            doc.getElementById('torbutton_httpPort').value = proxy_port;
            doc.getElementById('torbutton_httpsProxy').value = proxy_host;
            doc.getElementById('torbutton_httpsPort').value = proxy_port;
            doc.getElementById('torbutton_ftpProxy').value = proxy_host;
            doc.getElementById('torbutton_ftpPort').value = proxy_port;
            doc.getElementById('torbutton_gopherProxy').value = proxy_host;
            doc.getElementById('torbutton_gopherPort').value = proxy_port;
        } else {
            doc.getElementById('torbutton_httpProxy').value = proxy_host;
            doc.getElementById('torbutton_httpPort').value = proxy_port;
            doc.getElementById('torbutton_httpsProxy').value = proxy_host;
            doc.getElementById('torbutton_httpsPort').value = proxy_port;

            doc.getElementById('torbutton_ftpProxy').value = '';
            doc.getElementById('torbutton_ftpPort').value = 0;
            doc.getElementById('torbutton_gopherProxy').value = '';
            doc.getElementById('torbutton_gopherPort').value = 0;
        }
        doc.getElementById('torbutton_socksHost').value = 'localhost';
        doc.getElementById('torbutton_socksPort').value = 9050;

        doc.getElementById('torbutton_httpProxy').disabled = true;
        doc.getElementById('torbutton_httpPort').disabled = true;
        doc.getElementById('torbutton_httpsProxy').disabled = true;
        doc.getElementById('torbutton_httpsPort').disabled = true;
        doc.getElementById('torbutton_ftpProxy').disabled = true;
        doc.getElementById('torbutton_ftpPort').disabled = true;
        doc.getElementById('torbutton_gopherProxy').disabled = true;
        doc.getElementById('torbutton_gopherPort').disabled = true;
        doc.getElementById('torbutton_socksHost').disabled = true;
        doc.getElementById('torbutton_socksPort').disabled = true;
    } else {
        doc.getElementById('torbutton_httpProxy').disabled = false;
        doc.getElementById('torbutton_httpPort').disabled = false;
        doc.getElementById('torbutton_httpsProxy').disabled = false;
        doc.getElementById('torbutton_httpsPort').disabled = false;
        doc.getElementById('torbutton_ftpProxy').disabled = false;
        doc.getElementById('torbutton_ftpPort').disabled = false;
        doc.getElementById('torbutton_gopherProxy').disabled = false;
        doc.getElementById('torbutton_gopherPort').disabled = false;
        doc.getElementById('torbutton_socksHost').disabled = false;
        doc.getElementById('torbutton_socksPort').disabled = false;
    }
}

function torbutton_prefs_init(doc) {
    var checkbox_displayStatusPanel = doc.getElementById('torbutton_displayStatusPanel');
// return; 

    if (!m_prefs_inited) {
        torbutton_prefs_init_globals();
    }
    torbutton_log(4, "called prefs_init()");
    sizeToContent();

    doc.getElementById('torbutton_displayStatusPanel').checked = m_prefs.getBoolPref('extensions.torbutton.display_panel');
    var panel_style = doc.getElementById('torbutton_panelStyle');
    var panel_style_pref = m_prefs.getCharPref('extensions.torbutton.panel_style');
    if (panel_style_pref == 'text')
        panel_style.selectedItem = doc.getElementById('torbutton_panelStyleText');
    else if (panel_style_pref == 'iconic')
        panel_style.selectedItem = doc.getElementById('torbutton_panelStyleIcon');
    // doc.getElementById('torbutton_panelStyle').value = m_prefs.getCharPref('extensions.torbutton.panel_style');
    var settings_method = doc.getElementById('torbutton_settingsMethod');
    var settings_method_pref = m_prefs.getCharPref('extensions.torbutton.settings_method');
    if (settings_method_pref == 'recommended')
        settings_method.selectedItem = doc.getElementById('torbutton_useRecommendedSettings');
    else if (settings_method_pref == 'custom')
        settings_method.selectedItem = doc.getElementById('torbutton_useCustomSettings');
    // doc.getElementById('torbutton_settingsMethod').value = m_prefs.getCharPref('extensions.torbutton.settings_method');
    doc.getElementById('torbutton_usePrivoxy').checked = m_prefs.getBoolPref('extensions.torbutton.use_privoxy');
    doc.getElementById('torbutton_httpProxy').value = m_prefs.getCharPref('extensions.torbutton.http_proxy');
    doc.getElementById('torbutton_httpPort').value = m_prefs.getIntPref('extensions.torbutton.http_port');
    doc.getElementById('torbutton_httpsProxy').value = m_prefs.getCharPref('extensions.torbutton.https_proxy');
    doc.getElementById('torbutton_httpsPort').value = m_prefs.getIntPref('extensions.torbutton.https_port');
    doc.getElementById('torbutton_ftpProxy').value = m_prefs.getCharPref('extensions.torbutton.ftp_proxy');
    doc.getElementById('torbutton_ftpPort').value = m_prefs.getIntPref('extensions.torbutton.ftp_port');
    doc.getElementById('torbutton_gopherProxy').value = m_prefs.getCharPref('extensions.torbutton.gopher_proxy');
    doc.getElementById('torbutton_gopherPort').value = m_prefs.getIntPref('extensions.torbutton.gopher_port');
    doc.getElementById('torbutton_socksHost').value = m_prefs.getCharPref('extensions.torbutton.socks_host');
    doc.getElementById('torbutton_socksPort').value = m_prefs.getIntPref('extensions.torbutton.socks_port');
    // doc.getElementById('torbutton_warnUponExcludedSite').checked = m_prefs.getBoolPref('extensions.torbutton.prompt_before_visiting_excluded_sites');

    torbutton_prefs_set_field_attributes(doc);
}

function torbutton_prefs_save(doc) {
    torbutton_log(4, "called prefs_save()");
    m_prefs.setBoolPref('extensions.torbutton.display_panel', doc.getElementById('torbutton_displayStatusPanel').checked);
    m_prefs.setCharPref('extensions.torbutton.panel_style', doc.getElementById('torbutton_panelStyle').value);
    m_prefs.setCharPref('extensions.torbutton.settings_method', doc.getElementById('torbutton_settingsMethod').value);
    m_prefs.setBoolPref('extensions.torbutton.use_privoxy', doc.getElementById('torbutton_usePrivoxy').checked);
    m_prefs.setCharPref('extensions.torbutton.http_proxy', doc.getElementById('torbutton_httpProxy').value);
    m_prefs.setIntPref('extensions.torbutton.http_port', doc.getElementById('torbutton_httpPort').value);
    m_prefs.setCharPref('extensions.torbutton.https_proxy', doc.getElementById('torbutton_httpsProxy').value);
    m_prefs.setIntPref('extensions.torbutton.https_port', doc.getElementById('torbutton_httpsPort').value);
    m_prefs.setCharPref('extensions.torbutton.ftp_proxy', doc.getElementById('torbutton_ftpProxy').value);
    m_prefs.setIntPref('extensions.torbutton.ftp_port', doc.getElementById('torbutton_ftpPort').value);
    m_prefs.setCharPref('extensions.torbutton.gopher_proxy', doc.getElementById('torbutton_gopherProxy').value);
    m_prefs.setIntPref('extensions.torbutton.gopher_port', doc.getElementById('torbutton_gopherPort').value);
    m_prefs.setCharPref('extensions.torbutton.socks_host', doc.getElementById('torbutton_socksHost').value);
    m_prefs.setIntPref('extensions.torbutton.socks_port', doc.getElementById('torbutton_socksPort').value);
    // m_prefs.setBoolPref('extensions.torbutton.prompt_before_visiting_excluded_sites', doc.getElementById('torbutton_warnUponExcludedSite').checked);
}
