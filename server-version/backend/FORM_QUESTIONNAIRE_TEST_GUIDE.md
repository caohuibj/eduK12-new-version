# 纯Form问卷测试指南

## 测试背景

本次修订允许问卷只包含Form题目（不包含量表）即可发布。本文档提供测试指南以确保功能正常。

## 测试场景

### 1. 后端发布验证测试

#### 测试用例 1.1：纯Form问卷发布
**测试步骤：**
```bash
# 1. 创建问卷
curl -X POST http://localhost:3001/api/general-questionnaires \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"code":"form-test-1","name":"纯Form测试问卷"}'

# 2. 添加Form题目
curl -X POST http://localhost:3001/api/general-questionnaires/{id}/form-items \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"type":"fill_blank","label":"姓名","required":true}'

# 3. 发布问卷（应该成功）
curl -X POST http://localhost:3001/api/general-questionnaires/{id}/publish \
  -H "Authorization: Bearer $TOKEN"
```

**预期结果：** 发布成功，状态变为 `PUBLISHED`

#### 测试用例 1.2：空问卷发布
**测试步骤：**
```bash
# 创建问卷但不添加任何内容
curl -X POST http://localhost:3001/api/general-questionnaires \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"code":"empty-test","name":"空问卷"}'

# 尝试发布
curl -X POST http://localhost:3001/api/general-questionnaires/{id}/publish \
  -H "Authorization: Bearer $TOKEN"
```

**预期结果：** 返回错误"问卷必须包含至少一个量表或表单题目"

### 2. 前端UI测试

#### 测试用例 2.1：前端验证提示
**测试步骤：**
1. 登录教师账号
2. 进入泛化问卷管理页面
3. 创建新问卷
4. 只添加Form题目（不添加量表）
5. 点击"发布"按钮

**预期结果：**
- 发布成功
- 无错误提示
- 问卷状态变为"已发布"

#### 测试用例 2.2：空问卷发布拦截
**测试步骤：**
1. 创建新问卷
2. 不添加任何内容
3. 点击"发布"按钮

**预期结果：** 弹出提示"问卷必须包含至少一个量表或表单题目"

### 3. 问卷作答流程测试

#### 测试用例 3.1：纯Form问卷作答
**测试步骤：**
```bash
# 1. 生成访问令牌
curl -X POST http://localhost:3001/api/general-questionnaires/{id}/tokens \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"expiresDays":30,"maxUses":10}'

# 2. 访问问卷
curl http://localhost:3001/api/public/questionnaires/{token}

# 3. 开始测评
curl -X POST http://localhost:3001/api/public/questionnaires/{token}/start

# 4. 提交Form答案
curl -X PATCH http://localhost:3001/api/public/assessments/{sessionId}/answers \
  -H "Content-Type: application/json" \
  -d '{"answers":[{"formItemId":"xxx","value":"张三"}]}'

# 5. 完成测评
curl -X POST http://localhost:3001/api/public/assessments/{sessionId}/complete
```

**预期结果：**
- 作答流程顺畅
- 可以成功提交答案
- 完成后能查看报告（报告摘要为"您已完成「问卷名称」问卷填写"）

### 4. 数据导出测试

#### 测试用例 4.1：导出纯Form问卷数据
**测试步骤：**
```bash
curl -X POST http://localhost:3001/api/general-questionnaires/{id}/export \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"anonymize":true}'
```

**预期结果：**
- 导出成功
- CSV文件包含所有Form题目字段
- 数据完整且正确

### 5. 报告生成测试

#### 测试用例 5.1：纯Form问卷报告
**测试步骤：**
```bash
# 完成纯Form问卷作答后获取报告
curl http://localhost:3001/api/questionnaire-assessments/{id}/report \
  -H "Authorization: Bearer $TOKEN"
```

**预期结果：**
- 报告生成成功
- `scaleReports` 为空数组
- `totalDimensions` 为 0
- `averageScore` 为 0
- `overallSummary` 为"您已完成「问卷名称」问卷填写"

### 6. 向后兼容性测试

#### 测试用例 6.1：含量表问卷仍然正常
**测试步骤：**
1. 创建包含量表的问卷
2. 发布问卷
3. 完成作答
4. 查看报告

**预期结果：** 所有功能正常，与修订前一致

#### 测试用例 6.2：混合问卷正常
**测试步骤：**
1. 创建包含Form题目和量表的问卷
2. 发布问卷
3. 完成作答
4. 查看报告

**预期结果：** 所有功能正常，报告包含Form答案和量表测评结果

## 测试清单

- [ ] 后端发布验证通过
- [ ] 前端UI验证通过
- [ ] 纯Form问卷可正常作答
- [ ] 数据导出功能正常
- [ ] 报告生成功能正常
- [ ] 向后兼容性测试通过
- [ ] 无错误日志
- [ ] 性能无明显下降

## 注意事项

1. **测试环境：** 建议在测试环境先进行完整测试
2. **数据备份：** 测试前备份重要数据
3. **权限验证：** 确保权限验证逻辑未被破坏
4. **日志监控：** 测试过程中监控错误日志

## 测试报告

测试完成后，请记录：
- 测试日期
- 测试人员
- 测试结果
- 发现的问题
- 解决方案
