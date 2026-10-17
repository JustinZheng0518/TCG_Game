# 宝可梦简体中文卡面库

为电脑、手机浏览器抽卡游戏准备的真实简体中文卡面，按发行商品/set 的原始代码整理。目前提供卡面浏览与资源整理工具，抽卡玩法尚未实现。

- **236 个商品/set、23,250 条卡面记录**，源数据发行日期范围为 2022-10-27 至 2026-10-16。
- 保留同一卡号的普通、闪卡、逆闪等版本；同一卡片可能在多个商品中收录，不把重复收录称为不同卡牌。
- 逐套卡表位于 `data/pokemon/zh-CN/sets/<set-code>/cards.json`。
- 原图及 WebP 位于 `data/images/pokemon/zh-CN/<set-code>/`，下载与完整性状态见 `data/pokemon/zh-CN/coverage.json`。
- 图库页面支持手机、电脑、系列搜索、卡名与卡号搜索、稀有度筛选和原图放大。

完整说明见 [简中卡面库](docs/简中卡面库.md)。历史英文、多语言调研保留在 `data/catalogs/`，不作为简中图库的卡面来源。

## 整理资源

需要 Python 3 与 Pillow；原图与源快照需要数 GB 本地空间。

```bash
cd /workspace/TCG_Game
python3 -m venv --system-site-packages /workspace/card-assets-venv
PIP_CACHE_DIR=/workspace/card-source-cache/pip /workspace/card-assets-venv/bin/python -m pip install --disable-pip-version-check -r requirements-assets.txt
/workspace/card-assets-venv/bin/python tools/pokemon_cn.py prepare --workers 4
```

只重建元数据用 `catalog`，检查已归档数量用 `report`。重复整理会校验并复用已有原图和缩略图；遇到不同内容的已有原图会停止，保留用户文件。

## 启动浏览页

```bash
cd /workspace/TCG_Game
python3 -m http.server 8765 --bind 0.0.0.0
```

服务根页面为 `index.html`。使用 HTTP 服务打开，浏览器直接打开本地 HTML 文件会限制 JSON 读取。

来源为 [duanxr/PTCG-CHS-Datasets](https://github.com/duanxr/PTCG-CHS-Datasets)，固定提交及完整性证据随目录保存。原始图片保留来源原生尺寸，不用繁体、英文或翻译生成图片充当简体中文卡面。大体积图片与源快照保存在当前工作区，图片目录被 Git 忽略；卡表、索引、工具与浏览页属于仓库文件。
