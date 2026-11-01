# Matrix stimulus provenance

The committed SVG bank declares procedural generation using matRiks 0.1.5
and is present in candidate source commit `16d9bbaa5fffb424ce463220d6f9f7d3a7280db5`.
Its Git blob is `449f11201500c132d8f68f17fd2151547d9221ec`; the frontend and backend
copies are identical. No external standard-test images were added by this audit.

matRiks: Andrea Brancaccio, Ottavia M. Epifania, Debora de Chiusole.
Copyright 2023 matRiks authors. The package declares **MIT + file LICENSE**:

- [Pinned DESCRIPTION](https://github.com/OttaviaE/matRiks/blob/eb5bd6159bfb006be5823f4959a75d21499a59f1/DESCRIPTION)
- [Pinned LICENSE attribution](https://github.com/OttaviaE/matRiks/blob/eb5bd6159bfb006be5823f4959a75d21499a59f1/LICENSE)
- [Official package](https://cran.r-project.org/package=matRiks)

MIT License

Copyright (c) 2023 matRiks authors

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE.

The package notes that its graphics are based on DescTools, whose program
license is **GPL (>= 2)**. See its [fixed official DESCRIPTION](https://github.com/AndriSignorell/DescTools/blob/820c97ccc00447b2ef17c938ab1a12adbe4b13b3/DESCRIPTION).
The DescTools version used to generate this bank is not recorded; this current
source inspection does not identify the installed historical version.

The source-specific independent review checked both archived R scripts,
matRiks commit `eb5bd6159bfb006be5823f4959a75d21499a59f1` (DESCRIPTION,
MIT LICENSE, figure definitions and draw source), and the existing SVG bank.
Inputs are mathematical geometry parameters. All 264 SVG fragments across the
18 items use polygon/rect and related drawing primitives; no image/text/use
nodes or href/data references were found. The parameterized `pacman()` figure
is not an embedded standard-test image. No restricted external ICAR/Raven/
MaRs-IB item image input was found.

已检查固定生成脚本、生成器图形定义及现存SVG，未发现受限外部题图输入；本批图形按参数化程序生成材料处理，保留生成器署名与许可证。历史R/依赖版本及运行日志缺失，因此不承诺逐字节重建。

The matRiks MIT grant above concerns its software, and DescTools declares
GPL (>=2) for its program. This conclusion is based on the inspected inputs and
source, not on a rule that any output of MIT software automatically becomes a
MIT-licensed image. The historical `internal-generated` label is not a claim that
EduK12 authored matRiks. No generic output-rights HOLD, extra per-SVG license
requirement or historical-dependency-hash gate is introduced.

[Archived source and bank history](provenance/README.md) retain the existing
records. The exact historical R/DescTools/svglite/jsonlite environment and stdout
are missing, so byte-for-byte reconstruction is not promised. These scripts are
not executed by the application, and no package source beyond the archived
project scripts is vendored. These records supply no psychometric norms or
permission for unrelated external test material.

MaRs-IB is an alternative discussed in the literature. Its paper is open access,
but the paper describes its test forms as non-commercial-use materials. Those
forms and private/registered ICAR banks were not fetched or distributed here.
See [Chierchia et al. 2019, section 2.5](https://pmc.ncbi.nlm.nih.gov/articles/PMC6837216/).
