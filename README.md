# Wallpaper Engine Workshop NAS Panel

<img width="1618" height="926" alt="image" src="https://github.com/user-attachments/assets/78076406-833f-4095-a5fe-33f8cb532de2" />

一个面向 NAS / 家庭服务器的 Wallpaper Engine 创意工坊下载与内容库面板。

能做的事情 -> 搜索创意工坊、加入下载队列、查看任务状态、整理本地内容、生成 NFO/Jellyfin 旁挂文件; 用一个 WebUI 管理，适合部署在 Docker、NAS 或长期在线的 Linux 服务器上。

> 当前项目主要围绕 Wallpaper Engine 的 Steam App ID `431960` 工作。请使用你有权访问相关创意工坊内容的 Steam 账号，并遵守 Steam、Wallpaper Engine 和创意工坊内容的使用条款。

## 功能概览

- 浏览和筛选 Wallpaper Engine 创意工坊内容。
- 支持多选、批量加入下载队列。
- API 和下载 worker 分离，下载任务在后台执行。
- 任务页可查看排队中、下载中、成功、失败状态，并支持重试和清理历史。
- 独立 Steam 登录页，可查看 SteamCMD 运行状态和最近错误。
- 内容库可查看本地路径、文件状态、大小、metadata、NFO 和 Jellyfin 旁挂状态。
- 支持内容库重扫/校验，补齐缺失的 NFO 和 Jellyfin 旁挂文件。
- 删除内容时默认只移除记录，也可确认后同时删除本地输出目录。
- 支持 Docker Compose 部署，适合放到 NAS 上长期运行。

## 服务组成

Docker Compose 会启动三个服务：

- `web`：前端面板，默认端口 `8080`。
- `api`：HTTP API，默认端口 `3001`。
- `worker`：后台下载进程，负责消费队列并调用 SteamCMD。

数据默认保存在 Docker volume 中：

- `panel-db`：面板 SQLite 数据库。
- `panel-downloads`：下载后的内容库输出目录，容器内路径为 `/downloads`。
- `steam-home`：Steam 登录态和 workshop 缓存。
- `steamcmd-install`：SteamCMD 安装目录。

## 快速开始

### 1. 准备环境

需要：

- Docker
- Docker Compose
- 一个可以访问目标 Wallpaper Engine 创意工坊内容的 Steam 账号

### 2. 克隆项目

```bash
git clone https://github.com/ANGJustinl/wallpaper-nas-panel
cd wallpaper-nas-panel/apps
```

### 3. 创建配置文件

```bash
cp .env.example .env
```

按需编辑 `.env`。最常用的是端口、默认下载目录、代理和 Steam 账号名：

```env
PANEL_WEB_PORT=8080
PANEL_API_PORT=3001
PANEL_DEFAULT_STEAM_ACCOUNT=nas-panel-operator
PANEL_DEFAULT_DOWNLOAD_ROOT=/downloads/431960
PANEL_DEFAULT_PROXY_ENABLED=false
PANEL_DEFAULT_PROXY_URL=http://127.0.0.1:7890
```

### 4. 启动

```bash
docker compose up -d --build
```

启动后访问：

- Web 面板：`http://<你的服务器IP>:8080/`
- API 健康检查：`http://<你的服务器IP>:3001/api/health`

本机测试时通常是：

```text
http://127.0.0.1:8080/
```

## 首次使用流程

1. 打开 Web 面板。
2. 进入“设置”页，确认下载目录、NFO、Jellyfin 旁挂和代理配置。
3. 进入“Steam 登录”页，使用 SteamCMD 完成登录。
4. 回到“探索”页搜索创意工坊内容，选择项目后加入下载队列。
5. 进入“任务”页查看下载进度、失败原因或重试。
6. 下载成功后进入“内容库”页，查看本地路径、文件状态、NFO 和 Jellyfin 旁挂状态。
7. 如需重新校验文件或补齐 metadata，点击内容库里的“重扫/校验”。

## 配置说明

大部分设置可以在 Web 面板的“设置”页保存。`.env` 更适合用来设置首次启动默认值、端口和容器环境。

