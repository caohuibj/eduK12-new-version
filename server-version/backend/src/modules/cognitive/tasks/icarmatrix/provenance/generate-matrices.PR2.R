#!/usr/bin/env Rscript
# COG-Intelligence Roadmap v2.0 PR2 — matRiks offline matrix bank generation.
#
# Generates a frozen rule-based matrix bank (2x2 child track + 3x3 standard
# track) as JSON with inline per-cell/response SVGs. R never enters the request
# path: this script runs offline, its output is committed, and PR3's icarmatrix
# v2.0.0 consumes the committed JSON.
#
# Rule system: matRiks (MIT) — Epifania & Brancaccio; generated items are
# internal-authored derivatives (license 'internal-generated', source notes the
# generator). Distractor taxonomy from response_list: correct + r_diag/r_left/
# r_top/wp_copy/wp_matrix/difference/ic_neg/ic_flip/ic_size/ic_inc.
#
# Usage: Rscript generate-matrices.R [--seed N] [--out path.json]
#
# QC gates (fail hard): every item renders 8 cells + 11 responses, all SVGs
# unique and well-formed, rule coverage meets the per-rule minimum.

suppressPackageStartupMessages({
  library(matRiks)
  library(svglite)
  library(jsonlite)
})

args <- commandArgs(trailingOnly = TRUE)
arg_value <- function(flag) {
  idx <- match(flag, args)
  if (is.na(idx) || is.na(args[idx + 1])) NA_character_ else args[idx + 1]
}
seed <- { v <- arg_value("--seed"); if (is.na(v)) 20261031L else as.integer(v) }
out_path <- { v <- arg_value("--out"); if (is.na(v)) {
  script <- sub("^--file=", "", grep("^--file=", commandArgs(FALSE), value = TRUE)[1])
  file.path(dirname(script), "bank-matgen.json")
} else v }

CELL_SVG_IN <- 1.15  # inches per rendered cell/response

to_svg <- function(fig) {
  tmp <- tempfile(fileext = ".svg")
  svglite(tmp, width = CELL_SVG_IN, height = CELL_SVG_IN, standalone = FALSE, pointsize = 6)
  on.exit(unlink(tmp), add = TRUE)
  invisible(draw(fig))
  invisible(dev.off())
  raw <- paste(readLines(tmp, warn = FALSE), collapse = "")
  # 去掉尾随换行，压缩空白，保持单一 <svg> 根。
  gsub("\\s{2,}", " ", raw)
}

render_item <- function(item_id, matrix_type, hrule, vrule, fig_expr, extra_rule_tags) {
  m <- tryCatch(mat_apply(eval(fig_expr), hrule, vrule, mat.type = if (matrix_type == "2x2") 4 else 9),
                error = function(e) NULL)
  if (is.null(m)) return(NULL)
  shown_n <- if (matrix_type == "2x2") 3L else 8L
  cells <- lapply(seq_len(shown_n), function(i) tryCatch(to_svg(m[[i]]), error = function(e) NULL))
  if (any(vapply(cells, is.null, logical(1)))) return(NULL)
  responses_obj <- tryCatch(suppressWarnings(response_list(m, seed = seed + length(items) + 1L)),
                            error = function(e) NULL)
  if (is.null(responses_obj)) return(NULL)
  resp_names <- names(responses_obj)
  if (is.null(resp_names) || resp_names[1] != "correct") return(NULL)
  responses_raw <- lapply(seq_along(responses_obj), function(i) {
    list(name = resp_names[i], svg = tryCatch(to_svg(responses_obj[[i]]), error = function(e) NULL))
  })
  # 去重（退化干扰项如单图形的 ic_inc 会与其它响应同图）；correct 必须保留。
  seen_svgs <- character(0)
  responses <- list()
  for (r in responses_raw) {
    if (is.null(r$svg)) next
    if (r$svg %in% seen_svgs) next
    seen_svgs <- c(seen_svgs, r$svg)
    responses <- append(responses, list(r))
  }
  # K12 呈现需要 1 正确 + ≥6 可用干扰项。
  if (length(responses) < 7L) return(NULL)
  list(
    itemId = item_id,
    matrixType = matrix_type,
    hrules = hrule,
    vrules = vrule,
    ruleTags = as.list(unique(c(hrule, vrule, extra_rule_tags))),
    cells = unlist(cells, use.names = FALSE),
    responses = responses,
    correctResponseIndex = 0L
  )
}

qc_item <- function(item) {
  if (length(item$cells) != (if (item$matrixType == "2x2") 3L else 8L)) stop("cell count mismatch")
  if (length(item$responses) < 7L) stop("usable response count < 7")
  if (!all(vapply(c(item$cells, item$responses[[1]]$svg), function(s) grepl("^<svg", s), logical(1)))) stop("malformed svg")
  response_svgs <- vapply(item$responses, function(r) r$svg, character(1))
  if (anyDuplicated(response_svgs)) stop("duplicate response svg (degenerate distractor)")
  TRUE
}

