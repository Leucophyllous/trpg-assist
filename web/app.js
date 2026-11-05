import { API } from "./config.js";

const SYS = {
  Cthulhu: "クトゥルフ神話TRPG (CoC6)",
  Cthulhu7th: "クトゥルフ神話TRPG 7版",
  "SwordWorld2.5": "ソード・ワールド2.5",
  ShinobiGami: "シノビガミ",
  Emoklore: "エモクロアTRPG",
  Other: "その他"
};
const DICE_NAMES = { ...SYS, Other: undefined, DiceBot: "汎用ダイス" };
const PRESETS = {
  Cthulhu: ["1d100", "CC<=50", "1d6", "1d10"],
  Cthulhu7th: ["CC<=50", "1d100", "1d6", "1d10"],
  "SwordWorld2.5": ["2d6", "K20", "K10+5", "1d6"],
  ShinobiGami: ["SG>=5", "SG>=7", "2d6", "ST"],
  Emoklore: ["DM<=5", "2DM<=5", "1d6", "3DM<=4"],
  DiceBot: ["2d6", "1d100", "3d6", "1d20"]
};
const TEMPLATES = {
  Cthulhu: ["STR", "CON", "POW", "DEX", "APP", "SIZ", "INT", "EDU", "HP", "MP", "SAN", "職業", "年齢"],
  Cthulhu7th: ["STR", "CON", "POW", "DEX", "APP", "SIZ", "INT", "EDU", "HP", "MP", "SAN", "幸運", "職業", "年齢"],
  "SwordWorld2.5": ["種族", "生まれ", "冒険者レベル", "器用度", "敏捷度", "筋力", "生命力", "知力", "精神力", "HP", "MP", "技能"],
  ShinobiGami: ["流派", "階級", "生命力", "功績点", "信念", "使命", "秘密"],
  Emoklore: ["職業", "目的", "技能"],
  Other: ["HP", "MP"]
};
const ERR = {
  "invalid invite": "招待リンクが無効です（再発行された可能性があります）",
  "table is full": "この卓は満員です",
  "too many tables created": "本日の卓作成数の上限に達しました",
  "capacity reached": "サービスの容量上限に達しています",
  "limit reached": "登録件数の上限に達しました",
  forbidden: "権限がありません",
  unauthorized: "認証が必要です",
  "gm only": "GMのみ操作できます",
  "too large": "データが大きすぎます"
};
const TABS = [["rules", "ルール"], ["dice", "ダイス"], ["sheets", "キャラシ"], ["logs", "記録"], ["members", "メンバー"]];

const app = document.getElementById("app");
const toastEl = document.getElementById("toast");
let timer = null;
let toastTimer = null;
let dicePromise = null;

function loadDice() {
  if (!dicePromise) dicePromise = import("./dice.js");
  return dicePromise;
}

function h(tag, attrs, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (k === "class") el.className = v;
    else if (k.startsWith("on")) el.addEventListener(k.slice(2), v);
    else if (v === true) el.setAttribute(k, "");
    else if (v !== false && v != null) el.setAttribute(k, v);
  }
  for (const c of kids.flat(Infinity)) if (c != null && c !== false) el.append(c.nodeType ? c : document.createTextNode(String(c)));
  return el;
}

function field(label, el) {
  return h("label", { class: "field" }, h("span", {}, label), el);
}

function notify(text) {
  toastEl.textContent = text;
  toastEl.classList.add("on");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl.classList.remove("on"), 3200);
}

function msg(e) {
  return ERR[e.message] || e.message || "エラーが発生しました";
}

function fmt(ms) {
  return new Date(ms).toLocaleString("ja-JP", { dateStyle: "short", timeStyle: "short" });
}

const store = {
  get() {
    try { return JSON.parse(localStorage.getItem("trpg.tables") || "{}"); } catch { return {}; }
  },
  set(v) {
    try { localStorage.setItem("trpg.tables", JSON.stringify(v)); } catch {}
  },
  name() {
    try { return localStorage.getItem("trpg.name") || ""; } catch { return ""; }
  },
  setName(n) {
    try { localStorage.setItem("trpg.name", n); } catch {}
  }
};

function remember(id, patch) {
  const s = store.get();
  s[id] = { ...(s[id] || {}), ...patch };
  store.set(s);
}

async function api(method, path, body, token) {
  const headers = {};
  if (token) headers.Authorization = "Bearer " + token;
  if (body) headers["Content-Type"] = "application/json";
  const res = await fetch(API + path, { method, headers, body: body ? JSON.stringify(body) : undefined });
  let data = {};
  try { data = await res.json(); } catch {}
  if (!res.ok) {
    const e = new Error(data.error || "HTTP " + res.status);
    e.status = res.status;
    throw e;
  }
  return data;
}

