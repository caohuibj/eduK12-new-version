# Scale 声明式报告内容

本底座让每个量表版本在自己的目录声明报告版本、标签与原创配图，不再为每份量表修改共享运行时映射。它不改变计分、参数解析、授权或被试入场流程。

## 目录与身份

- 默认报告版本：同一版本 `source.json` 的 `executable.definition.report`
- 可选报告版本：`server-version/backend/src/modules/scale/instruments/<instrumentKey>/<instrumentVersion>/report-variants.json`
- 配图清单：`server-version/frontend/src/scale-report-artwork/<instrumentKey>/<instrumentVersion>/<reportVersion>/report-artwork.json`
- 图片：与清单同目录的普通 `.webp` 文件
- 标签：继续使用同一份 `source.json` 的 `catalog.construct.constructOverlapTags`；修改标签时递增 `catalogManifestVersion`，不建立第二套标签事实源。

`report.artworkKey` 必须严格等于 `<instrumentKey>/<instrumentVersion>/<reportVersion>`。管理员仍在授权时选择报告版本；选中的报告定义和 `artworkKey` 随组合一起冻结。被试作答与提交不查询配图清单，也不增加授权或有效期 gate。

## 配图清单

```json
{
  "schemaVersion": 1,
  "artworkKey": "example_scale/1.0.0/1.1.0",
  "hero": {
    "file": "hero.webp",
    "alt": "帮助读者理解这份报告的主题插画。",
    "width": 1200,
    "height": 800
  },
  "bands": [
    {
      "scoreKey": "total",
      "bandKey": "low",
      "file": "low.webp",
      "alt": "提醒从一个可完成的小行动开始。",
      "width": 512,
      "height": 512
    }
  ]
}
```

`hero` 可以省略，`bands` 可以为空，但二者不能同时没有内容。同一张图片可以服务多个 `scoreKey` 的同名分档；每个 `scoreKey + bandKey` 只能声明一次，而且必须是该报告版本实际会产生的分档。图片只参与展示，不定义阈值或重新计算分数。

## 不可变与兼容规则

- 已存在的 report variant 不改写、不删除；润色时追加新的 `key` 和 `reportVersion`。
- 已提交的配图目录、清单和 WebP 不原位替换；配图修订跟随新的 `reportVersion` 新建目录。
- 因此，已经授权或已经入场的结果继续使用其冻结的报告版本与配图身份；新授权才可选择新增版本。
- 报告材料仍绑定原 C/P 哈希，并继续通过来源、计分 fixture、参数分档、受众和报告模板兼容检查。STANDARD 量表不能借配图或报告材料绕过 `referencePolicy`，也不能使用被禁止的自编原始分反馈。

## 生成与定向检查

新增 `report-variants.json` 后运行：

```bash
cd server-version/backend
npm run scale:instruments:generate
npm run scale:instruments:check
```

生成器维护 `report-variants.generated.ts`；不要手工编辑中央注册表。轻量 Scale 内容门禁会核对精确 Git 候选、C/P 哈希、报告兼容、追加历史、配图路径、真实分档、WebP 尺寸及未引用文件。它不签发科学审定、版权批准、发布或部署资格。
