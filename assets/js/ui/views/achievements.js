/* ==========================================================================
   ZEITKONTO — Ansicht „Erfolge“
   ========================================================================== */
(function (root) {
  "use strict";
  var ZK = root.ZK = root.ZK || {};
  var D = ZK.Dom, T = ZK.Time, I = ZK.I18n;

  (ZK.Views = ZK.Views || {}).achievements = { render: render };

  function render(host, App) {
    var result = App.buildAchievements();
    var stats = ZK.Achievements.buildStats(App.store.allDays(), App.settings());
    var lvl = result.level;

    var head = D.el("div.view-head");
    var left = D.el("div");
    left.appendChild(D.el("h1", { text: I.t("ach.title") }));
    left.appendChild(D.el("p.lede", { text: I.t("ach.lede") }));
    head.appendChild(left);
    var earnedCount = result.badges.filter(function (b) { return b.earned; }).length;
    head.appendChild(D.el("span.tag.solid", { text: earnedCount + " / " + result.badges.length }));
    host.appendChild(head);

    /* ---- Stufe & Serien ---- */
    var top = D.el("div.grid-3.mb-5.stagger");

    var levelCard = D.el("section.card");
    var levelInner = D.el("div.level-card");
    var badge = D.el("div.level-badge", { style: { "--p": Math.round(lvl.progress * 100) + "%" } });
    badge.appendChild(D.el("span", { text: String(lvl.level) }));
    levelInner.appendChild(badge);
    var levelText = D.el("div");
    levelText.innerHTML =
      '<div style="font-size:11px;font-weight:800;letter-spacing:.1em;text-transform:uppercase;color:var(--ink-3)">' +
      D.esc(I.t("ach.level", { n: lvl.level })) + "</div>" +
      '<div style="font-size:24px;font-weight:850;letter-spacing:-.03em;margin:2px 0 6px">' + lvl.xp + " XP</div>" +
      '<div style="font-size:12px;color:var(--ink-3)">' +
      D.esc(I.t("ach.xpToNext", { n: lvl.toNext, next: lvl.level + 1 })) + "</div>";
    levelInner.appendChild(levelText);
    levelCard.appendChild(levelInner);
    top.appendChild(levelCard);

    var streakCard = D.el("section.card");
    streakCard.appendChild(D.el("div.card-head", { html: "<h2>" + D.esc(I.t("ach.currentStreak")) + "</h2>" }));
    var flame = D.el("div.streak-flame");
    flame.innerHTML = '<span style="font-size:30px">' + (stats.currentStreak > 0 ? "🔥" : "🌱") + "</span>" +
      "<span>" + D.esc(I.tn("ach.dayStreak", stats.currentStreak)) + "</span>";
    streakCard.appendChild(flame);
    streakCard.appendChild(D.el("p.muted", {
      style: { fontSize: "12px", marginTop: "8px" },
      text: I.t("ach.bestStreak") + ": " + I.tn("ach.dayStreak", stats.bestStreak)
    }));
    top.appendChild(streakCard);

    var factCard = D.el("section.card");
    factCard.appendChild(D.el("div.card-head", { html: "<h2>" + D.esc(I.t("common.total")) + "</h2>" }));
    var facts = D.el("div.col", { style: { gap: "9px" } });
    [
      [I.t("stats.recordedDays"), String(stats.recordedDays)],
      [I.t("common.hours"), Math.round(stats.totalNet / 60) + " h"],
      [I.t("ach.streak"), I.tn("ach.dayStreak", stats.bestStreak)],
      ["🐓 / 🦉", stats.earlyBirds + " / " + stats.nightOwls]
    ].forEach(function (f) {
      facts.appendChild(D.el("div", {
        style: { display: "flex", justifyContent: "space-between", fontSize: "13px", fontWeight: "650" },
        html: "<span class='muted'>" + D.esc(f[0]) + "</span><span class='mono fw-8'>" + D.esc(f[1]) + "</span>"
      }));
    });
    factCard.appendChild(facts);
    top.appendChild(factCard);

    host.appendChild(top);

    /* ---- Abzeichen ---- */
    var card = D.el("section.card");
    card.appendChild(D.el("div.card-head", { html: "<h2>" + D.esc(I.t("ach.title")) + "</h2>" }));
    var grid = D.el("div.badge-grid");

    result.badges.forEach(function (b) {
      var meta = I.badge(b.id);
      var node = D.el("div.badge" + (b.earned ? ".earned" : ""), {
        "data-tip": b.earned
          ? I.t("ach.unlocked", { date: I.formatDate(b.earnedAt, { day: "2-digit", month: "2-digit", year: "numeric" }) })
          : I.t("ach.locked")
      });
      node.appendChild(D.el("span.emoji", { text: b.emoji }));
      node.appendChild(D.el("span.bname", { text: meta.name }));
      node.appendChild(D.el("span.bdesc", { text: meta.desc }));
      if (!b.earned) {
        var bar = D.el("div.bar.thin.bprog");
        bar.appendChild(D.el("i", { style: { width: Math.round(b.progress * 100) + "%" } }));
        node.appendChild(bar);
        node.appendChild(D.el("span.bdesc.mono", {
          text: I.t("ach.progressOf", { a: Math.round(b.value * 10) / 10, b: b.goal })
        }));
      } else {
        node.appendChild(D.el("span.tag.plus", { text: "+" + b.xp + " XP" }));
      }
      grid.appendChild(node);
    });

    card.appendChild(grid);
    host.appendChild(card);
  }
})(typeof self !== "undefined" ? self : this);
