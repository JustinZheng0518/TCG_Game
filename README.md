# 小小卡店：宝可梦卡牌经营与收藏

电脑、手机都能玩的简体中文卡店经营小游戏。初始资金 ¥3,000，经营未拆封商品和单卡，收集喜欢的卡面。

新版以原创卡店场景为主页，点击画面里的仓库、收银台、展示柜和活动公告板进入对应功能。手机使用底部四区导航，经营明细在小窗口中打开。

- **进货与经营**：供货商进货、保留卡包出售或拆封收藏、买入 / 回收 / 寄售单卡，结算营业日、支付运营费用、提升口碑并扩建柜台。
- **独立获得渠道**：236 套分为常规补充包、特色包、预组、礼盒、赛事活动、任务、特典兑换与组合附属包。活动卡不再一律按五张 RR 包发放。
- **活动和任务**：打理店铺、经营目标、活动券、每日通讯码；官方活动特别包第五弹按 89% / 10% / 1% 工艺配比抽一张。
- **新闻与行情**：官方售价和新闻联网快照、带来源与时间的参考价、明确标注的模拟新闻影响；卡牌详情支持联网查价并手动核对版本，失败回退到模拟估值。
- **收藏和存档**：23,250 条真实简中卡面，按 set 浏览；现金、库存、寄售、报价和收藏一起保存。兼容旧版收藏，支持完整经营备份。

先在卡店打理店铺，或到“任务”窗口使用游戏码 `START-STORE`。进入“采购开包”选系列，可以一键买入并拆封；已有库存会优先使用，只为不足部分付钱。想留货出售则展开“只进货，留在店里卖”。

“收藏卡册”保留卖卡、寄售、保留最后一张的批量卖重复卡，以及完整卡表 / 单卡买入入口。“活动广场”分别进入活动、任务、礼盒和特典渠道。收银柜台中可管理货架和寄售；新闻、任务、账本、升级和存档都可通过场景入口或右上角设置按钮访问。开门营业后显示当天售出数量、回款和运营支出的结算窗口。

所有资金及交易均为游戏模拟。已核实 4 款商品的官方建议零售价，其余商品和未查询单卡使用明确标注的模拟估值；没有默认全量实时简中成交价。外部单卡接口在本次云网络中受限，浏览器可尝试直连，详见 [卡店玩法、调研与行情接入](docs/卡店经营与数据来源.md)。

普通补充包继续使用独立 RR 保底、最高稀有档每包 0.1% 的游戏规则，参见 [概率依据](docs/开包概率说明.md)。特色渠道不使用这套普通包规则。

卡库仍为 **236 个商品/set、23,250 条卡面记录**，包括同一卡号的不同加工版本。完整整理与来源说明见 [简中卡面库](docs/简中卡面库.md)。图片默认从固定提交的 GitHub 图源读取，本地下载后优先使用缓存。

## 从 GitHub 运行

GitHub Pages 地址：<https://justinzheng0518.github.io/TCG_Game/>。网站需要保留路径末尾的 `/TCG_Game/`；首次启用或推送后，请以仓库 Actions 中的部署结果确认发布是否完成。

本仓库包含游戏代码、完整卡表、图片地址和数据工具。联网游玩不需要先下载几 GB 图片，也不需要 API 密钥或第三方运行依赖。

```bash
git clone https://github.com/JustinZheng0518/TCG_Game.git
cd TCG_Game
python3 -m http.server 8765 --bind 0.0.0.0
```

打开服务根页面即可游玩。使用 HTTP 服务打开，直接双击本地 HTML 会限制 JSON 读取。

也可在 GitHub 仓库 **Settings → Pages → Deploy from a branch** 中选择 **main / (root)** 并保存，作为静态网站发布。本仓库带有 `.nojekyll`，无需构建。首次开启后若没有构建记录，可在来源设置正确后向 main 推送一次提交来触发发布。推送代码与部署完成是两件事；发布结果以 Actions / Pages 状态为准。

经营数据保存在当前浏览器，不会自动在电脑和手机之间同步；可通过“导出经营存档 / 恢复经营存档”转移。版本 2 备份经确认后整体恢复；旧版收藏仅合并卡牌，不重置资金。

## 检查游戏逻辑

```bash
node --test tests/*.test.cjs
python3 -m unittest discover -s tests -p 'test_*.py'
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

## 场景与界面资源

原创卡店场景图位于 `web/assets/card-shop-scene.png`，为本项目生成的插画资源并随站点发布；真实卡牌预览继续使用卡库来源。`web/game-scene.js` 与 `web/game-scene.css` 负责游戏场景和窗口，经营存档格式保持版本 2。一键补货拆包采用一次存档写入，失败不会扣款或消耗库存。
