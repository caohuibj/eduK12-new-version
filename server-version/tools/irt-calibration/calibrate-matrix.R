#!/usr/bin/env Rscript
# COG-Intelligence Roadmap v2.0 PR5 — IRT 标定管线（离线；R 不进请求链路）。
#
# 两种模式：
#   --simulate                    参数恢复仿真：从已知 2PL 参数生成合成作答 →
#                                 标定 → 校验回收精度（fail-hard）。当前没有
#                                 真实数据集时的管线正确性验证方式。
#   --input matrix.json           标定真实/试测数据（interchange 格式见
#                                 response-matrix schema；由 PR4 数据集转换器产出）。
#
# 产物：calibration snapshot JSON（calibrationVersion 独立管理，只追加、
# 不覆盖原始作答）。status=SIMULATION_ONLY 的快照不得用于任何被试报告。

suppressPackageStartupMessages({
  library(mirt)
  library(jsonlite)
})

args <- commandArgs(trailingOnly = TRUE)
arg_value <- function(flag) {
  idx <- match(flag, args)
  if (is.na(idx) || is.na(args[idx + 1])) NA_character_ else args[idx + 1]
}
has_flag <- function(flag) !is.na(match(flag, args))

simulate_mode <- has_flag("--simulate")
input_path <- arg_value("--input")
seed <- { v <- arg_value("--seed"); if (is.na(v)) 20261031L else as.integer(v) }
n_persons <- { v <- arg_value("--persons"); if (is.na(v)) 1000L else as.integer(v) }
n_items <- { v <- arg_value("--items"); if (is.na(v)) 20L else as.integer(v) }
out_path <- { v <- arg_value("--out"); if (is.na(v)) {
  script <- sub("^--file=", "", grep("^--file=", commandArgs(FALSE), value = TRUE)[1])
  file.path(dirname(script), "calibration-snapshot.json")
} else v }
calibration_version <- { v <- arg_value("--calibration-version"); if (is.na(v)) "cal-matgen-v0.1.0-sim" else v }
script_dir <- dirname(sub("^--file=", "", grep("^--file=", commandArgs(FALSE), value = TRUE)[1]))

# ---- 模式一：参数恢复仿真 ----
run_simulation <- function() {
  set.seed(seed)
  true_a <- pmin(2.5, pmax(0.5, rnorm(n_items, mean = 1.3, sd = 0.35)))
  true_b <- pmin(2.5, pmax(-2.5, rnorm(n_items, mean = 0, sd = 1)))
  theta <- rnorm(n_persons)
  # 2PL ICC：P(correct) = logistic(a * (theta - b))
  probs <- matrix(0, nrow = n_persons, ncol = n_items)
  for (j in seq_len(n_items)) probs[, j] <- 1 / (1 + exp(-true_a[j] * (theta - true_b[j])))
  responses <- matrix(runif(n_persons * n_items), nrow = n_persons, ncol = n_items) < probs
  storage.mode(responses) <- "integer"

  fit <- mirt(data = as.data.frame(responses), model = 1, itemtype = "2PL", SE = TRUE, verbose = FALSE)
  coef_list <- coef(fit, IRTpars = TRUE, simplify = TRUE)$items
  est_a <- coef_list[, "a"]
  est_b <- coef_list[, "b"]

  # 回收精度：皮尔逊相关 + b 的 RMSE（N=1000/K=20 下常用门槛）
  r_a <- suppressWarnings(cor(true_a, est_a))
  r_b <- suppressWarnings(cor(true_b, est_b))
  rmse_b <- sqrt(mean((est_b - true_b)^2))
  if (is.na(r_a) || r_a < 0.8) stop(sprintf("parameter recovery too low for a: r=%.3f (need >= 0.8)", r_a))
  if (is.na(r_b) || r_b < 0.9) stop(sprintf("parameter recovery too low for b: r=%.3f (need >= 0.9)", r_b))
  if (rmse_b > 0.4) stop(sprintf("b RMSE too high: %.3f (need <= 0.4)", rmse_b))

  se <- coef_list  # simplify 输出含 SE 列（a (SE) / b (SE)）
  items <- lapply(seq_len(n_items), function(j) {
    list(
      itemId = sprintf("sim-%03d", j),
      a = round(est_a[j], 4), b = round(est_b[j], 4),
      trueA = round(true_a[j], 4), trueB = round(true_b[j], 4)
    )
  })
  list(
    snapshot = list(
      schemaVersion = 1L,
      calibrationVersion = calibration_version,
      status = "SIMULATION_ONLY",
      model = "2PL",
      estimation = paste0("mirt ", as.character(packageVersion("mirt")), " (MMLE), offline"),
      seed = seed,
      sample = list(n = n_persons, itemCount = n_items, population = "theta ~ N(0,1) (simulated)"),
      items = items,
      diagnostics = list(
        parameterRecovery = list(
          rA = round(r_a, 4), rB = round(r_b, 4), rmseB = round(rmse_b, 4),
          thresholds = list(rA = 0.8, rB = 0.9, rmseB = 0.4)
        )
      ),
      generatedAtUtc = format(as.POSIXct(Sys.time(), tz = "UTC"), "%Y-%m-%dT%H:%M:%SZ"),
      provenance = "SIMULATION ONLY: parameters recovered from synthetic responses; this snapshot must never feed participant reports or reference bands. Real calibration awaits the roadmap-B1 pilot sample."
    ),
    recovery = list(rA = r_a, rB = r_b, rmseB = rmse_b)
  )
}

