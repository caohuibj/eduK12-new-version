/** Retired compatibility component; it performs no reads or writes. */
export default function InstrumentAuthorization(_props: { training?: boolean }) {
  return <p role="status">版权许可台账已退役，不再录入或审批许可记录。版权许可不作为系统门禁，系统不判断是否已获许可。</p>
}
