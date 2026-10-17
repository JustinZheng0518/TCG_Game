# 宝可梦卡藏：抽卡与收藏

电脑和手机浏览器都能玩的简体中文宝可梦开包、收藏小游戏，按发行商品/set 的原始代码整理。

- 选择 set，打开一包（5 张）或十包连开（50 张）。
- 新卡自动加入收藏，重复卡累计数量，各 set 显示收藏进度。
- 收藏自动保存在当前浏览器，支持导入、导出 JSON 备份；重复导入不会重复增加数量。
- 可浏览完整卡表，搜索卡名、卡号和稀有度，点击放大卡面。
- 免费娱乐模拟；开包权重是游戏规则，不是实体卡包的官方概率。

- **236 个商品/set、23,250 条卡面记录**，源数据发行日期范围为 2022-10-27 至 2026-10-16。
- 保留同一卡号的普通、闪卡、逆闪等版本；同一卡片可能在多个商品中收录，不把重复收录称为不同卡牌。
- 逐套卡表位于 `data/pokemon/zh-CN/sets/<set-code>/cards.json`。
- 卡图从固定版本的 GitHub 图片源读取；本地下载原图/WebP 后会自动优先使用本地资源。
- 图库页面支持手机、电脑、系列搜索、卡名与卡号搜索、稀有度筛选和原图放大。

完整说明见 [简中卡面库](docs/简中卡面库.md)。历史英文、多语言调研保留在 `data/catalogs/`，不作为简中图库的卡面来源。

## 从 GitHub 运行

本仓库包含游戏代码、完整卡表、图片地址和数据工具。联网游玩不需要先下载几 GB 图片，也不需要 API 密钥或第三方运行依赖。

```bash
git clone https://github.com/JustinZheng0518/TCG_Game.git
cd TCG_Game
python3 -m http.server 8765 --bind 0.0.0.0
```

打开服务根页面即可游玩。使用 HTTP 服务打开，直接双击本地 HTML 会限制 JSON 读取。

也可在 GitHub 仓库 **Settings → Pages → Deploy from a branch** 中选择 **main / (root)** 并保存，作为静态网站发布。本仓库带有 `.nojekyll`，无需构建。推送代码与启用 Pages 是两件事；Pages 是否已启用以仓库设置为准。

收藏保存在当前浏览器，不会自动在电脑和手机之间同步；可通过“导出收藏 / 导入收藏”转移。导入按卡牌保留两份存档中的较大数量，不叠加重复备份。

## 检查游戏逻辑

```bash
node --test tests/game-core.test.cjs
```

## 可选：下载全部图片到本地

需要 Python 3 与 Pillow；原图与源快照需要数 GB 本地空间。

```bash
cd /workspace/TCG_Game
python3 -m venv --system-site-packages /workspace/card-assets-venv
PIP_CACHE_DIR=/workspace/card-source-cache/pip /workspace/card-assets-venv/bin/python -m pip install --disable-pip-version-check -r requirements-assets.txt
/workspace/card-assets-venv/bin/python tools/pokemon_cn.py prepare --workers 4
```

只重建元数据用 `catalog`，检查已归档数量用 `report`。重复整理会校验并复用已有原图和缩略图；遇到不同内容的已有原图会停止，保留用户文件。

来源为 [duanxr/PTCG-CHS-Datasets](https://github.com/duanxr/PTCG-CHS-Datasets)，图片链接固定于提交 `c3b6ac6ef803aad9d60e44d058359addf3a20883`。原图使用来源原生尺寸。本仓库不捆绑原始图片；可选的本地图片缓存被 Git 忽略。

`coverage.json` 与 `image-manifest.json` 保存的是资源整理机器上完成的全量校验证据，不表示新克隆的仓库已经包含原图文件；网页会自动使用 GitHub 图源。
