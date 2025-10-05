# AZJTK Header提取器

一个Chrome浏览器插件，用于自动提取woaizuji.com网站特定请求中的azjtk header字段。

## 功能特性

- 🔍 **自动监听**: 自动监听目标网站的网络请求
- 📋 **一键复制**: 提取到的azjtk值可一键复制到剪贴板
- 💾 **数据存储**: 自动保存最新提取的数据
- 🎨 **美观界面**: 现代化的用户界面设计
- 🔔 **实时通知**: 页面内实时显示提取状态

## 安装方法

### 方法一：开发者模式安装（推荐）

1. 打开Chrome浏览器
2. 访问 `chrome://extensions/`
3. 开启右上角的"开发者模式"
4. 点击"加载已解压的扩展程序"
5. 选择本插件的文件夹
6. 插件安装完成

### 方法二：打包安装

1. 在Chrome扩展程序页面点击"打包扩展程序"
2. 选择插件文件夹，生成.crx文件
3. 将.crx文件拖拽到Chrome扩展程序页面进行安装

## 使用方法

1. **安装插件**后，在Chrome工具栏会出现插件图标
2. **访问目标网站**: 打开 `https://external-gw.woaizuji.com` 相关页面
3. **触发请求**: 执行会调用订单列表接口的操作
4. **查看结果**: 点击插件图标查看提取到的azjtk值
5. **复制使用**: 点击复制按钮将azjtk值复制到剪贴板

## 文件结构

```
aizuji_plugin/
├── manifest.json      # 插件配置文件
├── background.js      # 后台脚本，监听网络请求
├── popup.html        # 弹出窗口HTML
├── popup.js          # 弹出窗口交互逻辑
├── popup.css         # 弹出窗口样式
├── content.js        # 内容脚本，页面交互
├── icon16.png        # 16x16图标
├── icon48.png        # 48x48图标
├── icon128.png       # 128x128图标
└── README.md         # 说明文档
```

## 技术实现

### 核心功能

- **网络请求监听**: 使用Chrome的`webRequest` API监听特定URL的请求
- **Header提取**: 从请求头中提取azjtk字段
- **数据存储**: 使用Chrome的`storage` API保存提取的数据
- **消息传递**: 通过Chrome的`runtime` API在不同脚本间传递消息

### 权限说明

- `activeTab`: 访问当前活动标签页
- `storage`: 本地数据存储
- `webRequest`: 监听网络请求
- `https://external-gw.woaizuji.com/*`: 访问目标网站

## 注意事项

1. **目标URL**: 插件专门针对 `https://external-gw.woaizuji.com/merchantTeamwork/inside_route_page/merchantOrder/orderList` 请求
2. **Header字段**: 只提取名为"azjtk"的header字段
3. **数据安全**: 所有数据仅在本地存储，不会上传到任何服务器
4. **浏览器兼容**: 仅支持Chrome浏览器及基于Chromium的浏览器

## 故障排除

### 插件无法提取数据

1. 确认是否访问了正确的网站
2. 检查是否触发了目标请求
3. 打开开发者工具查看控制台日志
4. 确认插件权限已正确授予

### 插件图标不显示

1. 检查插件是否正确安装
2. 确认插件是否已启用
3. 尝试重新加载插件

### 复制功能不工作

1. 确认浏览器支持剪贴板API
2. 检查是否授予了必要的权限
3. 尝试手动选择文本复制

## 开发说明

如需修改插件功能，可以编辑相应的文件：

- 修改监听的URL: 编辑 `background.js` 中的URL匹配规则
- 修改界面样式: 编辑 `popup.css` 文件
- 添加新功能: 在相应的JavaScript文件中添加代码

修改后需要在Chrome扩展程序页面重新加载插件。

## 版本历史

- **v1.0.0**: 初始版本，实现基本的azjtk提取功能

## 许可证

本项目仅供学习和研究使用。
