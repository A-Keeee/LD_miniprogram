# 🐾 宠伴 – LD 智能宠物小程序

> **基于 TDesign Mini-Program 的微信小程序，与 LD 硬件设备联动，提供实时视频、行为状态同步、传感器读数与 AI 对话。**

---

## 📖 项目概述

`LD_miniprogram` 是 **宠伴智联** 的前端小程序，对接 [`LD_backend`](https://github.com/fourzkw/LD_backend) 后端服务，实现账号登录、设备配对、宠物数字分身与云端行为推理的完整链路。

| 功能 | 说明 |
|------|------|
| **账号体系** | 手机号 + 密码注册/登录，Token 鉴权访问后端 API。 |
| **设备配对** | 输入 6 位配对码，上传宠物照片并创建数字分身，支持多设备绑定与切换。 |
| **状态视频** | 优先播放后端 AI 生成视频，回退至本地预置视频；支持批量生成各状态视频。 |
| **云端同步** | 轮询 `GET /api/pet/status`，将 IMU 推理 `behaviour` 映射为宠物状态并刷新 UI。 |
| **状态徽章** | 根据当前状态（等待、睡觉、行走、吃饭、梳理、抖动身体）显示 Emoji 与标签。 |
| **传感器框** | 电池 % 与温度 ℃ 的实时读数展示。 |
| **AI 聊天** | 基于 Gemini 的宠物对话弹层，支持发送/接收消息。 |
| **本地互动体验** | 手帐、任务积分、猫友碰一碰、数字旅行和电子猫包。 |
| **主题** | 暖白与 LOXI 橙的消费级宠物陪伴风格。 |

## ✨ 无后端 Demo Mode

不启动 `LD_backend` 也可以完成完整演示：

1. 打开登录页，点击 **「先体验 Demo →」**。
2. 在陪伴页摸摸汤圆、进入电子猫包或与它聊天。
3. 从底部 Tab 依次体验手帐、猫友、旅行和我的资产。
4. 在 **我的 → Demo 控制台** 手动推进下一幕或开启每 15 秒自动剧情。

Demo 数据只保存在小程序本地，并与真实账号、设备和视频缓存隔离。关闭 Demo Mode 后，已有真实后端链路继续按原接口工作。

---

## 🚀 快速开始

### 前置条件

1. **Node ≥ 14**（用于 npm 依赖安装）
2. **微信开发者工具**（最新版）
3. **LD_backend**（可选，仅真实登录、设备与视频链路需要）

### 安装步骤

```bash
# 克隆仓库
git clone https://github.com/fourzkw/LD_miniprogram.git
cd LD_miniprogram

# 安装依赖
npm install

# 在微信开发者工具中打开项目（文件 → 打开 → 选择本文件夹）
```

### 后端配置

在 `config/index.js` 中修改 `localBackendBaseUrl`：

```js
export const cloudConfig = {
  localBackendBaseUrl: 'http://127.0.0.1:5000',  // 真机预览改为电脑局域网 IP
  statusPollIntervalMs: 1500,
};
```

- 开发阶段请在微信开发者工具中勾选 **「不校验合法域名、web-view、TLS 版本以及 HTTPS 证书」**。
- 真机预览时，将 `127.0.0.1` 替换为电脑的局域网 IP（如 `http://192.168.x.x:5000`）。
- `config.useMock` 默认为 `false`，关闭后所有请求走真实后端；设为 `true` 可启用本地 mock 拦截。

### 本地运行

1. 打开 **微信开发者工具**，点击 **「编译」→「预览」**。
2. 无后端演示：登录页点击 **「先体验 Demo」**。
3. 真实链路：启动 **LD_backend**，注册/登录后在 **我的** 页绑定设备。

---

## 🛠️ 开发指南

### 项目结构

```
├─ app.js / app.json / app.less   # 全局入口与配置
├─ config/
│   ├─ index.js                   # useMock、后端地址、轮询间隔
│   └─ config.js                  # request 层使用的 baseUrl 封装
├─ api/request.js                 # 统一 HTTP 请求（自动附加 Bearer Token）
├─ pages/
│   ├─ login/                     # 登录页
│   ├─ register/                  # 注册页
│   ├─ home/                      # 陪伴首页（视频、状态、想法、聊天）
│   ├─ journal/                   # 事件时间线、情绪、梦境与手帐
│   ├─ social/                    # 猫友匹配与收藏
│   ├─ travel/                    # 数字旅行、明信片与特产
│   ├─ petbag/                    # 手机传感器互动
│   └─ setting/                   # 我的、Demo 控制台与开发工具
├─ custom-tab-bar/                # 陪伴 / 手帐 / 猫友 / 旅行 / 我的
├─ components/                    # 可复用组件（nav、card 等）
├─ utils/
│   ├─ types.js                   # PetStatus、VideoProvider 枚举
│   └─ services/
│        ├─ deviceService.js     # 设备注册、配对、切换、解绑
│        ├─ videoService.js      # 视频解析、AI 任务、本地缓存
│        └─ geminiService.js     # Gemini AI 对话封装
├─ mock/                          # 可选 mock 数据（useMock: true 时生效）
└─ static/video/                  # 本地预置状态视频（回退用）
```

### 页面路由

| 页面 | 路径 | 说明 |
|------|------|------|
| 登录 | `pages/login/login` | 入口页，未登录自动跳转 |
| 注册 | `pages/register/register` | 手机号注册 |
| 陪伴 | `pages/home/index` | 状态、想法、互动与聊天 |
| 手帐 | `pages/journal/index` | 情绪、事件、梦境与每日手帐 |
| 猫友 | `pages/social/index` | 碰一碰、匹配与好友卡 |
| 旅行 | `pages/travel/index` | 世界副本、明信片与数字特产 |
| 我的 | `pages/setting/index` | 资产、任务、设备与开发工具 |

### 关键服务

- **`utils/services/deviceService.js`**：`pairDevice`、`listDevices`、`setActiveDevice`、`unbindDevice` 等设备生命周期管理。
- **`utils/services/videoService.js`**：`resolveStatusVideoUrl` 按「本地 AI 缓存 → 后端任务 → 预置视频」策略解析可播放 URL；`createStatusVideoTask` 触发 AI 视频生成。
- **`pages/home/index.js`**：视频加载、云端同步轮询、多宠物切换、聊天流程的核心逻辑。

### 添加新页面

1. 在 `pages/` 下新建目录，创建 `index.wxml`、`index.wxss`、`index.js`、`index.json`。
2. 在 `app.json` 的 `pages` 数组中加入路径。
3. 若使用 TDesign 组件，在页面或全局 `usingComponents` 中注册。

---

## 📦 功能细节

### 1. 设备配对流程

1. 在 LD_backend / 硬件侧获取 6 位配对码。
2. 进入 **设置** 页，填写配对码、宠物昵称、类型（猫/狗）并上传照片。
3. 调用 `POST /api/devices/pair`，成功后自动设为当前活跃设备并同步 `petProfile`。
4. 可在设备列表中切换活跃宠物或解绑设备。

### 2. 状态视频解析策略

```js
// utils/services/videoService.js → resolveStatusVideoUrl()
// 1. 本地 AI 生成缓存（按账号 + 状态）
// 2. GET /api/video/tasks/<state> 查询后端任务状态
// 3. 可选回退至 static/video/ 预置视频
```

#### 行为识别与视频对应关系

云端推理返回的 `behaviour` 在 `pages/home/index.js` 中映射为 `PetStatus`：

| 推理结果 behaviour | 宠物状态 PetStatus | 预置视频文件 |
|-------------------|--------------------|--------------|
| `Rest` | `PetStatus.WAITING` | `static/video/waiting.mp4` |
| `Sleep` | `PetStatus.SLEEPING` | `static/video/sleeping.mp4` |
| `Walk` / `Run` | `PetStatus.WALKING` | `static/video/walking.mp4` |
| `Feed` | `PetStatus.EATING` | `static/video/eating.mp4` |
| `Groom` | `PetStatus.GROOMING` | `static/video/grooming.mp4` |
| `Shake` | `PetStatus.SHAKING` | `static/video/shaking.mp4` |
| `Litter box` | `PetStatus.LITTER_BOX` | 后端生成/缓存视频 |

> 微信 `<video>` 组件不支持直接播放包内路径，预置视频会先复制到用户目录再作为 `src` 使用。

### 3. 云端实时同步

在 **我的 → Demo / 开发工具** 开启「云端状态同步」后，Home 可见时按 `statusPollIntervalMs` 间隔请求：

```
GET /api/pet/status?device_id=<active_device_id>
```

需已登录且绑定设备；返回的 `behaviour` 会驱动状态徽章与视频切换。

### 4. AI 聊天（Gemini）

```js
import { chatWithPet } from '../../utils/services/geminiService.js';
const reply = await chatWithPet(pet, userMsg);
```

网络异常时会在聊天记录中显示 `喵? (连接断开...)`。

### 5. 视频提供商设置

在 **设置** 页可配置 `VideoProvider`：

- **LOCAL**：使用预置/后端已生成视频。
- **KLING_AI**：AI 短视频生成（接口预留，需配置 API Key）。

---

## 🧩 扩展指南

- **新增宠物状态**：在 `utils/types.js` 扩展 `PetStatus`，同步更新 `pages/home/index.js` 的 `statusConfig` 与 `static/video/` 预置文件。
- **对接新后端**：修改 `config/index.js` 中的 `localBackendBaseUrl`。
- **启用 Mock**：将 `config.useMock` 设为 `true`，请求将由 `mock/` 目录拦截。

---

## 📜 常用脚本

```bash
npm run lint          # ESLint 检查
npm run lint:fix      # 自动修复 ESLint + Prettier
```

---

## 📄 许可证

本项目采用 **MIT License**，详见 `LICENSE` 文件。

---

## 🙏 贡献

1. Fork 本仓库。
2. 创建功能分支：`git checkout -b feat/awesome-feature`。
3. 执行 `npm run lint` 确保代码无报错。
4. 提交 Pull Request 并填写清晰的描述。

---

祝开发愉快，给你的宠物最好的陪伴！