| 配置项 | 默认值 | 说明 |
| --- | --- | --- |
| `PANEL_WEB_PORT` | `8080` | Web 面板暴露端口。 |
| `PANEL_API_PORT` | `3001` | API 暴露端口。 |
| `PANEL_DEFAULT_STEAM_ACCOUNT` | `nas-panel-operator` | 默认 Steam 账号名。 |
| `PANEL_DEFAULT_DOWNLOAD_ROOT` | `/downloads/431960` | 下载后同步到内容库的根目录。 |
| `PANEL_DEFAULT_METADATA_LANGUAGE` | `en-US` | metadata / NFO 默认语言标记。 |
| `PANEL_DEFAULT_REQUEST_INTERVAL_MS` | `1250` | 请求间隔，避免过于频繁访问。 |
| `PANEL_DEFAULT_AUTO_GENERATE_NFO` | `true` | 是否自动生成 `workshop.nfo`。 |
| `PANEL_DEFAULT_JELLYFIN_SIDECARS` | `true` | 是否为视频内容生成 Jellyfin 兼容旁挂文件。 |
| `PANEL_DEFAULT_VIDEO_ONLY_SIDECARS` | `true` | 是否仅对可播放视频生成 Jellyfin 旁挂。 |
| `PANEL_DEFAULT_PRESERVE_EXISTING_SIDECARS` | `true` | 已存在的 `movie.nfo`、`poster.jpg`、`folder.jpg` 是否保留不覆盖。 |
| `PANEL_DEFAULT_DELETE_FILES` | `false` | 删除内容记录时，“同时删除本地文件”复选框的默认状态。 |
| `PANEL_DEFAULT_PROXY_ENABLED` | `false` | 是否默认启用代理。 |
| `PANEL_DEFAULT_PROXY_URL` | `http://127.0.0.1:7890` | 代理地址，按你的网络环境修改。 |
| `PANEL_STEAMCMD_INSTALL_SOURCE` | `steamcmd-install` | 可选。复用已有 SteamCMD 安装目录时，填宿主机上的 `steamcmd` 子目录。 |
| `PANEL_STEAM_DATA_SOURCE` | `steam-home` | 可选。复用已有 Steam 登录态和 workshop cache 时，填宿主机上的 `Steam` 子目录。 |
| `STEAMCMD_BATCH_MAX_ITEMS` | `20` | worker 每次合批下载的最大项目数。 |

如果已经在 Web 面板里保存过设置，面板保存的设置会优先生效。`.env` 主要影响第一次初始化和容器运行环境。

## NAS 目录挂载

默认配置使用 Docker volume 保存下载内容。如果希望把内容直接放到 NAS 共享目录，可以修改 `apps/docker-compose.yml`，把 `api` 和 `worker` 里的：

```yaml
- panel-downloads:/downloads
```

替换为你的宿主机目录，例如：

```yaml
- /volume1/media/wallpaper-workshop:/downloads
```

修改后重建容器：

```bash
cd apps
docker compose up -d --build
```

建议同时备份数据库 volume `panel-db`，否则内容文件还在，但面板里的任务和内容库记录可能丢失。

## 复用已有 SteamCMD

如果你已经有一个 SteamCMD 容器，并且它的挂载关系类似：

```text
宿主机: /path/to/steamcmd
容器内: /home/steam
```

那么这个目录通常会包含：

```text
/path/to/steamcmd/steamcmd
/path/to/steamcmd/Steam
```

可以在 `apps/.env` 里这样配置，让本面板复用已有 SteamCMD 程序、登录态和 workshop cache：

```env
PANEL_STEAMCMD_INSTALL_SOURCE=/path/to/steamcmd/steamcmd
PANEL_STEAM_DATA_SOURCE=/path/to/steamcmd/Steam
```

然后重建服务：

```bash
cd apps
docker compose up -d --build
```

注意不要把完整的 `/path/to/steamcmd` 直接填给 `PANEL_STEAMCMD_INSTALL_SOURCE`。这个变量要指向其中的 `steamcmd` 子目录；`PANEL_STEAM_DATA_SOURCE` 要指向其中的 `Steam` 子目录。

如果你的现有 SteamCMD 容器正在运行下载任务，建议先停止它，避免两个容器同时操作同一套 SteamCMD 和 workshop cache。

## Jellyfin 与 NFO