function page(...content) {
  app.replaceChildren(h("header", { class: "site" }, h("a", { href: "#/" }, "TRPGアシスト"), h("span", { class: "muted" }, "招待制の卓共有サイト")), ...content.flat(Infinity).filter(c => c != null && c !== false));
}

function notice(title, text) {
  page(h("div", { class: "card" }, h("h2", {}, title), h("p", {}, text), h("a", { href: "#/" }, "ホームへ")));
}

function sysSelect(value) {
  const sel = h("select", {}, Object.entries(SYS).map(([k, v]) => h("option", { value: k, selected: k === value }, v)));
  return sel;
}

function homeView() {
  const mine = Object.entries(store.get());
  const list = mine.length
    ? mine.map(([id, t]) => h("a", { class: "item", href: "#/t/" + id + "/rules" }, h("div", { class: "card" }, h("h3", {}, t.name || id, t.role === "gm" ? h("span", { class: "badge" }, "GM") : null), h("div", { class: "muted" }, SYS[t.system] || ""))))
    : [h("p", { class: "muted" }, "参加中の卓はありません。")];
  const name = h("input", { maxlength: 60, required: true });
  const sys = sysSelect("Cthulhu");
  const desc = h("textarea", { rows: 2, maxlength: 500 });
  const me = h("input", { maxlength: 30, required: true, value: store.name() });
  const create = h("button", { class: "primary", onclick: async (ev) => {
    if (!name.value.trim() || !me.value.trim()) return notify("卓の名前とあなたの表示名を入力してください");
    ev.target.disabled = true;
    try {
      const r = await api("POST", "/api/tables", { name: name.value, system: sys.value, description: desc.value, displayName: me.value });
      store.setName(me.value.trim());
      remember(r.tableId, { token: r.memberToken, name: name.value.trim(), system: sys.value, role: "gm" });
      location.hash = "#/t/" + r.tableId + "/members";
    } catch (e) {
      notify(msg(e));
      ev.target.disabled = false;
    }
  } }, "卓を作成");
  const link = h("input", { placeholder: "招待リンクを貼り付け" });
  const go = h("button", { onclick: () => {
    const m = /join\/([\w-]+)/.exec(link.value) || /^([\w-]{10,})$/.exec(link.value.trim());
    if (!m) return notify("招待リンクを認識できません");
    location.hash = "#/join/" + m[1];
  } }, "参加");
  page(
    h("h2", {}, "あなたの卓"), h("div", { class: "list" }, list),
    h("h2", {}, "招待リンクで参加"), h("div", { class: "card" }, h("div", { class: "roll" }, link, go)),
    h("h2", {}, "卓を作成"),
    h("div", { class: "card" }, field("卓の名前", name), field("システム", sys), field("説明（任意）", desc), field("あなたの表示名", me), create, h("p", { class: "muted" }, "作成した人がGMになります。招待リンクを渡した人だけが卓の内容を見られます。"))
  );
}

async function joinView(token) {
  page(h("p", { class: "muted" }, "確認中…"));
  let pv;
  try { pv = await api("GET", "/api/invite/" + encodeURIComponent(token)); } catch (e) { return notice("参加できません", msg(e)); }
  const me = h("input", { maxlength: 30, value: store.name() });
  const btn = h("button", { class: "primary", onclick: async (ev) => {
    if (!me.value.trim()) return notify("表示名を入力してください");
    ev.target.disabled = true;
    try {
      const r = await api("POST", "/api/join", { inviteToken: token, displayName: me.value });
      store.setName(me.value.trim());
      remember(r.tableId, { token: r.memberToken, name: r.tableName, system: pv.system, role: "player" });
      location.hash = "#/t/" + r.tableId + "/rules";
    } catch (e) {
      notify(msg(e));
      ev.target.disabled = false;
    }
  } }, "参加する");
  page(h("div", { class: "card" }, h("h2", {}, pv.name), h("div", { class: "muted" }, SYS[pv.system] || ""), field("あなたの表示名", me), btn));
}

function parseSheet(raw) {
  try {
    const d = JSON.parse(raw);
    return { f: Array.isArray(d.f) ? d.f : [], memo: String(d.memo || "") };
  } catch {
    return { f: [], memo: "" };
  }
}

