export function ReceiptOnlyConfirmation({ acceptedAt, onExit }: { acceptedAt?: string | null; onExit: () => void }) {
  return <div className="space-y-4" role="status">
    <h2 className="text-xl font-semibold">交卷成功</h2>
    <p>答案已保存，本次问卷仅提供交卷回执。</p>
    {acceptedAt && <p>提交时间 <time dateTime={acceptedAt}>{new Date(acceptedAt).toLocaleString()}</time></p>}
    <button type="button" className="btn-primary min-h-11" onClick={onExit}>返回</button>
  </div>
}
