var AxiosMiniprogramAdapter=function(e){"use strict";var t=Object.prototype.toString;
/*!
   * Determine if an object is a Buffer
   *
   * @author   Feross Aboukhadijeh <https://feross.org>
   * @license  MIT
   */function n(e){return"[object Array]"===t.call(e)}function r(e){return null!==e&&"object"==typeof e}function o(e){return"[object Function]"===t.call(e)}function i(e,t){if(null!=e)if("object"!=typeof e&&(e=[e]),n(e))for(var r=0,o=e.length;r<o;r++)t.call(null,e[r],r,e);else for(var i in e)Object.prototype.hasOwnProperty.call(e,i)&&t.call(null,e[i],i,e)}var a={isArray:n,isArrayBuffer:function(e){return"[object ArrayBuffer]"===t.call(e)},isBuffer:function(e){return null!=e&&null!=e.constructor&&"function"==typeof e.constructor.isBuffer&&e.constructor.isBuffer(e)},isFormData:function(e){return"undefined"!=typeof FormData&&e instanceof FormData},isArrayBufferView:function(e){return"undefined"!=typeof ArrayBuffer&&ArrayBuffer.isView?ArrayBuffer.isView(e):e&&e.buffer&&e.buffer instanceof ArrayBuffer},isString:function(e){return"string"==typeof e},isNumber:function(e){return"number"==typeof e},isObject:r,isUndefined:function(e){return void 0===e},isDate:function(e){return"[object Date]"===t.call(e)},isFile:function(e){return"[object File]"===t.call(e)},isBlob:function(e){return"[object Blob]"===t.call(e)},isFunction:o,isStream:function(e){return r(e)&&o(e.pipe)},isURLSearchParams:function(e){return"undefined"!=typeof URLSearchParams&&e instanceof URLSearchParams},isStandardBrowserEnv:function(){return("undefined"==typeof navigator||"ReactNative"!==navigator.product&&"NativeScript"!==navigator.product&&"NS"!==navigator.product)&&("undefined"!=typeof window&&"undefined"!=typeof document)},forEach:i,merge:function e(){var t={};function n(n,r){"object"==typeof t[r]&&"object"==typeof n?t[r]=e(t[r],n):t[r]=n}for(var r=0,o=arguments.length;r<o;r++)i(arguments[r],n);return t},deepMerge:function e(){var t={};function n(n,r){"object"==typeof t[r]&&"object"==typeof n?t[r]=e(t[r],n):t[r]="object"==typeof n?e({},n):n}for(var r=0,o=arguments.length;r<o;r++)i(arguments[r],n);return t},extend:function(e,t,n){return i(t,(function(t,r){e[r]=n&&"function"==typeof t?function(e,t){return function(){for(var n=new Array(arguments.length),r=0;r<n.length;r++)n[r]=arguments[r];return e.apply(t,n)}}(t,n):t})),e},trim:function(e){return e.replace(/^\s*/,"").replace(/\s*$/,"")}},u=function(e,t,n,r,o){return function(e,t,n,r,o){return e.config=t,n&&(e.code=n),e.request=r,e.response=o,e.isAxiosError=!0,e.toJSON=function(){return{message:this.message,name:this.name,description:this.description,number:this.number,fileName:this.fileName,lineNumber:this.lineNumber,columnNumber:this.columnNumber,stack:this.stack,config:this.config,code:this.code}},e}(new Error(e),t,n,r,o)};function c(e){return encodeURIComponent(e).replace(/%40/gi,"@").replace(/%3A/gi,":").replace(/%24/g,"$").replace(/%2C/gi,",").replace(/%20/g,"+").replace(/%5B/gi,"[").replace(/%5D/gi,"]")}var s=function(e,t,n){if(!t)return e;var r;if(n)r=n(t);else if(a.isURLSearchParams(t))r=t.toString();else{var o=[];a.forEach(t,(function(e,t){null!=e&&(a.isArray(e)?t+="[]":e=[e],a.forEach(e,(function(e){a.isDate(e)?e=e.toISOString():a.isObject(e)&&(e=JSON.stringify(e)),o.push(c(t)+"="+c(e))})))})),r=o.join("&")}if(r){var i=e.indexOf("#");-1!==i&&(e=e.slice(0,i)),e+=(-1===e.indexOf("?")?"?":"&")+r}return e};const f=e=>null!==e&&"object"==typeof e;var l;!function(e){e[e.kUnknown=0]="kUnknown",e[e.kWechat=1]="kWechat",e[e.kAlipay=2]="kAlipay",e[e.kBaidu=3]="kBaidu"}(l||(l={}));const d=f(global.wx)?l.kWechat:f(global.my)?l.kAlipay:f(global.swan)?l.kBaidu:l.kUnknown,p=d===l.kWechat?wx.request.bind(wx):d===l.kAlipay?(my.request||my.httpRequest).bind(my):d===l.kBaidu?swan.request.bind(swan):void 0;function m(){let e;return{send(t){p&&(e=p(t))},abort(){e&&e.abort()}}}const h=e=>"string"==typeof e;return e.default=function(e){return new Promise((function(t,n){const{url:r,data:o,headers:i,method:c,params:f,paramsSerializer:p,responseType:b,timeout:y,cancelToken:g}=e;if(e.auth){const[t,n]=[e.auth.username||"",e.auth.password||""];i.Authorization=`Basic ${function(e){const t=String(e);let n,r,o=0,i="ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=",a="";for(;t.charAt(0|o)||(i="=",o%1);a+=i.charAt(63&n>>8-o%1*8)){if(r=t.charCodeAt(o+=.75),r>255)throw new Error('"btoa" failed: The string to be encoded contains characters outside of the Latin1 range.');n=n<<8|r}return a}(`${t}:${n}`)}`}a.forEach(i,(e,t)=>{const n=t.toLowerCase();(void 0===o&&"content-type"===n||"referer"===n)&&delete i[t]});let v=function(e){let t,n,r,o,i,a;const c=m();return{send(s){c.send({...s,success:t=>{const n=t.header||t.headers,r=t.statusCode||t.status||200,o=200===r?"OK":400===r?"Bad Request":"";a&&a({data:t.data,status:r,statusText:o,headers:n,config:e,request:s})},fail:t=>{let n=!1,a=!1;switch(d){case l.kWechat:-1!==t.errMsg.indexOf("request:fail abort")?n=!0:-1!==t.errMsg.indexOf("timeout")&&(a=!0);break;case l.kAlipay:[14,19].includes(t.error)?n=!0:[13].includes(t.error)&&(a=!0)}const c=n?u("Request aborted",e,"ECONNABORTED",""):a?u("Request Timeout",e,"ECONNABORTED",""):u("Network Error",e,null,"");n&&r&&r(c),a&&i&&i(c),o&&o(c)},complete:()=>{t&&(clearTimeout(t),t=void 0)}}),n&&(t=setTimeout(()=>{i&&i(u(`timeout of ${e.timeout||0}ms exceeded`,e,"ECONNABORTED","")),t=void 0},n))},abort(){c.abort()},set timeout(e){n=e},set onabort(e){r=e},set onerror(e){o=e},set ontimeout(e){i=e},set onsuccess(e){a=e}}}(e);const A={url:s(r,f,p),headers:i,method:c&&c.toUpperCase(),data:h(o)?JSON.parse(o):o,responseType:b};g&&g.promise.then(e=>{v&&(v.abort(),n(e),v=null)}),v.timeout=y,v.onsuccess=function(e){!function(e,t,n){var r=n.config.validateStatus;!r||r(n.status)?e(n):t(u("Request failed with status code "+n.status,n.config,null,n.request,n))}(t,n,e),v=null},v.onabort=function(e){v&&(n(e),v=null)},v.onerror=function(e){v&&(n(e),v=null)},v.ontimeout=function(e){n(e),v=null},v.send(A)}))},e.isString=h,e}({});