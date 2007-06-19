var m_tb_logger = false;
var m_tb_console = false;
var m_tb_debug = Components.classes["@mozilla.org/preferences-service;1"]
            .getService(Components.interfaces.nsIPrefBranch)
            .getBoolPref("extensions.torbutton.debug");

var m_tb_loglevel = Components.classes["@mozilla.org/preferences-service;1"]
            .getService(Components.interfaces.nsIPrefBranch)
            .getIntPref("extensions.torbutton.loglevel");

try {
    var logMngr = Components.classes["@mozmonkey.com/debuglogger/manager;1"]
                    .getService(Components.interfaces.nsIDebugLoggerManager); 
    m_tb_logger = logMngr.registerLogger("torbutton");
} catch (exErr) {
    m_tb_console = Components.classes["@mozilla.org/consoleservice;1"]
                    .getService(Components.interfaces.nsIConsoleService);
    m_tb_logger = false;
}

function torbutton_log(nLevel, sMsg) {
    if(!m_tb_debug) return;

    var rDate = new Date();
    if (m_tb_logger) {
        m_tb_logger.log(nLevel, rDate.getTime()+': '+sMsg);
    } else if (m_tb_console && nLevel >= m_tb_loglevel) {
        m_tb_console.logStringMessage(rDate.getTime()+': '+sMsg);
    } else if (nLevel >= m_tb_loglevel) {
        dump(rDate.getTime()+': '+sMsg+"\n");
    }
}

// get a preferences branch object
// FIXME: this is lame.
function torbutton_get_prefbranch(branch_name) {
    var o_prefs = false;
    var o_branch = false;

    torbutton_log(4, "called get_prefbranch()");
    o_prefs = Components.classes["@mozilla.org/preferences-service;1"]
                        .getService(Components.interfaces.nsIPrefService);
    if (!o_prefs)
    {
        torbutton_log(3, "failed to get preferences-service");
        return false;
    }

    o_branch = o_prefs.getBranch(branch_name);
    if (!o_branch)
    {
        torbutton_log(3, "failed to get prefs branch");
        return false;
    }

    return o_branch;
}

// check if the socks_remote_dns preference exists
function torbutton_check_socks_remote_dns()
{
    var o_prefbranch = false;

    o_prefbranch = torbutton_get_prefbranch("network.proxy.");
    // check if this version of Firefox has the socks_remote_dns option
    try {
        o_prefbranch.getBoolPref('socks_remote_dns');
        torbutton_log(3, "socks_remote_dns is available");
        return true;
    } catch (rErr) {
        // no such preference
        torbutton_log(3, "socks_remote_dns is unavailable");
        return false;
    }
}

function torbutton_check_status() {
    var liveprefs = false;
    var torprefs = false;

    liveprefs = torbutton_get_prefbranch('network.proxy.');
    torprefs = torbutton_get_prefbranch('extensions.torbutton.');
    if (!liveprefs || !torprefs) return;

    if (torbutton_check_socks_remote_dns())
         remote_dns = liveprefs.getBoolPref("socks_remote_dns");
    else
         remote_dns = true;

    return ( (liveprefs.getIntPref("type")           == 1)              &&
             (liveprefs.getCharPref("http")          == torprefs.getCharPref('http_proxy'))   &&
             (liveprefs.getIntPref("http_port")      == torprefs.getIntPref('http_port'))     &&
             (liveprefs.getCharPref("ssl")           == torprefs.getCharPref('https_proxy'))  &&
             (liveprefs.getIntPref("ssl_port")       == torprefs.getIntPref('https_port'))    &&
             (liveprefs.getCharPref("ftp")           == torprefs.getCharPref('ftp_proxy'))    &&
             (liveprefs.getIntPref("ftp_port")       == torprefs.getIntPref('ftp_port'))      &&
             (liveprefs.getCharPref("gopher")        == torprefs.getCharPref('gopher_proxy')) &&
             (liveprefs.getIntPref("gopher_port")    == torprefs.getIntPref('gopher_port'))   &&
             (liveprefs.getCharPref("socks")         == torprefs.getCharPref('socks_host'))   &&
             (liveprefs.getIntPref("socks_port")     == torprefs.getIntPref('socks_port'))    &&
             (liveprefs.getIntPref("socks_version")  == 5)              &&
             (liveprefs.getBoolPref("share_proxy_settings") == false)   &&
             (remote_dns == true) );
}

function torbutton_activate_tor_settings()
{
  var liveprefs = false;
  var torprefs = false;

  liveprefs = torbutton_get_prefbranch('network.proxy.');
  torprefs = torbutton_get_prefbranch('extensions.torbutton.');
  if (!liveprefs || !torprefs) return;

  liveprefs.setCharPref('http',         torprefs.getCharPref('http_proxy'));
  liveprefs.setIntPref('http_port',     torprefs.getIntPref('http_port'));
  liveprefs.setCharPref('ssl',          torprefs.getCharPref('https_proxy'));
  liveprefs.setIntPref('ssl_port',      torprefs.getIntPref('https_port'));
  liveprefs.setCharPref('ftp',          torprefs.getCharPref('ftp_proxy'));
  liveprefs.setIntPref('ftp_port',      torprefs.getIntPref('ftp_port'));
  liveprefs.setCharPref('gopher',       torprefs.getCharPref('gopher_proxy'));
  liveprefs.setIntPref('gopher_port',   torprefs.getIntPref('gopher_port'));
  liveprefs.setCharPref('socks',        torprefs.getCharPref('socks_host'));
  liveprefs.setIntPref('socks_port',    torprefs.getIntPref('socks_port'));
  liveprefs.setIntPref('socks_version', 5);
  liveprefs.setBoolPref('share_proxy_settings', false);
  if (torbutton_check_socks_remote_dns()) {
      liveprefs.setBoolPref('socks_remote_dns', true);
  }
  liveprefs.setIntPref('type', 1);
}

