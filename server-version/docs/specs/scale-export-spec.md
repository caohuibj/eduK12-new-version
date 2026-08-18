# 心理测评数据导出功能 - 规格文档

> 版本: v1.0 | 日期: 2026-03-25

---

## 一、功能概述

为教师端提供心理测评数据导出功能，支持导出为 SPSS .sav 格式，便于进行专业统计分析。

---

## 二、需求分析

### 2.1 核心需求

| 需求 | 说明 |
|------|------|
| 导出格式 | SPSS .sav 格式 |
| 数据格式 | 宽表格式（每行一个被试，每列一个变量） |
| 字段命名 | 中文转拼音，取前8个字符 |
| 反向计分 | 自动处理反向题目的分数转换 |

### 2.2 宽表结构设计

```
┌──────────────────────────────────────────────────────────────────────────┐
│ 导出宽表结构                                                              │
├──────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  基础信息字段                    题目得分字段                   维度得分字段  │
│  ┌─────────────────┐           ┌─────────────────┐         ┌───────────┐ │
│  │ id              │           │ Q1_waixiangxing │         │ D_waixiang│ │
│  │ user_id         │           │ Q2_shenjingzhi  │         │ D_shenjing│ │
│  │ user_name       │           │ Q3_kaifangxing  │         │ D_kaifang │ │
│  │ gender          │           │ Q4_yirenxing    │         │ D_yiren   │ │
│  │ age             │           │ Q5_jinzerenxing │         │ D_jinze   │ │
│  │ completed_at    │           │ ...             │         │ ...       │ │
│  │ total_time      │           │                 │         │           │ │
│  └─────────────────┘           └─────────────────┘         └───────────┘ │
│                                                                          │
└──────────────────────────────────────────────────────────────────────────┘
```

---

## 三、导出注意事项清单

### 3.1 数据处理类

| 问题 | 解决方案 | 优先级 |
|------|----------|--------|
| **反向计分处理** | 根据 `scale_items.reverse` 字段，使用 `points + 1 - value` 公式转换 | P0 |
| **缺失值处理** | 未作答题目导出为 SPSS 缺失值（.）或指定值（如 -1） | P0 |
| **数据类型一致性** | 数值型字段确保为整数，避免浮点数导致的精度问题 | P1 |
| **日期格式转换** | 日期转为 SPSS 支持的格式（YYYY-MM-DD 或时间戳） | P1 |

### 3.2 字段命名类

| 问题 | 解决方案 | 优先级 |
|------|----------|--------|
| **中文字段名** | 使用拼音转换库，取前8个字符 | P0 |
| **字段名冲突** | 添加前缀区分：Q_（题目）、D_（维度）、U_（用户） | P0 |
| **特殊字符** | 移除空格、特殊符号，仅保留字母数字下划线 | P0 |
| **字段名长度** | SPSS 字段名最长 64 字节，我们限制 8 字符保证安全 | P1 |

### 3.3 用户隐私类

| 问题 | 解决方案 | 优先级 |
|------|----------|--------|
| **用户标识脱敏** | 提供选项：导出真实信息/脱敏ID/匿名编号 | P0 |
| **敏感信息过滤** | 默认不导出联系方式等敏感字段 | P1 |
| **导出日志记录** | 记录导出操作，便于审计 | P1 |

### 3.4 数据完整性类

| 问题 | 解决方案 | 优先级 |
|------|----------|--------|
| **不完整测评** | 提供选项：仅导出已完成/包含进行中 | P0 |
| **进度过滤** | 支持按完成进度筛选（如 ≥80% 视为有效） | P1 |
| **时间范围筛选** | 支持按完成时间范围筛选数据 | P1 |
| **质量标记** | 可选导出数据质量标记（如作答时间异常） | P2 |

### 3.5 导出性能类

| 问题 | 解决方案 | 优先级 |
|------|----------|--------|
| **大数据量** | 分批处理，支持异步导出 | P1 |
| **超时处理** | 后台任务队列，完成后通知下载 | P1 |
| **内存占用** | 流式写入，避免内存溢出 | P2 |

### 3.6 格式兼容类

