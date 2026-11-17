/**
 * RETIRED / BENIGN STUB — authorized YesWeHack BBP PoC (handle ivan0912), Dailymotion.
 *
 * The original token-read creative that lived at this guessable path has been
 * retired. This stub contains NO token-read logic, NO window.open and NO
 * network beacon. It renders a static, inert "Advertisement" slot and does
 * nothing else, so the old link is harmless.
 *
 * The active canary PoC lives at an unguessable path and is additionally
 * secret-gated; see the YesWeHack report for the exact provided link.
 */
(function () {
  function VpaidAd() { this._slot = null; this._evtCallbacks = {}; }
  VpaidAd.prototype.handshakeVersion = function () { return "2.0"; };
  VpaidAd.prototype.initAd = function (w, h, vm, d, e, p) {
    this._slot = p.slot;
    this._slot.innerHTML =
      '<div style="position:absolute;top:0;left:0;right:0;bottom:0;' +
        'background:#111;display:flex;align-items:center;justify-content:center;z-index:99999">' +
        '<div style="text-align:center;color:#fff;font-family:sans-serif">' +
          '<div style="font-size:26px;margin-bottom:14px;font-weight:600">Advertisement</div>' +
          '<div style="font-size:13px;opacity:0.65;max-width:460px;line-height:1.5">' +
            'Authorized security research PoC (YWH ivan0912). This retired slot is ' +
            'inert and takes no action.</div>' +
        '</div>' +
      '</div>';
    this._fire("AdLoaded");
  };
  VpaidAd.prototype.startAd = function () { this._fire("AdStarted"); };
  VpaidAd.prototype.stopAd = function () {};
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