开启 `autoGenerateNfo` 后，下载成功、服务启动回填、内容库重扫都会尝试生成或补齐 metadata。

每个入库项目都会生成：

```text
workshop.nfo
```

对于包含视频文件的项目，默认还会生成 Jellyfin 友好的旁挂文件：

```text
movie.nfo
poster.jpg
folder.jpg
```

视频扩展名包括：

```text
.mp4 .webm .mkv .mov .m4v .avi
```

`poster.jpg` 和 `folder.jpg` 会优先从本地 `preview.jpg` 复制，不会额外远程下载图片。非视频项目，例如只包含 `scene.pkg` 的 Wallpaper Engine 场景，会保留归档型 `workshop.nfo`，Jellyfin 状态会显示为“不适用”。

## 内容库管理

内容库首页可以做这些事：

- 查看本地路径、文件数、大小和路径是否存在。
- 查看 `workshop.nfo` 是否存在。
- 查看 Jellyfin 旁挂是否就绪、缺失或不适用。
- 复制本地目录路径。
- 重新加入下载队列。
- 重扫/校验内容库，刷新统计并补齐缺失生成物。
- 删除内容记录。

删除内容时有两种模式：

- 默认：只移除面板里的内容库记录，不删除本地文件。
- 勾选“同时删除本地文件”：删除该条记录对应的 `outputPath` 目录，然后移除记录。

删除本地文件只处理面板输出目录，不会清理 Steam workshop cache。

## 常用运维命令

在 `apps/` 目录查看容器状态：

```bash
docker compose ps
```

查看日志：

```bash
docker compose logs -f api
docker compose logs -f worker
docker compose logs -f web
```

重启后台下载 worker：

```bash
docker compose restart worker
```

重建并更新全部服务：

```bash
docker compose up -d --build
```

从仓库根目录运行部署检查：

```bash
./scripts/verify-deploy.sh
```

如果不是本机端口，指定访问地址：

```bash
API_URL=http://127.0.0.1:3001 WEB_URL=http://127.0.0.1:8080 ./scripts/verify-deploy.sh
```

更严格的检查示例：

```bash
REQUIRE_LIBRARY_NONEMPTY=true REQUIRE_NFO=true ./scripts/verify-deploy.sh
REQUIRE_LIBRARY_NONEMPTY=true REQUIRE_NFO=true REQUIRE_JELLYFIN_SIDECARS=true ./scripts/verify-deploy.sh
```

`REQUIRE_JELLYFIN_SIDECARS=true` 需要内容库里至少有一个视频项目，否则会因为没有可检查的视频内容而失败。

## 本地开发

后端：

```bash
cd apps/server
npm install
npm run dev
```

worker：

```bash
cd apps/server
npm run dev:worker
```

前端：

```bash
cd apps/web
npm install
npm run dev
```

测试和构建：

```bash
cd apps/server
npm run test:run
npm run build

cd ../web
npm run test:run
npm run build
```

## 常见问题

### 下载前一定要登录 Steam 吗？

通常需要。请先在“Steam 登录”页完成 SteamCMD 登录。如果账号启用了 Steam Guard，按页面提示完成验证。

### 登录时提示 SteamCMD 正在被占用怎么办？

下载和登录共用同一把 SteamCMD 锁。下载任务可以等待锁，登录操作会快速失败并提示占用。等当前下载结束后再登录即可。

### 内容库显示 Jellyfin 不适用是什么意思？

说明该项目没有检测到可播放视频文件。典型 Wallpaper Engine 场景可能只有 `scene.pkg`，这类内容会生成 `workshop.nfo`，但不会生成 `movie.nfo`。

### 删除记录后磁盘空间没有释放？

默认删除只移除面板记录，不删本地文件。需要在删除确认弹窗里勾选“同时删除本地文件”。即使勾选，也只删除内容库输出目录，不清理 Steam workshop cache。

### 代理应该怎么配？

如果服务器访问 Steam 或创意工坊不稳定，可以在设置页启用代理，或通过 `.env` 设置 `PANEL_DEFAULT_PROXY_ENABLED=true` 和 `PANEL_DEFAULT_PROXY_URL`。代理地址要写成容器可以访问的地址，例如局域网代理 `http://127.0.0.1:7890`。
