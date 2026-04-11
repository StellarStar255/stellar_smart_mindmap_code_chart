# Smart Mindmap Code Chart

[English](./README.md) | **简体中文**

一个零依赖、基于 Web 的脑图编辑器,专为**可视化讲解代码与架构**而设计。使用原生 Node.js 实现(无任何前端框架),唯一的运行时依赖是 `ws`,用于实时协作。

![截图](./assets/code_chart_mindmap.png)

## 功能特性

- **拖拽式编辑** —— 在无限画布上创建、移动并连接节点
- **丰富的节点类型** —— 文本、代码块、图片,以及自动抓取网页元数据的 URL 卡片
- **多色主题** —— 通过颜色为节点标注语义类别
- **文件与命名空间管理** —— 将多个脑图组织到不同命名空间中
- **自动保存** —— 所有修改通过分片式 JSON 存储后端持久化到磁盘
- **导出 PNG** —— 一键将脑图分享为图片
- **开箱即用的局域网访问** —— 服务器默认监听 `0.0.0.0`,同一网络下的其他设备可直接访问
- **代理感知的 URL 抓取器** —— 自动读取 `HTTPS_PROXY` / `HTTP_PROXY` 环境变量,用于解析外链预览
- **快捷键** —— `Cmd/Ctrl + S` 保存,`Ctrl + 点击` 快速添加节点,`Shift + 点击/拖拽` 创建连接,`Delete` 删除选中节点

## 环境要求

- Node.js `>= 12.0.0`
- 现代浏览器(Chrome、Edge、Safari、Firefox)

## 安装

```shell
git clone https://github.com/StellarStar255/stellar_smart_mindmap_code_chart.git
cd stellar_smart_mindmap_code_chart
npm install
```

## 使用方式

启动服务器:

```shell
npm start
```

然后在浏览器中打开编辑器:

- 本机访问:<http://localhost:3000>
- 局域网访问:`http://<你的机器IP>:3000`(服务器启动时会在控制台打印)

## 项目结构

```
.
├── server.js            # HTTP 服务器、存储 API、URL 元数据抓取
├── app.js               # 前端编辑器逻辑
├── storage-adapter.js   # 客户端存储适配器
├── index.html           # 编辑器入口页
├── assets/              # 静态资源(图片、crypto-js)
└── data/                # 自动创建的持久化存储目录(分片 JSON)
```

持久化数据写入 `./data/keys/` —— 每个键一个文件 —— 因此编辑器在面对超大脑图时,也无需反复读写单一的 `storage.json`。

## 故障排查

**端口 3000 已被占用**

```shell
kill -9 $(lsof -t -i:3000)
```

**无法从局域网其他设备访问**

1. 确认所有设备处于同一 WiFi / 路由器下
2. 在防火墙设置中放行 `3000` 端口的入站连接
3. macOS 用户:*系统设置 → 网络 → 防火墙*

## 开源协议

[MIT](./LICENSE) © 2026 StellarStar255
