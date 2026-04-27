const {
  Notice,
  Plugin,
  PluginSettingTab,
  Setting,
  FuzzySuggestModal,
  normalizePath,
  requestUrl,
} = require("obsidian");

const DEFAULT_SETTINGS = {
  bookDir: "Book",

  doubanCookie: "",
  doubanUserId: "",
  doubanLoggedIn: false,

  wereadCookie: "",
  wereadLoggedIn: false,
};

module.exports = class BookVaultSyncPlugin extends Plugin {
  async onload() {
    await this.loadSettings();

    this.addCommand({
      id: "bookvault-sync-all",
      name: "一键同步",
      callback: async () => await this.syncAll(),
    });

    this.addCommand({
      id: "bookvault-login-douban",
      name: "Login Douban",
      callback: async () => await this.loginDouban(),
    });

    this.addCommand({
      id: "bookvault-sync-douban",
      name: "同步豆瓣",
      callback: async () => await this.syncDouban(),
    });

    this.addCommand({
      id: "bookvault-login-weread",
      name: "Login WeRead",
      callback: async () => await this.loginWeread(),
    });

    this.addCommand({
      id: "bookvault-sync-weread",
      name: "同步微信读书",
      callback: async () => await this.syncWeread(),
    });

    this.addCommand({
      id: "bookvault-check-login",
      name: "Check Login Status",
      callback: async () => {
        await this.checkDoubanCookie();
        await this.checkWereadCookie();
      },
    });

    this.addCommand({
      id: "bookvault-clear-login",
      name: "Clear Login Status",
      callback: async () => await this.clearAllLogin(),
    });

    this.addCommand({
      id: "bookvault-create-base",
      name: "更新数据库",
      callback: async () => await this.createBaseFile(),
    });

    this.addSettingTab(new BookVaultSettingTab(this.app, this));
    new Notice("BookVault Sync 已启动");
  }

  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }

  async syncAll() {
    await this.ensureStructure();
    await this.createBaseFile();

    if (this.settings.doubanCookie || this.settings.doubanUserId) {
      await this.syncDouban();
    } else {
      new Notice("还没有豆瓣登录状态。请先运行 BookVault: Login Douban");
    }

    if (this.settings.wereadCookie) {
      await this.syncWeread();
    } else {
      new Notice("还没有微信读书登录状态。请先运行 BookVault: Login WeRead");
    }
  }


  getBookDir() {
    return normalizePath(this.settings.bookDir || "Book");
  }

  getCoverDir() {
    return normalizePath(`${this.getBookDir()}/cover`);
  }

  getScriptsDir() {
    return normalizePath(`${this.getBookDir()}/scripts`);
  }

  getBaseFile() {
    return normalizePath(`${this.getBookDir()}/个人读书库.base`);
  }

  async ensureStructure() {
    await this.ensureFolder(this.getBookDir());
    await this.ensureFolder(this.getCoverDir());
    await this.ensureFolder(this.getScriptsDir());
  }

  async ensureFolder(path) {
    const normalized = normalizePath(path);
    if (!normalized || normalized === "/") return;

    const parts = normalized.split("/").filter(Boolean);
    let current = "";

    for (const part of parts) {
      current = current ? `${current}/${part}` : part;
      const exists = await this.app.vault.adapter.exists(current);
      if (!exists) await this.app.vault.createFolder(current);
    }
  }

  async createBaseFile() {
    const basePath = this.getBaseFile();
    const parent = basePath.split("/").slice(0, -1).join("/");
    if (parent) await this.ensureFolder(parent);

    const baseContent = this.getBaseFileContent();
    const exists = await this.app.vault.adapter.exists(basePath);
    if (exists) await this.app.vault.adapter.write(basePath, baseContent);
    else await this.app.vault.create(basePath, baseContent);

    new Notice(`已创建 / 更新：${basePath}`);
  }

  getBaseFileContent() {
    return `properties:
  书名:
    displayName: 书名
  作者:
    displayName: 作者
  出版社:
    displayName: 出版社
  出版年:
    displayName: 出版年
  豆瓣评分:
    displayName: 豆瓣评分
  个人评分:
    displayName: 个人评分
  结束阅读:
    displayName: 结束阅读
  阅读状态:
    displayName: 阅读状态
  封面:
    displayName: 封面
views:
  - type: cards
    name: 个人读书库
    filters:
      and:
        - file.folder == "${this.getBookDir()}"
    order:
      - file.name
      - 作者
      - 出版社
      - 豆瓣评分
      - 个人评分
      - 结束阅读
    card:
      image: 封面
      title: 书名
      subtitle: 作者
    cardSize: 140
    image: note.封面
    imageAspectRatio: 1.45
    imageFit: contain
`;
  }

  renderBookNote(book) {
    const coverEmbed = book.coverPath ? `![[${book.coverPath}|250]]` : "";
    return `---
书名: "${this.yamlEscape(book.title)}"
作者: "${this.yamlEscape(book.author)}"
出版社: "${this.yamlEscape(book.publisher)}"
出版年: "${this.yamlEscape(book.publishYear)}"
ISBN: "${this.yamlEscape(book.isbn)}"
页数: "${this.yamlEscape(book.pages)}"
装帧: "${this.yamlEscape(book.binding)}"
定价: "${this.yamlEscape(book.price)}"
豆瓣评分: "${this.yamlEscape(book.doubanRating)}"
个人评分: "${this.yamlEscape(book.personalRating)}"
结束阅读: "${this.yamlEscape(book.finishedDate)}"
阅读状态: 已读
豆瓣链接: "${this.yamlEscape(book.doubanUrl)}"
封面: "${this.yamlEscape(book.coverPath)}"
---

${coverEmbed}

# 内容简介

${book.summary || ""}

# 读书摘抄

## 微信读书

${book.wereadNotes || ""}

## 个人整理
`;
  }

  yamlEscape(value) {
    return String(value || "").replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  }

  safeFileName(text) {
    return String(text || "未命名")
      .replace(/[\\/:*?"<>|]/g, "_")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 90) || "未命名";
  }

  normalizeTitle(text) {
    return String(text || "")
      .toLowerCase()
      .replace(/[《》「」『』【】\[\]（）(){}]/g, "")
      .replace(/[\s:：,，.。!！?？;；、·\-—–_]/g, "");
  }

  removeBookTitleNoise(text) {
    let s = String(text || "").trim();
    s = s.replace(/^\d{6,8}/, "");
    s = s.replace(/《(.+?)》/g, "$1");
    s = s.replace(/[（(【\[].*?[）)】\]]/g, "");

    const noiseWords = [
      "精装珍藏版", "珍藏版", "典藏版", "纪念版", "收藏版", "新版", "修订版", "增订版",
      "完整版", "完结版", "全本", "全集", "插图版", "精装版", "平装版", "套装",
      "上下册", "上册", "下册", "影视原著", "电影原著", "电视剧原著",
      "译本", "译文经典", "作家榜经典文库"
    ];

    for (const w of noiseWords) s = s.replaceAll(w, "");
    return s.trim();
  }

  generateTitleCandidates(text) {
    const original = this.removeBookTitleNoise(text);
    const set = new Set();

    const add = (v) => {
      const cleaned = this.removeBookTitleNoise(v).trim();
      const norm = this.normalizeTitle(cleaned);
      if (norm) set.add(norm);
    };

    add(original);

    const separators = [":", "：", "|", "｜", "——", "—", "–", "-"];
    let parts = [original];

    for (const sep of separators) {
      const next = [];
      for (const p of parts) {
        if (p.includes(sep)) next.push(...p.split(sep).map(x => x.trim()).filter(Boolean));
        else next.push(p);
      }
      parts = next;
    }

    for (const p of parts) add(p);

    const colon = original.match(/(.+?)([:：])(.+)/);
    if (colon) {
      const prefix = colon[1].trim();
      const suffix = colon[3].trim();
      if (/(作品|全集|文集|小说集|散文集|代表作|经典|系列|三部曲|四部曲)$/.test(prefix)) add(suffix);
      add(prefix);
      add(suffix);
    }

    return Array.from(set).sort((a, b) => b.length - a.length);
  }

  titleMatchScore(a, b) {
    const aList = this.generateTitleCandidates(a);
    const bList = this.generateTitleCandidates(b);
    let best = 0;

    for (const na of aList) {
      for (const nb of bList) {
        if (!na || !nb) continue;
        if (na === nb) return 1;
        const [shorter, longer] = [na, nb].sort((x, y) => x.length - y.length);
        let score = 0;
        if (shorter && longer.includes(shorter)) {
          score = Math.min(0.99, 0.72 + (shorter.length / Math.max(longer.length, 1)) * 0.27);
        } else {
          score = this.sequenceRatio(na, nb);
        }
        if (score > best) best = score;
      }
    }

    return best;
  }

  sequenceRatio(a, b) {
    // 简化版相似度：LCS / 平均长度
    a = String(a || "");
    b = String(b || "");
    if (!a || !b) return 0;

    const dp = Array(a.length + 1).fill(0).map(() => Array(b.length + 1).fill(0));

    for (let i = 1; i <= a.length; i++) {
      for (let j = 1; j <= b.length; j++) {
        dp[i][j] = a[i - 1] === b[j - 1]
          ? dp[i - 1][j - 1] + 1
          : Math.max(dp[i - 1][j], dp[i][j - 1]);
      }
    }

    return (2 * dp[a.length][b.length]) / (a.length + b.length);
  }

  dateToYYMMDD(dateText) {
    const m = String(dateText || "").match(/(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
    if (!m) return "000000";
    const y = m[1].slice(2);
    const mo = String(m[2]).padStart(2, "0");
    const d = String(m[3]).padStart(2, "0");
    return `${y}${mo}${d}`;
  }

  htmlToDoc(html) {
    return new DOMParser().parseFromString(html, "text/html");
  }

  text(el) {
    return (el?.textContent || "").replace(/\s+/g, " ").trim();
  }


  async checkDoubanCookie() {
    if (!this.settings.doubanCookie) {
      this.settings.doubanLoggedIn = false;
      await this.saveSettings();
      new Notice("豆瓣未登录。");
      return false;
    }

    const id = await this.detectDoubanUserId();
    if (id) {
      this.settings.doubanUserId = id;
      this.settings.doubanLoggedIn = true;
      await this.saveSettings();
      new Notice(`豆瓣登录有效，ID：${id}`);
      return true;
    }

    this.settings.doubanLoggedIn = false;
    await this.saveSettings();
    new Notice("豆瓣 Cookie 已失效，请重新登录。");
    return false;
  }

  getServiceCookieDomains(service) {
    return service === "douban"
      ? ["douban.com", ".douban.com", "book.douban.com", ".book.douban.com", "www.douban.com", ".www.douban.com"]
      : ["weread.qq.com", ".weread.qq.com", "i.weread.qq.com", ".i.weread.qq.com"];
  }

  getDefaultElectronSession() {
    const bridge = this.getElectronBridge();
    return bridge?.session?.defaultSession || null;
  }

  getElectronBridge() {
    const w = window;
    const req = w.require;
    if (!req) return null;

    let BrowserWindow = null;
    let session = null;

    try {
      const electron = req("electron");
      BrowserWindow = electron.remote?.BrowserWindow;
      session = electron.remote?.session;
    } catch (e) {}

    try {
      if (!BrowserWindow || !session) {
        const remote = req("@electron/remote");
        BrowserWindow = BrowserWindow || remote.BrowserWindow;
        session = remote.session;
      }
    } catch (e) {}

    if (!BrowserWindow || !session?.defaultSession) return null;
    return { BrowserWindow, session };
  }

  mergeCookiesByName(cookies) {
    const byName = new Map();

    for (const cookie of cookies || []) {
      if (!cookie?.name || !cookie?.value) continue;
      byName.set(cookie.name, cookie);
    }

    return Array.from(byName.values());
  }

  cookiesToHeader(cookies) {
    return this.mergeCookiesByName(cookies)
      .filter((c) => c.name && c.value)
      .map((c) => `${c.name}=${c.value}`)
      .join("; ");
  }

  mergeCookieHeaders(baseHeader, setCookieHeader) {
    const cookieMap = new Map();

    for (const part of String(baseHeader || "").split(";")) {
      const [name, ...rest] = part.trim().split("=");
      if (!name || !rest.length) continue;
      cookieMap.set(name, rest.join("="));
    }

    const cookiePattern = /\b(wr_[A-Za-z0-9_]+)=([^;,\s]+)/g;
    let match;
    while ((match = cookiePattern.exec(String(setCookieHeader || "")))) {
      cookieMap.set(match[1], match[2]);
    }

    return Array.from(cookieMap.entries())
      .map(([name, value]) => `${name}=${value}`)
      .join("; ");
  }

  async readServiceCookies(service, cookieStore = null) {
    const store = cookieStore || this.getDefaultElectronSession()?.cookies;
    if (!store) return [];

    const allCookies = [];
    for (const domain of this.getServiceCookieDomains(service)) {
      try {
        const cookies = await store.get({ domain });
        allCookies.push(...cookies);
      } catch (e) {}
    }

    return this.mergeCookiesByName(allCookies);
  }

  async refreshWereadCookieFromSession() {
    const cookies = await this.readServiceCookies("weread");
    const hasWrVid = cookies.some((c) => c.name === "wr_vid" && c.value);
    const hasWrSkey = cookies.some((c) => c.name === "wr_skey" && c.value);
    const hasWrName = cookies.some((c) => c.name === "wr_name" && c.value);

    if (!hasWrVid || (!hasWrSkey && !hasWrName)) {
      return this.settings.wereadCookie || "";
    }

    const cookieText = this.cookiesToHeader(cookies);
    if (cookieText && cookieText !== this.settings.wereadCookie) {
      this.settings.wereadCookie = cookieText;
      this.settings.wereadLoggedIn = true;
      await this.saveSettings();
    }

    return cookieText;
  }

  async refreshWereadCookieFromResponse() {
    if (!this.settings.wereadCookie) return "";

    try {
      const res = await requestUrl({
        url: "https://weread.qq.com/",
        method: "HEAD",
        headers: {
          "Cookie": this.settings.wereadCookie,
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36"
        },
        throw: false
      });

      const setCookie = res.headers?.["set-cookie"] || res.headers?.["Set-Cookie"];
      if (!setCookie) return this.settings.wereadCookie;

      const mergedCookie = this.mergeCookieHeaders(this.settings.wereadCookie, setCookie);
      if (mergedCookie && mergedCookie !== this.settings.wereadCookie) {
        this.settings.wereadCookie = mergedCookie;
        this.settings.wereadLoggedIn = true;
        await this.saveSettings();
      }
    } catch (e) {}

    return this.settings.wereadCookie || "";
  }

  async createWereadBrowserFetcher() {
    const bridge = this.getElectronBridge();
    if (!bridge?.BrowserWindow) return null;

    const win = new bridge.BrowserWindow({
      show: false,
      width: 1200,
      height: 900,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
      },
    });

    let queue = Promise.resolve();
    let currentBookId = null;

    try {
      await win.loadURL("https://weread.qq.com/");
    } catch (e) {}

    const fetchJson = async (bookId, url, options = {}) => {
      const { method = "GET", body = null, headers = {} } = options;

      const run = async () => {
        if (bookId && currentBookId !== bookId) {
          currentBookId = bookId;
          try {
            await win.loadURL(`https://weread.qq.com/web/reader/${encodeURIComponent(bookId)}`);
          } catch (e) {}
        }

        const requestUrl = method === "GET" ? `${url}${url.includes("?") ? "&" : "?"}_=${Date.now()}` : url;
        const script = `
          (async () => {
            const response = await fetch(${JSON.stringify(requestUrl)}, {
              method: ${JSON.stringify(method)},
              headers: ${JSON.stringify(headers)},
              body: ${body ? JSON.stringify(body) : "null"},
              credentials: "include"
            });
            const text = await response.text();
            return { status: response.status, text };
          })()
        `;

        const result = await win.webContents.executeJavaScript(script, true);
        if (!result || result.status < 200 || result.status >= 300) return null;

        try {
          const payload = JSON.parse(result.text || "{}");
          if (payload && (payload.errcode || payload.errCode)) return null;
          return payload;
        } catch (e) {
          return null;
        }
      };

      const task = queue.then(run);
      queue = task.catch(() => null);
      return await task;
    };

    return {
      fetchJson,
      close: async () => {
        try {
          await queue.catch(() => null);
        } catch (e) {}
        try {
          if (!win.isDestroyed()) win.destroy();
        } catch (e) {}
      },
    };
  }

  async createWereadBrowserFetchers(count = 1) {
    const fetchers = [];
    const target = Math.max(0, Number(count) || 0);

    for (let i = 0; i < target; i++) {
      const fetcher = await this.createWereadBrowserFetcher();
      if (fetcher) fetchers.push(fetcher);
    }

    return fetchers;
  }

  async checkWereadCookie() {
    await this.refreshWereadCookieFromSession();

    if (!this.settings.wereadCookie) {
      this.settings.wereadLoggedIn = false;
      await this.saveSettings();
      new Notice("微信读书未登录。");
      return false;
    }

    const payload = await this.fetchWereadNotebookPayload();
    if (payload) {
      this.settings.wereadLoggedIn = true;
      await this.saveSettings();
      new Notice("微信读书登录有效。");
      return true;
    }

    this.settings.wereadLoggedIn = false;
    await this.saveSettings();
    new Notice("微信读书 Cookie 已失效，请重新登录。");
    return false;
  }


  async clearServiceWebCookies(service) {
    const w = window;
    const req = w.require;
    if (!req) return;

    let session = null;

    try {
      const electron = req("electron");
      session = electron.remote?.session;
    } catch (e) {}

    try {
      if (!session) {
        const remote = req("@electron/remote");
        session = remote.session;
      }
    } catch (e) {}

    if (!session) return;

    const domains = this.getServiceCookieDomains(service);

    for (const domain of domains) {
      try {
        const cookies = await session.defaultSession.cookies.get({ domain });
        for (const cookie of cookies) {
          const protocol = cookie.secure ? "https://" : "http://";
          const host = cookie.domain.startsWith(".") ? cookie.domain.substring(1) : cookie.domain;
          const url = `${protocol}${host}${cookie.path || "/"}`;
          try {
            await session.defaultSession.cookies.remove(url, cookie.name);
          } catch (e) {}
        }
      } catch (e) {}
    }
  }

  async clearDoubanLogin() {
    this.settings.doubanCookie = "";
    this.settings.doubanUserId = "";
    this.settings.doubanLoggedIn = false;
    await this.saveSettings();
    await this.clearServiceWebCookies("douban");
    new Notice("已清除豆瓣登录状态，并尝试清除网页登录 Cookie。");
  }

  async clearWereadLogin() {
    this.settings.wereadCookie = "";
    this.settings.wereadLoggedIn = false;
    await this.saveSettings();
    await this.clearServiceWebCookies("weread");
    new Notice("已清除微信读书登录状态，并尝试清除网页登录 Cookie。");
  }

  async clearAllLogin() {
    await this.clearDoubanLogin();
    await this.clearWereadLogin();
    new Notice("已全部注销登录状态。");
  }

  async loginDouban() {
    const captured = await this.openLoginWindowAndCaptureCookie(
      "douban",
      "https://www.douban.com/",
      async (cookies) => cookies.some((c) => c.name === "dbcl2" && c.value)
    );

    if (!captured) {
      new Notice("豆瓣 Cookie 自动捕获失败。请重试登录。");
      return;
    }

    this.settings.doubanCookie = captured;
    this.settings.doubanLoggedIn = true;
    await this.saveSettings();

    new Notice("豆瓣登录状态已保存，正在后台识别豆瓣 ID...");
    const id = await this.detectDoubanUserId();
    if (id) {
      this.settings.doubanUserId = id;
      await this.saveSettings();
      new Notice(`已识别豆瓣 ID：${id}`);
    } else {
      new Notice("已保存豆瓣 Cookie，但未自动识别 ID。可在设置页手动填写豆瓣 ID。");
    }
  }

  async loginWeread() {
    const captured = await this.openLoginWindowAndCaptureCookie(
      "weread",
      "https://weread.qq.com/",
      async (cookies) => {
        const hasWrVid = cookies.some((c) => c.name === "wr_vid" && c.value);
        const hasWrSkey = cookies.some((c) => c.name === "wr_skey" && c.value);
        const hasWrName = cookies.some((c) => c.name === "wr_name" && c.value);
        return hasWrVid && (hasWrSkey || hasWrName);
      }
    );

    if (!captured) {
      new Notice("微信读书 Cookie 自动捕获失败。可重试登录。");
      return;
    }

    this.settings.wereadCookie = captured;
    this.settings.wereadLoggedIn = true;
    await this.saveSettings();
    await this.refreshWereadCookieFromSession();

    new Notice("微信读书登录状态已保存。可以运行 同步微信读书。");
  }

  async openLoginWindowAndCaptureCookie(service, url, isReady) {
    const w = window;
    const req = w.require;

    if (!req) {
      window.open(url, "_blank");
      return null;
    }

    let BrowserWindow = null;
    let session = null;

    try {
      const electron = req("electron");
      BrowserWindow = electron.remote?.BrowserWindow;
      session = electron.remote?.session;
    } catch (e) {}

    try {
      if (!BrowserWindow) {
        const remote = req("@electron/remote");
        BrowserWindow = remote.BrowserWindow;
        session = remote.session;
      }
    } catch (e) {}

    if (!BrowserWindow || !session) {
      window.open(url, "_blank");
      return null;
    }

    return new Promise((resolve) => {
      const win = new BrowserWindow({
        width: 1100,
        height: 760,
        title: service === "douban" ? "登录豆瓣" : "登录微信读书",
        webPreferences: {
          nodeIntegration: false,
          contextIsolation: true,
        },
      });

      win.loadURL(url);

      const checkCookie = async () => {
        try {
          const cookies = await this.readServiceCookies(service, session.defaultSession.cookies);
          const cookieText = this.cookiesToHeader(cookies);

          if (await isReady(cookies)) {
            clearInterval(timer);
            win.close();
            resolve(cookieText);
          }
        } catch (e) {}
      };

      const timer = window.setInterval(checkCookie, 1500);

      win.on("closed", () => {
        clearInterval(timer);
        resolve(null);
      });
    });
  }

  async doubanRequest(url) {
    const headers = {
      "User-Agent": "Mozilla/5.0",
      "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
      "Referer": "https://book.douban.com/",
    };

    if (this.settings.doubanCookie) headers["Cookie"] = this.settings.doubanCookie;

    return await requestUrl({ url, method: "GET", headers, throw: false });
  }

  async detectDoubanUserId() {
    const urls = [
      "https://book.douban.com/mine?status=collect",
      "https://book.douban.com/mine",
      "https://www.douban.com/mine/",
    ];

    for (const url of urls) {
      try {
        const res = await this.doubanRequest(url);
        const finalUrl = res.url || url;
        const html = res.text || "";

        let id = this.extractDoubanUserId(finalUrl);
        if (!id) id = this.extractDoubanUserId(html);
        if (id) return id;
      } catch (e) {}
    }

    return "";
  }

  extractDoubanUserId(text) {
    const patterns = [
      /book\.douban\.com\/people\/([^\/"'>\s]+)\/collect/,
      /book\.douban\.com\/people\/([^\/"'>\s]+)\//,
      /www\.douban\.com\/people\/([^\/"'>\s]+)\//,
      /douban\.com\/people\/([^\/"'>\s]+)\//,
      /\/people\/([^\/"'>\s]+)\/collect/,
      /\/people\/([^\/"'>\s]+)\//,
    ];

    for (const p of patterns) {
      const m = String(text || "").match(p);
      if (m && m[1] && !["login", "register", "mine"].includes(m[1])) return m[1];
    }

    return "";
  }

  async syncDouban() {
    await this.ensureStructure();

    if (!this.settings.doubanUserId) {
      const id = await this.detectDoubanUserId();
      if (id) {
        this.settings.doubanUserId = id;
        await this.saveSettings();
      }
    }

    if (!this.settings.doubanUserId) {
      new Notice("没有豆瓣 ID。请先登录豆瓣，或在设置页手动填写豆瓣 ID。");
      return;
    }

    new Notice("开始读取豆瓣已读书籍...");
    const listItems = await this.fetchDoubanCollectList(this.settings.doubanUserId);

    if (!listItems.length) {
      new Notice("没有读取到豆瓣已读书籍。可能是 Cookie 失效、ID 错误或已读列表不可访问。");
      return;
    }

    new Notice(`已读取列表 ${listItems.length} 本，开始读取详情...`);

    const books = await this.mapLimit(
      listItems,
      Math.max(1, 10),
      async (item) => {
        const detail = await this.fetchDoubanBookDetail(item.url);
        return {
          title: detail.title || item.title,
          author: detail.author || item.author,
          publisher: detail.publisher || item.publisher,
          publishYear: detail.publishYear || item.publishYear,
          isbn: detail.isbn || "",
          pages: detail.pages || "",
          binding: detail.binding || "",
          price: detail.price || item.price || "",
          doubanRating: detail.doubanRating || "",
          personalRating: item.personalRating || "",
          finishedDate: item.finishedDate || "",
          doubanUrl: item.url,
          coverUrl: detail.coverUrl || item.coverUrl || "",
          summary: detail.summary || "",
        };
      }
    );

    const jsonPath = normalizePath(`${this.getScriptsDir()}/douban_books.json`);
    await this.app.vault.adapter.write(jsonPath, JSON.stringify(books, null, 2));

    new Notice("开始导入豆瓣书籍到 Obsidian...");
    let created = 0;
    let updated = 0;

    for (const book of books) {
      const result = await this.writeDoubanBookNote(book);
      if (result === "created") created++;
      else if (result === "updated") updated++;
    }

    await this.createBaseFile();
    new Notice(`豆瓣同步完成：新建 ${created}，更新 ${updated}`);
  }

  async fetchDoubanCollectList(userId) {
    const items = [];
    const seen = new Set();
    const maxPages = Math.max(1, 80);

    for (let page = 0; page < maxPages; page++) {
      const start = page * 15;
      const url = `https://book.douban.com/people/${userId}/collect?start=${start}&sort=time&rating=all&filter=all&mode=list`;

      const res = await this.doubanRequest(url);
      if (res.status < 200 || res.status >= 300) break;

      const pageItems = this.parseDoubanCollectPage(res.text || "");
      if (!pageItems.length) break;

      for (const item of pageItems) {
        if (!seen.has(item.url)) {
          seen.add(item.url);
          items.push(item);
        }
      }
    }

    return items;
  }

  parseDoubanCollectPage(html) {
    const doc = this.htmlToDoc(html);
    let containers = Array.from(doc.querySelectorAll("li.subject-item, .subject-item"));

    if (!containers.length) {
      containers = Array.from(doc.querySelectorAll("a[href*='/subject/']")).map((a) => {
        let node = a;
        for (let i = 0; i < 8 && node; i++) {
          if (node.matches?.("li, tr, .subject-item, .item")) return node;
          node = node.parentElement;
        }
        return a.parentElement;
      }).filter(Boolean);
    }

    const results = [];
    const seenIds = new Set();

    for (const container of containers) {
      const link = container.querySelector("h2 a") || container.querySelector("a[href*='/subject/']");
      if (!link) continue;

      let href = link.getAttribute("href") || "";
      if (href.startsWith("/subject/")) href = "https://book.douban.com" + href;

      const m = href.match(/\/subject\/(\d+)\//);
      if (!m) continue;

      const subjectId = m[1];
      if (seenIds.has(subjectId)) continue;
      seenIds.add(subjectId);

      const title = (link.getAttribute("title") || this.text(link)).trim();
      const pubText = this.text(container.querySelector(".pub"));
      const pub = this.parseDoubanPubText(pubText);

      const img = container.querySelector("img");
      const coverUrl = img?.getAttribute("src") || "";

      const fullText = this.text(container);
      const dateMatch = fullText.match(/\d{4}-\d{1,2}-\d{1,2}/);
      const finishedDate = dateMatch ? dateMatch[0] : "";

      let personalRating = "";
      const ratingSpan = container.querySelector("span[class*='rating']");
      if (ratingSpan) {
        const cls = ratingSpan.getAttribute("class") || "";
        const rm = cls.match(/rating(\d)-t/);
        if (rm) personalRating = rm[1];
      }

      results.push({
        title,
        url: href,
        subjectId,
        author: pub.author,
        publisher: pub.publisher,
        publishYear: pub.publishYear,
        price: pub.price,
        coverUrl,
        personalRating,
        finishedDate,
      });
    }

    return results;
  }

  parseDoubanPubText(pubText) {
    const parts = String(pubText || "")
      .replace(/\s+/g, " ")
      .split(/\s*\/\s*/)
      .map((p) => p.trim())
      .filter(Boolean);

    const result = { author: "", publisher: "", publishYear: "", price: "" };

    if (parts.length >= 4) {
      result.author = parts.slice(0, -3).join(" / ");
      result.publisher = parts[parts.length - 3];
      result.publishYear = parts[parts.length - 2];
      result.price = parts[parts.length - 1];
    } else if (parts.length === 3) {
      result.author = parts[0];
      result.publisher = parts[1];
      result.publishYear = parts[2];
    } else if (parts.length === 2) {
      result.author = parts[0];
      result.publisher = parts[1];
    } else if (parts.length === 1) {
      result.author = parts[0];
    }

    return result;
  }

  async fetchDoubanBookDetail(url) {
    try {
      const res = await this.doubanRequest(url);
      if (res.status < 200 || res.status >= 300) return {};

      const doc = this.htmlToDoc(res.text || "");
      const title = this.text(doc.querySelector("#wrapper h1 span"));
      const info = this.parseDoubanInfoBlock(doc);
      const doubanRating = this.text(doc.querySelector("strong.rating_num"));
      const coverUrl = doc.querySelector("#mainpic img")?.getAttribute("src") || "";

      const introEls = Array.from(doc.querySelectorAll("#link-report .intro"));
      const parts = [];
      for (const el of introEls) {
        const t = (el.textContent || "").trim();
        if (t && !parts.includes(t)) parts.push(t);
      }

      return {
        title,
        author: info["作者"] || "",
        publisher: info["出版社"] || "",
        publishYear: info["出版年"] || "",
        pages: info["页数"] || "",
        binding: info["装帧"] || "",
        price: info["定价"] || "",
        isbn: info["ISBN"] || "",
        doubanRating,
        coverUrl,
        summary: parts.join("\n\n"),
      };
    } catch (e) {
      return {};
    }
  }

  parseDoubanInfoBlock(doc) {
    const infoEl = doc.querySelector("#info");
    if (!infoEl) return {};

    const text = (infoEl.textContent || "").replace(/\r/g, "\n");
    const keys = ["作者", "出版社", "出品方", "副标题", "原作名", "译者", "出版年", "页数", "定价", "装帧", "丛书", "ISBN"];
    const result = {};

    for (const key of keys) {
      const re = new RegExp(`${key}\\s*[:：]\\s*([^\\n]+)`);
      const m = text.match(re);
      if (m) result[key] = m[1].trim();
    }

    if (!result["ISBN"]) {
      const m = text.match(/ISBN\s*[:：]?\s*([0-9Xx-]+)/);
      if (m) result["ISBN"] = m[1].trim();
    }

    return result;
  }

  async writeDoubanBookNote(book) {
    const datePrefix = this.dateToYYMMDD(book.finishedDate);
    const fileName = `${datePrefix}《${this.safeFileName(book.title)}》.md`;
    const notePath = normalizePath(`${this.getBookDir()}/${fileName}`);

    const existingPath = await this.findExistingBookNote(book.title);
    const finalPath = existingPath || notePath;

    const coverPath = await this.downloadCover(book);

    const newContent = this.renderBookNote({
      title: book.title,
      author: book.author,
      publisher: book.publisher,
      publishYear: book.publishYear,
      isbn: book.isbn,
      pages: book.pages,
      binding: book.binding,
      price: book.price,
      doubanRating: book.doubanRating,
      personalRating: book.personalRating,
      finishedDate: book.finishedDate,
      doubanUrl: book.doubanUrl,
      coverPath,
      summary: book.summary,
      wereadNotes: "",
    });

    const exists = await this.app.vault.adapter.exists(finalPath);

    if (exists) {
      const oldContent = await this.app.vault.adapter.read(finalPath);
      const finalContent = this.preserveReadingExcerpt(newContent, oldContent);
      await this.app.vault.adapter.write(finalPath, finalContent);
      return "updated";
    } else {
      await this.app.vault.create(finalPath, newContent);
      return "created";
    }
  }

  preserveReadingExcerpt(newContent, oldContent) {
    const oldMatch = String(oldContent || "").match(/# 读书摘抄\s*\n[\s\S]*/);
    if (!oldMatch) return newContent;

    if (/# 读书摘抄\s*\n[\s\S]*/.test(newContent)) {
      return newContent.replace(/# 读书摘抄\s*\n[\s\S]*/, oldMatch[0]);
    }

    return newContent.trim() + "\n\n" + oldMatch[0];
  }

  async findExistingBookNote(title) {
    const files = this.app.vault.getMarkdownFiles();
    let best = { path: "", score: 0 };

    for (const file of files) {
      if (!file.path.startsWith(this.getBookDir() + "/")) continue;

      const candidates = [file.basename];
      const stemMatch = file.basename.match(/《(.+?)》/);
      if (stemMatch) candidates.push(stemMatch[1]);

      try {
        const content = await this.app.vault.cachedRead(file);
        const m = content.match(/^书名:\s*["']?(.+?)["']?\s*$/m);
        if (m) candidates.push(m[1]);
      } catch (e) {}

      for (const c of candidates) {
        const score = this.titleMatchScore(title, c);
        if (score > best.score) best = { path: file.path, score };
        if (score >= 0.98) return file.path;
      }
    }

    return best.score >= 0.72 ? best.path : "";
  }

  async downloadCover(book) {
    if (!book.coverUrl) return "";

    try {
      const extMatch = book.coverUrl.match(/\.(jpg|jpeg|png|webp)(?:\?|$)/i);
      const ext = extMatch ? "." + extMatch[1].toLowerCase() : ".jpg";
      const fileName = this.safeFileName(book.title) + ext;
      const coverPath = normalizePath(`${this.getCoverDir()}/${fileName}`);

      const exists = await this.app.vault.adapter.exists(coverPath);
      if (exists) return coverPath;

      const res = await requestUrl({
        url: book.coverUrl,
        method: "GET",
        headers: { "User-Agent": "Mozilla/5.0", "Referer": "https://book.douban.com/" },
        throw: false,
      });

      if (res.status >= 200 && res.status < 300 && res.arrayBuffer) {
        await this.app.vault.adapter.writeBinary(coverPath, res.arrayBuffer);
        return coverPath;
      }
    } catch (e) {}

    return "";
  }

  // =========================
  // WeRead
  // =========================

  async wereadRequest(url, options = {}) {
    const headers = {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
      "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7",
      "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
      "Pragma": "no-cache",
      "Referer": "https://weread.qq.com/",
      "sec-ch-ua": "\"Google Chrome\";v=\"135\", \"Not-A.Brand\";v=\"8\", \"Chromium\";v=\"135\"",
      "sec-ch-ua-mobile": "?0",
      "sec-ch-ua-platform": "\"Windows\"",
      "sec-fetch-dest": "document",
      "sec-fetch-mode": "navigate",
      "sec-fetch-site": "same-origin",
      "upgrade-insecure-requests": "1"
    };

    if (this.settings.wereadCookie) headers["Cookie"] = this.settings.wereadCookie;

    let requestUrlWithTs = url;
    if ((options.method || "GET") === "GET") {
      requestUrlWithTs = `${url}${url.includes("?") ? "&" : "?"}_=${Date.now()}`;
    }

    return await requestUrl({
      url: requestUrlWithTs,
      method: options.method || "GET",
      headers,
      body: options.body,
      throw: false,
    });
  }

  async syncWeread() {
    await this.ensureStructure();
    await this.refreshWereadCookieFromSession();
    await this.refreshWereadCookieFromResponse();

    if (!this.settings.wereadCookie) {
      new Notice("没有微信读书登录状态。请先运行 BookVault: Login WeRead");
      return;
    }

    new Notice("开始读取微信读书笔记书单...");

    const notebookPayload = await this.fetchWereadNotebookPayload();
    if (!notebookPayload) {
      new Notice("微信读书读取失败。可能是 Cookie 失效，请重新登录微信读书。");
      return;
    }

    const books = this.extractWereadBooks(notebookPayload);

    if (!books.length) {
      new Notice("没有识别到微信读书笔记书籍。可能是接口结构变化或没有笔记。");
      await this.writeDebugJson("weread_user_notebook.json", notebookPayload);
      return;
    }

    new Notice(`识别到 ${books.length} 本有笔记的书，开始读取划线和想法...`);
    const needsBrowserBooks = books.filter((book) =>
      Number(book.noteCount || 0) > Number(book.reviewCount || 0) || Number(book.bookmarkCount || 0) > 0
    );
    const apiOnlyBooks = books.filter((book) =>
      Number(book.noteCount || 0) <= Number(book.reviewCount || 0) && Number(book.bookmarkCount || 0) <= 0
    );
    const browserFetchers = await this.createWereadBrowserFetchers(Math.min(4, needsBrowserBooks.length));
    let bookNotes = [];

    try {
      const browserLimit = browserFetchers.length
        ? browserFetchers.length
        : Math.max(1, Math.min(8, needsBrowserBooks.length || 1));
      const [apiOnlyResults, browserResults] = await Promise.all([
        this.mapLimit(
          apiOnlyBooks,
          Math.max(1, Math.min(12, apiOnlyBooks.length || 1)),
          async (book) => {
            const notes = await this.fetchWereadNotesForBook(book, null);
            return Object.assign({}, book, { notes });
          }
        ),
        this.mapLimit(
          needsBrowserBooks,
          browserLimit,
          async (book, current) => {
            const fetcher = browserFetchers.length
              ? browserFetchers[current % browserFetchers.length]
              : null;
            const notes = await this.fetchWereadNotesForBook(book, fetcher);
            return Object.assign({}, book, { notes });
          }
        ),
      ]);

      const resultMap = new Map();
      for (const item of [...apiOnlyResults, ...browserResults]) {
        if (item?.bookId) resultMap.set(item.bookId, item);
      }
      bookNotes = books.map((book) => resultMap.get(book.bookId) || Object.assign({}, book, { notes: [] }));
    } finally {
      await Promise.all(browserFetchers.map((fetcher) => fetcher.close().catch(() => null)));
    }

    const nonEmpty = bookNotes.filter((b) => b.notes && b.notes.length);
    const emptyButExpected = bookNotes
      .filter((b) => Number(b.noteCount || 0) > 0 && (!b.notes || !b.notes.length))
      .map((b) => ({
        title: b.title,
        bookId: b.bookId,
        noteCount: b.noteCount || 0,
        reviewCount: b.reviewCount || 0,
        bookmarkCount: b.bookmarkCount || 0
      }));
    await this.writeDebugJson("weread_notes.json", nonEmpty);
    await this.writeDebugJson("weread_empty_books.json", emptyButExpected);

    let merged = 0;
    const unmatched = [];

    for (const book of nonEmpty) {
      const path = await this.findExistingBookNote(book.title);

      if (!path) {
        unmatched.push(book);
        continue;
      }

      const oldContent = await this.app.vault.adapter.read(path);
      const markdown = this.renderWereadNotesMarkdown(book);
      const newContent = this.replaceWereadSection(oldContent, markdown);
      await this.app.vault.adapter.write(path, newContent);
      merged++;
    }

    await this.writeWereadUnmatched(unmatched);
    new Notice(`微信读书同步完成：已合并 ${merged} 本，未匹配 ${unmatched.length} 本`);
  }

  async fetchWereadNotebookPayload() {
    const urls = [
      "https://i.weread.qq.com/user/notebooks?synckey=0",
      "https://i.weread.qq.com/user/notebooks",
      "https://weread.qq.com/web/user/notebook",
      "https://weread.qq.com/api/user/notebook",
    ];

    for (const url of urls) {
      try {
        const res = await this.wereadRequest(url);
        if (res.status >= 200 && res.status < 300) {
          const json = res.json || JSON.parse(res.text || "{}");
          if (json && !json.errcode && !json.errCode) return json;
          if (json && (json.errcode || json.errCode)) await this.writeDebugJson("weread_notebook_error.json", json);
        }
      } catch (e) {}
    }

    return null;
  }

  extractWereadBooks(payload) {
    const books = [];
    const seen = new Set();

    const visit = (obj) => {
      if (!obj) return;

      if (Array.isArray(obj)) {
        for (const item of obj) visit(item);
        return;
      }

      if (typeof obj !== "object") return;

      const bookObj = obj.book && typeof obj.book === "object" ? obj.book : obj;
      const bookId = bookObj.bookId || bookObj.book_id || obj.bookId || obj.book_id;
      const title = bookObj.title || bookObj.bookName || obj.title || obj.bookName;
      const author = bookObj.author || obj.author || "";

      if (bookId && title) {
        const key = String(bookId);
        if (!seen.has(key)) {
          seen.add(key);
          books.push({
            bookId: key,
            title: String(title).trim(),
            author: String(author || "").trim(),
            noteCount: Number(obj.noteCount || 0),
            reviewCount: Number(obj.reviewCount || 0),
            bookmarkCount: Number(obj.bookmarkCount || 0)
          });
        }
      }

      for (const value of Object.values(obj)) visit(value);
    };

    visit(payload);
    return books;
  }

  async fetchWereadNotesForBook(book, browserFetcher = null) {
    const bookId = encodeURIComponent(book.bookId);
    const reviewEndpoints = [
      `https://weread.qq.com/api/review/list?bookId=${bookId}&listType=11&mine=1&syncKey=0`,
      `https://weread.qq.com/web/review/list?bookId=${bookId}&listType=11&mine=1&synckey=0`
    ];

    const [bookmarkPayload, reviewPayload] = await Promise.all([
      this.fetchWereadBookmarkPayload(book, browserFetcher),
      this.fetchWereadPayloadByShape(reviewEndpoints, (payload) => Array.isArray(payload?.reviews))
    ]);

    const notes = this.mergeWereadHighlightAndReviewPayloads(book, bookmarkPayload, reviewPayload);
    if (notes.length) return this.dedupeWereadNotes(notes);

    return this.dedupeWereadNotes([
      ...this.extractWereadNotes(bookmarkPayload, book, "bookmark"),
      ...this.extractWereadNotes(reviewPayload, book, "review")
    ]);
  }

  async fetchWereadBookmarkPayload(book, browserFetcher = null) {
    const bookId = encodeURIComponent(book.bookId);
    const bookmarkUrl = `https://weread.qq.com/web/book/bookmarklist?bookId=${bookId}`;

    if (browserFetcher?.fetchJson) {
      const browserPayload = await browserFetcher.fetchJson(book.bookId, bookmarkUrl, {
        headers: {
          "accept": "application/json, text/plain, */*"
        }
      });
      if (Array.isArray(browserPayload?.updated)) return browserPayload;
    }

    return await this.fetchWereadPayloadByShape(
      [
        bookmarkUrl,
        `https://i.weread.qq.com/book/bookmarklist?bookId=${bookId}`
      ],
      (payload) => Array.isArray(payload?.updated)
    );
  }

  mergeWereadHighlightAndReviewPayloads(book, bookmarkPayload, reviewPayload) {
    const notes = [];
    const byRange = new Map();
    const chapterByUid = new Map();

    for (const chapter of bookmarkPayload?.chapters || []) {
      if (chapter && chapter.chapterUid != null) {
        chapterByUid.set(String(chapter.chapterUid), chapter);
      }
    }

    for (const bookmark of bookmarkPayload?.updated || []) {
      if (!bookmark || typeof bookmark !== "object") continue;

      const quote = this.normalizeWereadText(bookmark.markText || bookmark.contextAbstract);
      if (!quote) continue;

      const chapter = chapterByUid.get(String(bookmark.chapterUid)) || {};
      const note = {
        noteId: String(bookmark.bookmarkId || bookmark.range || `${book.bookId}-${notes.length}`),
        bookId: book.bookId,
        bookTitle: book.title,
        chapter: this.normalizeWereadText(bookmark.chapterName || chapter.title || bookmark.chapterTitle),
        quote,
        thought: "",
        range: String(bookmark.range || ""),
        chapterUid: bookmark.chapterUid,
        chapterIdx: bookmark.chapterIdx || chapter.chapterIdx,
        created: bookmark.createTime || 0,
        source: "bookmark"
      };

      notes.push(note);
      if (note.range) byRange.set(note.range, note);
    }

    for (const item of reviewPayload?.reviews || []) {
      const review = item?.review && typeof item.review === "object" ? item.review : item;
      if (!review || typeof review !== "object") continue;

      const range = String(review.range || "");
      const quote = this.normalizeWereadText(
        review.abstract || review.contextAbstract || review.markText || review.rangeText
      );
      const thought = this.normalizeWereadText(review.content || review.note || review.review);
      const existing = range ? byRange.get(range) : null;

      if (existing) {
        if (!existing.quote && quote) existing.quote = quote;
        if (!existing.thought && thought) existing.thought = thought;
        if (!existing.chapter) {
          existing.chapter = this.normalizeWereadText(
            review.chapterName || review.chapterTitle || review.refMpInfo?.title
          );
        }
        if (existing.chapterIdx == null && review.chapterIdx != null) existing.chapterIdx = review.chapterIdx;
        if (!existing.created && review.createTime) existing.created = review.createTime;
        if (thought) existing.source = "bookmark+review";
        continue;
      }

      if (!quote && !thought) continue;

      const note = {
        noteId: String(review.reviewId || item?.reviewId || range || `${book.bookId}-${notes.length}`),
        bookId: book.bookId,
        bookTitle: book.title,
        chapter: this.normalizeWereadText(review.chapterName || review.chapterTitle || review.refMpInfo?.title),
        quote,
        thought,
        range,
        chapterUid: review.chapterUid,
        chapterIdx: review.chapterIdx,
        created: review.createTime || 0,
        source: "review"
      };

      notes.push(note);
      if (note.range) byRange.set(note.range, note);
    }

    return notes.filter((note) => note.quote || note.thought);
  }

  async fetchWereadPayloadByShape(urls, isExpectedPayload) {
    for (const url of urls) {
      try {
        const res = await this.wereadRequest(url);
        if (res.status < 200 || res.status >= 300) continue;

        const payload = res.json || JSON.parse(res.text || "{}");
        if (payload && (payload.errcode || payload.errCode)) continue;
        if (isExpectedPayload(payload)) return payload;
      } catch (e) {}
    }

    return null;
  }

  extractWereadNotes(payload, book, sourceType = "") {
    const structuredNotes = this.extractStructuredWereadNotes(payload, book, sourceType);
    if (structuredNotes.length) return structuredNotes;

    const notes = [];

    const visit = (obj) => {
      if (!obj) return;

      if (Array.isArray(obj)) {
        for (const item of obj) visit(item);
        return;
      }

      if (typeof obj !== "object") return;

      const reviewObj = obj.review && typeof obj.review === "object" ? obj.review : null;
      let quote = obj.markText || obj.abstract || obj.rangeText || obj.rangeContent || obj.highlight || "";
      let thought = "";

      const content = obj.content || obj.note || (reviewObj ? reviewObj.content : obj.review) || "";
      if (typeof content === "string") thought = content;
      else if (content && typeof content === "object") thought = content.content || content.text || content.review || "";

      // 微信读书有些 review 结构中 abstract 是划线，content 是想法。
      if (!quote && reviewObj) {
        quote = reviewObj.abstract || reviewObj.markText || reviewObj.contextAbstract || "";
        thought = thought || reviewObj.content || "";
      }

      if (quote || thought) {
        notes.push({
          noteId: String(obj.reviewId || reviewObj?.reviewId || obj.bookmarkId || obj.range || reviewObj?.range || obj.createTime || `${book.bookId}-${notes.length}`),
          bookId: book.bookId,
          bookTitle: book.title,
          chapter: String(obj.chapterName || obj.chapterTitle || obj.chapter || reviewObj?.chapterName || reviewObj?.chapterTitle || reviewObj?.refMpInfo?.title || ""),
          quote: String(quote || "").trim(),
          thought: String(thought || "").trim(),
          range: String(obj.range || reviewObj?.range || ""),
          chapterUid: obj.chapterUid || reviewObj?.chapterUid,
          chapterIdx: obj.chapterIdx || reviewObj?.chapterIdx,
          created: obj.createTime || reviewObj?.createTime || 0,
          source: sourceType || "fallback",
        });
      }

      for (const value of Object.values(obj)) visit(value);
    };

    visit(payload);
    return notes.filter((n) => n.quote || n.thought);
  }

  extractStructuredWereadNotes(payload, book, sourceType) {
    if (!payload || typeof payload !== "object") return [];

    const notes = [];
    const chapterByUid = new Map();

    for (const chapter of payload.chapters || []) {
      if (chapter && chapter.chapterUid != null) {
        chapterByUid.set(String(chapter.chapterUid), chapter);
      }
    }

    if (Array.isArray(payload.updated)) {
      for (const bookmark of payload.updated) {
        if (!bookmark || typeof bookmark !== "object") continue;

        const chapter = chapterByUid.get(String(bookmark.chapterUid)) || {};
        const quote = this.normalizeWereadText(bookmark.markText || bookmark.contextAbstract);

        if (!quote) continue;

        notes.push({
          noteId: String(bookmark.bookmarkId || bookmark.range || `${book.bookId}-${notes.length}`),
          bookId: book.bookId,
          bookTitle: book.title,
          chapter: this.normalizeWereadText(bookmark.chapterName || chapter.title || bookmark.chapterTitle),
          quote,
          thought: "",
          range: String(bookmark.range || ""),
          chapterUid: bookmark.chapterUid,
          chapterIdx: bookmark.chapterIdx || chapter.chapterIdx,
          created: bookmark.createTime || 0,
          source: "bookmark",
        });
      }
    }

    if (Array.isArray(payload.reviews)) {
      for (const item of payload.reviews) {
        const review = item?.review && typeof item.review === "object" ? item.review : item;
        if (!review || typeof review !== "object") continue;

        const quote = this.normalizeWereadText(
          review.abstract || review.contextAbstract || review.markText || review.rangeText
        );
        const thought = this.normalizeWereadText(review.content || review.note || review.review);

        if (!quote && !thought) continue;

        notes.push({
          noteId: String(review.reviewId || item?.reviewId || review.range || `${book.bookId}-${notes.length}`),
          bookId: book.bookId,
          bookTitle: book.title,
          chapter: this.normalizeWereadText(review.chapterName || review.chapterTitle || review.refMpInfo?.title),
          quote,
          thought,
          range: String(review.range || ""),
          chapterUid: review.chapterUid,
          chapterIdx: review.chapterIdx,
          created: review.createTime || 0,
          source: "review",
        });
      }
    }

    return notes.filter((n) => n.quote || n.thought);
  }

  normalizeWereadText(value) {
    if (value == null) return "";
    if (typeof value === "string") return value.trim();
    if (typeof value === "number") return String(value);
    return "";
  }

  dedupeWereadNotes(notes) {
    const byKey = new Map();
    const result = [];

    for (const note of notes) {
      const rangeKey = note.range ? `range:${note.bookId}:${note.range}` : "";
      const quoteKey = note.quote
        ? `quote:${note.bookId}:${this.normalizeTitle(note.chapter || "")}:${this.normalizeTitle(note.quote)}`
        : "";
      const thoughtKey = note.thought
        ? `thought:${note.bookId}:${this.normalizeTitle(note.thought)}`
        : "";
      const key = rangeKey || quoteKey || thoughtKey;

      if (!key) continue;

      const existing = byKey.get(key);
      if (existing) {
        if (!existing.quote && note.quote) existing.quote = note.quote;
        if (!existing.thought && note.thought) existing.thought = note.thought;
        if (!existing.chapter && note.chapter) existing.chapter = note.chapter;
        if (existing.chapterIdx == null && note.chapterIdx != null) existing.chapterIdx = note.chapterIdx;
        if (!existing.created && note.created) existing.created = note.created;
        if (note.source === "review") existing.source = "review";
        continue;
      }

      byKey.set(key, note);
      result.push(note);
    }

    return result.sort((a, b) => {
      const chapterA = Number.isFinite(Number(a.chapterIdx)) ? Number(a.chapterIdx) : Number.MAX_SAFE_INTEGER;
      const chapterB = Number.isFinite(Number(b.chapterIdx)) ? Number(b.chapterIdx) : Number.MAX_SAFE_INTEGER;
      if (chapterA !== chapterB) return chapterA - chapterB;

      const rangeA = this.getWereadRangeStart(a.range);
      const rangeB = this.getWereadRangeStart(b.range);
      if (rangeA !== rangeB) return rangeA - rangeB;

      return (Number(a.created) || 0) - (Number(b.created) || 0);
    });
  }

  getWereadRangeStart(range) {
    const value = String(range || "").split("-")[0];
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : Number.MAX_SAFE_INTEGER;
  }

  renderWereadNotesMarkdown(book) {
    const lines = [];

    for (const note of book.notes || []) {
      if (note.quote) {
        const quoteLines = String(note.quote).split(/\r?\n/).map((l) => `> ${l.trim()}`).join("\n");
        lines.push(quoteLines);
        lines.push("");
      }

      if (note.thought) {
        lines.push(`- 想法：${note.thought}`);
        lines.push("");
      }
    }

    return lines.join("\n").trim() + "\n";
  }

  replaceWereadSection(content, insert) {
    const text = String(content || "").trimEnd();

    if (!/# 读书摘抄/.test(text)) {
      return text + "\n\n# 读书摘抄\n\n## 微信读书\n\n" + insert.trim() + "\n\n## 个人整理\n";
    }

    const [before, afterRaw] = text.split("# 读书摘抄", 2);
    const after = afterRaw || "";

    let personal = "";
    if (/## 个人整理/.test(after)) {
      personal = after.split("## 个人整理").slice(1).join("## 个人整理").trim();
    }

    let result = before.trimEnd() + "\n\n# 读书摘抄\n\n## 微信读书\n\n" + insert.trim() + "\n\n## 个人整理";
    if (personal) result += "\n\n" + personal;
    return result.trimEnd() + "\n";
  }

  async writeWereadUnmatched(unmatched) {
    const path = normalizePath(`${this.getScriptsDir()}/weread_unmatched.md`);
    const lines = ["# 微信读书未匹配书目", ""];

    for (const item of unmatched) {
      lines.push(`## ${item.title}`);
      lines.push("");
      lines.push(`- bookId: ${item.bookId}`);
      lines.push(`- 作者: ${item.author || ""}`);
      lines.push(`- 笔记数量: ${(item.notes || []).length}`);
      lines.push("");
    }

    await this.app.vault.adapter.write(path, lines.join("\n"));
  }

  async writeDebugJson(name, data) {
    try {
      await this.ensureFolder(this.getScriptsDir());
      const path = normalizePath(`${this.getScriptsDir()}/${name}`);
      await this.app.vault.adapter.write(path, JSON.stringify(data, null, 2));
    } catch (e) {}
  }

  async mapLimit(items, limit, worker) {
    const results = new Array(items.length);
    let index = 0;

    const runners = new Array(Math.min(limit, items.length)).fill(0).map(async () => {
      while (index < items.length) {
        const current = index++;
        results[current] = await worker(items[current], current);
      }
    });

    await Promise.all(runners);
    return results;
  }

  getFolderPaths() {
    const set = new Set();

    try {
      const loaded = this.app.vault.getAllLoadedFiles();
      for (const item of loaded) {
        if (item && item.path !== undefined && item.children !== undefined) {
          set.add(item.path === "" ? "/" : item.path);
        }
      }
    } catch (e) {
      console.error("BookVault getAllLoadedFiles failed", e);
    }

    try {
      for (const file of this.app.vault.getFiles()) {
        const parts = file.path.split("/");
        parts.pop();

        if (!parts.length) {
          set.add("/");
          continue;
        }

        let current = "";
        for (const part of parts) {
          if (!part) continue;
          current = current ? `${current}/${part}` : part;
          set.add(current);
        }
      }
    } catch (e) {
      console.error("BookVault getFiles failed", e);
    }

    if (!set.has("/")) set.add("/");
    if (!set.has("Book")) set.add("Book");

    return Array.from(set)
      .filter(Boolean)
      .sort((a, b) => a.localeCompare(b, "zh-Hans-CN"));
  }

};


class BookVaultSettingTab extends PluginSettingTab {
  constructor(app, plugin) {
    super(app, plugin);
    this.plugin = plugin;
    this.pathValueEls = {};
  }

  getPreviewPaths(bookDir) {
    const dir = normalizePath((bookDir || "Book").trim() || "Book");

    return {
      book: dir,
      cover: normalizePath(`${dir}/cover`),
      scripts: normalizePath(`${dir}/scripts`),
      base: normalizePath(`${dir}/个人读书库.base`),
    };
  }

  updatePathPreview(bookDir) {
    if (!this.pathValueEls) return;

    const paths = this.getPreviewPaths(bookDir);

    if (this.pathValueEls.book) this.pathValueEls.book.setText(paths.book);
    if (this.pathValueEls.cover) this.pathValueEls.cover.setText(paths.cover);
    if (this.pathValueEls.scripts) this.pathValueEls.scripts.setText(paths.scripts);
    if (this.pathValueEls.base) this.pathValueEls.base.setText(paths.base);
  }

  createSection(containerEl, title, desc) {
    const section = containerEl.createDiv({ cls: "bookvault-section" });
    const header = section.createDiv({ cls: "bookvault-section-header" });
    header.createEl("h3", { text: title });

    if (desc) {
      header.createEl("p", { text: desc });
    }

    return section;
  }

  createPathPreview(containerEl) {
    this.pathValueEls = {};

    const preview = containerEl.createDiv({ cls: "bookvault-path-preview" });

    const rows = [
      ["book", "读书笔记"],
      ["cover", "封面"],
      ["scripts", "数据文件"],
      ["base", "数据库"],
    ];

    for (const [key, label] of rows) {
      const row = preview.createDiv({ cls: "bookvault-path-row" });
      row.createSpan({ text: label, cls: "bookvault-path-label" });
      this.pathValueEls[key] = row.createSpan({ text: "", cls: "bookvault-path-value" });
    }

    this.updatePathPreview(this.plugin.settings.bookDir);
  }

  createLoginStatus(containerEl) {
    const grid = containerEl.createDiv({ cls: "bookvault-login-grid" });

    const createCard = (service, isLoggedIn, desc, loginHandler, checkHandler, clearHandler) => {
      const card = grid.createDiv({ cls: "bookvault-login-card" });

      const top = card.createDiv({ cls: "bookvault-login-card-top" });
      top.createEl("h4", { text: service });

      const badge = top.createSpan({
        text: isLoggedIn ? "已登录" : "未登录",
        cls: isLoggedIn ? "bookvault-badge bookvault-badge-ok" : "bookvault-badge bookvault-badge-warn",
      });

      card.createEl("p", { text: desc, cls: "bookvault-muted" });

      const actions = card.createDiv({ cls: "bookvault-actions" });

      const loginBtn = actions.createEl("button", { text: isLoggedIn ? "重新登录" : "登录" });
      loginBtn.onclick = loginHandler;

      const checkBtn = actions.createEl("button", { text: "检测" });
      checkBtn.onclick = checkHandler;

      const clearBtn = actions.createEl("button", { text: "注销", cls: "mod-warning" });
      clearBtn.onclick = clearHandler;
    };

    createCard(
      "豆瓣",
      this.plugin.settings.doubanLoggedIn,
      "读取书籍信息",
      async () => {
        await this.plugin.loginDouban();
        this.display();
      },
      async () => {
        await this.plugin.checkDoubanCookie();
        this.display();
      },
      async () => {
        await this.plugin.clearDoubanLogin();
        this.display();
      }
    );

    createCard(
      "微信读书",
      this.plugin.settings.wereadLoggedIn,
      "读取摘抄和想法",
      async () => {
        await this.plugin.loginWeread();
        this.display();
      },
      async () => {
        await this.plugin.checkWereadCookie();
        this.display();
      },
      async () => {
        await this.plugin.clearWereadLogin();
        this.display();
      }
    );
  }

  display() {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.addClass("bookvault-settings");

    const hero = containerEl.createDiv({ cls: "bookvault-hero" });
    hero.createEl("h2", { text: "BookVault Sync" });
    hero.createEl("p", {
      text: "同步豆瓣和微信读书",
    });

    const egg = hero.createDiv({ cls: "bookvault-easter-egg" });
    egg.createSpan({ text: "Kaltgeist" });

    const pathSection = this.createSection(
      containerEl,
      "1. 位置",
      "选择一个文件夹即可"
    );

    new Setting(pathSection)
      .setName("笔记文件夹")
      .setDesc("输入路径或选择文件夹")
      .addText((text) =>
        text
          .setPlaceholder("Book")
          .setValue(this.plugin.settings.bookDir)
          .onChange(async (value) => {
            this.plugin.settings.bookDir = normalizePath(value.trim() || "Book");
            this.updatePathPreview(this.plugin.settings.bookDir);
            await this.plugin.saveSettings();
          })
      )
      .addButton((button) =>
        button
          .setButtonText("选择")
          .onClick(() => {
            try {
              const folders = this.plugin.getFolderPaths();
              new FolderSelectModal(this.app, folders, async (folder) => {
                const normalized = folder === "/" ? "" : folder;
                this.plugin.settings.bookDir = normalizePath(normalized || "Book");
                await this.plugin.saveSettings();
                this.display();
              }).open();
            } catch (e) {
              console.error("BookVault folder selector failed", e);
              new Notice("文件夹选择器打开失败，请先直接在输入框里填写路径。");
            }
          })
      );

    this.createPathPreview(pathSection);

    const loginSection = this.createSection(
      containerEl,
      "2. 账号",
      "登录后才能同步"
    );
    this.createLoginStatus(loginSection);

    new Setting(loginSection)
      .setName("豆瓣 ID")
      .setDesc("自动识别失败时填写，例如 people 后面的那段 ID")
      .addText((text) =>
        text
          .setPlaceholder("douban_user_id")
          .setValue(this.plugin.settings.doubanUserId || "")
          .onChange(async (value) => {
            this.plugin.settings.doubanUserId = value.trim();
            await this.plugin.saveSettings();
          })
      );

    new Setting(loginSection)
      .setName("清除登录")
      .setDesc("清除两个账号")
      .addButton((button) =>
        button
          .setButtonText("全部注销")
          .setWarning()
          .onClick(async () => {
            await this.plugin.clearAllLogin();
            this.display();
          })
      );

    const syncSection = this.createSection(
      containerEl,
      "3. 同步",
      "选择同步方式"
    );

    const syncGrid = syncSection.createDiv({ cls: "bookvault-sync-grid" });

    const createSyncButton = (title, desc, buttonText, cta, handler) => {
      const card = syncGrid.createDiv({ cls: "bookvault-sync-card" });
      card.createEl("h4", { text: title });
      card.createEl("p", { text: desc, cls: "bookvault-muted" });

      const btn = card.createEl("button", { text: buttonText });
      if (cta) btn.addClass("mod-cta");
      btn.onclick = handler;
    };

    createSyncButton(
      "一键同步",
      "同步书籍和摘抄",
      "一键同步",
      true,
      async () => await this.plugin.syncAll()
    );

    createSyncButton(
      "只同步豆瓣",
      "更新书籍笔记",
      "同步豆瓣",
      false,
      async () => await this.plugin.syncDouban()
    );

    createSyncButton(
      "只同步微信读书",
      "合并摘抄想法",
      "同步微信读书",
      false,
      async () => await this.plugin.syncWeread()
    );

    createSyncButton(
      "更新 Bases",
      "更新 Base 文件",
      "更新数据库",
      false,
      async () => await this.plugin.createBaseFile()
    );
  }
}


class FolderSelectModal extends FuzzySuggestModal {
  constructor(app, folders, onSelect) {
    super(app);
    this.folders = folders;
    this.onSelectFolder = onSelect;
    this.setPlaceholder("选择或搜索文件夹路径");
  }

  getItems() {
    return this.folders;
  }

  getItemText(item) {
    return item;
  }

  onChooseItem(item) {
    this.onSelectFolder(item);
  }
}