| 问题 | 解决方案 | 优先级 |
|------|----------|--------|
| **SPSS 版本** | 使用标准 SPSS 保存格式，兼容各版本 | P0 |
| **编码问题** | 使用 UTF-8 编码，SPSS 20+ 支持 | P0 |
| **变量标签** | 为每个变量添加中文标签，保留原始含义 | P1 |
| **值标签** | 为分类型变量添加值标签（如性别：1=男，2=女） | P1 |

---

## 四、技术方案

### 4.1 依赖安装

```bash
cd backend
npm install pinyin-pro @penggy/sav-writer
```

- `pinyin-pro`：拼音转换库，准确率高
- `@penggy/sav-writer`：SPSS .sav 文件写入库

### 4.2 字段命名规则

```typescript
// 命名规则
const FIELD_RULES = {
  USER_PREFIX: 'U_',      // 用户字段前缀
  QUESTION_PREFIX: 'Q_',  // 题目字段前缀
  DIMENSION_PREFIX: 'D_', // 维度字段前缀
  MAX_LENGTH: 8,          // 最大字段名长度
}

// 示例转换
const examples = {
  '用户ID': 'U_yonghuid',
  '外向性第1题': 'Q_waixian1',
  '神经质': 'D_shenjing',
}
```

### 4.3 反向计分处理

```typescript
/**
 * 应用反向计分
 * @param value 原始分值
 * @param reverse 是否反向计分
 * @param points 量表点数（如 5 点量表）
 */
function applyReverseScore(value: number, reverse: boolean, points: number): number {
  if (!reverse) return value
  return points + 1 - value
}

// 示例：5 点量表，原值 5，反向后为 1
// 示例：5 点量表，原值 1，反向后为 5
```

### 4.4 宽表数据结构

```typescript
interface ExportRow {
  // 用户基础信息
  U_id: string           // 用户ID（或脱敏ID）
  U_name?: string        // 用户姓名（可选）
  U_gender?: number      // 性别编码
  U_age?: number         // 年龄
  U_time?: number        // 完成用时（秒）
  U_date?: string        // 完成日期
  
  // 题目得分（动态生成）
  [Q_xxx: string]: number | null  // 题目得分，已处理反向计分
  
  // 维度得分（动态生成）
  [D_xxx: string]: number | null  // 维度得分
}
```

---

## 五、API 设计

### 5.1 导出接口

```http
POST /api/scales/:scaleId/export
Content-Type: application/json
Authorization: Bearer {token}

{
  "format": "sav",                    // 导出格式：sav/csv/xlsx
  "options": {
    "anonymize": true,                // 是否脱敏
    "includeProgress": false,         // 是否包含进行中
    "minProgress": 100,               // 最低完成进度
    "dateRange": {                    // 时间范围
      "start": "2026-01-01",
      "end": "2026-03-25"
    },
    "includeLabels": true,            // 是否包含变量标签
    "includeDemographics": true       // 是否包含用户人口学信息
  }
}

Response:
{
  "code": 0,
  "data": {
    "downloadUrl": "/api/exports/{taskId}/download",
    "fileName": "scale_export_20260325.sav",
    "recordCount": 150,
    "fieldCount": 32
  }
}
```

### 5.2 导出预览接口

```http
GET /api/scales/:scaleId/export/preview

Response:
{
  "code": 0,
  "data": {
    "fields": [
      { "name": "U_id", "label": "用户ID", "type": "string" },
      { "name": "Q_waixian1", "label": "外向性第1题", "type": "numeric" }
    ],
    "sampleData": [...],
    "recordCount": 150
  }
}
```

---

## 六、开发任务清单

### Task 1: 安装依赖

**目标**: 安装拼音转换和 SPSS 写入依赖

**步骤**:
| 步骤 | 操作 |
|------|------|
| 1.1 | 安装 pinyin-pro |
| 1.2 | 安装 @penggy/sav-writer 或备选方案 |

**检验标准**:
- [ ] 依赖安装成功
- [ ] TypeScript 类型支持

---

### Task 2: 字段命名服务

**目标**: 实现中文转拼音的字段命名服务

