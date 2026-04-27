# BookVault Sync v1.0.0

一键同步豆瓣已读和微信读书摘抄到 Obsidian 个人读书库。

## 功能

- **豆瓣同步**：导入已读书籍信息（书名、作者、出版社、评分等）
- **微信读书同步**：合并划线和想法到对应书籍笔记
- **自动匹配**：智能识别重复书籍，避免重复创建
- **Bases 数据库**：自动生成卡片式读书库视图
- **Cookie 登录**：打开登录窗口后自动捕获登录状态

## 手动安装

如果暂时不是从插件市场安装，只复制下面这些文件到：

`.obsidian/plugins/bookvault-sync/`

- `manifest.json`
- `main.js`
- `styles.css`
- `versions.json`
- `README.md`

不要复制 `data.json`。这个文件保存本机登录状态，里面可能有豆瓣和微信读书 Cookie，本仓库不会发布这个文件。

## 使用步骤

1. 安装插件并在 Obsidian 中启用
2. 在设置页选择读书笔记存放位置（默认 `Book` 文件夹）
3. 登录豆瓣和微信读书
4. 点击「一键同步」开始同步

## 命令

- **一键同步**：同时同步豆瓣和微信读书
- **同步豆瓣**：只同步豆瓣已读书籍
- **同步微信读书**：只同步微信读书摘抄
- **更新数据库**：更新 Bases 文件结构
- **Check Login Status**：检测登录状态
- **Clear Login Status**：清除所有登录信息

## 文件结构

```
Book/
├── 《书名》.md           # 书籍笔记
├── cover/               # 书籍封面
└── scripts/             # 数据文件和日志
```

## 注意事项

- 仅支持 Obsidian 桌面版
- 需要已登录豆瓣或微信读书账号
- Cookie 仅保存在本地，不会上传
- 插件文件夹应命名为 `bookvault-sync`

## GitHub Release

首个正式版本为 `1.0.0`。发布到 GitHub Release 时建议附上：

- `manifest.json`
- `main.js`
- `styles.css`
- `versions.json`
- `bookvault-sync-1.0.0.zip`