# ---- 模式二：真实/试测数据标定 ----
run_calibration <- function() {
  payload <- fromJSON(input_path, simplifyVector = FALSE)
  stopifnot(payload$schemaVersion == 1L)
  item_ids <- unlist(payload$itemIds)
  # persons × items 的 0/1 矩阵（NA 允许，mirt 按缺失处理）
  resp <- as.data.frame(matrix(unlist(payload$responses), nrow = length(payload$personIds), byrow = TRUE))
  names(resp) <- item_ids
  storage.mode(resp) <- "integer"
  fit <- mirt(data = resp, model = 1, itemtype = "2PL", SE = TRUE, verbose = FALSE)
  coef_list <- coef(fit, IRTpars = TRUE, simplify = TRUE)$items
  # CTT 项目统计
  p_values <- colMeans(resp, na.rm = TRUE)
  item_total <- vapply(seq_len(ncol(resp)), function(j) {
    rest <- rowSums(resp[, -j, drop = FALSE])
    suppressWarnings(cor(resp[, j], rest, use = "pairwise.complete.obs"))
  }, numeric(1))
  items <- lapply(seq_len(ncol(resp)), function(j) {
    list(
      itemId = item_ids[j],
      a = round(coef_list[j, "a"], 4), b = round(coef_list[j, "b"], 4),
      pCorrect = round(p_values[j], 4),
      itemTotalR = if (is.na(item_total[j])) NULL else round(item_total[j], 4)
    )
  })
  list(
    snapshot = list(
      schemaVersion = 1L,
      calibrationVersion = calibration_version,
      status = { v <- arg_value("--status"); if (is.na(v)) "PILOT_CALIBRATED" else v },
      model = "2PL",
      estimation = paste0("mirt ", as.character(packageVersion("mirt")), " (MMLE), offline"),
      sample = list(n = nrow(resp), itemCount = ncol(resp), population = payload$sampleDescription %||% "unspecified"),
      items = items,
      diagnostics = list(
        m2 = tryCatch({ m2(fit) }, error = function(e) NULL),
        note = "DIF/local-dependence checks per roadmap B2 are required before status can advance to VALIDATED."
      ),
      generatedAtUtc = format(as.POSIXct(Sys.time(), tz = "UTC"), "%Y-%m-%dT%H:%M:%SZ"),
      provenance = paste0("Calibrated from item-level research dataset (dataOrigin=", payload$dataOrigin, "); raw responses are never overwritten.")
    ),
    recovery = NULL
  )
}

`%||%` <- function(a, b) if (is.null(a)) b else a

result <- if (simulate_mode) run_simulation() else run_calibration()
writeLines(jsonlite::toJSON(result$snapshot, auto_unbox = TRUE, pretty = TRUE, null = "null"), out_path)
if (!is.null(result$recovery)) {
  cat(sprintf("recovery: r(a)=%.3f r(b)=%.3f RMSE(b)=%.3f -> %s\n",
              result$recovery$rA, result$recovery$rB, result$recovery$rmseB, out_path))
} else {
  cat(sprintf("calibrated %d items -> %s\n", length(result$snapshot$items), out_path))
}
