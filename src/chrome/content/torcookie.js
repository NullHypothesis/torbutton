var cookiesTree = null;
var prefs = null;
var cookies = [];
var protectedcookies = [];
//custom tree view, this is how we dynamically add the cookies
var cookiesTreeView = {
  rowCount : 0,
  setTree : function(tree){},
  getImageSrc : function(row,column) {},
  getProgressMode : function(row,column) {},
  getCellValue : function(row,column) {},
  getCellText : function(row,column){
    var rv="";
    switch (column.id) {
      case "domainCol" : rv = cookies[row].rawHost; break;
      case "nameCol"   : rv = cookies[row].name; break;
      case "lockCol"   : rv = cookies[row].isProtected;
    }
    return rv;
  },
  isSeparator : function(index) {return false;},
  isSorted: function() { return false; },
  isContainer : function(index) {return false;},
  cycleHeader : function(column, aElt) {},
  getRowProperties : function(row,column,prop){},
  getColumnProperties : function(column,columnElement,prop){},
  getCellProperties : function(row,column,prop) {}
 };
 
function Cookie(number,name,value,isDomain,host,rawHost,path,isSecure,expires,
                isProtected) {
  this.number = number;
  this.name = name;
  this.value = value;
  this.isDomain = isDomain;
  this.host = host;
  this.rawHost = rawHost;
  this.path = path;
  this.isSecure = isSecure;
  this.expires = expires;
  this.isProtected = isProtected;
}

function initDialog() {
  cookiesTree = document.getElementById("cookiesTree");
  prefs =Components.classes["@mozilla.org/preferences-service;1"]
        .getService(Components.interfaces.nsIPrefBranch);
  var tor_enabled = prefs.getBoolPref("extensions.torbutton.tor_enabled");
  //init cookie manager
  var cookiemanager = Components.classes["@mozilla.org/cookiemanager;1"].getService();
    cookiemanager = cookiemanager.QueryInterface(Components.interfaces.nsICookieManager);
  var enumerator = cookiemanager.enumerator;
  var count = 0;
  while (enumerator.hasMoreElements()) {
    var nextCookie = enumerator.getNext();
    if (!nextCookie) break;
    nextCookie = nextCookie.QueryInterface(Components.interfaces.nsICookie);
    var host = nextCookie.host;
    var isProt = checkIfProtected(nextCookie.name, host, nextCookie.path);
    //populate list
    cookies[count] =
      new Cookie(count++, nextCookie.name, nextCookie.value, nextCookie.isDomain, host,
                   (host.charAt(0)==".") ? host.substring(1,host.length) : host,
                   nextCookie.path, nextCookie.isSecure, nextCookie.expires,
                   isProt);
  }
  //apply custom view
  cookiesTreeView.rowCount = cookies.length;
  cookiesTree.treeBoxObject.view = cookiesTreeView;    
 
  //grab data from xml files
  //add protected tag
}
function checkIfProtected(name, host, path)
{
  
  return false;
}
function itemSelected() {
  var item = document.getElementById("cookiesTree").selectedItemIndex;
  
}