# 计分与参数

PMA题1–8，PMSi题9–15，PMSe题16–22；第1、4、5、8题用6-原值。各维按已答题等权均分，范围1–5，不生成总分。每维至多漏1题：PMA至少7题，其余各至少6题；超过则该维不计算。不得把未反向的结构方程分析编码当个人计分。

当前引擎用prorate_if_min_answered配mean实现，数学上保留已答题均分，不放大成总分、不插补。技术prorated标志会为true，result的limited表示信息不完整；任一canonical维不可算时当前报告整体不解释，其他可算分数仍保留。

精确计分事实见[GESIS Scoring](https://zis.gesis.org/s//skala/Rummel-Danner-Kuhlmann-The-short-version-of-the-Meta-cognitive-Prospective-Memory-Inventory-%28MPMI-s%29?lang=en)。该页Standard License素材不作为本包复制源。

本包参数采用原始分数解释，未绑定ReferenceSet或新增经验分档；原德国参考数据不转作中国常模。没有实测阈值不自动阻碍发布；独立参数版本缺口属于功能线，当前不伪造字段。
