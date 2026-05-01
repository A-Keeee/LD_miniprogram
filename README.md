# 🐾 TDesign 小程序 Starter – **宠伴**

> **一个精美的微信小程序，提供与虚拟宠物的互动，包括实时视频、状态徽章、传感器读数以及 AI 对话功能。**

---

## 📖 项目概述

`tdesign-miniprogram-starter` 基于 **TDesign Mini‑Program** 组件实现，演示了 **高级 UI**（玻璃拟态、渐变配色、微交互）以及完整的宠物仪表盘功能：

| 功能 | 说明 |
|------|------|
| **实时视频 / 备用视频** | 展示宠物实时视频，若解码失败自动回退远程视频。 |
| **状态徽章** | 根据宠物当前状态（睡觉、玩耍、吃饭、等待、抖动身体）显示对应 Emoji。 |
| **传感器框** | 电池 % 与温度 ℃ 的实时读数，使用 TDesign 图标。 |
| **控制按钮** | 心形（震动反馈）与聊天按钮。 |
| **聊天弹层** | 基于 Gemini 的 AI 对话，支持发送/接收消息。 |
| **云端实时同步** | 可选 WebSocket (`ws://8.156.34.152:4535`) 推送远端推理结果并同步状态。 |
| **主题** | 暗色玻璃拟态风格，渐变高光，流畅的点击/滑动动画。 |

---

## 🎨 截图

> 请将实际页面截图替换以下占位图。

```markdown
![首页示例](https://via.placeholder.com/800x450?text=Home+Page+Mockup)
```

---

## 🚀 快速开始

### 前置条件

1. **Node ≥ 14**（用于 npm）
2. **微信开发者工具**（最新版）
3. 可选：**Python 3.9+**（仅用于 `wx_test_sub.py` 测试脚本）

### 安装步骤

```bash
# 克隆仓库
git clone https://github.com/TDesignOteam/tdesign-miniprogram-starter.git
cd tdesign-miniprogram-starter

# 安装依赖
npm install

# 在微信开发者工具中打开项目（File → Open → 选择本文件夹）
```

### 本地运行

1. 打开 **微信开发者工具**，点击 **“编译” → “预览”**。
2. 小程序将在模拟器或真实设备（扫码）上启动。

### 打包发布

```bash
# 如有自定义构建脚本，可执行
npm run build
```

在 **微信开发者工具** 中选择 **“上传”**，填写版本号和说明即可。

---

## 🛠️ 开发指南

### 项目结构

```
├─ app.js                # 全局入口，初始化 globalData
├─ app.json              # 小程序配置（页面、tabBar、组件）
├─ app.less              # 全局 LESS 变量 & 主题
├─ pages/
│   ├─ home/            # ★ 主仪表盘（index.wxml、.wxss、.js）
│   ├─ social/          # 预留的社交页
│   ├─ setting/         # 设置页（目前为空）
│   └─ setup/           # 首次运行向导，用于创建宠物资料
├─ components/           # 可复用的 TDesign 组件（如有）
├─ utils/
│   ├─ types.js         # 枚举定义（PetStatus）
│   └─ services/
│        ├─ videoService.js   # 视频 URL 解析 & 远端 fallback
│        └─ geminiService.js  # 与 Gemini 对话的封装
├─ wx_test_sub.py        # 本地调试脚本示例（非必须）
└─ README.md             # 本文档
```

### 关键代码文件

- **pages/home/index.js**：页面核心逻辑，负责视频加载、状态映射、WebSocket 处理、聊天流程。
- **pages/home/index.wxml**：使用 TDesign 组件 (`t-icon`, `t-toast`) 布局页面 UI。
- **pages/home/index.wxss**：局部样式，实现玻璃拟态、渐变、响应式布局。
- **utils/services/videoService.js**：`getPetStatusVideo(pet, settings)` 获取对应视频 URL；`getRemoteFallback(pet)` 远端图片回退。
- **utils/services/geminiService.js**：封装 Gemini API，`chatWithPet(pet, userMsg)` 返回 AI 回复。

### 添加新页面的步骤

1. 在 `pages/` 下新建目录（例如 `pages/profile/`），并创建 `index.wxml、index.wxss、index.js`。
2. 在 `app.json` 的 `pages` 数组中加入路径：`"pages/profile/index"`。
3. 若使用自定义组件，记得在 `usingComponents` 中注册。

---

## 📦 功能细节

### 1. 实时视频 & 退化机制
```js
// pages/home/index.js → loadVideo()
const url = await getPetStatusVideo(pet, settings);
```
- 若本地解码失败，`handleVideoError()` 会尝试一次远端视频回退，随后永久关闭视频播放以防无限重试。
- 本地视频文件会先从小程序包复制到用户目录，再作为 `<video>` 的可播放 `src` 使用。

#### 行为识别结果与视频对应关系

云端推理服务返回的 `behaviour` 会先在 `pages/home/index.js` 中映射为 `PetStatus`，再由 `utils/services/videoService.js` 选择对应视频文件：

| 推理结果 behaviour | 宠物状态 PetStatus | 展示视频 | 视频文件 |
|-------------------|--------------------|----------|----------|
| `Rest` | `PetStatus.SLEEPING` | 睡觉视频 | `static/video/sleeping.mp4` |
| `Walk` / `Run` | `PetStatus.PLAYING` | 玩耍视频 | `static/video/playing.mp4` |
| `Feed` | `PetStatus.EATING` | 吃饭视频 | `static/video/eating.mp4` |
| `Groom` | `PetStatus.WAITING` | 等待视频 | `static/video/waiting.mp4` |
| `Shake` | `PetStatus.SHAKING` | 抖动视频 | `static/video/shaking.mp4` |

> 注意：仓库中也包含 `static/video/grooming.mp4`，但当前 `Groom` 行为按产品定义对应等待视频 `waiting.mp4`。

### 2. 云端实时同步（WebSocket）
```js
wx.connectSocket({ url: 'ws://8.156.34.152:4535' });
```
- 收到 `{type: 'inference_result', behaviour: 'Walk'}` 后映射为 `PetStatus.PLAYING` 并刷新 UI。

### 3. AI 聊天（Gemini）
```js
import { chatWithPet } from '../../utils/services/geminiService.js';
const reply = await chatWithPet(pet, userMsg);
```
- 网络异常时会在聊天记录中显示 `喵? (连接断开...)`。

### 4. 轻触反馈
```js
wx.vibrateShort({ type: 'medium' }); // 心形按钮点击时触发
```

---

## 🧩 扩展指南

- **新增状态**：在 `utils/types.js` 中扩展 `PetStatus` 枚举，并在 `statusConfig` 中添加对应的 `label` 与 `icon`。
- **自定义组件**：将可复用的 UI 放入 `components/`，并在页面的 `usingComponents` 中声明。
- **后端对接**：将演示的 WebSocket 地址替换为自己的推理服务端点。

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

## 🛎️ 联系方式

- 在 GitHub 提交 **Issue**。
- 加入 **官方 TDesign 小程序交流群**（搜索 “TDesign Mini‑Program”）。

---

祝开发愉快，给你的宠物最好的陪伴！