function textForm(it, fields) {
  const els = {};
  const node = h("div", {}, fields.map(f => {
    const el = f.type === "textarea"
      ? h("textarea", { rows: f.rows || 8, maxlength: f.max }, it ? it[f.key] : "")
      : h("input", { type: f.type || "text", maxlength: f.max, value: it ? it[f.key] : (f.def ? f.def() : "") });
    els[f.key] = el;
    return field(f.label, el);
  }));
  return { node, values: () => Object.fromEntries(fields.map(f => [f.key, els[f.key].value])) };
}

function sheetForm(it, ctx) {
  const d = parseSheet(it ? it.data : null);
  const name = h("input", { maxlength: 100, value: it ? it.name : "" });
  const rows = h("div", { class: "rows" });
  function addRow(k, v) {
    const row = h("div", { class: "row" },
      h("input", { class: "k", maxlength: 40, placeholder: "項目", value: k }),
      h("input", { class: "v", maxlength: 200, placeholder: "値", value: v }),
      h("button", { type: "button", onclick: () => row.remove() }, "×"));
    rows.append(row);
  }
  (it ? d.f : (TEMPLATES[ctx.system] || TEMPLATES.Other).map(k => [k, ""])).forEach(([k, v]) => addRow(k, v));
  const memo = h("textarea", { rows: 6, maxlength: 10000 }, d.memo);
  const node = h("div", {},
    field("キャラクター名", name),
    h("div", { class: "field" }, h("span", {}, "ステータス"), rows, h("button", { type: "button", onclick: () => { if (rows.children.length < 60) addRow("", ""); } }, "＋ 項目を追加")),
    field("メモ", memo));
  return { node, values: () => ({ name: name.value, data: JSON.stringify({ f: [...rows.children].map(r => [r.querySelector(".k").value, r.querySelector(".v").value]).filter(([k, v]) => k || v), memo: memo.value }) }) };
}

function sheetView(it) {
  const d = parseSheet(it.data);
  return h("div", {}, h("h3", {}, it.name),
    d.f.length ? h("dl", { class: "kv" }, d.f.map(([k, v]) => [h("dt", {}, k), h("dd", {}, v)])) : null,
    d.memo ? h("p", { class: "body" }, d.memo) : null);
}

const today = () => new Date().toLocaleDateString("sv-SE");

const COLLECTIONS = {
  rules: {
    add: "ルールを追加", empty: "ハウスルールはまだありません。",
    form: (it) => textForm(it, [{ key: "title", label: "タイトル", max: 100 }, { key: "body", label: "内容", type: "textarea", rows: 10, max: 20000 }]),
    view: (it) => h("div", {}, h("h3", {}, it.title), h("p", { class: "body" }, it.body))
  },
  sheets: {
    add: "キャラシを追加", empty: "キャラクターシートはまだありません。",
    form: sheetForm, view: sheetView
  },
  logs: {
    add: "記録を追加", empty: "セッション記録はまだありません。",
    form: (it) => textForm(it, [{ key: "played_on", label: "日付", type: "date", max: 20, def: today }, { key: "title", label: "タイトル", max: 100 }, { key: "body", label: "内容", type: "textarea", rows: 12, max: 30000 }]),
    view: (it) => h("div", {}, h("h3", {}, it.title), h("div", { class: "muted" }, it.played_on), h("p", { class: "body" }, it.body))
  }
};

async function collectionTab(box, ctx, name) {
  const cfg = COLLECTIONS[name];
  const { id, token, me } = ctx;
  const listEl = h("div", { class: "list" });
  const formBox = h("div");
  box.append(h("div", { class: "toolbar" }, h("button", { class: "primary", onclick: () => openForm(null) }, "＋ " + cfg.add)), formBox, listEl);
  async function load() {
    const { items } = await api("GET", "/api/t/" + id + "/" + name, null, token);
    listEl.replaceChildren(...(items.length ? items.map(card) : [h("p", { class: "muted" }, cfg.empty)]));
  }
  function card(it) {
    const can = me.role === "gm" || it.author_id === me.id;
    return h("article", { class: "card" }, cfg.view(it),
      h("footer", {}, h("span", { class: "muted" }, (it.author_name || "退出済み") + " ・ " + fmt(it.updated_at)),
        can ? h("span", { class: "actions" }, h("button", { onclick: () => openForm(it) }, "編集"), h("button", { class: "danger", onclick: () => remove(it) }, "削除")) : null));
  }
  function openForm(it) {
    const f = cfg.form(it, ctx);
    const save = h("button", { class: "primary", onclick: async () => {
      try {
        const v = f.values();
        if (it) await api("PUT", "/api/t/" + id + "/" + name + "/" + it.id, v, token);
        else await api("POST", "/api/t/" + id + "/" + name, v, token);
        formBox.replaceChildren();
        await load();
      } catch (e) { notify(msg(e)); }
    } }, "保存");
    formBox.replaceChildren(h("div", { class: "card" }, f.node, h("div", { class: "actions" }, save, h("button", { onclick: () => formBox.replaceChildren() }, "キャンセル"))));
    formBox.scrollIntoView({ block: "nearest" });
  }
  async function remove(it) {
    if (!confirm("削除しますか？")) return;
    try { await api("DELETE", "/api/t/" + id + "/" + name + "/" + it.id, null, token); await load(); } catch (e) { notify(msg(e)); }
  }
  await load();
}

