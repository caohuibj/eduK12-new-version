import { BarChart3, ClipboardList, FileText, Radio, Settings2 } from 'lucide-react'

export const surveySectionMeta={
  settings:{icon:Settings2,goal:'确认研究的基本信息与采集方式，保存后开始编制工具。',links:[['基本信息','survey-project-basics'],['采集方式','survey-project-collection'],['保存设置','survey-project-save']]},
  tools:{icon:ClipboardList,goal:'编制自己的研究工具，或导入管理员已授权的原版工具。',links:[['自编工具','survey-tool-create'],['授权工具目录','survey-authorized-catalog'],['编辑与试答','survey-tool-editor']]},
  reports:{icon:FileText,goal:'选定测量版本，编制报告内容，再用合成样例检查展示效果。',links:[['创建报告','survey-report-create'],['草稿与版本','survey-report-list'],['编辑与预览','survey-report-editor']]},
  publish:{icon:Radio,goal:'准备波次与知情同意，试答并冻结后，核对就绪再开放采集。',links:[['当前阶段','survey-publish-stage'],['选择波次','survey-wave-list'],['配置与开放','survey-wave-editor']]},
  data:{icon:BarChart3,goal:'先看完成进度与样本质量，再查看统计或按权限导出数据。',links:[['完成进度','survey-data-overview'],['质量复核','survey-data-quality'],['统计分析','survey-data-statistics'],['数据导出','survey-data-export']]},
} as const
