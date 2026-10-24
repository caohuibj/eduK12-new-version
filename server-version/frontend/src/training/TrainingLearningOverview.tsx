import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ArrowRight, CalendarClock, CheckCheck, ClipboardList, MessageSquareText, RefreshCw, X } from 'lucide-react';
import apiClient from '../api/client';
import './training-learning-overview.css';
type Kind = 'ALL' | 'ASSIGNMENT' | 'CHECKIN' | 'ASSESSMENT';
type View = 'todo' | 'feedback';
type Row = {
    key: string;
    kind: Exclude<Kind, 'ALL'>;
    typeLabel: string;
    title: string;
    courses: {
        id: string;
        title: string;
    }[];
    state: string;
    stateLabel: string;
    deadline: string | null;
    updatedAt: string | null;
    href: string;
    action: string;
};
export type LearningPage = {
    summary: {
        todo: number;
        feedback: number;
    };
    counts: Record<Kind, number>;
    list: Row[];
    total: number;
    page: number;
    pageSize: number;
    generatedAt: string;
};
const formatTime = (value: string) => { const date = new Date(value); return Number.isNaN(date.getTime()) ? '' : new Intl.DateTimeFormat('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(date); };
const failure = (cause: unknown) => cause && typeof cause === 'object' && 'message' in cause && typeof cause.message === 'string' ? cause.message : '学习概览暂时无法读取，请重试';
export default function TrainingLearningOverview({ refreshKey = 0, courseHeading, courseAction }: {
    refreshKey?: number;
    courseHeading?: ReactNode;
    courseAction?: ReactNode;
}) {
    const [params, setParams] = useSearchParams();
    const selected = params.get('learning'), expanded = selected === 'todo' || selected === 'feedback';
    const view: View = selected === 'feedback' ? 'feedback' : 'todo';
    const rawKind = params.get('learningKind'), kind: Kind = ['ASSIGNMENT', 'ASSESSMENT', ...(view === 'todo' ? ['CHECKIN'] : [])].includes(rawKind ?? '') ? rawKind as Kind : 'ALL';
    const rawPage = Number(params.get('learningPage')), page = Number.isInteger(rawPage) && rawPage > 0 && rawPage <= 100000 ? rawPage : 1;
    const [result, setResult] = useState<LearningPage | null>(null), [summary, setSummary] = useState<LearningPage['summary'] | null>(null), [loading, setLoading] = useState(true), [error, setError] = useState(''), [retry, setRetry] = useState(0);
    const cache = useRef(new Map<string, LearningPage>()), heading = useRef<HTMLHeadingElement>(null);
    useEffect(() => { cache.current.clear(); }, [refreshKey, retry]);
    useEffect(() => {
        let active = true;
        const key = [view, kind, page].join(':');
        setError('');
        setResult(null);
        const saved = cache.current.get(key);
        if (saved) {
            setResult(saved);
            setSummary(saved.summary);
            setLoading(false);
            return;
        }
        setLoading(true);
        void apiClient.get<LearningPage>('/courses/my/learning-inbox?view=' + view + '&kind=' + kind + '&page=' + page + '&pageSize=6').then(response => {
            if (!active)
                return;
            const data = response.data;
            if (response.code !== 0 || !data || !Array.isArray(data.list) || !Number.isSafeInteger(data.summary?.todo) || !Number.isSafeInteger(data.summary?.feedback) || !Number.isSafeInteger(data.total) || data.total < 0 || data.summary.todo < 0 || data.summary.feedback < 0 || data.page !== page || data.pageSize !== 6 || data.list.some(row => !row.href.startsWith('/student/')))
                throw Error(response.message || '学习概览数据不完整，请重试');
            cache.current.set(key, data);
            if (cache.current.size > 30)
                cache.current.delete(cache.current.keys().next().value!);
            setResult(data);
            setSummary(data.summary);
        }).catch(cause => { if (active) {
            setError(failure(cause));
            setSummary(null);
        } }).finally(() => { if (active)
            setLoading(false); });
        return () => { active = false; };
    }, [view, kind, page, refreshKey, retry]);
    useEffect(() => { if (expanded)
        heading.current?.focus(); }, [expanded, view]);
    const change = (next: View | null, nextKind: Kind = 'ALL', nextPage = 1) => setParams(current => {
        const query = new URLSearchParams(current);
        for (const key of ['learning', 'learningKind', 'learningPage'])
            query.delete(key);
        if (next) {
            query.set('learning', next);
            if (nextKind !== 'ALL')
                query.set('learningKind', nextKind);
            if (nextPage > 1)
                query.set('learningPage', String(nextPage));
        }
        return query;
    });
    const filters: [
        Kind,
        string
    ][] = view === 'todo' ? [['ALL', '全部'], ['ASSIGNMENT', '练习'], ['CHECKIN', '打卡'], ['ASSESSMENT', '测评']] : [['ALL', '全部'], ['ASSIGNMENT', '练习评语'], ['ASSESSMENT', '测评结果']];
    const maxPage = Math.max(1, Math.ceil((result?.total ?? 0) / 6));
    useEffect(() => {
        if (result && page > Math.max(1, Math.ceil(result.total / 6))) {
            setParams(current => { const next = new URLSearchParams(current); next.delete('learningPage'); return next; }, { replace: true });
        }
    }, [result, page, setParams]);
    return <section className="learning-overview" aria-label="学习概览">
  <header className={"learning-overview-header" + (courseHeading ? " learning-overview-header--courses" : "")}>
  {courseHeading}
  <div className="learning-shortcuts">
   <button type="button" className="learning-shortcut learning-shortcut--todo" aria-expanded={expanded && view === 'todo'} aria-controls={expanded && view === 'todo' ? 'learning-inbox-panel' : undefined} onClick={() => change(expanded && view === 'todo' ? null : 'todo')}>
    <span className="learning-shortcut-top"><span className="learning-shortcut-icon"><ClipboardList size={21} aria-hidden="true"/></span><ArrowRight size={19} aria-hidden="true"/></span>
    <span className="learning-shortcut-title">待办任务<span className="learning-shortcut-count">{summary?.todo ?? '—'}<small>项</small></span></span><span className="learning-shortcut-description">跨课程汇总 · 练习、打卡与测评</span>
   </button>
   <button type="button" className="learning-shortcut learning-shortcut--feedback" aria-expanded={expanded && view === 'feedback'} aria-controls={expanded && view === 'feedback' ? 'learning-inbox-panel' : undefined} onClick={() => change(expanded && view === 'feedback' ? null : 'feedback')}>
    <span className="learning-shortcut-top"><span className="learning-shortcut-icon"><MessageSquareText size={21} aria-hidden="true"/></span><ArrowRight size={19} aria-hidden="true"/></span>
    <span className="learning-shortcut-title">反馈与结果<span className="learning-shortcut-count">{summary?.feedback ?? '—'}<small>条</small></span></span><span className="learning-shortcut-description">练习评语 · 测评结果与开放状态</span>
   </button>
  </div>
  {courseAction && <div className="learning-course-action">{courseAction}</div>}
  </header>
  {!expanded && error && <div className="learning-overview-error" role="alert"><p>{error}，课程仍可正常查看。</p><button type="button" onClick={() => setRetry(r => r + 1)}>重新读取概览</button></div>}
  {expanded && <section id="learning-inbox-panel" className="learning-inbox" aria-labelledby="learning-inbox-title" aria-busy={loading}>
   <header className="learning-inbox-header"><div><h2 id="learning-inbox-title" ref={heading} tabIndex={-1}>{view === 'todo' ? '待办任务' : '反馈与结果'}</h2><p>{view === 'todo' ? '按进行中与截止时间排序，直接回到需要处理的任务。' : '查看培训师留下的评语，以及你已交卷的测评记录。'}</p></div><div className="learning-inbox-actions"><button type="button" disabled={loading} onClick={() => setRetry(r => r + 1)} aria-label="刷新学习列表"><RefreshCw size={17} aria-hidden="true"/></button><button type="button" onClick={() => change(null)} aria-label="收起学习列表"><X size={19} aria-hidden="true"/></button></div></header>
   <div className="learning-inbox-filters" role="group" aria-label="学习内容分类">{filters.map(([value, label]) => <button type="button" key={value} aria-pressed={kind === value} onClick={() => change(view, value)}>{label}{result && <span>{result.counts[value]}</span>}</button>)}</div>
   {view === 'feedback' && <p className="learning-inbox-note">测评记录不等于结果已开放；内容和开放时间仍按原测评规则显示。</p>}
   {loading ? <div role="status" className="learning-inbox-empty"><RefreshCw size={23} aria-hidden="true"/><p>正在汇总学习记录…</p></div> : error ? <div role="alert" className="learning-inbox-empty"><p>{error}</p><button type="button" onClick={() => setRetry(r => r + 1)}>重试学习列表</button></div> : !result?.list.length ? <div role="status" className="learning-inbox-empty"><CheckCheck size={28} aria-hidden="true"/><h3>{view === 'todo' ? '当前没有这类待办' : '暂时没有这类反馈'}</h3><p>{view === 'todo' ? '新的学习任务会在发布并向你开放后显示。' : '培训师的练习评语和已交卷测评记录会显示在这里。'}</p></div> : <>
    <ul className="learning-inbox-list">{result.list.map(row => <li key={row.key}><div className="learning-inbox-row-body"><div className="learning-inbox-meta"><span>{row.typeLabel}</span><span>{row.stateLabel}</span></div><h3>{row.title}</h3><p className="learning-inbox-source">{row.courses.map(c => c.title).join('、') || '个人测评记录'}</p>{row.deadline && <p className="learning-inbox-time"><CalendarClock size={14} aria-hidden="true"/>截止 {formatTime(row.deadline)}</p>}{view === 'feedback' && row.updatedAt && <p className="learning-inbox-time">{formatTime(row.updatedAt)}</p>}</div><Link to={row.href} aria-label={row.action + '：' + row.title}>{row.action}<ArrowRight size={16} aria-hidden="true"/></Link></li>)}</ul>
    <nav className="learning-inbox-pagination" aria-label="学习列表分页"><span>共 {result.total} {view === 'todo' ? '项' : '条'} · 第 {page} / {maxPage} 页</span><div><button type="button" disabled={page <= 1} onClick={() => change(view, kind, page - 1)}>上一页</button><button type="button" disabled={page >= maxPage} onClick={() => change(view, kind, page + 1)}>下一页</button></div></nav>
   </>}
  </section>}
 </section>;
}
