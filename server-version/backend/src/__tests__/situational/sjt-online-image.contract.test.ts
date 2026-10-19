import { describe, expect, it } from 'vitest'
import fixture from '../../modules/situational/authoring/examples/online-hand-calculated.json'
import { compileSjtOnlineDocument, publicSjtOnlineMetadata, validateSjtOnlineMetadata, assertSjtOnlineReleaseReady } from '../../modules/situational/authoring/online'
import { canonicalHash } from '../../modules/assessment-runtime/canonical'

const image = () => ({ asset: { assetId: 'author-image', contentHash: 'a'.repeat(64), mimeType: 'image/png' },
  altText: '两名教师讨论排课', caption: '备课现场', rightsStatus: 'self_authored', rightsNote: '私有许可附件编号，不应对受测者披露' })
const document = () => {
  const d = JSON.parse(JSON.stringify(fixture))
  d.display.scenes[0].image = image()
  return d
}
describe('online SJT portable image compiler identity', () => {
  it('keeps text compiler, response protocol and original digest envelope unchanged', () => {
    const text = compileSjtOnlineDocument(fixture)
    expect(text.package.online.compilerVersion).toBe('sjt-online-fixed-v1')
    expect(text.package.online.responseProtocol).toBe('sjt-online-response-v1')
    expect(text.contentDigest).toBe(canonicalHash({ compilerVersion: 'sjt-online-fixed-v1', template: text.template, package: text.package }))
    expect(text.package.definition.scenes.every(scene => scene.stimulus.type === 'TEXT_V1')).toBe(true)
    expect(JSON.stringify(publicSjtOnlineMetadata(text.package.online))).not.toContain('"image"')
  })
  it('binds image identity and protected rights to distinct definition/display digests without changing scores', () => {
    const text = compileSjtOnlineDocument(fixture), picture = compileSjtOnlineDocument(document())
    expect(picture.package.online.compilerVersion).toBe('sjt-online-static-image-v1')
    expect(picture.package.online.responseProtocol).toBe(text.package.online.responseProtocol)
    expect(picture.package.goldenCases).toEqual(text.package.goldenCases)
    expect(picture.definitionHash).not.toBe(text.definitionHash)
    expect(() => assertSjtOnlineReleaseReady(picture)).not.toThrow()
    expect(validateSjtOnlineMetadata(picture.package.online, picture.package.definition)).toEqual(picture.package.online)
    const rights = document(); rights.display.scenes[0].image.rightsNote = '另一份私有授权依据'
    const changed = compileSjtOnlineDocument(rights)
    expect(changed.definitionHash).toBe(picture.definitionHash)
    expect(changed.package.online.displayHash).not.toBe(picture.package.online.displayHash)
    expect(changed.contentDigest).not.toBe(picture.contentDigest)
    for (const field of ['altText', 'caption']) {
      const d = document(); d.display.scenes[0].image[field] = '变更的展示字段'
      expect(compileSjtOnlineDocument(d).definitionHash).not.toBe(picture.definitionHash)
    }
    const d = document(); d.display.scenes[0].image.asset.contentHash = 'b'.repeat(64)
    expect(compileSjtOnlineDocument(d).definitionHash).not.toBe(picture.definitionHash)
  })
  it('projects only portable display metadata and rejects compiler downgrade and altered immutable identities', () => {
    const c = compileSjtOnlineDocument(document()), publicMetadata = publicSjtOnlineMetadata(c.package.online)
    expect(publicMetadata.display.scenes[0].image).toEqual({ asset: image().asset, altText: image().altText, caption: image().caption })
    const json = JSON.stringify(publicMetadata)
    for (const secret of ['rightsStatus', 'rightsNote', '私有许可', 'contributions', 'expertKey', 'objectKey', 'storageObjectKey']) expect(json).not.toContain(secret)
    expect(() => validateSjtOnlineMetadata({ ...c.package.online, compilerVersion: 'sjt-online-fixed-v1' }, c.package.definition)).toThrow()
    const m = JSON.parse(JSON.stringify(c.package.online)); m.display.scenes[0].image.asset.contentHash = 'f'.repeat(64); m.displayHash = canonicalHash(m.display)
    expect(() => validateSjtOnlineMetadata(m, c.package.definition)).toThrow()
  })
  it('rejects URLs, GIF, missing alt text and unproven private rights before draft acceptance', () => {
    for (const changes of [{ altText: '' }, { rightsStatus: 'unknown' }, { rightsNote: '' },
      { asset: { ...image().asset, mimeType: 'image/gif' } }, { asset: { ...image().asset, assetId: 'https://example.test/image' } }]) {
      const d = document(); d.display.scenes[0].image = { ...image(), ...changes }
      expect(() => compileSjtOnlineDocument(d)).toThrow()
    }
  })
})