**步骤**:
| 步骤 | 操作 | 文件 |
|------|------|------|
| 2.1 | 创建字段命名服务 | `backend/src/services/exportService.ts` |
| 2.2 | 实现拼音转换函数 | `backend/src/services/exportService.ts` |
| 2.3 | 实现字段名去重逻辑 | `backend/src/services/exportService.ts` |

**检验标准**:
- [ ] "外向性" → "waixian"
- [ ] "神经质" → "shenjing"
- [ ] 重复字段名自动加序号

---

### Task 3: 反向计分处理

**目标**: 在导出时正确处理反向计分题目

**步骤**:
| 步骤 | 操作 | 文件 |
|------|------|------|
| 3.1 | 实现反向计分转换函数 | `backend/src/services/exportService.ts` |
| 3.2 | 加载题目的 reverse 属性 | - |

**检验标准**:
- [ ] 5 点量表，原值 5，反向后为 1
- [ ] 非反向题目保持原值

---

### Task 4: SPSS 导出服务

**目标**: 实现生成 .sav 文件的核心逻辑

**步骤**:
| 步骤 | 操作 | 文件 |
|------|------|------|
| 4.1 | 创建导出服务 | `backend/src/services/exportService.ts` |
| 4.2 | 实现宽表数据组装 | `backend/src/services/exportService.ts` |
| 4.3 | 实现 .sav 文件生成 | `backend/src/services/exportService.ts` |

**检验标准**:
- [ ] 生成的 .sav 文件可被 SPSS 正确打开
- [ ] 变量标签正确显示
- [ ] 数值类型正确

---

### Task 5: 导出 API

**目标**: 实现导出相关的后端接口

**步骤**:
| 步骤 | 操作 | 文件 |
|------|------|------|
| 5.1 | 添加导出控制器 | `backend/src/controllers/scaleController.ts` |
| 5.2 | 添加导出路由 | `backend/src/routes/scales.ts` |
| 5.3 | 添加预览接口 | `backend/src/controllers/scaleController.ts` |

**检验标准**:
- [ ] 导出接口返回正确的下载链接
- [ ] 权限验证正确
- [ ] 文件下载成功

---

### Task 6: 前端导出界面

**目标**: 在量表管理页面添加导出功能入口

**步骤**:
| 步骤 | 操作 | 文件 |
|------|------|------|
| 6.1 | 添加导出按钮 | `frontend/src/pages/ScaleList.tsx` |
| 6.2 | 创建导出配置弹窗 | `frontend/src/components/ExportModal.tsx` |
| 6.3 | 实现下载功能 | `frontend/src/pages/ScaleList.tsx` |

**检验标准**:
- [ ] 导出按钮显示正确
- [ ] 配置选项可用
- [ ] 下载功能正常

---

### Task 7: 测试与验证

**目标**: 端到端测试导出功能

**步骤**:
| 步骤 | 操作 |
|------|------|
| 7.1 | 使用真实数据导出测试 |
| 7.2 | SPSS 软件验证文件 |
| 7.3 | 验证反向计分正确性 |

**检验标准**:
- [ ] SPSS 可正常打开导出文件
- [ ] 字段名正确
- [ ] 反向计分正确
- [ ] 缺失值正确标记

---

## 七、备选方案

如果 `@penggy/sav-writer` 不可用，可考虑：

| 方案 | 说明 |
|------|------|
| **方案 A** | 使用 Python 调用 `pyreadstat` 库生成 .sav，Node.js 通过子进程调用 |
| **方案 B** | 先导出为 CSV，附带 SPSS 语法文件(.sps)，用户在 SPSS 中导入 |
| **方案 C** | 导出为 Excel 格式，SPSS 可直接导入 Excel |

---

## 八、文件变更清单

| 文件 | 变更类型 | 说明 |
|------|----------|------|
| `backend/package.json` | 修改 | 添加依赖 |
| `backend/src/services/exportService.ts` | 新增 | 导出服务 |
| `backend/src/controllers/scaleController.ts` | 修改 | 添加导出接口 |
| `backend/src/routes/scales.ts` | 修改 | 添加路由 |
| `frontend/src/pages/ScaleList.tsx` | 修改 | 添加导出按钮 |
| `frontend/src/components/ExportModal.tsx` | 新增 | 导出配置弹窗 |

---

请确认这份规格文档是否完整，确认后我们开始执行开发。