async function diceTab(box, ctx) {
  const { id, token, info } = ctx;
  const initial = info.table.system === "Other" ? "DiceBot" : info.table.system;
  const sel = h("select", {}, Object.entries(DICE_NAMES).filter(([, v]) => v).map(([k, v]) => h("option", { value: k, selected: k === initial }, v)));
  const input = h("input", { placeholder: "例: CC<=60 / 2d6+3", maxlength: 200, autocomplete: "off" });
  const secret = h("input", { type: "checkbox", style: "width:auto" });
  const chips = h("div", { class: "chips" });
  const helpPre = h("pre", { class: "help" }, "読み込み中…");
  const log = h("div", { class: "dicelog" });
  let last = 0;
  function drawChips() {
    chips.replaceChildren(...(PRESETS[sel.value] || []).map(p => h("button", { type: "button", onclick: () => { input.value = p; input.focus(); } }, p)));
    loadDice().then(m => { const s = m.listSystems().find(x => x.id === sel.value); helpPre.textContent = s ? s.help : ""; }).catch(() => { helpPre.textContent = "ダイスライブラリを読み込めませんでした。"; });
  }
  sel.addEventListener("change", drawChips);
  function entry(it, local) {
    return h("div", { class: "entry" + (local ? " secret" : "") },
      h("div", { class: "who" }, (local ? "シークレット（あなたのみ）" : it.member_name) + " ・ " + (DICE_NAMES[it.system] || it.system) + " ・ " + fmt(it.created_at)),
      h("div", { class: "res" }, it.result));
  }
  async function pull() {
    const { items } = await api("GET", "/api/t/" + id + "/dice" + (last ? "?after=" + last : ""), null, token);
    for (const it of items) { log.prepend(entry(it, false)); last = Math.max(last, it.id); }
  }
  async function doRoll() {
    const cmd = input.value.trim();
    if (!cmd) return;
    let m;
    try { m = await loadDice(); } catch { return notify("ダイスライブラリを読み込めませんでした"); }
    let r = null;
    try { r = m.roll(sel.value, cmd); } catch {}
    if (!r) return notify("コマンドを解釈できません。下のヘルプを確認してください");
    if (secret.checked || r.secret) {
      log.prepend(entry({ system: sel.value, result: r.text, created_at: Date.now() }, true));
      return;
    }
    try {
      await api("POST", "/api/t/" + id + "/dice", { system: sel.value, command: cmd, result: r.text }, token);
      await pull();
    } catch (e) { notify(msg(e)); }
  }
  input.addEventListener("keydown", (ev) => { if (ev.key === "Enter") doRoll(); });
  box.append(
    h("div", { class: "card" }, field("システム", sel), chips,
      h("div", { class: "roll" }, input, h("button", { class: "primary", onclick: doRoll }, "ロール")),
      h("label", { class: "muted" }, secret, " シークレットダイス（記録せず、自分の画面にだけ表示）"),
      h("details", {}, h("summary", { class: "muted" }, "コマンドのヘルプ"), helpPre)),
    h("h3", {}, "ロールログ"), log);
  drawChips();
  try { await pull(); } catch (e) { notify(msg(e)); }
  timer = setInterval(() => { if (!document.hidden) pull().catch(() => {}); }, 6000);
}

