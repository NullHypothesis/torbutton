var __HookObjects = function() {
  /* XXX: Removeme once verified not to run twice */
  if (typeof(window.__tb_hooks_ran) != 'undefined') {
      alert("Error, double jshook!");
      return;
  }
 
  /* TODO: It might be a good idea to hook window sizes also..
     But that will almost certainly fuck with rendering.. Maybe set
     user's window to a fixed size? */

  /* Hrmm.. Is it possible this breaks plugin install or other weird shit
     for non-windows OS's? */
  if(__tb_set_uagent) {
      var tmp_oscpu = __tb_oscpu;
      navigator.__defineGetter__("oscpu", function() { return tmp_oscpu;});
  }

  /* Timezone fix for http://gemal.dk/browserspy/css.html */
  var reparseDate = function(d, str) {
    /* Rules:
     *   - If they specify a timezone, it is converted to local
     *     time. All getter fucntions then convert properly to
     *     UTC. No mod needed.
     *   - If they specify UTC timezone, then it is converted
     *     to local time. All getter functions then convert back.
     *     No mod needed.
     *   - If they specify NO timezone, it is local time. 
     *     The UTC conversion then reveals the offset. Fix.
     */
    
    /* Step 1: Remove everything inside ()'s (they are "comments") */
    var s = str.toLowerCase();
    var re = new RegExp('\\(.*\\)', "gm");
    s = s.replace(re, "");

    /* Step 2: Look for +/-. If found, do nothing */
    if(s.indexOf("+") == -1 && s.indexOf("-") == -1) {
      /* Step 3: Look for timezone string from
       * http://lxr.mozilla.org/seamonkey/source/js/src/jsdate.c
       */
      if(s.indexOf(" gmt") == -1 && s.indexOf(" ut") == -1 &&
         s.indexOf(" est") == -1 && s.indexOf(" edt") == -1 &&
         s.indexOf(" cst") == -1 && s.indexOf(" cdt") == -1 &&
         s.indexOf(" mst") == -1 && s.indexOf(" mdt") == -1 &&
         s.indexOf(" pst") == -1 && s.indexOf(" pdt")) {
        /* No timezone specified. Adjust. */
        d.setTime(d.getTime()-(d.getTimezoneOffset()*60000));
      }
    } 
  } 

  var tmp = Date;
  Date = function() {
    /* DO NOT make 'd' a member! EvilCode will use it! */
    var d;
    var a = arguments;
    /* apply doesn't seem to work for constructors :( */
    if(arguments.length == 0) d=new tmp();
    if(arguments.length == 1) d=new tmp(a[0]);
    if(arguments.length == 3) d=new tmp(a[0],a[1],a[2]);
    if(arguments.length == 4) d=new tmp(a[0],a[1],a[2],a[3]);
    if(arguments.length == 5) d=new tmp(a[0],a[1],a[2],a[3],a[4]);
    if(arguments.length == 6) d=new tmp(a[0],a[1],a[2],a[3],a[4],a[5]);
    if(arguments.length == 7) d=new tmp(a[0],a[1],a[2],a[3],a[4],a[5],a[6]);
    if(arguments.length > 7) d=new tmp();

    if(arguments.length > 0) {
      if((arguments.length == 1) && typeof(a[0]) == "string") {
        reparseDate(d,a[0]);
      } else if(arguments.length > 1) { 
        /* Numerical value. No timezone given, adjust. */
        d.setTime(d.getTime()-(d.getTimezoneOffset()*60000));
      }
    }

    Date.prototype.valueOf=Date.prototype.getTime = /* UTC already */
         function(){return d.getTime();}
    Date.prototype.getFullYear=function(){return d.getUTCFullYear();}  
    Date.prototype.getYear=function() {return d.getUTCYear();}
    Date.prototype.getMonth=function(){return d.getUTCMonth();}
    Date.prototype.getDate=function() {return d.getUTCDate();}
    Date.prototype.getDay=function() {return d.getUTCDay();}
    Date.prototype.getHours=function(){return d.getUTCHours();}
    Date.prototype.getMinutes=function(){return d.getUTCMinutes();}
    Date.prototype.getSeconds=function(){return d.getUTCSeconds();}
    Date.prototype.getMilliseconds=function(){return d.getUTCMilliseconds();}
    Date.prototype.getTimezoneOffset=function(){return 0;}
 
    Date.prototype.setTime = 
       function(x) {return d.setTime(x);}
    Date.prototype.setFullYear=function(x){return d.setUTCFullYear(x);}
    Date.prototype.setYear=function(x){return d.setUTCYear(x);}
    Date.prototype.setMonth=function(x){return d.setUTCMonth(x);}
    Date.prototype.setDate=function(x){return d.setUTCDate(x);}
    Date.prototype.setDay=function(x){return d.setUTCDay(x);}
    Date.prototype.setHours=function(x){return d.setUTCHours(x);}
    Date.prototype.setMinutes=function(x){return d.setUTCMinutes(x);}
    Date.prototype.setSeconds=function(x){return d.setUTCSeconds(x);}
    Date.prototype.setMilliseconds=
       function(x) {return d.setUTCMilliseconds(x);}
 
    Date.prototype.getUTCFullYear=function(){return d.getUTCFullYear();}  
    Date.prototype.getUTCYear=function() {return d.getUTCYear();}
    Date.prototype.getUTCMonth=function(){return d.getUTCMonth();}
    Date.prototype.getUTCDate=function() {return d.getUTCDate();}
    Date.prototype.getUTCDay=function() {return d.getUTCDay();}
    Date.prototype.getUTCHours=function(){return d.getUTCHours();}
    Date.prototype.getUTCMinutes=function(){return d.getUTCMinutes();}
    Date.prototype.getUTCSeconds=function(){return d.getUTCSeconds();}
    Date.prototype.getUTCMilliseconds=
       function(){return d.getUTCMilliseconds();}
     
    Date.prototype.setUTCFullYear=function(x){return d.setUTCFullYear(x);}
    Date.prototype.setUTCYear=function(x){return d.setUTCYear(x);}
    Date.prototype.setUTCMonth=function(x){return d.setUTCMonth(x);}
    Date.prototype.setUTCDate=function(x){return d.setUTCDate(x);}
    Date.prototype.setUTCDay=function(x){return d.setUTCDay(x);}
    Date.prototype.setUTCHours=function(x){return d.setUTCHours(x);}
    Date.prototype.setUTCMinutes=function(x){return d.setUTCMinutes(x);}
    Date.prototype.setUTCSeconds=function(x){return d.setUTCSeconds(x);}
    Date.prototype.setUTCMilliseconds=
        function(x) {return d.setUTCMilliseconds(x);}
  
    Date.prototype.toUTCString=function(){return d.toUTCString();}
    Date.prototype.toGMTString=function(){return d.toGMTString();}
    Date.prototype.toString=function(){return d.toUTCString();}
    Date.prototype.toLocaleString=function(){return d.toUTCString();}
    
    /* Fuck 'em if they can't take a joke: */
    Date.prototype.toLocaleTimeString=function(){return d.toUTCString();}
    Date.prototype.toLocaleDateString=function(){return d.toUTCString();}
    Date.prototype.toDateString=function(){return d.toUTCString();}
    Date.prototype.toTimeString=function(){return d.toUTCString();}

    /* Hack to solve the problem of multiple date objects
     * all sharing the same lexically scoped d every time a new one is
     * created. This hack creates a fresh new prototype reference for 
     * the next object to use with a different d binding.
     */
    Date.prototype = new Object.prototype.toSource();
    return d.toUTCString();
  }

  Date.parse=function(s) {
    var d = new tmp(s);
    if(typeof(s) == "string") reparseDate(d, s);
    return d.getTime();    
  }

  Date.now=function(){return tmp.now();}
  Date.UTC=function(){return tmp.apply(tmp, arguments); }
}

if (__HookObjects) {
    __HookObjects();
    __HookObjects = undefined;
    __tb_set_uagent = undefined;
    __tb_oscpu = undefined;
    /* XXX: Removeme */
    window.__tb_hooks_ran = true;
}