items <- list()
failures <- character(0)
add_item <- function(item) {
  if (is.null(item)) return(FALSE)
  ok <- tryCatch({ qc_item(item); TRUE }, error = function(e) { failures <<- c(failures, paste(item$itemId, conditionMessage(e))); FALSE })
  if (ok) { items <<- append(items, list(item)); invisible(TRUE) } else invisible(FALSE)
}

plan_id <- function(i, matrix_type, hrule, vrule) sprintf("matgen-%s-%s-%s-%03d", if (matrix_type == "2x2") "child" else "std", hrule, vrule, i)

counter <- new.env(parent = emptyenv()); counter$n <- 0L
emit <- function(matrix_type, hrule, vrule, fig_expr, extra_tags = character(0)) {
  counter$n <- counter$n + 1L
  item <- render_item(plan_id(counter$n, matrix_type, hrule, vrule), matrix_type, hrule, vrule, fig_expr, extra_tags)
  cat("DEBUG plan", counter$n, matrix_type, hrule, vrule, "item_null=", is.null(item), "\n")
  add_item(item)
}

set.seed(seed)

# ---- 3x3 standard track（青少年/成人）：规则轴覆盖 shape / rotate / shade ----
shapes3 <- quote(cof(square(), circle(), triangle()))
emit("3x3", "shape", "shape", shapes3)
emit("3x3", "shape", "identity", shapes3)
emit("3x3", "identity", "shape", shapes3)
emit("3x3", "shade", "shade", quote(size(malta(), 3)))
emit("3x3", "shade", "identity", quote(size(malta(), 3)))
emit("3x3", "rotate", "rotate", quote(pacman()))
emit("3x3", "rotate", "identity", quote(pacman()))
emit("3x3", "identity", "rotate", quote(pacman()))
emit("3x3", "shade", "rotate", quote(pacman()))
emit("3x3", "shape", "rotate", shapes3)

# ---- 2x2 child track（儿童）：双值规则，尽量覆盖 rotate / shade / size ----
emit("2x2", "rotate", "rotate", quote(cof(pacman(), lily())))
emit("2x2", "rotate", "identity", quote(pacman()))
emit("2x2", "identity", "rotate", quote(pacman()))
emit("2x2", "shade", "shade", quote(size(malta(), 3)))
emit("2x2", "shade", "identity", quote(size(malta(), 3)))
emit("2x2", "size", "size", quote(cof(size(square(), 2), size(circle(), 2))))
emit("2x2", "size", "identity", quote(size(square(), 2)))
emit("2x2", "rotate", "shade", quote(pacman()))

# ---- QC：规则覆盖矩阵 ----
required_min <- c("3x3" = 6, "2x2" = 4)
coverage <- table(vapply(items, function(i) i$matrixType, character(1)))
rule_cov <- table(unlist(lapply(items, function(i) i$ruleTags)))
if (length(items) < 12) stop(sprintf("only %d items generated; failures: %s", length(items), paste(failures, collapse = " | ")))
if (!all(coverage[c("3x3", "2x2")] >= required_min[c("3x3", "2x2")])) stop(sprintf("matrix-type coverage too low: %s", paste(coverage, collapse = ",")))
if (!all(rule_cov >= 2)) stop(sprintf("rule coverage too low: %s", paste(utils::capture.output(print(rule_cov)), collapse = " ")))

payload <- list(
  schemaVersion = 1L,
  generator = paste0("matRiks ", as.character(packageVersion("matRiks")), " (MIT); offline pipeline generate-matrices.R"),
  seed = seed,
  generatedAtUtc = format(as.POSIXct(Sys.time(), tz = "UTC"), "%Y-%m-%dT%H:%M:%SZ", usetz = FALSE),
  provenance = "Generated offline for EduK12 internal use; rule system MIT-licensed matRiks; items are internal-authored derivatives, not copies of any published test.",
  coverage = list(
    byMatrixType = as.list(coverage),
    byRuleTag = as.list(rule_cov),
    failedPlans = failures
  ),
  items = items
)

writeLines(jsonlite::toJSON(payload, auto_unbox = TRUE, pretty = TRUE, null = "null"), out_path)
cat(sprintf("items=%d (3x3=%d, 2x2=%d) rules=%s failedPlans=%d -> %s (%.1f KB)\n",
            length(items), coverage[["3x3"]], coverage[["2x2"]],
            paste(names(rule_cov), collapse = "/"), length(failures),
            out_path, file.info(out_path)$size / 1024))