function membersTab(box, ctx) {
  const { id, token, info, me } = ctx;
  const gm = me.role === "gm";
  async function kick(m) {
    if (!confirm(m.name + " を追放しますか？")) return;
    try { await api("DELETE", "/api/t/" + id + "/members/" + m.id, null, token); route(); } catch (e) { notify(msg(e)); }
  }
  box.append(h("h3", {}, "参加者"), h("ul", { class: "members" }, info.members.map(m =>
    h("li", {}, h("span", {}, m.name, m.role === "gm" ? h("span", { class: "badge" }, "GM") : null, m.id === me.id ? h("span", { class: "badge alt" }, "あなた") : null),
      gm && m.role !== "gm" ? h("button", { class: "danger", onclick: () => kick(m) }, "追放") : null))));
  if (!gm) {
    box.append(h("div", { class: "card" }, h("button", { class: "danger", onclick: async () => {
      if (!confirm("この卓から退出しますか？再参加には招待リンクが必要です。")) return;
      try {
        await api("DELETE", "/api/t/" + id + "/members/" + me.id, null, token);
        const s = store.get(); delete s[id]; store.set(s);
        location.hash = "#/";
      } catch (e) { notify(msg(e)); }
    } }, "卓から退出")));
    return;
  }
  const linkOf = (t) => location.origin + location.pathname + "#/join/" + t;
  const link = h("input", { readonly: true, value: linkOf(info.inviteToken) });
  box.append(h("h3", {}, "招待リンク"), h("div", { class: "card" },
    h("p", { class: "muted" }, "このリンクを開いた人は誰でもこの卓に参加できます。渡す相手に注意してください。"),
    link,
    h("div", { class: "actions", style: "margin-top:8px" },
      h("button", { class: "primary", onclick: async () => {
        try { await navigator.clipboard.writeText(link.value); notify("コピーしました"); } catch { link.select(); notify("選択しました。コピーしてください"); }
      } }, "コピー"),
      h("button", { onclick: async () => {
        if (!confirm("招待リンクを再発行しますか？古いリンクは使えなくなります（参加済みの人は影響しません）。")) return;
        try { const r = await api("POST", "/api/t/" + id + "/invite", {}, token); link.value = linkOf(r.inviteToken); notify("再発行しました"); } catch (e) { notify(msg(e)); }
      } }, "再発行"))));
  const name = h("input", { maxlength: 60, value: info.table.name });
  const sys = sysSelect(info.table.system);
  const desc = h("textarea", { rows: 2, maxlength: 500 }, info.table.description);
  box.append(h("h3", {}, "卓の設定"), h("div", { class: "card" }, field("卓の名前", name), field("システム", sys), field("説明", desc),
    h("div", { class: "actions" },
      h("button", { class: "primary", onclick: async () => {
        try {
          await api("PATCH", "/api/t/" + id, { name: name.value, system: sys.value, description: desc.value }, token);
          remember(id, { name: name.value.trim(), system: sys.value });
          route();
        } catch (e) { notify(msg(e)); }
      } }, "保存"),
      h("button", { class: "danger", onclick: async () => {
        if (prompt("卓と全データを完全に削除します。続けるには卓の名前を入力してください") !== info.table.name) return;
        try {
          await api("DELETE", "/api/t/" + id, null, token);
          const s = store.get(); delete s[id]; store.set(s);
          location.hash = "#/";
        } catch (e) { notify(msg(e)); }
      } }, "卓を削除"))));
}

async function tableView(id, tab) {
  const mine = store.get()[id];
  if (!mine) return notice("この卓には参加していません", "招待リンクを開いて参加してください。");
  page(h("p", { class: "muted" }, "読み込み中…"));
  let info;
  try {
    info = await api("GET", "/api/t/" + id, null, mine.token);
  } catch (e) {
    if (e.status === 401 || e.status === 403) {
      const s = store.get(); delete s[id]; store.set(s);
      return notice("この卓にアクセスできません", "追放されたか、卓が削除されました。");
    }
    return notice("読み込みに失敗しました", msg(e));
  }
  remember(id, { name: info.table.name, system: info.table.system, role: info.me.role });
  const ctx = { id, token: mine.token, info, me: info.me, system: info.table.system };
  const box = h("div");
  const t = TABS.some(([k]) => k === tab) ? tab : "rules";
  page(
    h("h2", {}, info.table.name, info.me.role === "gm" ? h("span", { class: "badge" }, "GM") : null),
    h("div", { class: "muted" }, SYS[info.table.system] || ""),
    info.table.description ? h("p", { class: "body" }, info.table.description) : null,
    h("nav", { class: "tabs" }, TABS.map(([k, l]) => h("a", { href: "#/t/" + id + "/" + k, class: k === t ? "on" : "" }, l))),
    box);
  try {
    if (t === "dice") await diceTab(box, ctx);
    else if (t === "members") membersTab(box, ctx);
    else await collectionTab(box, ctx, t);
  } catch (e) {
    notify(msg(e));
  }
}

function route() {
  clearInterval(timer);
  const parts = location.hash.replace(/^#\/?/, "").split("/");
  if (parts[0] === "join" && parts[1]) return joinView(parts[1]);
  if (parts[0] === "t" && parts[1]) return tableView(parts[1], parts[2] || "rules");
  return homeView();
}

window.addEventListener("hashchange", route);
route();
