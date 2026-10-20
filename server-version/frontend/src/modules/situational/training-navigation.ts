/** Local navigation only. Answers, scoring and scientific stage journals stay separate. */
export const TRAINING_SJT_PAGE = 'trainingSjtPage'

export function trainingSjtPageIndex(metadata: Record<string, unknown> | undefined, sceneKeys: string[]): number | null {
  const value = metadata?.[TRAINING_SJT_PAGE]
  if (value === undefined) return null
  const cursor = value as { version?: unknown; visitedSceneKeys?: unknown }
  if (!cursor || cursor.version !== 1 || !Array.isArray(cursor.visitedSceneKeys)
    || !cursor.visitedSceneKeys.length || cursor.visitedSceneKeys.length > sceneKeys.length
    || cursor.visitedSceneKeys.some((key, index) => key !== sceneKeys[index])) {
    throw new Error('本机情境换页进度与当前路径不一致，请保留草稿并联系教师。')
  }
  return cursor.visitedSceneKeys.length - 1
}

export const trainingSjtPageCursor = (sceneKeys: string[]) => ({ version: 1, visitedSceneKeys: sceneKeys })
